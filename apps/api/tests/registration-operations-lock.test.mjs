import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { RegistrationOperationsService } from '../dist/registration-operations.service.js';

function fixture(locked) {
  const calls = { lock: [], auditCount: 0, auditCreate: 0, reservationFind: 0 };
  const tx = {
    $queryRaw: async (strings, ...values) => {
      calls.lock.push({ sql: strings.join('?'), values });
      return [{ locked }];
    },
    auditLog: {
      count: async () => { calls.auditCount++; return 0; },
      create: async () => { calls.auditCreate++; return { id: 'audit_a' }; },
    },
    eventRegistrationReservation: {
      findMany: async () => { calls.reservationFind++; return []; },
    },
  };
  const prisma = {
    event: { findUnique: async () => ({ id: 'event_a', organizationId: 'org_a', name: 'Evento' }) },
    $transaction: async (callback) => callback(tx),
  };
  const authorization = {
    requireEventPermission: async (userId, organizationId, eventId, permission) => {
      assert.deepEqual([userId, organizationId, eventId, permission],
        ['operator_a', 'org_a', 'event_a', 'ACCREDITATION']);
    },
  };
  return { service: new RegistrationOperationsService(prisma, authorization), calls };
}

const input = { kind: 'PROTOCOL', value: 'EVO-0123456789ABCDEF' };

test('lock ocupado recusa com 429 antes de consultar inscrição ou gravar auditoria', async () => {
  const { service, calls } = fixture(false);
  await assert.rejects(() => service.search('operator_a', 'event_a', input),
    (error) => error?.status === 429);
  assert.equal(calls.lock.length, 1);
  assert.match(calls.lock[0].sql, /pg_try_advisory_xact_lock/);
  assert.equal(calls.lock[0].values.length, 1);
  assert.equal(calls.lock[0].values[0], createHash('sha256')
    .update('event_a').update('\0').update('operator_a').digest().readBigInt64BE(0));
  assert.equal(calls.auditCount, 0);
  assert.equal(calls.reservationFind, 0);
  assert.equal(calls.auditCreate, 0);
});

test('lock livre consulta apenas o evento e registra metadados sem termo de busca', async () => {
  const { service, calls } = fixture(true);
  const result = await service.search('operator_a', 'event_a', input);
  assert.deepEqual(result.items, []);
  assert.equal(calls.auditCount, 1);
  assert.equal(calls.reservationFind, 1);
  assert.equal(calls.auditCreate, 1);
});
