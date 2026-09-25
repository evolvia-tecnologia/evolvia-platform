import { Injectable, UnauthorizedException } from '@nestjs/common';
import { EventStatus, Prisma, RegistrationReservationStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from './prisma.service';
import { issueCheckInCode } from './check-in-policy';
import {
  ParticipantAccessInput,
  ParticipantAreaPolicyError,
  normalizeParticipantAccess,
  normalizeParticipantToken,
  participantHash,
  secureHashMatches,
} from './participant-area-policy';

const SESSION_MINUTES = 15;
const INVALID_ACCESS = 'Não foi possível validar os dados de acesso.';

@Injectable()
export class ParticipantAreaService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(slugValue: string, rawInput: ParticipantAccessInput) {
    let input: { protocol: string; identityDocument: string };
    try { input = normalizeParticipantAccess(rawInput); }
    catch (error) { throw new UnauthorizedException(error instanceof ParticipantAreaPolicyError ? error.message : INVALID_ACCESS); }

    const event = await this.prisma.event.findUnique({
      where: { slug: slugValue.trim().toLowerCase() },
      select: { id: true, organizationId: true, status: true },
    });
    if (!event?.organizationId || event.status !== EventStatus.PUBLISHED) throw new UnauthorizedException(INVALID_ACCESS);
    const organizationId = event.organizationId;

    const reservation = await this.prisma.eventRegistrationReservation.findFirst({
      where: { protocol: input.protocol, eventId: event.id, organizationId },
      select: { id: true, identityHash: true },
    });
    const suppliedHash = participantHash(input.identityDocument);
    if (!reservation || !secureHashMatches(reservation.identityHash, suppliedHash)) throw new UnauthorizedException(INVALID_ACCESS);

    return this.issueSession(event.id, organizationId, reservation.id);
  }

  async createSessionForReservation(eventId: string, organizationId: string, reservationId: string) {
    return this.issueSession(eventId, organizationId, reservationId);
  }

  private async issueSession(eventId: string, organizationId: string, reservationId: string) {

    const token = randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_MINUTES * 60_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.participantAccessSession.deleteMany({
        where: {
          organizationId,
          eventId: eventId,
          reservationId: reservationId,
          OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }],
        },
      });
      const session = await tx.participantAccessSession.create({
        data: {
          organizationId,
          eventId: eventId,
          reservationId: reservationId,
          tokenHash: participantHash(token),
          expiresAt,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          eventId: eventId,
          action: 'participant.session_created',
          entityType: 'ParticipantAccessSession',
          entityId: session.id,
          metadata: { expiresAt: expiresAt.toISOString() } as Prisma.InputJsonObject,
        },
      });
    });
    return { accessToken: token, expiresAt: expiresAt.toISOString() };
  }

  async getArea(slugValue: string, authorization?: string) {
    const session = await this.requireSession(slugValue, authorization);
    await this.prisma.participantAccessSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
    return {
      event: session.reservation.event,
      registration: {
        protocol: session.reservation.protocol,
        status: session.reservation.status,
        category: session.reservation.category.name,
        lot: session.reservation.lot.name,
        finalPriceCents: session.reservation.finalPriceCents,
        confirmedAt: session.reservation.confirmedAt?.toISOString() ?? null,
        expiresAt: session.reservation.expiresAt?.toISOString() ?? null,
      },
      credential: session.reservation.status === RegistrationReservationStatus.CONFIRMED ? {
        code: issueCheckInCode(session.eventId, session.reservationId, process.env.JWT_SECRET ?? ''),
        checkedInAt: session.reservation.checkIn?.checkedInAt.toISOString() ?? null,
      } : null,
      paymentReceipt: session.reservation.status === RegistrationReservationStatus.CONFIRMED
        && session.reservation.checkout?.status === 'PAID' && session.reservation.paymentReceipt
        ? {
          number: session.reservation.paymentReceipt.number,
          amountCents: session.reservation.paymentReceipt.amountCents,
          paidAt: session.reservation.paymentReceipt.paidAt.toISOString(),
          issuedAt: session.reservation.paymentReceipt.issuedAt.toISOString(),
          seller: session.reservation.paymentReceipt.sellerSnapshot,
        } : null,
      fiscalDocument: { status: 'NOT_CONFIGURED' as const },
      payment: session.reservation.checkout ? {
        status: session.reservation.checkout.status,
        paidAt: session.reservation.checkout.paidAt?.toISOString() ?? null,
      } : null,
      sessionExpiresAt: session.expiresAt.toISOString(),
    };
  }

  async requireConfirmedScope(slugValue: string, authorization?: string) {
    const session = await this.requireSession(slugValue, authorization);
    if (session.reservation.status !== RegistrationReservationStatus.CONFIRMED) {
      throw new UnauthorizedException('Inscrição confirmada necessária.');
    }
    return { eventId: session.eventId, organizationId: session.organizationId, reservationId: session.reservationId };
  }

  async revoke(slugValue: string, authorization?: string) {
    const session = await this.requireSession(slugValue, authorization);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.participantAccessSession.update({ where: { id: session.id }, data: { revokedAt: now } });
      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          eventId: session.eventId,
          action: 'participant.session_revoked',
          entityType: 'ParticipantAccessSession',
          entityId: session.id,
          metadata: {} as Prisma.InputJsonObject,
        },
      });
    });
    return { revoked: true };
  }

  private async requireSession(slugValue: string, authorization?: string) {
    let token: string;
    try { token = normalizeParticipantToken(authorization); }
    catch { throw new UnauthorizedException('Sessão inválida ou expirada.'); }
    const now = new Date();
    const session = await this.prisma.participantAccessSession.findFirst({
      where: {
        tokenHash: participantHash(token), revokedAt: null, expiresAt: { gt: now },
        reservation: { event: { slug: slugValue.trim().toLowerCase(), status: EventStatus.PUBLISHED } },
      },
      include: {
        reservation: {
          select: {
            protocol: true, status: true, finalPriceCents: true, confirmedAt: true, expiresAt: true,
            event: { select: { name: true, slug: true, profileCode: true, startDate: true, endDate: true, format: true, venue: true } },
            category: { select: { name: true } }, lot: { select: { name: true } },
            checkout: { select: { status: true, paidAt: true } },
            paymentReceipt: { select: { number: true, amountCents: true, paidAt: true, issuedAt: true, sellerSnapshot: true } },
            checkIn: { select: { checkedInAt: true } },
          },
        },
      },
    });
    if (!session) throw new UnauthorizedException('Sessão inválida ou expirada.');
    return session;
  }
}
