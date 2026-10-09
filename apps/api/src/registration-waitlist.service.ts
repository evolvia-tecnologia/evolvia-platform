import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventStatus, MembershipRole, Prisma, RegistrationReservationStatus, RegistrationWaitlistStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuthorizationService } from './authorization.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { normalizeIdentityDocument, participantHash } from './participant-area-policy';
import { PrismaService } from './prisma.service';
import { PublicRegistrationInput } from './registration-reservations-policy';
import { RegistrationReservationsService, activeWaitlistOfferWhere } from './registration-reservations.service';
import {
  RegistrationWaitlistPolicyError,
  WAITLIST_ORDER_LABEL,
  combinedFreeSeats,
  effectiveWaitlistStatus,
  freeSeats,
  normalizeWaitlistConfig,
  normalizeWaitlistKey,
  normalizeWaitlistLotId,
  offerExpiresAt,
  queueOrder,
  waitlistAcceptsEntries,
  waitlistEntryCode,
} from './registration-waitlist-policy';

const STAFF_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.OPERATOR];
const ACTIVE_RESERVATION_STATUSES = [RegistrationReservationStatus.PENDING_PAYMENT, RegistrationReservationStatus.CONFIRMED];
const ORGANIZER_ENTRY_LIMIT = 500;

type Client = Prisma.TransactionClient | PrismaService;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function policy<T>(task: () => T): T {
  try {
    return task();
  } catch (error) {
    if (error instanceof RegistrationWaitlistPolicyError) throw new BadRequestException(error.message);
    throw error;
  }
}

