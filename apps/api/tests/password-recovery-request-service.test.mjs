import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PasswordRecoveryRequestService,
  hashPasswordRecoveryIdentifier,
} from '../dist/auth/password-recovery-request.service.js';
import { hashPasswordResetToken } from '../dist/auth/password-recovery.js';

const PEPPER = 'segredo-de-teste-com-mais-de-32-caracteres';

function createHarness({ identity = null, deliveryFails = false, lookupFails = false } = {}) {
  const state = {
    rateLimits: [],
    lookups: [],
    persisted: [],
    revoked: [],
    deliveries: [],
    audits: [],
    diagnostics: [],
  };

  const service = new PasswordRecoveryRequestService({
    identifierPepper: PEPPER,
    store: {
      async findEligibleIdentityByEmail(email) {
        state.lookups.push(email);
        if (lookupFails) throw new Error('falha simulada');
        return identity;
      },
      async replaceActiveToken(input) {
        state.persisted.push(input);
        return { id: 'reset_1' };
      },
      async revokeToken(tokenId) {
        state.revoked.push(tokenId);
      },
    },
    rateLimiter: {
      async assertAllowed(input) {
        state.rateLimits.push(input);
      },
    },
    delivery: {
      async send(input) {
        state.deliveries.push(input);
        if (deliveryFails) throw new Error('transporte indisponível');
      },
    },
    audit: {
      async record(input) {
        state.audits.push(input);
      },
    },
    diagnostics: {
      async capture(input) {
        state.diagnostics.push(input);
      },
    },
  });

  return { service, state };
}

test('conta elegível e inexistente recebem resposta pública idêntica', async () => {
  const existing = createHarness({
    identity: { id: 'usr_1', verifiedEmail: 'pessoa@exemplo.com' },
  });
  const missing = createHarness();

  const first = await existing.service.request({
    email: ' Pessoa@Exemplo.com ',
    originKey: 'origem_1',
  });
  const second = await missing.service.request({
    email: ' Pessoa@Exemplo.com ',
    originKey: 'origem_1',
  });

  assert.deepEqual(first, second);
  assert.deepEqual(existing.state.lookups, ['pessoa@exemplo.com']);
  assert.deepEqual(missing.state.lookups, ['pessoa@exemplo.com']);
});

test('rate limit usa HMAC e ocorre antes da consulta de identidade', async () => {
  const { service, state } = createHarness();

  await service.request({ email: 'pessoa@exemplo.com', originKey: 'origem_1' });

  assert.equal(state.rateLimits.length, 1);
  assert.equal(state.rateLimits[0].originKey, 'origem_1');
  assert.match(state.rateLimits[0].identityKey, /^[a-f0-9]{64}$/u);
  assert.equal(state.rateLimits[0].identityKey.includes('pessoa@exemplo.com'), false);
});

test('HMAC é estável após normalização e exige pepper forte', () => {
  assert.equal(
    hashPasswordRecoveryIdentifier(' Pessoa@Exemplo.com ', PEPPER),
    hashPasswordRecoveryIdentifier('pessoa@exemplo.com', PEPPER),
  );
  assert.throws(
    () => hashPasswordRecoveryIdentifier('pessoa@exemplo.com', 'curto'),
    /ao menos 32 caracteres/u,
  );
});

test('store recebe somente hash enquanto entrega recebe o token opaco', async () => {
  const { service, state } = createHarness({
    identity: { id: 'usr_1', verifiedEmail: 'pessoa@exemplo.com' },
  });

  await service.request({ email: 'pessoa@exemplo.com', originKey: 'origem_1' });

  assert.equal(state.persisted.length, 1);
  assert.equal(state.deliveries.length, 1);
  assert.equal(state.persisted[0].identityId, 'usr_1');
  assert.equal(
    state.persisted[0].tokenHash,
    hashPasswordResetToken(state.deliveries[0].token),
  );
  assert.equal(
    JSON.stringify(state.persisted[0]).includes(state.deliveries[0].token),
    false,
  );
});

test('falha de entrega revoga token e mantém resposta anti-enumeração', async () => {
  const failing = createHarness({
    identity: { id: 'usr_1', verifiedEmail: 'pessoa@exemplo.com' },
    deliveryFails: true,
  });
  const missing = createHarness();

  const first = await failing.service.request({
    email: 'pessoa@exemplo.com',
    originKey: 'origem_1',
  });
  const second = await missing.service.request({
    email: 'pessoa@exemplo.com',
    originKey: 'origem_1',
  });

  assert.deepEqual(first, second);
  assert.deepEqual(failing.state.revoked, ['reset_1']);
  assert.deepEqual(failing.state.diagnostics, [
    { operation: 'password_recovery.request', stage: 'DELIVERY' },
  ]);
  assert.equal(failing.state.audits[0].outcome, 'DELIVERY_FAILED');
  assert.equal(
    JSON.stringify(failing.state.audits).includes('pessoa@exemplo.com'),
    false,
  );
});

test('falha de lookup não vaza estado e gera diagnóstico sanitizado', async () => {
  const failing = createHarness({ lookupFails: true });
  const missing = createHarness();

  const first = await failing.service.request({
    email: 'pessoa@exemplo.com',
    originKey: 'origem_1',
  });
  const second = await missing.service.request({
    email: 'pessoa@exemplo.com',
    originKey: 'origem_1',
  });

  assert.deepEqual(first, second);
  assert.deepEqual(failing.state.diagnostics, [
    { operation: 'password_recovery.request', stage: 'LOOKUP' },
  ]);
});
