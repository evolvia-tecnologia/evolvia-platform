import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  PasswordRecoveryIdentity,
  PasswordRecoveryRequestStore,
} from './password-recovery-request.service';

const MAX_SERIALIZABLE_ATTEMPTS = 3;

@Injectable()
export class PrismaPasswordRecoveryRequestStore implements PasswordRecoveryRequestStore {
  constructor(private readonly prisma: PrismaService) {}

  async findEligibleIdentityByEmail(email: string): Promise<PasswordRecoveryIdentity | null> {
    const identity = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
      },
    });

    if (!identity?.emailVerifiedAt) return null;

    return {
      id: identity.id,
      verifiedEmail: identity.email,
    };
  }

  async replaceActiveToken(input: Readonly<{
    identityId: string;
    tokenHash: string;
    expiresAt: Date;
  }>): Promise<Readonly<{ id: string }>> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const revokedAt = new Date();
            await tx.passwordResetToken.updateMany({
              where: {
                userId: input.identityId,
                consumedAt: null,
                revokedAt: null,
              },
              data: { revokedAt },
            });

            return tx.passwordResetToken.create({
              data: {
                userId: input.identityId,
                tokenHash: input.tokenHash,
                expiresAt: input.expiresAt,
              },
              select: { id: true },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (reason) {
        if (!this.isSerializableConflict(reason) || attempt === MAX_SERIALIZABLE_ATTEMPTS) {
          throw reason;
        }
      }
    }

    throw new Error('A substituição atômica do token não foi concluída.');
  }

  async revokeToken(tokenId: string): Promise<void> {
    await this.prisma.passwordResetToken.updateMany({
      where: {
        id: tokenId,
        consumedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
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
