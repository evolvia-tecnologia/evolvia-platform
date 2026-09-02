import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PASSWORD_RECOVERY_MINIMUM_RESPONSE_DURATION_MS,
  PasswordRecoveryRequestService,
  hashPasswordRecoveryIdentifier,
} from '../dist/auth/password-recovery-request.service.js';
import {
  PASSWORD_RECOVERY_PUBLIC_MESSAGE,
  hashPasswordResetToken,
} from '../dist/auth/password-recovery.js';

const PEPPER = 'segredo-de-teste-com-mais-de-32-caracteres';
const OTHER_PEPPER = 'outro-pepper-de-teste-com-32-chars!!';
const SERVICE_SOURCE = new URL(
  '../src/auth/password-recovery-request.service.ts',
  import.meta.url,
);

function createHarness({
  identity = null,
  deliveryFails = false,
  lookupFails = false,
  persistFails = false,
  revokeFails = false,
  auditFails = false,
  diagnosticsFail = false,
  waitFails = false,
} = {}) {
  const state = {
    rateLimits: [],
    lookups: [],
    persisted: [],
    revoked: [],
    deliveries: [],
    audits: [],
    diagnostics: [],
    responseWaits: [],
  };
  let nowCalls = 0;

  const service = new PasswordRecoveryRequestService({
    minimumResponseDurationMs: PASSWORD_RECOVERY_MINIMUM_RESPONSE_DURATION_MS,
    now: () => {
      nowCalls += 1;
      return nowCalls === 1 ? 1_000 : 1_000;
    },
    wait: async (milliseconds) => {
      state.responseWaits.push(milliseconds);
      if (waitFails) throw new Error('espera indisponível');
    },
    identifierPepper: PEPPER,
    store: {
      async findEligibleIdentityByEmail(email) {
        state.lookups.push(email);
        if (lookupFails) throw new Error('falha simulada de lookup');
        return identity;
      },
      async replaceActiveToken(input) {
        state.persisted.push(input);
        if (persistFails) throw new Error('falha simulada de persistência');
        return { id: 'reset_1' };
      },
      async revokeToken(tokenId) {
        state.revoked.push(tokenId);
        if (revokeFails) throw new Error('falha simulada de revogação');
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
        if (auditFails) throw new Error('auditoria indisponível');
      },
    },
    diagnostics: {
      async capture(input) {
        state.diagnostics.push(input);
        if (diagnosticsFail) throw new Error('diagnóstico indisponível');
      },
    },
  });

  return { service, state };
}

function assertNoSecrets(serialized, extra = []) {
  const forbidden = [
    'pessoa@exemplo.com',
    PEPPER,
    OTHER_PEPPER,
    'SenhaForte1!',
    'falha simulada',
    'transporte indisponível',
    'auditoria indisponível',
    'diagnóstico indisponível',
    ...extra,
  ];
  for (const value of forbidden) {
    assert.equal(serialized.includes(value), false, `vazou ${value}`);
  }
}

test('o serviço importa o store integrado e não lê pepper do ambiente', async () => {
  const source = await readFile(SERVICE_SOURCE, 'utf8');
  assert.match(source, /from '\.\/password-recovery-prisma\.store'/u);
  assert.equal(/export interface PasswordRecoveryRequestStore/u.test(source), false);
  assert.equal(/export type PasswordRecoveryIdentity =/u.test(source), false);
  assert.equal(source.includes('process.env'), false);
  assert.equal(source.includes('@Injectable'), false);
  assert.equal(source.includes('@Controller'), false);
});

test('conta elegível, ausente e não verificada recebem resposta pública idêntica', async () => {
  const existing = createHarness({
    identity: { id: 'usr_1', verifiedEmail: 'pessoa@exemplo.com' },
  });
  const missing = createHarness();
  const unverified = createHarness({ identity: null });

  const first = await existing.service.request({
    email: ' Pessoa@Exemplo.com ',
    originKey: 'origem_1',
  });
  const second = await missing.service.request({
    email: ' Pessoa@Exemplo.com ',
    originKey: 'origem_1',
  });
  const third = await unverified.service.request({
    email: ' Pessoa@Exemplo.com ',
    originKey: 'origem_1',
  });

  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
  assert.deepEqual(first, { message: PASSWORD_RECOVERY_PUBLIC_MESSAGE });
  assert.equal(JSON.stringify(first).includes('usr_1'), false);
  assert.equal(JSON.stringify(first).includes('pessoa@exemplo.com'), false);
  assert.deepEqual(existing.state.lookups, ['pessoa@exemplo.com']);
  assert.deepEqual(missing.state.lookups, ['pessoa@exemplo.com']);
  assert.deepEqual(unverified.state.lookups, ['pessoa@exemplo.com']);
  assert.deepEqual(unverified.state.persisted, []);
  assert.deepEqual(unverified.state.deliveries, []);
  assert.deepEqual(unverified.state.audits, [{
    action: 'password_recovery.request',
    outcome: 'IGNORED',
  }]);
});

