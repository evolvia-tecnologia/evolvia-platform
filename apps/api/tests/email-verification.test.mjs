import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMAIL_VERIFICATION_TOKEN_TTL_MS,
  generateEmailVerificationToken,
  getEmailVerificationExpiration,
  getEmailVerificationTokenState,
  hashEmailVerificationToken,
  isEmailVerificationTokenFormatValid,
  normalizeIdentityEmail,
} from '../dist/auth/email-verification.js';

test('gera token de verificação opaco com 256 bits', () => {
  const first = generateEmailVerificationToken();
  const second = generateEmailVerificationToken();

  assert.equal(isEmailVerificationTokenFormatValid(first), true);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/u);
  assert.notEqual(first, second);
});

test('recusa formatos que não correspondem ao token canônico', () => {
  assert.equal(isEmailVerificationTokenFormatValid(''), false);
  assert.equal(isEmailVerificationTokenFormatValid('token-curto'), false);
  assert.equal(isEmailVerificationTokenFormatValid('a'.repeat(44)), false);
  assert.equal(isEmailVerificationTokenFormatValid('a'.repeat(42) + '='), false);
});

test('produz somente hash SHA-256 determinístico para persistência', () => {
  const token = generateEmailVerificationToken();
  const hash = hashEmailVerificationToken(token);

  assert.match(hash, /^[a-f0-9]{64}$/u);
  assert.equal(hash, hashEmailVerificationToken(token));
  assert.equal(hash.includes(token), false);
});

test('normaliza endereço sem inferir verificação', () => {
  assert.equal(normalizeIdentityEmail('  Pessoa@Exemplo.COM  '), 'pessoa@exemplo.com');
});

test('calcula expiração inicial em 24 horas', () => {
  const now = new Date('2026-08-18T00:00:00.000Z');

  assert.equal(
    getEmailVerificationExpiration(now).getTime() - now.getTime(),
    EMAIL_VERIFICATION_TOKEN_TTL_MS,
  );
});

test('classifica consumo, revogação e expiração com precedência segura', () => {
  const now = new Date('2026-08-18T00:00:00.000Z');
  const future = new Date(now.getTime() + 1_000);
  const past = new Date(now.getTime() - 1_000);

  assert.equal(getEmailVerificationTokenState({ expiresAt: future }, now), 'ACTIVE');
  assert.equal(getEmailVerificationTokenState({ expiresAt: past }, now), 'EXPIRED');
  assert.equal(
    getEmailVerificationTokenState({ expiresAt: future, revokedAt: now }, now),
    'REVOKED',
  );
  assert.equal(
    getEmailVerificationTokenState(
      { expiresAt: future, revokedAt: now, consumedAt: now },
      now,
    ),
    'CONSUMED',
  );
});
