import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthController } from '../dist/auth.controller.js';

test('/me expõe somente o estado mínimo da verificação', async () => {
  const calls = [];
  const controller = new AuthController(
    {},
    {
      user: {
        async findUnique(input) {
          calls.push(input);
          return {
            id: 'user-123',
            name: 'Pessoa',
            email: 'pessoa@exemplo.com',
            createdAt: new Date('2026-08-24T00:00:00.000Z'),
            emailVerifiedAt: new Date('2026-08-24T01:00:00.000Z'),
            memberships: [],
          };
        },
      },
    },
  );

  const response = await controller.me({
    user: { id: 'user-123', email: 'pessoa@exemplo.com' },
    headers: {},
  });

  assert.equal(calls[0].where.id, 'user-123');
  assert.equal(calls[0].select.emailVerifiedAt, true);
  assert.equal(response.emailVerification.status, 'VERIFIED');
  assert.equal('emailVerifiedAt' in response, false);
  assert.equal(JSON.stringify(response.emailVerification).includes('2026-08-24'), false);
});

test('/me mantém conta não confirmada como PENDING sem inferência', async () => {
  const controller = new AuthController(
    {},
    {
      user: {
        async findUnique() {
          return {
            id: 'user-456',
            name: 'Pessoa',
            email: 'pendente@exemplo.com',
            createdAt: new Date('2026-08-24T00:00:00.000Z'),
            emailVerifiedAt: null,
            memberships: [],
          };
        },
      },
    },
  );

  const response = await controller.me({
    user: { id: 'user-456', email: 'pendente@exemplo.com' },
    headers: {},
  });

  assert.equal(response.emailVerification.status, 'PENDING');
  assert.equal('emailVerifiedAt' in response, false);
});
