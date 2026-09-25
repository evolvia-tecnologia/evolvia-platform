import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthorizationService } from '../dist/authorization.service.js';

function serviceWith(membership) {
  const scopes = [];
  const prisma = {
    organizationMembership: {
      findUnique: async (query) => {
        scopes.push(query.where.organizationId_userId);
        return membership;
      },
    },
  };
  return { service: new AuthorizationService(prisma), scopes };
}

test('membership ACTIVE autoriza somente o escopo exato consultado', async () => {
  const membership = { role: 'OWNER', status: 'ACTIVE', organization: { id: 'org_a' } };
  const { service, scopes } = serviceWith(membership);

  assert.equal(await service.requireMembership('user_a', 'org_a'), membership);
  assert.deepEqual(scopes, [{ userId: 'user_a', organizationId: 'org_a' }]);
});

test('membership ausente, suspensa ou removida é negada sem distinguir o motivo', async () => {
  for (const membership of [null, { status: 'SUSPENDED' }, { status: 'REMOVED' }]) {
    const { service } = serviceWith(membership);
    await assert.rejects(
      () => service.requireMembership('user_a', 'org_a'),
      (error) => error?.status === 404 && error?.message === 'Organização não encontrada.',
    );
  }
});

test('papel fora da allowlist é negado com a mesma resposta minimizada', async () => {
  const { service } = serviceWith({ role: 'VIEWER', status: 'ACTIVE', organization: { id: 'org_a' } });
  await assert.rejects(
    () => service.requireRole('user_a', 'org_a', ['OWNER', 'ADMIN']),
    (error) => error?.status === 404 && error?.message === 'Organização não encontrada.',
  );
});

test('operador exige concessão ativa no evento e permissão exata, sem fallback à organização', async () => {
  const scopes = [];
  let grant = null;
  const prisma = {
    organizationMembership: {
      findUnique: async () => ({ role: 'OPERATOR', status: 'ACTIVE', organization: { id: 'org_a' } }),
    },
    eventOperatorAssignment: {
      findFirst: async (query) => { scopes.push(query.where); return grant; },
    },
    eventCapability: { findUnique: async () => ({ status: 'ACTIVE' }) },
  };
  const service = new AuthorizationService(prisma);
  for (const [eventId, permission] of [['event_a', 'CHECK_IN'], ['event_b', 'CHECK_IN'], ['event_a', 'ACCREDITATION']]) {
    await assert.rejects(
      () => service.requireEventPermission('operator', 'org_a', eventId, permission),
      (error) => error?.status === 404,
    );
  }
  grant = { id: 'grant_a' };
  await service.requireEventPermission('operator', 'org_a', 'event_a', 'CHECK_IN');
  assert.deepEqual(scopes.map(({ eventId, organizationId, userId, permissions, active }) =>
    ({ eventId, organizationId, userId, permissions, active })), [
    { eventId: 'event_a', organizationId: 'org_a', userId: 'operator', permissions: { has: 'CHECK_IN' }, active: true },
    { eventId: 'event_b', organizationId: 'org_a', userId: 'operator', permissions: { has: 'CHECK_IN' }, active: true },
    { eventId: 'event_a', organizationId: 'org_a', userId: 'operator', permissions: { has: 'ACCREDITATION' }, active: true },
    { eventId: 'event_a', organizationId: 'org_a', userId: 'operator', permissions: { has: 'CHECK_IN' }, active: true },
  ]);
  assert.equal(scopes[3].OR[0].expiresAt, null);
  assert.ok(scopes[3].OR[1].expiresAt.gt instanceof Date);
});

test('membership suspensa nega operador antes de consultar qualquer concessão', async () => {
  let queried = false;
  const service = new AuthorizationService({
    organizationMembership: { findUnique: async () => ({ role: 'OPERATOR', status: 'SUSPENDED' }) },
    eventOperatorAssignment: { findFirst: async () => { queried = true; return { id: 'grant' }; } },
  });
  await assert.rejects(() => service.requireEventPermission('operator', 'org_a', 'event_a', 'CHECK_IN'), { status: 404 });
  assert.equal(queried, false);
});

test('capability desabilitada nega operador com atribuição e organizador', async () => {
  const queries = [];
  const prisma = {
    organizationMembership: {
      findUnique: async () => ({ role: 'OPERATOR', status: 'ACTIVE' }),
    },
    eventOperatorAssignment: { findFirst: async () => ({ id: 'assignment' }) },
    eventCapability: {
      findUnique: async (query) => { queries.push(query.where.eventId_code); return { status: 'DISABLED' }; },
    },
  };
  const service = new AuthorizationService(prisma);
  await assert.rejects(() => service.requireEventPermission('operator', 'org', 'event', 'CHECK_IN'), { status: 404 });
  assert.deepEqual(queries, [{ eventId: 'event', code: 'access_control' }]);
  prisma.organizationMembership.findUnique = async () => ({ role: 'OWNER', status: 'ACTIVE' });
  await assert.rejects(() => service.requireEventPermission('owner', 'org', 'event', 'ACCREDITATION'), { status: 404 });
  assert.deepEqual(queries[1], { eventId: 'event', code: 'credential' });
});
