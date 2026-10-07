import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { ScientificReviewerService } from '../dist/scientific-reviewer.service.js';

const scope = { eventId: 'cevent00000001', organizationId: 'corganization01', submissionId: 'csubmission001' };

function harness({ required = 2, received = 1, chairRequired = false, chair = true, missing = false, changed = false, failAudit = false, serializationFailure = false, cancelled = false, version = 1, olderReceived = 0 } = {}) {
  const calls = [];
  let committed = false;
  const tx = {
    event: { findFirst: async ({ where }) => {
      assert.deepEqual(where, { id: scope.eventId, organizationId: scope.organizationId });
      return { status: cancelled ? 'CANCELLED' : 'PUBLISHED' };
    } },
    scientificSubmission: {
      findFirst: async ({ where }) => {
        assert.deepEqual(where, { id: scope.submissionId, eventId: scope.eventId, organizationId: scope.organizationId });
        return missing ? null : { id: scope.submissionId, status: 'UNDER_REVIEW', currentVersion: version };
      },
      updateMany: async (input) => {
        assert.deepEqual(input.where, { id: scope.submissionId, eventId: scope.eventId, organizationId: scope.organizationId, status: 'UNDER_REVIEW' });
        calls.push(['update', input]); return { count: changed ? 0 : 1 };
      },
    },
    scientificSubmissionConfig: { findUnique: async (input) => {
      assert.deepEqual(input.where, { eventId_organizationId: { eventId: scope.eventId, organizationId: scope.organizationId } });
      assert.deepEqual(input.select, { coordinatorDecidesStatus: true, reviewersPerSubmission: true });
      return { coordinatorDecidesStatus: chairRequired, reviewersPerSubmission: required };
    } },
    scientificReviewAssignment: { count: async ({ where }) => {
      assert.deepEqual(where, { eventId: scope.eventId, organizationId: scope.organizationId, submissionId: scope.submissionId, version: { versionNumber: version }, status: 'SUBMITTED', conflictStatus: 'CLEAR' });
      // PENDING, CONFLICT and CANCELLED rows are deliberately excluded by this query.
      return where.version?.versionNumber === version ? received : received + olderReceived;
    } },
    user: { findUnique: async () => ({ email: 'coordenador@example.test' }) },
    scientificCommitteeMembership: { findFirst: async ({ where }) => {
      assert.equal(where.eventId, scope.eventId); assert.equal(where.organizationId, scope.organizationId);
      assert.equal(where.isChair, true); return chair ? { id: 'cchair0000001' } : null;
    } },
    auditLog: { create: async (input) => { calls.push(['audit', input]); if (failAudit) throw new Error('audit failed'); } },
  };
  const prisma = {
    event: { findUnique: async () => ({ id: scope.eventId, organizationId: scope.organizationId, status: 'PUBLISHED' }) },
    $transaction: async (run, options) => {
      assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
      const result = await run(tx);
      if (serializationFailure) throw new Prisma.PrismaClientKnownRequestError('serialization failure', { code: 'P2034', clientVersion: 'test' });
      committed = true; return result;
    },
  };
  const authorization = { requireRole: async (userId, organizationId) => {
    assert.equal(userId, 'corganizer001'); assert.equal(organizationId, scope.organizationId);
  } };
  return { service: new ScientificReviewerService(prisma, authorization), calls, committed: () => committed };
}
const decide = (h) => h.service.decide('corganizer001', scope.eventId, scope.submissionId, { status: 'ACCEPTED' });

test('quórum configurado dois recusa um parecer sem escrever ou auditar', async () => {
  const h = harness(); await assert.rejects(decide(h), /recebidos: 1; necessários.*2/u);
  assert.deepEqual(h.calls, []); assert.equal(h.committed(), false);
});
test('quórum atingido grava decisão e auditoria do mesmo escopo', async () => {
  const h = harness({ received: 2 }); assert.deepEqual(await decide(h), { id: scope.submissionId, status: 'ACCEPTED' });
  assert.equal(h.committed(), true); assert.deepEqual(h.calls.map(x => x[0]), ['update', 'audit']);
  assert.deepEqual(h.calls[1][1].data.metadata, { status: 'ACCEPTED', versionNumber: 1, receivedReviews: 2, requiredReviews: 2 });
});
test('null legado mantém mínimo um e zero pareceres nunca decide', async () => {
  assert.equal((await decide(harness({ required: null, received: 1 }))).status, 'ACCEPTED');
  const h = harness({ required: null, received: 0 }); await assert.rejects(decide(h), /necessários.*1/u);
  assert.deepEqual(h.calls, []);
});
test('configuração inválida falha fechada', async () => {
  for (const required of [0, -1, 11, 1.5]) {
    const h = harness({ required, received: 10 }); await assert.rejects(decide(h), /quantidade válida/u); assert.deepEqual(h.calls, []);
  }
});
test('conflito, cancelamento e parecer pendente não atendem quórum', async () => {
  const h = harness({ received: 0 }); await assert.rejects(decide(h), /recebidos: 0/u); assert.deepEqual(h.calls, []);
});
test('trabalho de outro escopo não recebe decisão', async () => {
  const h = harness({ missing: true }); await assert.rejects(decide(h), /Trabalho não encontrado/u); assert.deepEqual(h.calls, []);
});
test('coordenador continua obrigatório quando configurado', async () => {
  const h = harness({ chairRequired: true, chair: false, received: 2 });
  await assert.rejects(decide(h), /Só o coordenador/u); assert.deepEqual(h.calls, []);
  assert.equal((await decide(harness({ chairRequired: true, received: 2 }))).status, 'ACCEPTED');
});
test('alteração concorrente de estado não audita decisão perdida', async () => {
  const h = harness({ changed: true, received: 2 }); await assert.rejects(decide(h), /mudou durante/u);
  assert.deepEqual(h.calls.map(x => x[0]), ['update']); assert.equal(h.committed(), false);
});
test('falha de auditoria não permite commit', async () => {
  const h = harness({ failAudit: true, received: 2 }); await assert.rejects(decide(h), /audit failed/u); assert.equal(h.committed(), false);
});
test('conflito serializável retorna 409 e não reporta decisão concluída', async () => {
  const h = harness({ serializationFailure: true, received: 2 });
  await assert.rejects(decide(h), error => error.getStatus() === 409); assert.equal(h.committed(), false);
});
test('cancelamento do evento na transação bloqueia decisão', async () => {
  const h = harness({ cancelled: true, received: 2 }); await assert.rejects(decide(h), /evento cancelado/u); assert.deepEqual(h.calls, []);
});



test('pareceres de versão anterior não autorizam decisão da versão corrigida', async () => {
  const h = harness({ version: 2, received: 0, olderReceived: 2 });
  await assert.rejects(decide(h), /recebidos: 0; necessários.*2/u);
  assert.deepEqual(h.calls, []);
  assert.equal(h.committed(), false);
  const current = harness({ version: 2, received: 2, olderReceived: 2 });
  assert.equal((await decide(current)).status, 'ACCEPTED');
  assert.equal(current.calls[1][1].data.metadata.versionNumber, 2);
});
