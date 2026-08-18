import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EmailVerificationRejectedError,
  EmailVerificationService,
  EmailVerificationStoreRejection,
  EmailVerificationUnavailableError,
} from '../dist/auth/email-verification.service.js';
import {
  generateEmailVerificationToken,
  hashEmailVerificationToken,
} from '../dist/auth/email-verification.js';

function createHarness({ storeError } = {}) {
  const now = new Date('2026-08-18T20:30:00.000Z');
  const token = generateEmailVerificationToken();
  const state = { issued: [], confirmed: [] };
  const service = new EmailVerificationService({
    now: () => now,
    generateToken: () => token,
    store: {
      async replaceActiveToken(input) {
        state.issued.push(input);
        if (storeError) throw storeError;
        return { id: 'verify_1' };
      },
      async confirmToken(input) {
        state.confirmed.push(input);
        if (storeError) throw storeError;
        return { verifiedAt: now };
      },
    },
  });

  return { service, state, now, token };
}

test('emissão persiste somente hash e devolve token apenas à camada chamadora', async () => {
  const { service, state, now, token } = createHarness();

  const issued = await service.issue('usr_1');

  assert.equal(issued.token, token);
  assert.equal(issued.expiresAt.getTime() - now.getTime(), 24 * 60 * 60 * 1000);
  assert.deepEqual(state.issued, [{
    userId: 'usr_1',
    tokenHash: hashEmailVerificationToken(token),
    expiresAt: issued.expiresAt,
    now,
  }]);
  assert.equal(JSON.stringify(state.issued).includes(token), false);
});

test('confirmação envia somente hash e horário ao store', async () => {
  const { service, state, now, token } = createHarness();

  assert.deepEqual(await service.confirm(token), { verifiedAt: now });
  assert.deepEqual(state.confirmed, [{
    tokenHash: hashEmailVerificationToken(token),
    now,
  }]);
  assert.equal(JSON.stringify(state.confirmed).includes(token), false);
});

test('token malformado ou rejeitado recebe uma única resposta pública', async () => {
  const malformed = createHarness();
  const rejected = createHarness({ storeError: new EmailVerificationStoreRejection() });

  await assert.rejects(malformed.service.confirm('token-invalido'), EmailVerificationRejectedError);
  await assert.rejects(rejected.service.confirm(rejected.token), EmailVerificationRejectedError);
  assert.deepEqual(malformed.state.confirmed, []);
});

test('falha operacional não é confundida com estado do token', async () => {
  const { service, token } = createHarness({ storeError: new Error('banco indisponível') });

  await assert.rejects(service.confirm(token), EmailVerificationUnavailableError);
});
