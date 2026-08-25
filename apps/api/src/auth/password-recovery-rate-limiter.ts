import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { PasswordRecoveryRateLimiter } from './password-recovery-request.service';

export const PASSWORD_RECOVERY_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const PASSWORD_RECOVERY_ORIGIN_LIMIT = 5;
export const PASSWORD_RECOVERY_IDENTITY_LIMIT = 3;

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const SAFE_KEY_HASH = /^[a-f0-9]{64}$/u;

export class PasswordRecoveryRateLimitExceededError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super('Limite temporário de solicitações de recuperação atingido.');
    this.name = 'PasswordRecoveryRateLimitExceededError';
    this.retryAfterMs = retryAfterMs;
  }
}

@Injectable()
export class PrismaPasswordRecoveryRateLimiter implements PasswordRecoveryRateLimiter {
  constructor(private readonly prisma: PrismaService) {}

  async assertAllowed(
    input: Readonly<{ originKey: string; identityKey: string }>,
    now = new Date(),
  ): Promise<void> {
    this.assertSafeKey(input.originKey);
    this.assertSafeKey(input.identityKey);

    const windowStartedAt = new Date(
      Math.floor(now.getTime() / PASSWORD_RECOVERY_RATE_LIMIT_WINDOW_MS) *
        PASSWORD_RECOVERY_RATE_LIMIT_WINDOW_MS,
    );
    const expiresAt = new Date(
      windowStartedAt.getTime() + PASSWORD_RECOVERY_RATE_LIMIT_WINDOW_MS,
    );
    const buckets = [
      { dimension: 'ORIGIN', keyHash: input.originKey, limit: PASSWORD_RECOVERY_ORIGIN_LIMIT },
      { dimension: 'IDENTITY', keyHash: input.identityKey, limit: PASSWORD_RECOVERY_IDENTITY_LIMIT },
    ] as const;

    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            await tx.passwordRecoveryRateLimitBucket.deleteMany({
              where: { expiresAt: { lte: now } },
            });

            for (const bucket of buckets) {
              const current = await tx.passwordRecoveryRateLimitBucket.findUnique({
                where: {
                  dimension_keyHash_windowStartedAt: {
                    dimension: bucket.dimension,
                    keyHash: bucket.keyHash,
                    windowStartedAt,
                  },
                },
                select: { requestCount: true },
              });

              if (current && current.requestCount >= bucket.limit) {
                throw new PasswordRecoveryRateLimitExceededError(
                  Math.max(0, expiresAt.getTime() - now.getTime()),
                );
              }
            }

            for (const bucket of buckets) {
              await tx.passwordRecoveryRateLimitBucket.upsert({
                where: {
                  dimension_keyHash_windowStartedAt: {
                    dimension: bucket.dimension,
                    keyHash: bucket.keyHash,
                    windowStartedAt,
                  },
                },
                create: {
                  dimension: bucket.dimension,
                  keyHash: bucket.keyHash,
                  windowStartedAt,
                  requestCount: 1,
                  expiresAt,
                },
                update: {
                  requestCount: { increment: 1 },
                  expiresAt,
                },
              });
            }
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return;
      } catch (reason) {
        if (reason instanceof PasswordRecoveryRateLimitExceededError) throw reason;
        if (!this.isSerializableConflict(reason) || attempt === MAX_SERIALIZABLE_ATTEMPTS) {
          throw reason;
        }
      }
    }
  }

  private assertSafeKey(value: string): void {
    if (!SAFE_KEY_HASH.test(value)) {
      throw new Error('A chave do rate limit deve ser um HMAC SHA-256 sanitizado.');
    }
  }

  private isSerializableConflict(reason: unknown): boolean {
    return (
      typeof reason === 'object' &&
      reason !== null &&
      'code' in reason &&
      (reason as { code?: unknown }).code === 'P2034'
    );
  }
}
