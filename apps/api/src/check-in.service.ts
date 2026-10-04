import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CapabilityStatus, EventStatus, MembershipRole, Prisma, RegistrationReservationStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuthorizationService } from './authorization.service';
import { verifyCredentialScan } from './check-in-policy';
import { printedCredential } from './credential-label';
import {
  DeskPolicyError,
  deskDisplayName,
  normalizeSelfServiceRequest,
  readLabelConfig,
  readSelfServiceMethods,
  type SelfServiceMethod,
} from './event-desk-policy';
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
    const reservationId = verifyCredentialScan(eventId, code, process.env.JWT_SECRET ?? '');
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
    const reservationId = verifyCredentialScan(event.id, code, process.env.JWT_SECRET ?? '');
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

  private async publishedCredentialEvent(slug: string) {
    const event = await this.prisma.event.findFirst({
      where: { slug: slug.trim().toLowerCase(), status: EventStatus.PUBLISHED, organizationId: { not: null } },
      select: {
        id: true,
        name: true,
        slug: true,
        organizationId: true,
        capabilities: { where: { status: CapabilityStatus.ACTIVE, code: 'credential' }, select: { config: true } },
        eventPublication: { select: { logoAssetId: true } },
      },
    });
    if (!event?.organizationId || event.capabilities.length === 0) throw new NotFoundException('Evento não encontrado.');
    return event;
  }

  async selfServiceContext(slug: string) {
    const event = await this.publishedCredentialEvent(slug);
    return {
      eventName: event.name,
      logoUrl: event.eventPublication?.logoAssetId
        ? `/api/public/events/${encodeURIComponent(event.slug)}/media/LOGO`
        : null,
      methods: readSelfServiceMethods(event.capabilities[0]?.config),
    };
  }

  async selfServicePrint(slug: string, input: unknown) {
    const event = await this.publishedCredentialEvent(slug);
    const methods = readSelfServiceMethods(event.capabilities[0]?.config);
    let request: { method: SelfServiceMethod; value: string };
    try { request = normalizeSelfServiceRequest(input); } catch (error) {
      if (error instanceof DeskPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    if (!methods.includes(request.method)) throw new BadRequestException('Esta forma de identificação não está disponível neste totem.');
    const reservation = await this.reservationForSelfService(event, request.method, request.value);
    const label = printedCredential(
      event.name,
      reservation.registrationData,
      reservation.category.name,
      reservation.protocol,
      event.id,
      reservation.id,
      process.env.JWT_SECRET ?? '',
      readLabelConfig(event.capabilities[0]?.config),
    );
    const scope = { reservationId: reservation.id, eventId: event.id, organizationId: event.organizationId! };
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const checkIn = await tx.eventRegistrationCheckIn.create({ data: { ...scope, actorUserId: null } });
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId!,
            eventId: event.id,
            action: 'registration.checked_in',
            entityType: 'EventRegistrationReservation',
            entityId: reservation.id,
            metadata: { source: 'self-service', method: request.method, checkedInAt: checkIn.checkedInAt.toISOString() } as Prisma.InputJsonObject,
          },
        });
        return checkIn;
      });
      return { ...label, checkedInAt: created.checkedInAt.toISOString(), alreadyCheckedIn: false };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.eventRegistrationCheckIn.findFirst({ where: scope, select: { checkedInAt: true } });
      if (!existing) throw error;
      return { ...label, checkedInAt: existing.checkedInAt.toISOString(), alreadyCheckedIn: true };
    }
  }

  private async reservationForSelfService(
    event: { id: string; organizationId: string | null },
    method: SelfServiceMethod,
    value: string,
  ) {
    const select = {
      id: true,
      protocol: true,
      registrationData: true,
      category: { select: { name: true } },
    } as const;
    const scope = { eventId: event.id, organizationId: event.organizationId!, status: RegistrationReservationStatus.CONFIRMED };
    if (method === 'QR') {
      const reservationId = verifyCredentialScan(event.id, value, process.env.JWT_SECRET ?? '');
      if (!reservationId) throw new BadRequestException('QR Code inválido para este evento.');
      const reservation = await this.prisma.eventRegistrationReservation.findFirst({
        where: { ...scope, id: reservationId },
        select,
      });
      if (!reservation) throw new BadRequestException('Não encontramos uma inscrição confirmada com esses dados.');
      return reservation;
    }
    const hash = createHash('sha256').update(value).digest('hex');
    const where = method === 'CPF' ? { ...scope, identityHash: hash } : { ...scope, emailHash: hash };
    const found = await this.prisma.eventRegistrationReservation.findMany({ where, select, take: 2 });
    if (found.length > 1) throw new BadRequestException(method === 'CPF'
      ? 'Encontramos mais de uma inscrição para este CPF. Use o QR Code.'
      : 'Encontramos mais de uma inscrição para este e-mail. Use CPF ou QR Code.');
    if (found.length === 0) throw new BadRequestException('Não encontramos uma inscrição confirmada com esses dados.');
    return found[0];
  }
}

