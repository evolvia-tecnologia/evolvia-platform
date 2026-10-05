import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { EventEvaluationService } from '../dist/event-evaluation.service.js';

const tenant = { eventId: 'event001', organizationId: 'org001' };
const questions = [{ id: 'nota', label: 'Nota geral', kind: 'RATING', required: true }];
const config = { id: 'config01', active: true, title: 'Avaliação', questions, revision: 1 };
const input = { active: true, title: config.title, questions };
function harness({ active = true, responseCount = 0, serialization = false } = {}) {
  const calls = []; let committed = false;
  const assertTenant = where => assert.deepEqual(where, { eventId_organizationId: tenant });
  const tx = {
    eventEvaluationConfig: {
      findUnique: async ({ where }) => { assertTenant(where); calls.push('read-config'); return { ...config, active }; },
      upsert: async ({ where }) => { assertTenant(where); calls.push('update-config'); return config; },
    },
    eventEvaluationResponse: {
      count: async ({ where }) => { assert.deepEqual(where, tenant); return responseCount; },
      findUnique: async () => null,
      create: async ({ data }) => {
        assert.deepEqual({ eventId: data.eventId, organizationId: data.organizationId }, tenant);
        assert.equal(data.reservationId, 'reservation01'); assert.deepEqual(data.answers, { nota: 5 });
        calls.push('answer'); return { id: 'answer01', submittedAt: new Date('2026-10-05T12:00:00Z') };
      },
    },
    auditLog: { create: async ({ data }) => { assert.equal(data.organizationId, tenant.organizationId); assert.equal(data.eventId, tenant.eventId); calls.push('audit'); } },
  };
  const prisma = {
    event: { findUnique: async () => ({ id: tenant.eventId, organizationId: tenant.organizationId, name: 'Evento' }) },
    // Any answer configuration read outside the transaction is forbidden in this harness.
    eventEvaluationConfig: { findUnique: async () => { calls.push('management'); return config; } },
    eventEvaluationResponse: { count: async () => responseCount },
    $transaction: async (callback, options) => {
      assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
      const result = await callback(tx);
      if (serialization) throw new Prisma.PrismaClientKnownRequestError('serialization', { code: 'P2034', clientVersion: '6' });
      committed = true; return result;
    },
  };
  const service = new EventEvaluationService(prisma, { requireRole: async () => {} }, { requireConfirmedScope: async () => ({ ...tenant, reservationId: 'reservation01' }) });
  return { service, calls, committed: () => committed };
}
const answer = h => h.service.answer('evento', 'Bearer test', 'evaluation-key-000001', { nota: 5 });
test('resposta valida perguntas e abertura dentro do snapshot serializável', async () => {
  const h = harness(); assert.equal((await answer(h)).replay, false);
  assert.deepEqual(h.calls, ['read-config', 'answer', 'audit']); assert.equal(h.committed(), true);
});
test('avaliação fechada no snapshot não recebe resposta', async () => {
  const h = harness({ active: false }); await assert.rejects(answer(h), /não está aberta/u);
  assert.deepEqual(h.calls, ['read-config']); assert.equal(h.committed(), false);
});
test('resposta para pergunta retirada é recusada antes da escrita', async () => {
  const h = harness(); await assert.rejects(h.service.answer('evento', 'Bearer test', 'evaluation-key-000001', { antiga: 5 }), /não pertence/u);
  assert.deepEqual(h.calls, ['read-config']); assert.equal(h.committed(), false);
});
test('primeira resposta existente impede mudar perguntas na configuração', async () => {
  const h = harness({ responseCount: 1 }); await assert.rejects(h.service.configure('user', tenant.eventId, { ...input, questions: [{ ...questions[0], label: 'Outra pergunta' }] }), /após o início/u);
  assert.deepEqual(h.calls, ['read-config']); assert.equal(h.committed(), false);
});
test('organizador pode fechar sem modificar perguntas após respostas', async () => {
  const h = harness({ responseCount: 1 }); await h.service.configure('user', tenant.eventId, { ...input, active: false });
  assert.deepEqual(h.calls, ['read-config', 'update-config', 'audit', 'management']); assert.equal(h.committed(), true);
});
test('conflito de serialização da resposta retorna 409 sem confirmação', async () => {
  const h = harness({ serialization: true }); await assert.rejects(answer(h), e => e.getStatus() === 409);
  assert.equal(h.committed(), false);
});
test('conflito de serialização da configuração retorna 409 sem estado atualizado', async () => {
  const h = harness({ serialization: true }); await assert.rejects(h.service.configure('user', tenant.eventId, input), e => e.getStatus() === 409);
  assert.ok(!h.calls.includes('management')); assert.equal(h.committed(), false);
});
