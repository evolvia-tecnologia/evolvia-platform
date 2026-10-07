import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { EventStatus, RegistrationReservationStatus } from '@prisma/client';
import { issueCheckInCode, verifyCheckInCode } from './check-in-policy';
import { recordCheckIn } from './check-in-record';
import { PrismaService } from './prisma.service';
import {
  ShowEntrancePolicyError,
  TURNSTILE_DENIED_MESSAGE,
  TURNSTILE_PAGE_LIMIT,
  classifyEntranceCode,
  hashSecret,
  normalizeCursor,
  normalizePublicSlug,
  parseTurnstileBearer,
  projectTurnstileTicket,
  registrationDisplayName,
  showTicketStatus,
  type TurnstileShare,
} from './show-entrance.policy';

const INVALID_KEY = 'Credencial inválida.';

type KeyRecord = {
  id: string;
  organizationId: string;
  eventId: string;
  createdByUserId: string;
  shareName: boolean;
  shareTicketType: boolean;
  shareStatus: boolean;
  shareCode: boolean;
  event: { id: string; slug: string; status: EventStatus; organizationId: string | null };
};

@Injectable()
export class TurnstileService {
  constructor(private readonly prisma: PrismaService) {}

  async listTickets(slug: string, authorization: string | undefined, cursor: unknown) {
    const key = await this.authorize(slug, authorization);
    let after: string | null = null;
    try { after = normalizeCursor(cursor); } catch (error) {
      if (error instanceof ShowEntrancePolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    const share = this.shareOf(key);
    const rows = await this.prisma.eventRegistrationReservation.findMany({
      where: {
        organizationId: key.organizationId,
        eventId: key.eventId,
        ...(after ? { id: { gt: after } } : {}),
        OR: [
          { status: RegistrationReservationStatus.CANCELLED },
          { status: RegistrationReservationStatus.CONFIRMED, finalPriceCents: 0 },
          { status: RegistrationReservationStatus.CONFIRMED, finalPriceCents: { gt: 0 }, checkout: { is: { status: 'PAID' } } },
        ],
      },
      orderBy: { id: 'asc' },
      take: TURNSTILE_PAGE_LIMIT + 1,
      select: {
        id: true,
        status: true,
        finalPriceCents: true,
        ...(share.shareName ? { registrationData: true } : {}),
        category: { select: { name: true } },
        checkout: { select: { status: true } },
      },
    });
    const page = rows.slice(0, TURNSTILE_PAGE_LIMIT);
    const tickets = page.flatMap((row) => {
      const status = showTicketStatus({
        status: row.status,
        finalPriceCents: row.finalPriceCents,
        checkoutStatus: row.checkout?.status ?? null,
      });
      if (!status) return [];
      return [projectTurnstileTicket(share, {
        participantName: share.shareName ? registrationDisplayName(row.registrationData) : null,
        ticketType: row.category.name,
        status,
        ticketCode: share.shareCode ? issueCheckInCode(key.eventId, row.id, process.env.JWT_SECRET ?? '') : '',
      })];
    });
    return {
      tickets,
      nextCursor: rows.length > TURNSTILE_PAGE_LIMIT ? page[page.length - 1]?.id ?? null : null,
    };
  }

  async validateEntry(slug: string, authorization: string | undefined, input: { code?: unknown }) {
    const key = await this.authorize(slug, authorization);
    if (typeof input?.code !== 'string' || input.code.trim() === '') {
      throw new BadRequestException('Informe o código do ingresso.');
    }
    const classified = classifyEntranceCode(input.code);
    if (classified.kind !== 'TICKET') return { result: 'DENIED' as const, message: TURNSTILE_DENIED_MESSAGE };

    const reservationId = verifyCheckInCode(key.eventId, classified.code, process.env.JWT_SECRET ?? '');
    if (!reservationId) return { result: 'DENIED' as const, message: TURNSTILE_DENIED_MESSAGE };
    const share = this.shareOf(key);

    const reservation = await this.prisma.eventRegistrationReservation.findUnique({
      where: { id_eventId_organizationId: { id: reservationId, eventId: key.eventId, organizationId: key.organizationId } },
      select: {
        id: true,
        status: true,
        finalPriceCents: true,
        ...(share.shareName ? { registrationData: true } : {}),
        category: { select: { name: true } },
        checkout: { select: { status: true } },
        checkIn: { select: { checkedInAt: true, reversedAt: true } },
      },
    });
    const ticketStatus = reservation ? showTicketStatus({
      status: reservation.status,
      finalPriceCents: reservation.finalPriceCents,
      checkoutStatus: reservation.checkout?.status ?? null,
    }) : null;
    if (!reservation || (ticketStatus !== 'PAGO' && ticketStatus !== 'ISENTO')) {
      return { result: 'DENIED' as const, message: TURNSTILE_DENIED_MESSAGE };
    }

    const ticket = projectTurnstileTicket(share, {
      participantName: share.shareName ? registrationDisplayName(reservation.registrationData) : null,
      ticketType: reservation.category.name,
      status: ticketStatus,
      ticketCode: share.shareCode ? classified.code : '',
    });
    if (reservation.checkIn && !reservation.checkIn.reversedAt) {
      await this.touchKey(key.id);
      return { result: 'ALREADY_USED' as const, checkedInAt: reservation.checkIn.checkedInAt.toISOString(), ticket };
    }

    const checkedInAt = await this.prisma.$transaction(async (tx) => {
      const created = await recordCheckIn(tx, {
        reservationId: reservation.id,
        eventId: key.eventId,
        organizationId: key.organizationId,
      }, key.createdByUserId, { source: 'turnstile', keyId: key.id });
      await tx.eventTurnstileKey.update({ where: { id: key.id }, data: { lastUsedAt: created.checkedInAt } });
      return created;
    });
    if (checkedInAt.alreadyCheckedIn) {
      return { result: 'ALREADY_USED' as const, checkedInAt: checkedInAt.checkedInAt.toISOString(), ticket };
    }
    return { result: 'VALIDATED' as const, checkedInAt: checkedInAt.checkedInAt.toISOString(), ticket };
  }

  private shareOf(key: KeyRecord): TurnstileShare {
    return {
      shareName: key.shareName,
      shareTicketType: key.shareTicketType,
      shareStatus: key.shareStatus,
      shareCode: key.shareCode,
    };
  }

  private async touchKey(keyId: string) {
    await this.prisma.eventTurnstileKey.update({ where: { id: keyId }, data: { lastUsedAt: new Date() } });
  }

  private async authorize(slug: string, authorization: string | undefined): Promise<KeyRecord> {
    const normalizedSlug = normalizePublicSlug(slug);
    const secret = parseTurnstileBearer(authorization);
    if (!normalizedSlug || !secret) throw new UnauthorizedException(INVALID_KEY);
    const key = await this.prisma.eventTurnstileKey.findUnique({
      where: { keyHash: hashSecret(secret) },
      select: {
        id: true,
        organizationId: true,
        eventId: true,
        createdByUserId: true,
        shareName: true,
        shareTicketType: true,
        shareStatus: true,
        shareCode: true,
        expiresAt: true,
        revokedAt: true,
        event: { select: { id: true, slug: true, status: true, organizationId: true } },
      },
    });
    const usable = key
      && !key.revokedAt
      && key.expiresAt.getTime() > Date.now()
      && key.event.organizationId === key.organizationId
      && key.event.slug === normalizedSlug
      && key.event.status === EventStatus.PUBLISHED;
    if (!key || !usable) throw new UnauthorizedException(INVALID_KEY);
    return key;
  }
}
