import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, RegistrationReservationStatus } from '@prisma/client';
import type { ConfirmedRegistrationNotice } from './integration-foundation.policy';
import { PrismaService } from './prisma.service';
import {
  CONFIRMATION_EMAIL_ATTEMPT_LIMIT,
  type ConfirmationEmailReason,
  confirmationMessage,
  credentialUrl,
  readDeliveryConfig,
  readRegistrationEmail,
} from './registration-confirmation-mail.policy';

const DELIVERED = 'registration.confirmation_email_delivered';
const FAILED = 'registration.confirmation_email_failed';

type Poster = (url: string, body: string, headers: Record<string, string>) => Promise<number>;

async function postDelivery(url: string, body: string, headers: Record<string, string>): Promise<number> {
  const response = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
  return response.status;
}

@Injectable()
export class RegistrationConfirmationMailService {
  constructor(private readonly prisma: PrismaService) {}

  async sendConfirmed(notice: ConfirmedRegistrationNotice, poster: Poster = postDelivery): Promise<void> {
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
      await this.record(scope, false, 'missing_recipient');
      return;
    }
    const config = readDeliveryConfig(process.env);
    const link = config ? credentialUrl(config.publicBaseUrl, notice.slug, notice.protocol) : null;
    if (!config || !link) {
      await this.record(scope, false, 'not_configured');
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
        await this.record(scope, false, 'rejected');
        return;
      }
      await this.record(scope, true, 'delivered');
    } catch {
      await this.record(scope, false, 'rejected');
    }
  }

  private async attemptsExhausted(scope: { organizationId: string; eventId: string; reservationId: string }) {
    const prior = await this.prisma.auditLog.findMany({
      where: {
        organizationId: scope.organizationId,
        eventId: scope.eventId,
        entityId: scope.reservationId,
        action: { in: [DELIVERED, FAILED] },
      },
      select: { action: true },
      take: CONFIRMATION_EMAIL_ATTEMPT_LIMIT,
    });
    return prior.some((row) => row.action === DELIVERED) || prior.length >= CONFIRMATION_EMAIL_ATTEMPT_LIMIT;
  }

  private async record(
    scope: { organizationId: string; eventId: string; reservationId: string },
    delivered: boolean,
    reason: ConfirmationEmailReason,
  ) {
    await this.prisma.auditLog.create({
      data: {
        organizationId: scope.organizationId,
        eventId: scope.eventId,
        action: delivered ? DELIVERED : FAILED,
        entityType: 'EventRegistrationReservation',
        entityId: scope.reservationId,
        metadata: { delivered, reason } as Prisma.InputJsonObject,
      },
    });
  }
}
