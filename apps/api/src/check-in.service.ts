import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CapabilityStatus, EventStatus, MembershipRole, Prisma, RegistrationReservationStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { verifyCheckInCode } from './check-in-policy';
import { deskDisplayName } from './event-desk-policy';
import { PrismaService } from './prisma.service';

const STAFF_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.OPERATOR];

@Injectable()
export class CheckInService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService) {}

  async checkIn(userId: string, eventId: string, input: { code?: unknown }) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, status: EventStatus.PUBLISHED, organizationId: { not: null } },
      select: { organizationId: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, STAFF_ROLES);

    const reservationId = verifyCheckInCode(eventId, input?.code, process.env.JWT_SECRET ?? '');
    if (!reservationId) throw new BadRequestException('Credencial inválida para este evento.');

    const scope = { reservationId, eventId, organizationId: event.organizationId };
    const reservation = await this.prisma.eventRegistrationReservation.findUnique({
      where: { id_eventId_organizationId: { id: reservationId, eventId, organizationId: event.organizationId } },
      select: { protocol: true, status: true },
    });
    if (!reservation || reservation.status !== RegistrationReservationStatus.CONFIRMED) {
      throw new BadRequestException('Inscrição não confirmada ou credencial inválida.');
    }

    try {
      const checkIn = await this.prisma.$transaction(async (tx) => {
        const created = await tx.eventRegistrationCheckIn.create({ data: { ...scope, actorUserId: userId } });
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId!,
            eventId,
            actorUserId: userId,
            action: 'registration.checked_in',
            entityType: 'EventRegistrationReservation',
            entityId: reservationId,
            metadata: { checkedInAt: created.checkedInAt.toISOString() } as Prisma.InputJsonObject,
          },
        });
        return created;
      });
      return { protocol: reservation.protocol, checkedInAt: checkIn.checkedInAt.toISOString(), alreadyCheckedIn: false };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.eventRegistrationCheckIn.findUnique({
        where: { reservationId },
        select: { eventId: true, organizationId: true, checkedInAt: true },
      });
      if (!existing || existing.eventId !== eventId || existing.organizationId !== event.organizationId) throw error;
      return { protocol: reservation.protocol, checkedInAt: existing.checkedInAt.toISOString(), alreadyCheckedIn: true };
    }
  }

  async selfCheckIn(slug: string, code: unknown) {
    const event = await this.prisma.event.findFirst({
      where: { slug: slug.trim().toLowerCase(), status: EventStatus.PUBLISHED, organizationId: { not: null } },
      select: {
        id: true,
        organizationId: true,
        capabilities: { where: { status: CapabilityStatus.ACTIVE, code: 'access_control' }, select: { code: true } },
      },
    });
    if (!event?.organizationId || event.capabilities.length === 0) throw new NotFoundException('Evento não encontrado.');
    const reservationId = verifyCheckInCode(event.id, code, process.env.JWT_SECRET ?? '');
    if (!reservationId) throw new BadRequestException('Credencial inválida para este evento.');
    const reservation = await this.prisma.eventRegistrationReservation.findFirst({
      where: { id: reservationId, eventId: event.id, organizationId: event.organizationId },
      select: { protocol: true, status: true, registrationData: true },
    });
    if (!reservation || reservation.status !== RegistrationReservationStatus.CONFIRMED) {
      throw new BadRequestException('Inscrição não confirmada ou credencial inválida.');
    }
    const name = deskDisplayName(reservation.registrationData);
    const scope = { reservationId, eventId: event.id, organizationId: event.organizationId };
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const checkIn = await tx.eventRegistrationCheckIn.create({ data: { ...scope, actorUserId: null } });
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId!,
            eventId: event.id,
            action: 'registration.checked_in',
            entityType: 'EventRegistrationReservation',
            entityId: reservationId,
            metadata: { source: 'self', checkedInAt: checkIn.checkedInAt.toISOString() } as Prisma.InputJsonObject,
          },
        });
        return checkIn;
      });
      return { outcome: 'entered' as const, name, protocol: reservation.protocol, checkedInAt: created.checkedInAt.toISOString() };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.eventRegistrationCheckIn.findFirst({
        where: scope,
        select: { checkedInAt: true },
      });
      if (!existing) throw error;
      return { outcome: 'already' as const, name, protocol: reservation.protocol, checkedInAt: existing.checkedInAt.toISOString() };
    }
  }
}
