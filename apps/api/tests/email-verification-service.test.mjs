import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  EmailVerificationRateLimitExceededError,
  EmailVerificationRejectedError,
  EmailVerificationService,
  EmailVerificationStoreRejection,
  EmailVerificationUnavailableError,
  EMAIL_VERIFICATION_REJECTED_MESSAGE,
  EMAIL_VERIFICATION_UNAVAILABLE_MESSAGE,
} from '../dist/auth/email-verification.service.js';
import {
  EmailVerificationRateLimitExceededError as IntegratedRateLimitError,
  EmailVerificationStoreRejection as IntegratedStoreRejection,
} from '../dist/auth/email-verification-prisma.store.js';
import {
  EMAIL_VERIFICATION_TOKEN_TTL_MS,
  generateEmailVerificationToken,
  hashEmailVerificationToken,
} from '../dist/auth/email-verification.js';

const SERVICE_SOURCE = new URL(
  '../src/auth/email-verification.service.ts',
  import.meta.url,
);

function createHarness({ storeError, issueError, confirmError, revokeError } = {}) {
  const now = new Date('2026-08-18T20:30:00.000Z');
  const token = generateEmailVerificationToken();
  const state = { issued: [], revoked: [], confirmed: [] };
  const service = new EmailVerificationService({
    now: () => now,
    generateToken: () => token,
    store: {
      async replaceActiveToken(input) {
        state.issued.push(input);
        if (issueError ?? storeError) throw issueError ?? storeError;
        return { id: 'verify_1', recipient: 'canonical@example.com' };
      },
      async revokeToken(input) {
        state.revoked.push(input);
        if (revokeError ?? storeError) throw revokeError ?? storeError;
      },
      async confirmToken(input) {
        state.confirmed.push(input);
        if (confirmError ?? storeError) throw confirmError ?? storeError;
        return { verifiedAt: now };
      },
    },
  });

  return { service, state, now, token };
}

function assertNoSecrets(serialized, extra = []) {
  const forbidden = [
    'canonical@example.com',
    'token-invalido',
    'banco indisponível',
    ...extra,
  ];
  for (const value of forbidden) {
    assert.equal(serialized.includes(value), false, `vazou ${value}`);
  }
}

test('o serviço reexporta erros do store integrado sem duplicá-los', async () => {
  const source = await readFile(SERVICE_SOURCE, 'utf8');
  assert.match(source, /from '\.\/email-verification-prisma\.store'/u);
  assert.equal(source.includes('class EmailVerificationStoreRejection'), false);
  assert.equal(source.includes('class EmailVerificationRateLimitExceededError'), false);
  assert.equal(source.includes('process.env'), false);
  assert.equal(source.includes('@Injectable'), false);
  assert.equal(EmailVerificationStoreRejection, IntegratedStoreRejection);
  assert.equal(EmailVerificationRateLimitExceededError, IntegratedRateLimitError);
});

test('emissão persiste somente hash e devolve destinatário canônico do store', async () => {
  const { service, state, now, token } = createHarness();

  const issued = await service.issue('usr_1');

  assert.deepEqual(issued, {
    tokenId: 'verify_1',
    recipient: 'canonical@example.com',
    token,
    expiresAt: issued.expiresAt,
  });
  assert.equal(issued.expiresAt.getTime() - now.getTime(), EMAIL_VERIFICATION_TOKEN_TTL_MS);
  assert.deepEqual(state.issued, [{
    userId: 'usr_1',
    tokenHash: hashEmailVerificationToken(token),
    expiresAt: issued.expiresAt,
    now,
  }]);
  assert.equal(JSON.stringify(state.issued).includes(token), false);
  assert.equal(JSON.stringify(state.issued).includes('canonical@example.com'), false);
  assert.notEqual(issued.recipient, 'usr_1');
});

test('revogação do token emitido delega somente id interno e horário', async () => {
  const { service, state, now } = createHarness();

  await service.revokeIssuedToken('verify_1');

  assert.deepEqual(state.revoked, [{ tokenId: 'verify_1', now }]);
  assert.equal(JSON.stringify(state.revoked).includes('canonical@example.com'), false);
  assert.equal(Object.keys(state.revoked[0]).join(','), 'tokenId,now');
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

test('confirmação inválida não chama o store', async () => {
  const { service, state } = createHarness();

  await assert.rejects(service.confirm('token-invalido'), EmailVerificationRejectedError);
  assert.deepEqual(state.confirmed, []);
  assert.deepEqual(state.issued, []);
});

test('rejeição, expiração, consumo e revogação resultam no mesmo erro público', async () => {
  const outcomes = ['rejeitado', 'expirado', 'consumido', 'revogado'];
  const messages = [];

  for (const _outcome of outcomes) {
    const { service, token } = createHarness({
      confirmError: new EmailVerificationStoreRejection(),
    });
    await assert.rejects(
      service.confirm(token),
      (error) => {
        assert.equal(error instanceof EmailVerificationRejectedError, true);
        assert.equal(error.message, EMAIL_VERIFICATION_REJECTED_MESSAGE);
        messages.push(error.message);
        assertNoSecrets(error.message, [token, hashEmailVerificationToken(token)]);
        return true;
      },
    );
  }

  assert.equal(new Set(messages).size, 1);
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

  await assert.rejects(
    service.confirm(token),
    (error) => {
      assert.equal(error instanceof EmailVerificationUnavailableError, true);
      assert.equal(error.message, EMAIL_VERIFICATION_UNAVAILABLE_MESSAGE);
      assertNoSecrets(error.message, [token]);
      return true;
    },
  );
});

test('rate limit preserva retryAfterMs sem expor dados pessoais', async () => {
  const retryAfterMs = 42_000;
  const { service, state, token } = createHarness({
    issueError: new EmailVerificationRateLimitExceededError(retryAfterMs),
  });

  await assert.rejects(
    service.issue('usr_1'),
    (error) => {
      assert.equal(error instanceof EmailVerificationRateLimitExceededError, true);
      assert.equal(error instanceof EmailVerificationStoreRejection, true);
      assert.equal(error.retryAfterMs, retryAfterMs);
      assertNoSecrets(error.message, [token, 'usr_1']);
      return true;
    },
  );
  assert.equal(JSON.stringify(state.issued).includes(token), false);
  assert.equal(JSON.stringify(state.issued).includes('canonical@example.com'), false);
});

test('erros e logs de verificação não contém e-mail, token, hash ou pepper', async () => {
  const { service, token } = createHarness({
    confirmError: new EmailVerificationStoreRejection(),
  });
  const source = await readFile(SERVICE_SOURCE, 'utf8');

  await assert.rejects(service.confirm(token), EmailVerificationRejectedError);
  assert.equal(source.includes('process.env'), false);
  assertNoSecrets(EMAIL_VERIFICATION_REJECTED_MESSAGE, [token]);
  assertNoSecrets(EMAIL_VERIFICATION_UNAVAILABLE_MESSAGE, [token]);
});
