import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  PasswordResetStore,
  PasswordResetStoreRejection,
} from './password-reset.service';

const MAX_SERIALIZABLE_ATTEMPTS = 3;

@Injectable()
export class PrismaPasswordResetStore implements PasswordResetStore {
  constructor(private readonly prisma: PrismaService) {}

  async resetPassword(input: Readonly<{
    tokenHash: string;
    passwordHash: string;
    now: Date;
  }>): Promise<void> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            const token = await tx.passwordResetToken.findUnique({
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
              throw new PasswordResetStoreRejection();
            }

            const consumed = await tx.passwordResetToken.updateMany({
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
              throw new PasswordResetStoreRejection();
            }

            await tx.user.update({
              where: { id: token.userId },
              data: {
                passwordHash: input.passwordHash,
                credentialVersion: { increment: 1 },
              },
              select: { id: true },
            });

            await tx.passwordRecoveryAuditEvent.create({
              data: {
                action: 'password_recovery.reset',
                outcome: 'RESET_COMPLETED',
                subjectUserId: token.userId,
              },
              select: { id: true },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return;
      } catch (reason) {
        if (reason instanceof PasswordResetStoreRejection) throw reason;
        if (!this.isSerializableConflict(reason) || attempt === MAX_SERIALIZABLE_ATTEMPTS) {
          throw reason;
        }
      }
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
