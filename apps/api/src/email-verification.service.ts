import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { MembershipStatus, Prisma } from '@prisma/client';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { PrismaService } from './prisma.service';
import { resolveEmailDeliveryConfiguration } from './email-verification-delivery-config';

const TOKEN_MINUTES = 20;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_ISSUES_PER_HOUR = 5;
const MAX_CONFIRM_ATTEMPTS = 5;
const INVALID = 'Não foi possível confirmar o e-mail. Solicite um novo link.';

type VerificationContext = {
  organizationId?: string;
  eventId?: string;
  identityHash?: string;
  emailHash?: string;
};

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  private rawToken(userId: string): string {
    if (process.env.EVOLVIA_CI_MODE === '1') {
      const secret = process.env.JWT_SECRET ?? '';
      if (secret.length < 32) throw new ServiceUnavailableException('Verificação de e-mail indisponível.');
      return createHmac('sha256', secret).update(`email-verification:${userId}`).digest('hex');
    }
    return randomBytes(32).toString('base64url');
  }

  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const retryable = typeof error === 'object' && error !== null && 'code' in error
          && (error as { code?: unknown }).code === 'P2034';
        if (!retryable || attempt === 3) throw error;
      }
    }
    throw new ServiceUnavailableException('Verificação de e-mail indisponível.');
  }

  async issue(userId: string, pending?: VerificationContext) {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60_000);
    const rawToken = this.rawToken(userId);
    const expiresAt = new Date(now.getTime() + TOKEN_MINUTES * 60_000);

    const created = await this.serializable(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, emailVerifiedAt: true },
      });
      if (!user || user.emailVerifiedAt) return null;

      // Check transport configuration before revoking any existing valid link.
      // A missing/invalid secret or HTTPS URL must not consume resend quota.
      const delivery = process.env.EVOLVIA_CI_MODE === '1' ? null : (() => {
        try {
          return resolveEmailDeliveryConfiguration(process.env);
        } catch {
          this.logger.error('email_verification_delivery_configuration_invalid');
          throw new ServiceUnavailableException('O envio do e-mail de confirmação ainda não está configurado.');
        }
      })();

      const recent = await tx.emailVerificationToken.findMany({
        where: { userId, createdAt: { gte: hourAgo } },
        orderBy: { createdAt: 'desc' },
        take: MAX_ISSUES_PER_HOUR,
        select: { createdAt: true },
      });
      if (recent[0] && now.getTime() - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS) {
        throw new HttpException('Aguarde um minuto antes de solicitar outro link.', HttpStatus.TOO_MANY_REQUESTS);
      }
      if (recent.length >= MAX_ISSUES_PER_HOUR) {
        throw new HttpException('Limite de reenvios atingido. Tente novamente mais tarde.', HttpStatus.TOO_MANY_REQUESTS);
      }

      let effectivePending = pending;
      if (!effectivePending) {
        const previous = await tx.emailVerificationToken.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: {
            organizationId: true,
            eventId: true,
            participantIdentityHash: true,
            participantEmailHash: true,
          },
        });
        const membership = previous?.organizationId ? null : await tx.organizationMembership.findFirst({
          where: { userId, status: MembershipStatus.ACTIVE },
          orderBy: { createdAt: 'asc' },
          select: { organizationId: true },
        });
        const legacyLink = previous?.organizationId || membership ? null : await tx.participantIdentityLink.findFirst({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          select: { identityHash: true, emailHash: true },
        });
        const legacyReservation = legacyLink ? await tx.eventRegistrationReservation.findFirst({
          where: { identityHash: legacyLink.identityHash, emailHash: legacyLink.emailHash },
          orderBy: { createdAt: 'desc' },
          select: { organizationId: true, eventId: true },
        }) : null;
        effectivePending = {
          organizationId: previous?.organizationId ?? membership?.organizationId ?? legacyReservation?.organizationId,
          eventId: previous?.eventId ?? legacyReservation?.eventId,
          identityHash: previous?.participantIdentityHash ?? legacyLink?.identityHash,
          emailHash: previous?.participantEmailHash ?? legacyLink?.emailHash,
        };
      }

      await tx.emailVerificationToken.updateMany({
        where: { userId, consumedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      const token = await tx.emailVerificationToken.create({
        data: {
          userId,
          tokenHash: hash(rawToken),
          expiresAt,
          organizationId: effectivePending?.organizationId,
          eventId: effectivePending?.eventId,
          participantIdentityHash: effectivePending?.identityHash,
          participantEmailHash: effectivePending?.emailHash,
        },
        select: { id: true, organizationId: true, eventId: true },
      });
      return { ...token, recipient: user.email, delivery };
    });

    if (!created) return { accepted: true };

    if (process.env.EVOLVIA_CI_MODE !== '1') {
      const delivery = created.delivery;
      if (!delivery) throw new ServiceUnavailableException('Verificação de e-mail indisponível.');
      const { deliveryUrl, actionUrl, bearerToken, sender } = delivery;
      actionUrl.hash = new URLSearchParams({ token: rawToken }).toString();

      try {
        const response = await fetch(deliveryUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': hash(`email-verification:${rawToken}`),
          },
          body: JSON.stringify({
            schema: 'evolvia.transactional-email.v1',
            message: {
              from: sender,
              to: [created.recipient],
              subject: 'Confirme seu e-mail na Evolvia',
              text: [
                'Confirme que este endereço de e-mail pertence a você.',
                '',
                `Acesse o link seguro: ${actionUrl.toString()}`,
                `O link expira em ${expiresAt.toISOString()}.`,
                '',
                'Se você não criou uma conta na Evolvia, ignore esta mensagem.',
              ].join('\n'),
              html: [
                '<p>Confirme que este endereço de e-mail pertence a você.</p>',
                `<p><a href="${actionUrl.toString().replaceAll('&', '&amp;').replaceAll('"', '&quot;')}">Confirmar meu e-mail</a></p>`,
                `<p>O link expira em ${expiresAt.toISOString()}.</p>`,
                '<p>Se você não criou uma conta na Evolvia, ignore esta mensagem.</p>',
              ].join(''),
            },
            metadata: { purpose: 'email-verification', expiresAt: expiresAt.toISOString() },
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error('delivery rejected');
      } catch {
        this.logger.error('email_verification_delivery_failed');
        await this.prisma.emailVerificationToken.updateMany({
          where: { id: created.id, consumedAt: null },
          data: { revokedAt: new Date() },
        });
        throw new ServiceUnavailableException('Não foi possível enviar o e-mail de confirmação.');
      }
    }
    return { accepted: true };
  }

  async confirm(rawToken: string) {
    const value = rawToken.trim();
    if (!/^[A-Za-z0-9_-]{32,128}$/u.test(value)) {
      throw new UnauthorizedException(INVALID);
    }
    const now = new Date();
    const tokenHash = hash(value);
    const token = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!token || token.consumedAt || token.revokedAt || token.expiresAt <= now
      || token.attemptCount >= MAX_CONFIRM_ATTEMPTS) {
      throw new UnauthorizedException(INVALID);
    }
    const attempt = await this.prisma.emailVerificationToken.updateMany({
      where: { id: token.id, consumedAt: null, revokedAt: null, attemptCount: { lt: MAX_CONFIRM_ATTEMPTS } },
      data: { attemptCount: { increment: 1 } },
    });
    if (attempt.count !== 1) throw new UnauthorizedException(INVALID);

    return this.serializable(async (tx) => {
      const claimed = await tx.emailVerificationToken.updateMany({
        where: { id: token.id, tokenHash, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
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
        if (existing && existing.userId !== token.userId) {
          throw new ConflictException('Essa identidade já está vinculada a outra conta.');
        }
        if (!existing) {
          await tx.participantIdentityLink.create({
            data: {
              userId: token.userId,
              identityHash: token.participantIdentityHash,
              emailHash: token.participantEmailHash,
            },
          });
        }
      }

      await tx.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: now } });
      await tx.emailVerificationToken.updateMany({
        where: { userId: token.userId, id: { not: token.id }, consumedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      if (token.organizationId) {
        await tx.auditLog.create({
          data: {
            organizationId: token.organizationId,
            eventId: token.eventId,
            actorUserId: token.userId,
            action: 'identity.email_verified',
            entityType: 'User',
            entityId: token.userId,
            metadata: {} as Prisma.InputJsonObject,
          },
        });
      }
      return { verified: true };
    });
  }
}
