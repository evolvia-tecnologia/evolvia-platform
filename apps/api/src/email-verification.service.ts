import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  TooManyRequestsException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from './prisma.service';

const TOKEN_MINUTES = 20;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_ISSUES_PER_HOUR = 5;
const MAX_CONFIRM_ATTEMPTS = 5;
const INVALID = 'Não foi possível confirmar o e-mail. Solicite um novo link.';

type PendingParticipant = {
  organizationId: string;
  eventId: string;
  identityHash: string;
  emailHash: string;
};

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class EmailVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  private rawToken(userId: string): string {
    if (process.env.EVOLVIA_CI_MODE === '1') {
      const secret = process.env.JWT_SECRET ?? '';
      if (secret.length < 32) throw new ServiceUnavailableException('Verificação de e-mail indisponível.');
      return createHmac('sha256', secret).update(`email-verification:${userId}`).digest('hex');
    }
    return randomBytes(32).toString('base64url');
  }

  async issue(userId: string, pending?: PendingParticipant) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    if (!user || user.emailVerifiedAt) return { accepted: true };

    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60_000);
    const recent = await this.prisma.emailVerificationToken.findMany({
      where: { userId, createdAt: { gte: hourAgo } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (recent[0] && now.getTime() - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new TooManyRequestsException('Aguarde um minuto antes de solicitar outro link.');
    }
    if (recent.length >= MAX_ISSUES_PER_HOUR) {
      throw new TooManyRequestsException('Limite de reenvios atingido. Tente novamente mais tarde.');
    }

    let effectivePending = pending;
    if (!effectivePending) {
      const previous = await this.prisma.emailVerificationToken.findFirst({
        where: { userId, participantIdentityHash: { not: null }, participantEmailHash: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: {
          organizationId: true, eventId: true,
          participantIdentityHash: true, participantEmailHash: true,
        },
      });
      if (previous?.organizationId && previous.eventId && previous.participantIdentityHash && previous.participantEmailHash) {
        effectivePending = {
          organizationId: previous.organizationId,
          eventId: previous.eventId,
          identityHash: previous.participantIdentityHash,
          emailHash: previous.participantEmailHash,
        };
      }
    }

    const rawToken = this.rawToken(userId);
    const expiresAt = new Date(now.getTime() + TOKEN_MINUTES * 60_000);
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.updateMany({
        where: { userId, consumedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      return tx.emailVerificationToken.create({
        data: {
          userId,
          tokenHash: hash(rawToken),
          expiresAt,
          organizationId: effectivePending?.organizationId,
          eventId: effectivePending?.eventId,
          participantIdentityHash: effectivePending?.identityHash,
          participantEmailHash: effectivePending?.emailHash,
        },
        select: { id: true },
      });
    });

    if (process.env.EVOLVIA_CI_MODE !== '1') {
      const deliveryUrl = process.env.EMAIL_VERIFICATION_DELIVERY_URL;
      const deliveryToken = process.env.EMAIL_VERIFICATION_DELIVERY_TOKEN;
      const publicUrl = process.env.EVOLVIA_PUBLIC_BASE_URL;
      if (!deliveryUrl || !deliveryToken || !publicUrl) {
        await this.prisma.emailVerificationToken.update({ where: { id: created.id }, data: { revokedAt: new Date() } });
        throw new ServiceUnavailableException('O envio do e-mail de confirmação ainda não está configurado.');
      }
      try {
        const response = await fetch(deliveryUrl, {
          method: 'POST',
          headers: { authorization: `Bearer ${deliveryToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            template: 'email-verification',
            to: user.email,
            verificationUrl: `${publicUrl.replace(/\/$/u, '')}/verificar-email?uid=${encodeURIComponent(user.id)}&token=${encodeURIComponent(rawToken)}`,
            expiresAt: expiresAt.toISOString(),
          }),
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error(`delivery status ${response.status}`);
      } catch {
        await this.prisma.emailVerificationToken.update({ where: { id: created.id }, data: { revokedAt: new Date() } });
        throw new ServiceUnavailableException('Não foi possível enviar o e-mail de confirmação.');
      }
    }
    return { accepted: true };
  }

  async confirm(userId: string, rawToken: string) {
    const value = rawToken.trim();
    if (!/^[A-Za-z0-9_-]{32,128}$/u.test(value) || !/^[a-z0-9]{10,64}$/u.test(userId)) {
      throw new UnauthorizedException(INVALID);
    }
    const now = new Date();
    const token = await this.prisma.emailVerificationToken.findFirst({
      where: { userId, consumedAt: null, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!token || token.expiresAt <= now || token.attemptCount >= MAX_CONFIRM_ATTEMPTS) {
      throw new UnauthorizedException(INVALID);
    }
    const attempt = await this.prisma.emailVerificationToken.updateMany({
      where: { id: token.id, consumedAt: null, revokedAt: null, attemptCount: { lt: MAX_CONFIRM_ATTEMPTS } },
      data: { attemptCount: { increment: 1 } },
    });
    if (attempt.count !== 1) throw new UnauthorizedException(INVALID);

    const supplied = Buffer.from(hash(value), 'hex');
    const expected = Buffer.from(token.tokenHash, 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new UnauthorizedException(INVALID);
    }

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.emailVerificationToken.updateMany({
        where: { id: token.id, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (claimed.count !== 1) throw new UnauthorizedException(INVALID);

      if (token.participantIdentityHash && token.participantEmailHash) {
        const existing = await tx.participantIdentityLink.findUnique({
          where: {
            identityHash_emailHash: {
              identityHash: token.participantIdentityHash,
              emailHash: token.participantEmailHash,
            },
          },
          select: { userId: true },
        });
        if (existing && existing.userId !== userId) {
          throw new ConflictException('Essa identidade já está vinculada a outra conta.');
        }
        if (!existing) {
          await tx.participantIdentityLink.create({
            data: {
              userId,
              identityHash: token.participantIdentityHash,
              emailHash: token.participantEmailHash,
            },
          });
        }
      }

      await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } });
      await tx.emailVerificationToken.updateMany({
        where: { userId, id: { not: token.id }, consumedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      if (token.organizationId) {
        await tx.auditLog.create({
          data: {
            organizationId: token.organizationId,
            eventId: token.eventId,
            actorUserId: userId,
            action: 'identity.email_verified',
            entityType: 'User',
            entityId: userId,
            metadata: {} as Prisma.InputJsonObject,
          },
        });
      }
      return { verified: true };
    });
  }
}
