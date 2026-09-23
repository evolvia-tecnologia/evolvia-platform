import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, Prisma, RegistrationReservationStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { PrismaService } from './prisma.service';

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

    const page = query?.page === undefined ? 1 : Number(query.page);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw new BadRequestException('Página inválida.');
    const status = query?.status ?? 'ALL';
    if (status !== 'ALL' && !Object.values(RegistrationReservationStatus).includes(status as RegistrationReservationStatus)) {
      throw new BadRequestException('Situação inválida.');
    }
    const protocol = query?.protocol?.trim().toUpperCase() ?? '';
    if (protocol && !PROTOCOL.test(protocol)) throw new BadRequestException('Protocolo inválido.');

    const scope = { organizationId: event.organizationId, eventId };
    const where: Prisma.EventRegistrationReservationWhereInput = {
      ...scope,
      ...(status === 'ALL' ? {} : { status: status as RegistrationReservationStatus }),
      ...(protocol ? { protocol } : {}),
    };
    const [total, rows, grouped, present] = await Promise.all([
      this.prisma.eventRegistrationReservation.count({ where }),
      this.prisma.eventRegistrationReservation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          protocol: true, status: true, createdAt: true, confirmedAt: true, finalPriceCents: true,
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
    ]);
    const counts = Object.fromEntries(Object.values(RegistrationReservationStatus).map((item) => [item, 0]));
    for (const item of grouped) counts[item.status] = item._count._all;

    return {
      event: { id: event.id, name: event.name },
      summary: { ...counts, checkedIn: present },
      page,
      pageSize: PAGE_SIZE,
      total,
      items: rows.map((row) => ({
        protocol: row.protocol,
        status: row.status,
        category: row.category.name,
        lot: row.lot.name,
        finalPriceCents: row.finalPriceCents,
        paymentStatus: row.checkout?.status ?? null,
        createdAt: row.createdAt.toISOString(),
        confirmedAt: row.confirmedAt?.toISOString() ?? null,
        checkedInAt: row.checkIn?.checkedInAt.toISOString() ?? null,
      })),
    };
  }
}
