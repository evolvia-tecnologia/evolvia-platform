import { createHash, randomBytes } from 'node:crypto';

export const PASSWORD_RESET_TOKEN_BYTES = 32;
export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

const PASSWORD_RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export const PASSWORD_RECOVERY_PUBLIC_MESSAGE =
  'Se existir uma conta elegível para este e-mail, enviaremos as próximas instruções.';

export type PasswordResetTokenState = 'ACTIVE' | 'EXPIRED' | 'CONSUMED' | 'REVOKED';

export type PasswordResetTokenTimestamps = {
  expiresAt: Date;
  consumedAt?: Date | null;
  revokedAt?: Date | null;
};

export function normalizePasswordRecoveryEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generatePasswordResetToken(): string {
  return randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('base64url');
}

export function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isPasswordResetTokenFormatValid(token: string): boolean {
  return PASSWORD_RESET_TOKEN_PATTERN.test(token);
}

export function getPasswordResetExpiration(now = new Date()): Date {
  return new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS);
}

export function getPasswordResetTokenState(
  token: PasswordResetTokenTimestamps,
  now = new Date(),
): PasswordResetTokenState {
  if (token.consumedAt) return 'CONSUMED';
  if (token.revokedAt) return 'REVOKED';
  if (token.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  return 'ACTIVE';
}
