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
