import { createHash, randomBytes } from 'node:crypto';

export const EMAIL_VERIFICATION_TOKEN_BYTES = 32;
export const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const EMAIL_VERIFICATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export type EmailVerificationTokenState =
  | 'ACTIVE'
  | 'EXPIRED'
  | 'CONSUMED'
  | 'REVOKED';

export type EmailVerificationTokenTimestamps = Readonly<{
  expiresAt: Date;
  consumedAt?: Date | null;
  revokedAt?: Date | null;
}>;

export function normalizeIdentityEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generateEmailVerificationToken(): string {
  return randomBytes(EMAIL_VERIFICATION_TOKEN_BYTES).toString('base64url');
}

export function hashEmailVerificationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isEmailVerificationTokenFormatValid(token: string): boolean {
  return EMAIL_VERIFICATION_TOKEN_PATTERN.test(token);
}

export function getEmailVerificationExpiration(now = new Date()): Date {
  return new Date(now.getTime() + EMAIL_VERIFICATION_TOKEN_TTL_MS);
}

export function getEmailVerificationTokenState(
  token: EmailVerificationTokenTimestamps,
  now = new Date(),
): EmailVerificationTokenState {
  if (token.consumedAt) return 'CONSUMED';
  if (token.revokedAt) return 'REVOKED';
  if (token.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  return 'ACTIVE';
}
