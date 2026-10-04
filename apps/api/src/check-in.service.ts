import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventStatus, MembershipRole, Prisma, RegistrationReservationStatus } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { verifyCheckInCode } from './check-in-policy';
import { PrismaService } from './prisma.service';
import {
  CHECK_IN_REPEATED_ACTION,
  classifyEntranceCode,
  hashSecret,
} from './show-entrance.policy';

const STAFF_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.OPERATOR];
const INVALID_CODE = 'Credencial inválida para este evento.';

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
    const classified = classifyEntranceCode(input?.code);
    if (classified.kind === 'INVALID') throw new BadRequestException(INVALID_CODE);
    if (classified.kind === 'STAFF') return this.checkInStaff(userId, eventId, event.organizationId, classified.code);
    return this.checkInTicket(userId, eventId, event.organizationId, classified.code);
  }

  private async checkInStaff(userId: string, eventId: string, organizationId: string, code: string) {
    const credential = await this.prisma.eventStaffCredential.findFirst({
      where: { codeHash: hashSecret(code), eventId, organizationId, active: true, revokedAt: null },
      select: { id: true, displayName: true, duty: true },
    });
    if (!credential) throw new BadRequestException(INVALID_CODE);
    const previous = await this.prisma.eventStaffAccess.count({
      where: { credentialId: credential.id, eventId, organizationId },
    });
    const access = await this.prisma.$transaction(async (tx) => {
      const created = await tx.eventStaffAccess.create({
        data: { organizationId, eventId, credentialId: credential.id, actorUserId: userId },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          eventId,
          actorUserId: userId,
          action: 'show.staff_entered',
          entityType: 'EventStaffCredential',
          entityId: credential.id,
          metadata: { duty: credential.duty, repeated: previous > 0 } satisfies Prisma.InputJsonObject,
        },
      });
      return created;
    });
    return {
      kind: 'STAFF' as const,
      displayName: credential.displayName,
      duty: credential.duty,
      checkedInAt: access.accessedAt.toISOString(),
      repeated: previous > 0,
    };
  }

  private async checkInTicket(userId: string, eventId: string, organizationId: string, code: string) {
    const reservationId = verifyCheckInCode(eventId, code, process.env.JWT_SECRET ?? '');
    if (!reservationId) throw new BadRequestException(INVALID_CODE);

    const scope = { reservationId, eventId, organizationId };
    const reservation = await this.prisma.eventRegistrationReservation.findUnique({
      where: { id_eventId_organizationId: { id: reservationId, eventId, organizationId } },
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
            organizationId,
            eventId,
            actorUserId: userId,
            action: 'registration.checked_in',
            entityType: 'EventRegistrationReservation',
            entityId: reservationId,
            metadata: { checkedInAt: created.checkedInAt.toISOString() } satisfies Prisma.InputJsonObject,
          },
        });
        return created;
      });
      return { kind: 'TICKET' as const, protocol: reservation.protocol, checkedInAt: checkIn.checkedInAt.toISOString(), alreadyCheckedIn: false };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.eventRegistrationCheckIn.findUnique({
        where: { reservationId },
        select: { eventId: true, organizationId: true, checkedInAt: true },
      });
      if (!existing || existing.eventId !== eventId || existing.organizationId !== organizationId) throw error;
      await this.prisma.auditLog.create({
        data: {
          organizationId,
          eventId,
          actorUserId: userId,
          action: CHECK_IN_REPEATED_ACTION,
          entityType: 'EventRegistrationReservation',
          entityId: reservationId,
          metadata: { checkedInAt: existing.checkedInAt.toISOString() } satisfies Prisma.InputJsonObject,
        },
      });
      return { kind: 'TICKET' as const, protocol: reservation.protocol, checkedInAt: existing.checkedInAt.toISOString(), alreadyCheckedIn: true };
    }
  }
}
