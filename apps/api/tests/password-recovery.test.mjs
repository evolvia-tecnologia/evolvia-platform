import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PASSWORD_RECOVERY_PUBLIC_MESSAGE,
  PASSWORD_RESET_TOKEN_TTL_MS,
  generatePasswordResetToken,
  getPasswordResetExpiration,
  getPasswordResetTokenState,
  hashPasswordResetToken,
  isPasswordResetTokenFormatValid,
  normalizePasswordRecoveryEmail,
} from '../dist/auth/password-recovery.js';

test('gera token opaco com 256 bits em base64url', () => {
  const first = generatePasswordResetToken();
  const second = generatePasswordResetToken();

  assert.match(first, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(isPasswordResetTokenFormatValid(first), true);
  assert.notEqual(first, second);
});

test('persiste somente hash SHA-256 determinístico e nunca o token puro', () => {
  const token = generatePasswordResetToken();
  const hash = hashPasswordResetToken(token);

  assert.match(hash, /^[a-f0-9]{64}$/u);
  assert.equal(hash, hashPasswordResetToken(token));
  assert.equal(hash.includes(token), false);
});

test('normaliza e-mail sem carregar organização ou evento', () => {
  assert.equal(normalizePasswordRecoveryEmail('  Pessoa@Exemplo.COM  '), 'pessoa@exemplo.com');
});

test('calcula expiração inicial de 30 minutos', () => {
  const now = new Date('2026-08-17T07:00:00.000Z');
  assert.equal(
    getPasswordResetExpiration(now).getTime() - now.getTime(),
    PASSWORD_RESET_TOKEN_TTL_MS,
  );
});

test('classifica uso único, revogação e expiração com precedência segura', () => {
  const now = new Date('2026-08-17T07:00:00.000Z');
  const future = new Date(now.getTime() + 1_000);
  const past = new Date(now.getTime() - 1_000);

  assert.equal(getPasswordResetTokenState({ expiresAt: future }, now), 'ACTIVE');
  assert.equal(getPasswordResetTokenState({ expiresAt: past }, now), 'EXPIRED');
  assert.equal(
    getPasswordResetTokenState({ expiresAt: future, revokedAt: now }, now),
    'REVOKED',
  );
  assert.equal(
    getPasswordResetTokenState(
      { expiresAt: future, revokedAt: now, consumedAt: now },
      now,
    ),
    'CONSUMED',
  );
});

test('mensagem pública não confirma existência da conta', () => {
  assert.equal(PASSWORD_RECOVERY_PUBLIC_MESSAGE.includes('há uma conta'), false);
  assert.match(PASSWORD_RECOVERY_PUBLIC_MESSAGE, /Se existir uma conta elegível/u);
});
