import assert from 'node:assert/strict';
import test from 'node:test';
import { EventOperatorAssignmentsService } from '../dist/event-operator-assignments.service.js';

function fixture(activeCodes = ['access_control', 'credential']) {
  const writes = [];
  const prisma = {
    event: { findUnique: async () => ({ id: 'event_a', organizationId: 'org_a' }) },
    organizationMembership: {
      findUnique: async () => ({ role: 'OPERATOR', status: 'ACTIVE' }),
    },
    eventCapability: { findMany: async () => activeCodes.map((code) => ({ code })) },
    $transaction: async (callback) => callback({
      eventOperatorAssignment: {
        upsert: async (query) => {
          writes.push(query);
          return { id: 'assignment_a', permissions: query.create.permissions, active: true, expiresAt: query.create.expiresAt };
        },
      },
      auditLog: { create: async () => ({ id: 'audit_a' }) },
    }),
  };
  const authorization = { requireRole: async () => ({ role: 'OWNER' }) };
  return { service: new EventOperatorAssignmentsService(prisma, authorization), writes };
}

test('validade inválida ou passada recebe 400 antes de qualquer escrita', async () => {
  const { service, writes } = fixture();
  for (const expiry of ['data-invalida', '2020-01-01T00:00:00.000Z']) {
    await assert.rejects(
      () => service.grant('owner', 'event_a', 'operator', ['CHECK_IN'], expiry),
      (error) => error?.status === 400,
    );
  }
  assert.equal(writes.length, 0);
});

test('validade futura é persistida no escopo do evento e reutilizada no upsert', async () => {
  const { service, writes } = fixture();
  const expiry = new Date(Date.now() + 60_000).toISOString();
  const result = await service.grant('owner', 'event_a', 'operator', ['CHECK_IN', 'CHECK_IN'], expiry);
  assert.equal(writes.length, 1);
  const query = writes[0];
  assert.deepEqual(query.where, { eventId_userId: { eventId: 'event_a', userId: 'operator' } });
  assert.equal(query.create.organizationId, 'org_a');
  assert.deepEqual(query.create.permissions, ['CHECK_IN']);
  assert.strictEqual(query.create.expiresAt, query.update.expiresAt);
  assert.equal(query.create.expiresAt.toISOString(), expiry);
  assert.equal(result.active, true);
});

test('função não é atribuída se a capability foi desabilitada; funções futuras permanecem bloqueadas', async () => {
  const { service, writes } = fixture(['registration']);
  await assert.rejects(
    () => service.grant('owner', 'event_a', 'operator', ['CHECK_IN']),
    (error) => error?.status === 400,
  );
  await assert.rejects(
    () => service.grant('owner', 'event_a', 'operator', ['BADGE_PRINT']),
    (error) => error?.status === 400,
  );
  assert.equal(writes.length, 0);
});
