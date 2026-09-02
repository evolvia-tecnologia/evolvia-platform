import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
export const EMAIL_VERIFICATION_RESEND_WINDOW_MS = 15 * 60 * 1000;
export const EMAIL_VERIFICATION_RESEND_LIMIT = 3;

const MAX_SERIALIZABLE_ATTEMPTS = 3;

export class EmailVerificationStoreRejection extends Error {
  constructor() {
    super('A verificação de e-mail não pode ser concluída.');
    this.name = 'EmailVerificationStoreRejection';
  }
}

export class EmailVerificationRateLimitExceededError
  extends EmailVerificationStoreRejection {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super();
    this.name = 'EmailVerificationRateLimitExceededError';
    this.retryAfterMs = retryAfterMs;
  }
}

export interface EmailVerificationStore {
  replaceActiveToken(input: Readonly<{
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  }>): Promise<Readonly<{ id: string; recipient: string }>>;
  revokeToken(input: Readonly<{
    tokenId: string;
    now: Date;
  }>): Promise<void>;
  confirmToken(input: Readonly<{
    tokenHash: string;
    now: Date;
  }>): Promise<Readonly<{ verifiedAt: Date }>>;
}

@Injectable()
export class PrismaEmailVerificationStore implements EmailVerificationStore {
  constructor(private readonly prisma: PrismaService) {}

  async replaceActiveToken(input: Readonly<{
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  }>): Promise<Readonly<{ id: string; recipient: string }>> {
    return this.withSerializableRetry(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { id: true, email: true, emailVerifiedAt: true },
      });

      if (!user || user.emailVerifiedAt) {
        throw new EmailVerificationStoreRejection();
      }

      const windowStartedAt = new Date(
        input.now.getTime() - EMAIL_VERIFICATION_RESEND_WINDOW_MS,
      );
      const recentTokens = await tx.emailVerificationToken.findMany({
        where: {
          userId: input.userId,
          createdAt: { gte: windowStartedAt },
        },
        orderBy: { createdAt: 'desc' },
        take: EMAIL_VERIFICATION_RESEND_LIMIT,
        select: { createdAt: true },
      });
      const latestToken = recentTokens[0];
      if (latestToken) {
        const cooldownEndsAt =
          latestToken.createdAt.getTime() + EMAIL_VERIFICATION_RESEND_COOLDOWN_MS;
        if (cooldownEndsAt > input.now.getTime()) {
          throw new EmailVerificationRateLimitExceededError(
            cooldownEndsAt - input.now.getTime(),
          );
        }
      }
      if (recentTokens.length >= EMAIL_VERIFICATION_RESEND_LIMIT) {
        const oldestCountedToken =
          recentTokens[EMAIL_VERIFICATION_RESEND_LIMIT - 1];
        const windowEndsAt =
          oldestCountedToken.createdAt.getTime() +
          EMAIL_VERIFICATION_RESEND_WINDOW_MS;
        if (windowEndsAt > input.now.getTime()) {
          throw new EmailVerificationRateLimitExceededError(
            windowEndsAt - input.now.getTime(),
          );
        }
      }

      await tx.emailVerificationToken.updateMany({
        where: {
          userId: input.userId,
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: input.now },
      });

      const token = await tx.emailVerificationToken.create({
        data: {
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        },
        select: { id: true },
      });

      return { id: token.id, recipient: user.email };
    });
  }

  async revokeToken(input: Readonly<{
    tokenId: string;
    now: Date;
  }>): Promise<void> {
    await this.prisma.emailVerificationToken.updateMany({
      where: {
        id: input.tokenId,
        consumedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: input.now },
    });
  }

  async confirmToken(input: Readonly<{
    tokenHash: string;
    now: Date;
  }>): Promise<Readonly<{ verifiedAt: Date }>> {
    return this.withSerializableRetry(async (tx) => {
      const token = await tx.emailVerificationToken.findUnique({
        where: { tokenHash: input.tokenHash },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          consumedAt: true,
          revokedAt: true,
        },
      });

      if (
        !token ||
        token.consumedAt ||
        token.revokedAt ||
        token.expiresAt.getTime() <= input.now.getTime()
      ) {
        throw new EmailVerificationStoreRejection();
      }

      const consumed = await tx.emailVerificationToken.updateMany({
        where: {
          id: token.id,
          tokenHash: input.tokenHash,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: input.now },
        },
        data: { consumedAt: input.now },
      });

      if (consumed.count !== 1) {
        throw new EmailVerificationStoreRejection();
      }

      const verified = await tx.user.updateMany({
        where: { id: token.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: input.now },
      });

      if (verified.count !== 1) {
        throw new EmailVerificationStoreRejection();
      }

      await tx.emailVerificationToken.updateMany({
        where: {
          userId: token.userId,
          id: { not: token.id },
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: input.now },
      });

      return { verifiedAt: input.now };
    });
  }

  private async withSerializableRetry<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (reason) {
        if (
          reason instanceof EmailVerificationStoreRejection ||
          !this.isSerializableConflict(reason) ||
          attempt === MAX_SERIALIZABLE_ATTEMPTS
        ) {
          throw reason;
        }
      }
    }

    throw new Error('A transação de verificação de e-mail não foi concluída.');
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
