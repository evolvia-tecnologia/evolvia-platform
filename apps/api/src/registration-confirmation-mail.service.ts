import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, RegistrationReservationStatus } from '@prisma/client';
import type { ConfirmedRegistrationNotice } from './integration-foundation.policy';
import { PrismaService } from './prisma.service';
import {
  CONFIRMATION_EMAIL_ATTEMPT_LIMIT,
  type ConfirmationEmailReason,
  confirmationEmailMetadata,
  confirmationMessage,
  credentialUrl,
  isDeliveryTimeout,
  readDeliveryConfig,
  readRegistrationEmail,
} from './registration-confirmation-mail.policy';

const ACCEPTED = 'registration.confirmation_email_accepted';
const FAILED = 'registration.confirmation_email_failed';

type Poster = (url: string, body: string, headers: Record<string, string>) => Promise<number>;

async function postDelivery(url: string, body: string, headers: Record<string, string>): Promise<number> {
  const response = await fetch(url, { method: 'POST', redirect: 'error', headers, body, signal: AbortSignal.timeout(10_000) });
  try {
    return response.status;
  } finally {
    await response.body?.cancel().catch(() => undefined);
  }
}

@Injectable()
export class RegistrationConfirmationMailService {
  private readonly logger = new Logger(RegistrationConfirmationMailService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendConfirmed(notice: ConfirmedRegistrationNotice, poster: Poster = postDelivery): Promise<void> {
    try {
      const scope = {
        organizationId: notice.organizationId,
        eventId: notice.eventId,
        reservationId: notice.reservationId,
      };
      const reservation = await this.prisma.eventRegistrationReservation.findFirst({
        where: { id: scope.reservationId, eventId: scope.eventId, organizationId: scope.organizationId },
        select: {
          status: true,
          registrationData: true,
          event: { select: { name: true, organizationId: true } },
        },
      });
      if (!reservation || reservation.event.organizationId !== scope.organizationId) return;
      if (reservation.status !== RegistrationReservationStatus.CONFIRMED) return;
      if (await this.attemptsExhausted(scope)) return;

      const recipient = readRegistrationEmail(reservation.registrationData);
      if (!recipient) {
        await this.record(scope, 'missing_recipient');
        return;
      }
      const config = readDeliveryConfig(process.env);
      const link = config ? credentialUrl(config.publicBaseUrl, notice.slug, notice.protocol) : null;
      if (!config || !link) {
        await this.record(scope, 'not_configured');
        return;
      }
      const body = JSON.stringify(confirmationMessage({
        eventName: reservation.event.name,
        protocol: notice.protocol,
        credentialUrl: link,
        sender: config.sender,
        recipient,
      }));
      try {
        const status = await poster(config.endpoint, body, {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': createHash('sha256').update(`registration-confirmation:${scope.reservationId}`).digest('hex'),
        });
        if (status < 200 || status >= 300) {
          await this.record(scope, 'rejected');
          return;
        }
        await this.record(scope, 'provider_accepted');
      } catch (error) {
        await this.record(scope, isDeliveryTimeout(error) ? 'timeout' : 'rejected');
      }
    } catch (error) {
      this.logger.error(error instanceof Error ? error.name : 'registration_confirmation_mail_failed');
      return;
    }
  }

  private async attemptsExhausted(scope: { organizationId: string; eventId: string; reservationId: string }) {
    const where = {
      organizationId: scope.organizationId,
      eventId: scope.eventId,
      entityId: scope.reservationId,
    };
    // Preparation failures never reached the provider. Keep them auditable,
    // but allow a later notification to recover after configuration is fixed.
    // Check acceptance separately so a bounded/unsorted failure list cannot hide it.
    const accepted = await this.prisma.auditLog.findFirst({
      where: { ...where, action: ACCEPTED }, select: { id: true },
    });
    if (accepted) return true;
    const attempts = await this.prisma.auditLog.count({
      where: {
        ...where,
        action: FAILED,
        OR: ['rejected', 'timeout', 'audit_failed'].map((reason) => ({
          metadata: { path: ['reason'], equals: reason },
        })),
      },
    });
    return attempts >= CONFIRMATION_EMAIL_ATTEMPT_LIMIT;
  }

  private async record(
    scope: { organizationId: string; eventId: string; reservationId: string },
    reason: ConfirmationEmailReason,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: scope.organizationId,
          eventId: scope.eventId,
          action: reason === 'provider_accepted' ? ACCEPTED : FAILED,
          entityType: 'EventRegistrationReservation',
          entityId: scope.reservationId,
          metadata: confirmationEmailMetadata(reason) as Prisma.InputJsonObject,
        },
      });
    } catch {
      if (reason === 'provider_accepted') return;
      try {
        await this.prisma.auditLog.create({
          data: {
            organizationId: scope.organizationId,
            eventId: scope.eventId,
            action: FAILED,
            entityType: 'EventRegistrationReservation',
            entityId: scope.reservationId,
            metadata: confirmationEmailMetadata('audit_failed') as Prisma.InputJsonObject,
          },
        });
      } catch {
        return;
      }
    }
  }
}

