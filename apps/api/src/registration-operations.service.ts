import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, OperatorPermission, Prisma, RegistrationReservationStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { createHash } from 'node:crypto';
import { AccreditationSearchInputError, normalizeAccreditationSearch } from './accreditation-search-policy';
import { PrismaService } from './prisma.service';
import { effectiveRegistrationStatus } from './registration-operations-policy';

const PAGE_SIZE = 25;
const PROTOCOL = /^EVO-[A-F0-9]{16}$/u;

@Injectable()
export class RegistrationOperationsService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService) {}

  async search(userId: string, eventId: string, rawInput: unknown) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId }, select: { id: true, organizationId: true, name: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireEventPermission(userId, event.organizationId, eventId, OperatorPermission.ACCREDITATION);
    let input;
    try {
      input = normalizeAccreditationSearch(rawInput);
    } catch (error) {
      if (error instanceof AccreditationSearchInputError) throw new BadRequestException(error.message);
      throw error;
    }
    const scope = { organizationId: event.organizationId, eventId };
    const take = 26;
    const skip = (input.page - 1) * 25;
    return this.prisma.$transaction(async (tx) => {
      // Serializa tentativas simultâneas desta conta neste evento; o termo nunca entra no log.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId + ':' + userId}))::text`;
      const recent = await tx.auditLog.count({
        where: { ...scope, actorUserId: userId, action: 'registration.assisted_search',
          createdAt: { gte: new Date(Date.now() - 60_000) } },
      });
      if (recent >= 12) throw new HttpException('Limite de consultas atingido. Aguarde um minuto.', 429);

      let ids: string[] | null = null;
      if (input.kind === 'NAME') {
        // O nome validado exclui caracteres curinga de ILIKE. O valor é parâmetro do driver.
        const pattern = '%' + input.value + '%';
        const found = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT "id" FROM "EventRegistrationReservation"
          WHERE "organizationId" = ${event.organizationId} AND "eventId" = ${eventId}
            AND ("registrationData"->>'full_name') ILIKE ${pattern}
          ORDER BY "createdAt" DESC, "id" DESC LIMIT ${take} OFFSET ${skip}
        `);
        ids = found.map((item) => item.id);
      }
      const hash = (value: string) => createHash('sha256').update(value).digest('hex');
      const where: Prisma.EventRegistrationReservationWhereInput = {
        ...scope,
        ...(input.kind === 'DOCUMENT' ? { identityHash: hash(input.value) } : {}),
        ...(input.kind === 'EMAIL' ? { emailHash: hash(input.value) } : {}),
        ...(input.kind === 'PROTOCOL' ? { protocol: input.value } : {}),
        ...(input.kind === 'CATEGORY' ? { categoryId: input.value } : {}),
        ...(ids ? { id: { in: ids } } : {}),
      };
      const rows = await tx.eventRegistrationReservation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...(ids ? {} : { skip, take }),
        select: {
          protocol: true, status: true, expiresAt: true, registrationData: true,
          category: { select: { name: true } }, checkIn: { select: { checkedInAt: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          ...scope, actorUserId: userId, action: 'registration.assisted_search',
          entityType: 'EventRegistrationReservation',
          metadata: { kind: input.kind, page: input.page, resultCount: Math.min(rows.length, 25) },
        },
      });
      const now = new Date();
      return {
        event: { id: event.id, name: event.name }, page: input.page, hasMore: rows.length > 25,
        items: rows.slice(0, 25).map((row) => {
          const data = row.registrationData && typeof row.registrationData === 'object' && !Array.isArray(row.registrationData)
            ? row.registrationData as Record<string, unknown> : {};
          return {
            name: typeof data.full_name === 'string' ? data.full_name.slice(0, 180) : 'Nome indisponível',
            protocol: row.protocol, category: row.category.name,
            status: effectiveRegistrationStatus(row.status, row.expiresAt, now),
            checkedInAt: row.checkIn?.checkedInAt.toISOString() ?? null,
          };
        }),
      };
    });
  }

  async list(userId: string, eventId: string, query: { page?: string; status?: string; protocol?: string }) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, name: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    const actor = await this.authorization.requireEventPermission(userId, event.organizationId, eventId, OperatorPermission.ACCREDITATION);

    if (query?.page !== undefined && (typeof query.page !== 'string' || !/^[1-9][0-9]{0,3}$/u.test(query.page))) {
      throw new BadRequestException('Página inválida.');
    }
    const page = query?.page === undefined ? 1 : Number(query.page);
    if (page > 1000) throw new BadRequestException('Página inválida.');
    const status = query?.status ?? 'ALL';
    if (typeof status !== 'string') throw new BadRequestException('Situação inválida.');
    if (status !== 'ALL' && !Object.values(RegistrationReservationStatus).includes(status as RegistrationReservationStatus)) {
      throw new BadRequestException('Situação inválida.');
    }
    if (query?.protocol !== undefined && typeof query.protocol !== 'string') throw new BadRequestException('Protocolo inválido.');
    const protocol = query?.protocol?.trim().toUpperCase() ?? '';
    if (protocol && !PROTOCOL.test(protocol)) throw new BadRequestException('Protocolo inválido.');

    const scope = { organizationId: event.organizationId, eventId };
    const now = new Date();
    const effectiveFilter: Prisma.EventRegistrationReservationWhereInput = status === 'PENDING_PAYMENT'
      ? { status: RegistrationReservationStatus.PENDING_PAYMENT, expiresAt: { gt: now } }
      : status === 'EXPIRED'
        ? { OR: [
          { status: RegistrationReservationStatus.EXPIRED },
          { status: RegistrationReservationStatus.PENDING_PAYMENT, expiresAt: { lte: now } },
        ] }
        : status === 'ALL' ? {} : { status: status as RegistrationReservationStatus };
    const where: Prisma.EventRegistrationReservationWhereInput = {
      ...scope, ...effectiveFilter, ...(protocol ? { protocol } : {}),
    };
    const [total, rows, grouped, present, stalePending] = await Promise.all([
      this.prisma.eventRegistrationReservation.count({ where }),
      this.prisma.eventRegistrationReservation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          protocol: true, status: true, createdAt: true, confirmedAt: true, expiresAt: true, finalPriceCents: true,
          category: { select: { name: true } },
          lot: { select: { name: true } },
          checkout: { select: { status: true } },
          checkIn: { select: { checkedInAt: true } },
        },
      }),
      this.prisma.eventRegistrationReservation.groupBy({
        by: ['status'], where: scope, _count: { _all: true },
      }),
      this.prisma.eventRegistrationCheckIn.count({ where: scope }),
      this.prisma.eventRegistrationReservation.count({ where: {
        ...scope, status: RegistrationReservationStatus.PENDING_PAYMENT, expiresAt: { lte: now },
      } }),
    ]);
    const counts = Object.fromEntries(Object.values(RegistrationReservationStatus).map((item) => [item, 0]));
    for (const item of grouped) counts[item.status] = item._count._all;
    counts.PENDING_PAYMENT -= stalePending;
    counts.EXPIRED += stalePending;

    return {
      event: { id: event.id, name: event.name },
      operatorMode: actor.role === MembershipRole.OPERATOR,
      summary: { ...counts, checkedIn: present },
      page,
      pageSize: PAGE_SIZE,
      total,
      items: rows.map((row) => ({
        protocol: row.protocol,
        status: effectiveRegistrationStatus(row.status, row.expiresAt, now),
        category: row.category.name,
        lot: row.lot.name,
        finalPriceCents: actor.role === MembershipRole.OPERATOR ? null : row.finalPriceCents,
        paymentStatus: actor.role === MembershipRole.OPERATOR ? null : effectiveRegistrationStatus(row.status, row.expiresAt, now) === RegistrationReservationStatus.EXPIRED
          && row.status === RegistrationReservationStatus.PENDING_PAYMENT && row.checkout?.status !== 'PAID_REVIEW'
          ? 'EXPIRED' : row.checkout?.status ?? null,
        createdAt: row.createdAt.toISOString(),
        confirmedAt: row.confirmedAt?.toISOString() ?? null,
        checkedInAt: row.checkIn?.checkedInAt.toISOString() ?? null,
      })),
    };
  }
}