@Injectable()
export class RegistrationWaitlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly reservations: RegistrationReservationsService,
  ) {}

  private async serializable<T>(task: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(task, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') continue;
        throw error;
      }
    }
    throw new ConflictException('Não foi possível concluir a operação na fila. Tente novamente.');
  }

  private async participant(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true } });
    if (!user) throw new UnauthorizedException('Conta indisponível.');
    if (!user.emailVerifiedAt) throw new ForbiddenException('Confirme seu e-mail antes de usar a fila de espera.');
    return { emailHash: participantHash(user.email.trim().toLowerCase()) };
  }

  private async publishedEvent(client: Client, slug: string) {
    const event = await client.event.findUnique({
      where: { slug: String(slug ?? '').trim().toLowerCase() },
      select: { id: true, organizationId: true, name: true, slug: true, status: true },
    });
    if (!event?.organizationId || event.status !== EventStatus.PUBLISHED) {
      throw new NotFoundException('Inscrições indisponíveis para este evento.');
    }
    return { ...event, organizationId: event.organizationId };
  }

  private async organizerEvent(userId: string, eventId: string, roles: readonly MembershipRole[]) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true, organizationId: true, name: true } });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    const membership = await this.authorization.requireRole(userId, event.organizationId, roles);
    return { event: { ...event, organizationId: event.organizationId }, role: membership.role };
  }

  private activeReservationWhere(eventId: string, now: Date) {
    return {
      eventId,
      status: { in: ACTIVE_RESERVATION_STATUSES },
      OR: [{ status: RegistrationReservationStatus.CONFIRMED }, { expiresAt: { gt: now } }],
    } satisfies Prisma.EventRegistrationReservationWhereInput;
  }

  private async seats(client: Client, eventId: string, lot: { id: string; quantity: number | null }, category: { id: string; capacity: number | null }, now: Date) {
    const activeReservation = this.activeReservationWhere(eventId, now);
    const offers = activeWaitlistOfferWhere(eventId, now);
    const [lotReserved, lotOffered, categoryReserved, categoryOffered, waiting] = await Promise.all([
      client.eventRegistrationReservation.count({ where: { ...activeReservation, lotId: lot.id } }),
      client.eventRegistrationWaitlistEntry.count({ where: { ...offers, lotId: lot.id } }),
      client.eventRegistrationReservation.count({ where: { ...activeReservation, categoryId: category.id } }),
      client.eventRegistrationWaitlistEntry.count({ where: { ...offers, categoryId: category.id } }),
      client.eventRegistrationWaitlistEntry.count({ where: { eventId, lotId: lot.id, status: RegistrationWaitlistStatus.WAITING } }),
    ]);
    const free = combinedFreeSeats(freeSeats(lot.quantity, lotReserved, lotOffered), freeSeats(category.capacity, categoryReserved, categoryOffered));
    return { reserved: lotReserved, offered: lotOffered, free, waiting };
  }

  private async eventSeats(eventId: string, now: Date) {
    const activeReservation = this.activeReservationWhere(eventId, now);
    const offers = activeWaitlistOfferWhere(eventId, now);
    const [lotReserved, categoryReserved, lotOffered, categoryOffered, waiting] = await Promise.all([
      this.prisma.eventRegistrationReservation.groupBy({ by: ['lotId'], where: activeReservation, _count: { _all: true } }),
      this.prisma.eventRegistrationReservation.groupBy({ by: ['categoryId'], where: activeReservation, _count: { _all: true } }),
      this.prisma.eventRegistrationWaitlistEntry.groupBy({ by: ['lotId'], where: offers, _count: { _all: true } }),
      this.prisma.eventRegistrationWaitlistEntry.groupBy({ by: ['categoryId'], where: offers, _count: { _all: true } }),
      this.prisma.eventRegistrationWaitlistEntry.groupBy({
        by: ['lotId'], where: { eventId, status: RegistrationWaitlistStatus.WAITING }, _count: { _all: true },
      }),
    ]);
    const byLot = (rows: Array<{ lotId: string; _count: { _all: number } }>) => new Map(rows.map((row) => [row.lotId, row._count._all]));
    const byCategory = (rows: Array<{ categoryId: string; _count: { _all: number } }>) => new Map(rows.map((row) => [row.categoryId, row._count._all]));
    const maps = {
      lotReserved: byLot(lotReserved), categoryReserved: byCategory(categoryReserved),
      lotOffered: byLot(lotOffered), categoryOffered: byCategory(categoryOffered), waiting: byLot(waiting),
    };
    return (lot: { id: string; quantity: number | null }, category: { id: string; capacity: number | null }) => {
      const reserved = maps.lotReserved.get(lot.id) ?? 0;
      const offered = maps.lotOffered.get(lot.id) ?? 0;
      const free = combinedFreeSeats(
        freeSeats(lot.quantity, reserved, offered),
        freeSeats(category.capacity, maps.categoryReserved.get(category.id) ?? 0, maps.categoryOffered.get(category.id) ?? 0),
      );
      return { reserved, offered, free, waiting: maps.waiting.get(lot.id) ?? 0 };
    };
  }

  private async position(client: Client, entry: { id: string; lotId: string; queuedAt: Date }) {
    const ahead = await client.eventRegistrationWaitlistEntry.count({
      where: {
        lotId: entry.lotId,
        status: RegistrationWaitlistStatus.WAITING,
        OR: [{ queuedAt: { lt: entry.queuedAt } }, { queuedAt: entry.queuedAt, id: { lt: entry.id } }],
      },
    });
    return ahead + 1;
  }

  async participantState(userId: string, slug: string) {
    await this.participant(userId);
    const event = await this.publishedEvent(this.prisma, slug);
    const now = new Date();
    let lots: Array<{ categoryId: string; categoryName: string; lotId: string; lotName: string; priceCents: number; closesAt: string | null; offerMinutes: number | null }> = [];
    try {
      const options = await this.reservations.getOptions(event.slug);
      lots = options.waitlist.map(({ categoryId, categoryName, lotId, lotName, priceCents, closesAt, offerMinutes }) => (
        { categoryId, categoryName, lotId, lotName, priceCents, closesAt, offerMinutes }
      ));
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
    }
    const entries = await this.prisma.eventRegistrationWaitlistEntry.findMany({
      where: { eventId: event.id, organizationId: event.organizationId, userId },
      orderBy: { queuedAt: 'asc' },
      select: {
        id: true, lotId: true, status: true, queuedAt: true, offerExpiresAt: true,
        lot: { select: { name: true } }, category: { select: { name: true } },
        reservation: { select: { protocol: true, status: true, expiresAt: true } },
      },
    });
    return {
      event: { name: event.name, slug: event.slug },
      orderLabel: WAITLIST_ORDER_LABEL,
      lots,
      entries: await Promise.all(entries.map(async (entry) => {
        const status = effectiveWaitlistStatus(entry.status, entry.offerExpiresAt, now);
        return {
          lotId: entry.lotId,
          lotName: entry.lot.name,
          categoryName: entry.category.name,
          status,
          position: status === 'WAITING' ? await this.position(this.prisma, entry) : null,
          queuedAt: entry.queuedAt.toISOString(),
          offerExpiresAt: status === 'OFFERED' ? entry.offerExpiresAt?.toISOString() ?? null : null,
          protocol: entry.reservation?.protocol ?? null,
          reservationStatus: !entry.reservation ? null
            : entry.reservation.status === RegistrationReservationStatus.PENDING_PAYMENT
              && (!entry.reservation.expiresAt || entry.reservation.expiresAt <= now)
              ? RegistrationReservationStatus.EXPIRED
              : entry.reservation.status,
        };
      })),
    };
  }

  async join(userId: string, slug: string, raw: unknown) {
    const { emailHash } = await this.participant(userId);
    const body = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
    const lotId = policy(() => normalizeWaitlistLotId(body.lotId));
    let identityDocument: string;
    try {
      identityDocument = normalizeIdentityDocument(body.identityDocument);
    } catch {
      throw new BadRequestException('Informe um CPF ou documento estrangeiro válido.');
    }
    const identityHash = participantHash(identityDocument);
    try {
      await this.serializable(async (tx) => {
        const event = await this.publishedEvent(tx, slug);
        const now = new Date();
        const lot = await tx.eventRegistrationLot.findFirst({
          where: { id: lotId, eventId: event.id, organizationId: event.organizationId, active: true, startsAt: { lte: now } },
          include: { category: { select: { id: true, capacity: true, active: true } } },
        });
        if (!lot || !lot.category.active) throw new NotFoundException('Lote não encontrado neste evento.');
        if (!waitlistAcceptsEntries(lot, now)) throw new ConflictException('A fila de espera deste lote não está aberta.');

        const existing = await tx.eventRegistrationWaitlistEntry.findUnique({ where: { lotId_userId: { lotId, userId } } });
        if (existing && existing.status === RegistrationWaitlistStatus.ACCEPTED) {
          throw new ConflictException('Você já confirmou a vaga deste lote.');
        }
        if (existing && effectiveWaitlistStatus(existing.status, existing.offerExpiresAt, now) !== 'OFFER_EXPIRED'
          && existing.status !== RegistrationWaitlistStatus.LEFT) {
          if (existing.identityHash !== identityHash) throw new ConflictException('Você já está nesta fila com outro documento.');
          return;
        }

        const reservation = await tx.eventRegistrationReservation.findUnique({
          where: { eventId_identityHash: { eventId: event.id, identityHash } },
          select: { status: true },
        });
        if (reservation) {
          throw new ConflictException(ACTIVE_RESERVATION_STATUSES.some((status) => status === reservation.status)
            ? 'Este documento já tem inscrição neste evento.'
            : 'Este documento já teve uma inscrição cancelada ou expirada neste evento. Por enquanto, a fila não aceita uma nova entrada para ele; fale com a organização.');
        }
        const other = await tx.eventRegistrationWaitlistEntry.findFirst({
          where: {
            eventId: event.id,
            ...(existing ? { NOT: { id: existing.id } } : {}),
            AND: [
              { OR: [{ userId }, { identityHash }] },
              { OR: [{ status: RegistrationWaitlistStatus.WAITING }, activeWaitlistOfferWhere(event.id, now)] },
            ],
          },
          select: { id: true },
        });
        if (other) throw new ConflictException('Você ou este documento já está na fila de outro lote deste evento. Saia dela antes de entrar nesta.');

        const seats = await this.seats(tx, event.id, lot, lot.category, now);
        if (seats.free !== 0 && seats.waiting === 0) {
          throw new ConflictException('Ainda há vagas neste lote. Faça a inscrição pelo formulário.');
        }

        const queue = { status: RegistrationWaitlistStatus.WAITING, queuedAt: now, offeredAt: null, offerExpiresAt: null, promotionKeyHash: null, identityHash, emailHash };
        const entry = existing
          ? await tx.eventRegistrationWaitlistEntry.update({ where: { id: existing.id }, data: queue, select: { id: true } })
          : await tx.eventRegistrationWaitlistEntry.create({
            data: { ...queue, organizationId: event.organizationId, eventId: event.id, categoryId: lot.category.id, lotId, userId },
            select: { id: true },
          });
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId, eventId: event.id, actorUserId: userId,
            action: 'registration.waitlist_joined', entityType: 'EventRegistrationWaitlistEntry', entityId: entry.id,
            metadata: { lotId, rejoined: Boolean(existing) } as Prisma.InputJsonObject,
          },
        });
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
    return this.participantState(userId, slug);
  }

  async leave(userId: string, slug: string, rawLotId: string) {
    await this.participant(userId);
    const lotId = policy(() => normalizeWaitlistLotId(rawLotId));
    await this.serializable(async (tx) => {
      const event = await this.publishedEvent(tx, slug);
      const entry = await tx.eventRegistrationWaitlistEntry.findUnique({ where: { lotId_userId: { lotId, userId } } });
      if (!entry || entry.eventId !== event.id) throw new NotFoundException('Você não está na fila deste lote.');
      if (entry.status === RegistrationWaitlistStatus.ACCEPTED) {
        throw new ConflictException('Sua vaga já foi confirmada. Para cancelar a inscrição, fale com a organização.');
      }
      if (entry.status === RegistrationWaitlistStatus.LEFT || entry.status === RegistrationWaitlistStatus.OFFER_EXPIRED) return;
      const left = await tx.eventRegistrationWaitlistEntry.updateMany({
        where: { id: entry.id, status: { in: [RegistrationWaitlistStatus.WAITING, RegistrationWaitlistStatus.OFFERED] } },
        data: { status: RegistrationWaitlistStatus.LEFT },
      });
      if (left.count !== 1) return;
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId, eventId: event.id, actorUserId: userId,
          action: 'registration.waitlist_left', entityType: 'EventRegistrationWaitlistEntry', entityId: entry.id,
          metadata: { lotId, hadOffer: entry.status === RegistrationWaitlistStatus.OFFERED } as Prisma.InputJsonObject,
        },
      });
    });
    return this.participantState(userId, slug);
  }

  async offerOptions(userId: string, slug: string, rawLotId: string) {
    await this.participant(userId);
    const lotId = policy(() => normalizeWaitlistLotId(rawLotId));
    return this.reservations.getWaitlistOfferOptions(slug, userId, lotId);
  }

  async accept(userId: string, slug: string, rawLotId: string, input: PublicRegistrationInput, idempotencyKey?: string) {
    await this.participant(userId);
    const lotId = policy(() => normalizeWaitlistLotId(rawLotId));
    if (!input || typeof input !== 'object' || input.lotId !== lotId) {
      throw new BadRequestException('A ficha precisa ser do mesmo lote da vaga oferecida.');
    }
    return this.reservations.reserve(slug, input, idempotencyKey, { waitlistUserId: userId });
  }

  async organizerOverview(userId: string, eventId: string) {
    const { event, role } = await this.organizerEvent(userId, eventId, STAFF_ROLES);
    const now = new Date();
    const lots = await this.prisma.eventRegistrationLot.findMany({
      where: { eventId: event.id, organizationId: event.organizationId, active: true, category: { active: true } },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { startsAt: 'asc' }],
      select: {
        id: true, name: true, quantity: true, startsAt: true, endsAt: true,
        waitlistEnabled: true, waitlistOfferMinutes: true, waitlistClosesAt: true,
        category: { select: { id: true, name: true, capacity: true } },
      },
    });
    const [entries, seatsFor] = await Promise.all([
      this.prisma.eventRegistrationWaitlistEntry.findMany({
        where: { eventId: event.id, organizationId: event.organizationId, status: { not: RegistrationWaitlistStatus.LEFT } },
        orderBy: [{ queuedAt: 'asc' }, { id: 'asc' }],
        take: ORGANIZER_ENTRY_LIMIT,
        select: { id: true, lotId: true, status: true, queuedAt: true, offerExpiresAt: true, reservation: { select: { protocol: true } } },
      }),
      this.eventSeats(event.id, now),
    ]);
    return {
      event: { id: event.id, name: event.name },
      orderLabel: WAITLIST_ORDER_LABEL,
      canManage: EVENT_EDITOR_ROLES.includes(role),
      lots: lots.map((lot) => {
        const seats = seatsFor(lot, lot.category);
        let position = 0;
        const own = entries.filter((entry) => entry.lotId === lot.id).sort(queueOrder);
        return {
          lotId: lot.id,
          lotName: lot.name,
          categoryName: lot.category.name,
          quantity: lot.quantity,
          categoryCapacity: lot.category.capacity,
          endsAt: lot.endsAt.toISOString(),
          reserved: seats.reserved,
          offered: seats.offered,
          free: seats.free,
          waiting: seats.waiting,
          waitlistEnabled: lot.waitlistEnabled,
          waitlistOfferMinutes: lot.waitlistOfferMinutes,
          waitlistClosesAt: lot.waitlistClosesAt?.toISOString() ?? null,
          acceptsEntries: waitlistAcceptsEntries(lot, now),
          entries: own.map((entry) => {
            const status = effectiveWaitlistStatus(entry.status, entry.offerExpiresAt, now);
            return {
              code: waitlistEntryCode(entry.id),
              status,
              position: status === 'WAITING' ? (position += 1) : null,
              queuedAt: entry.queuedAt.toISOString(),
              offerExpiresAt: status === 'OFFERED' ? entry.offerExpiresAt?.toISOString() ?? null : null,
              protocol: entry.reservation?.protocol ?? null,
            };
          }),
        };
      }),
    };
  }

  async configure(userId: string, eventId: string, rawLotId: string, raw: unknown) {
    const { event } = await this.organizerEvent(userId, eventId, EVENT_EDITOR_ROLES);
    const lotId = policy(() => normalizeWaitlistLotId(rawLotId));
    await this.serializable(async (tx) => {
      const lot = await tx.eventRegistrationLot.findFirst({
        where: { id: lotId, eventId: event.id, organizationId: event.organizationId },
        select: { id: true, endsAt: true },
      });
      if (!lot) throw new NotFoundException('Lote não encontrado neste evento.');
      const config = policy(() => normalizeWaitlistConfig(raw, new Date(), lot.endsAt));
      await tx.eventRegistrationLot.update({
        where: { id: lot.id },
        data: { waitlistEnabled: config.enabled, waitlistOfferMinutes: config.offerMinutes, waitlistClosesAt: config.closesAt },
      });
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId, eventId: event.id, actorUserId: userId,
          action: 'registration.waitlist_configured', entityType: 'EventRegistrationLot', entityId: lot.id,
          metadata: {
            enabled: config.enabled, offerMinutes: config.offerMinutes, closesAt: config.closesAt?.toISOString() ?? null,
          } as Prisma.InputJsonObject,
        },
      });
    });
    return this.organizerOverview(userId, eventId);
  }

  async promote(userId: string, eventId: string, raw: unknown, rawKey?: string) {
    const { event } = await this.organizerEvent(userId, eventId, EVENT_EDITOR_ROLES);
    const body = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
    const lotId = policy(() => normalizeWaitlistLotId(body.lotId));
    const promotionKeyHash = sha256(policy(() => normalizeWaitlistKey(rawKey)));
    try {
      return await this.serializable(async (tx) => {
        const now = new Date();
        const lot = await tx.eventRegistrationLot.findFirst({
          where: { id: lotId, eventId: event.id, organizationId: event.organizationId },
          include: { category: { select: { id: true, capacity: true, active: true } } },
        });
        if (!lot) throw new NotFoundException('Lote não encontrado neste evento.');
        const repeated = await tx.eventRegistrationWaitlistEntry.findUnique({
          where: { lotId_promotionKeyHash: { lotId, promotionKeyHash } },
          select: { id: true, status: true, offerExpiresAt: true },
        });
        if (repeated) return this.promotionResult(repeated, now, true);

        await tx.eventRegistrationWaitlistEntry.updateMany({
          where: { eventId: event.id, lotId, status: RegistrationWaitlistStatus.OFFERED, offerExpiresAt: { lte: now } },
          data: { status: RegistrationWaitlistStatus.OFFER_EXPIRED },
        });
        if (!lot.active || !lot.category.active || lot.startsAt > now || lot.endsAt <= now) {
          throw new ConflictException('O lote não está no período de inscrição.');
        }
        if (lot.waitlistOfferMinutes === null) throw new ConflictException('Defina o prazo de confirmação da fila antes de promover.');
        const seats = await this.seats(tx, event.id, lot, lot.category, now);
        if (seats.free === 0) throw new ConflictException('Não há vaga liberada neste lote. Aguarde um cancelamento ou expiração.');

        const candidates = await tx.eventRegistrationWaitlistEntry.findMany({
          where: { eventId: event.id, lotId, status: RegistrationWaitlistStatus.WAITING },
          orderBy: [{ queuedAt: 'asc' }, { id: 'asc' }],
          take: 50,
          select: { id: true, identityHash: true },
        });
        const registered = candidates.length === 0 ? [] : await tx.eventRegistrationReservation.findMany({
          where: { eventId: event.id, identityHash: { in: [...new Set(candidates.map((candidate) => candidate.identityHash))] } },
          select: { identityHash: true },
        });
        const registeredHashes = new Set(registered.map((reservation) => reservation.identityHash));
        const next = candidates.find((candidate) => !registeredHashes.has(candidate.identityHash)) ?? null;
        if (!next) throw new ConflictException('Ninguém elegível aguardando nesta fila.');

        const expiresAt = offerExpiresAt(now, lot.waitlistOfferMinutes, lot.endsAt);
        const offered = await tx.eventRegistrationWaitlistEntry.updateMany({
          where: { id: next.id, status: RegistrationWaitlistStatus.WAITING },
          data: { status: RegistrationWaitlistStatus.OFFERED, offeredAt: now, offerExpiresAt: expiresAt, promotionKeyHash },
        });
        if (offered.count !== 1) throw new ConflictException('A fila mudou durante a promoção. Atualize e tente de novo.');
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId, eventId: event.id, actorUserId: userId,
            action: 'registration.waitlist_promoted', entityType: 'EventRegistrationWaitlistEntry', entityId: next.id,
            metadata: { lotId, entryCode: waitlistEntryCode(next.id), offerExpiresAt: expiresAt.toISOString() } as Prisma.InputJsonObject,
          },
        });
        return this.promotionResult({ id: next.id, status: RegistrationWaitlistStatus.OFFERED, offerExpiresAt: expiresAt }, now, false);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Esta promoção já foi registrada. Atualize a fila.');
      }
      throw error;
    }
  }

  private promotionResult(entry: { id: string; status: RegistrationWaitlistStatus; offerExpiresAt: Date | null }, now: Date, repeated: boolean) {
    const status = effectiveWaitlistStatus(entry.status, entry.offerExpiresAt, now);
    return {
      code: waitlistEntryCode(entry.id),
      status,
      offerExpiresAt: entry.offerExpiresAt?.toISOString() ?? null,
      repeated,
    };
  }
}