test('rate limit usa HMAC e ocorre antes da consulta de identidade', async () => {
  const { service, state } = createHarness();

  await service.request({ email: 'pessoa@exemplo.com', originKey: 'origem_1' });

  assert.equal(state.rateLimits.length, 1);
  assert.equal(state.rateLimits[0].originKey, 'origem_1');
  assert.match(state.rateLimits[0].identityKey, /^[a-f0-9]{64}$/u);
  assert.equal(state.rateLimits[0].identityKey.includes('pessoa@exemplo.com'), false);
  assert.equal(state.rateLimits[0].identityKey.includes(PEPPER), false);
  assert.equal(
    state.rateLimits[0].identityKey,
    hashPasswordRecoveryIdentifier('pessoa@exemplo.com', PEPPER),
  );
  assert.equal(state.lookups.length, 1);
});

test('HMAC é determinístico, depende do pepper e rejeita pepper curto', () => {
  assert.equal(
    hashPasswordRecoveryIdentifier(' Pessoa@Exemplo.com ', PEPPER),
    hashPasswordRecoveryIdentifier('pessoa@exemplo.com', PEPPER),
  );
  assert.notEqual(
    hashPasswordRecoveryIdentifier('pessoa@exemplo.com', PEPPER),
    hashPasswordRecoveryIdentifier('pessoa@exemplo.com', OTHER_PEPPER),
  );
  assert.throws(
    () => hashPasswordRecoveryIdentifier('pessoa@exemplo.com', 'curto'),
    /ao menos 32 caracteres/u,
  );
  assert.throws(
    () => new PasswordRecoveryRequestService({
      identifierPepper: 'curto',
      store: {
        async findEligibleIdentityByEmail() { return null; },
        async replaceActiveToken() { return { id: 'x' }; },
        async revokeToken() {},
      },
      rateLimiter: { async assertAllowed() {} },
      delivery: { async send() {} },
      audit: { async record() {} },
      diagnostics: { async capture() {} },
    }),
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
  assert.equal(state.deliveries[0].recipient, 'pessoa@exemplo.com');
});

test('falha de persistência mantém resposta uniforme e não entrega token', async () => {
  const failing = createHarness({
    identity: { id: 'usr_1', verifiedEmail: 'pessoa@exemplo.com' },
    persistFails: true,
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
  assert.deepEqual(failing.state.deliveries, []);
  assert.deepEqual(failing.state.revoked, []);
  assert.deepEqual(failing.state.diagnostics, [
    { operation: 'password_recovery.request', stage: 'PERSISTENCE' },
  ]);
  assert.equal(failing.state.audits[0].outcome, 'PERSISTENCE_FAILED');
  assertNoSecrets(JSON.stringify(failing.state.diagnostics));
  assertNoSecrets(JSON.stringify(failing.state.audits), [hashPasswordResetToken('x')]);
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
  assertNoSecrets(JSON.stringify(failing.state.diagnostics), [failing.state.deliveries[0].token]);
});

test('falha de revogação não vaza detalhes e preserva resposta pública', async () => {
  const failing = createHarness({
    identity: { id: 'usr_1', verifiedEmail: 'pessoa@exemplo.com' },
    deliveryFails: true,
    revokeFails: true,
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
    { operation: 'password_recovery.request', stage: 'REVOCATION' },
  ]);
  assert.equal(failing.state.audits[0].outcome, 'DELIVERY_FAILED');
  assertNoSecrets(JSON.stringify(failing.state.diagnostics));
  assertNoSecrets(JSON.stringify(failing.state.audits));
  assert.equal(JSON.stringify(first).includes('reset_1'), false);
});

test('falha de auditoria ou diagnóstico não altera a resposta pública', async () => {
  const failing = createHarness({
    identity: { id: 'usr_1', verifiedEmail: 'pessoa@exemplo.com' },
    auditFails: true,
    diagnosticsFail: true,
    waitFails: true,
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
  assert.deepEqual(first, { message: PASSWORD_RECOVERY_PUBLIC_MESSAGE });
});

test('duração mínima é aplicada de forma determinística com relógio e espera injetados', async () => {
  const { service, state } = createHarness();

  await service.request({ email: 'pessoa@exemplo.com', originKey: 'origem_1' });

  assert.deepEqual(state.responseWaits, [
    PASSWORD_RECOVERY_MINIMUM_RESPONSE_DURATION_MS,
  ]);
});

test('lookup, persistência, entrega, auditoria e diagnóstico não vazam identidade para o diagnóstico', async () => {
  const { service, state } = createHarness({
    identity: { id: 'usr_1', verifiedEmail: 'pessoa@exemplo.com' },
    persistFails: true,
    auditFails: true,
  });

  const response = await service.request({
    email: ' Pessoa@Exemplo.com ',
    originKey: 'origem_1',
  });

  assert.deepEqual(response, { message: PASSWORD_RECOVERY_PUBLIC_MESSAGE });
  assert.equal(state.lookups[0], 'pessoa@exemplo.com');
  assert.equal(JSON.stringify(state.persisted).includes('pessoa@exemplo.com'), false);
  assert.match(state.persisted[0].tokenHash, /^[a-f0-9]{64}$/u);
  assertNoSecrets(JSON.stringify(state.rateLimits));
  assertNoSecrets(JSON.stringify(state.audits));
  assertNoSecrets(JSON.stringify(state.diagnostics));
  assert.deepEqual(state.diagnostics, [
    { operation: 'password_recovery.request', stage: 'PERSISTENCE' },
    { operation: 'password_recovery.request', stage: 'AUDIT' },
  ]);
});
