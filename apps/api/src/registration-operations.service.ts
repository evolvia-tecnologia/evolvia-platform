import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, Prisma, RegistrationReservationStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { PrismaService } from './prisma.service';
import { effectiveRegistrationStatus } from './registration-operations-policy';

const STAFF_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.OPERATOR];
const PAGE_SIZE = 25;
const PROTOCOL = /^EVO-[A-F0-9]{16}$/u;

@Injectable()
export class RegistrationOperationsService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService) {}

  async list(userId: string, eventId: string, query: { page?: string; status?: string; protocol?: string }) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, name: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, STAFF_ROLES);

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
          category: { select: { name: true, proofRequirement: true } },
          categoryProof: { select: { state: true } },
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
      summary: { ...counts, checkedIn: present },
      page,
      pageSize: PAGE_SIZE,
      total,
      items: rows.map((row) => ({
        protocol: row.protocol,
        status: effectiveRegistrationStatus(row.status, row.expiresAt, now),
        category: row.category.name,
        categoryProof: row.category.proofRequirement === 'NONE'
          ? null
          : row.categoryProof?.state ?? (row.category.proofRequirement === 'OPTIONAL' ? 'NOT_SENT' : 'MISSING'),
        lot: row.lot.name,
        finalPriceCents: row.finalPriceCents,
        paymentStatus: effectiveRegistrationStatus(row.status, row.expiresAt, now) === RegistrationReservationStatus.EXPIRED
          && row.status === RegistrationReservationStatus.PENDING_PAYMENT && row.checkout?.status !== 'PAID_REVIEW'
          ? 'EXPIRED' : row.checkout?.status ?? null,
        createdAt: row.createdAt.toISOString(),
        confirmedAt: row.confirmedAt?.toISOString() ?? null,
        checkedInAt: row.checkIn?.checkedInAt.toISOString() ?? null,
      })),
    };
  }
}
