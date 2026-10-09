import { BadRequestException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { CapabilityStatus, EventStatus, MembershipRole, Prisma, RegistrationReservationStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuthorizationService } from './authorization.service';
import { verifyCredentialScan } from './check-in-policy';
import { activeCheckedInAt, recordCheckIn } from './check-in-record';
import { printedCredential } from './credential-label';
import {
  DeskPolicyError,
  deskDisplayName,
  labelText,
  normalizeSelfServiceRequest,
  readLabelConfig,
  readSelfServiceMethods,
  type SelfServiceMethod,
} from './event-desk-policy';
import { totemAccessDecision } from './totem-link-policy';
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

    const checkIn = await this.prisma.$transaction((tx) => recordCheckIn(
      tx,
      scope,
      userId,
      {},
      CHECK_IN_REPEATED_ACTION,
    ));
    return {
      kind: 'TICKET' as const,
      protocol: reservation.protocol,
      checkedInAt: checkIn.checkedInAt.toISOString(),
      alreadyCheckedIn: checkIn.alreadyCheckedIn,
    };
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
    const created = await this.prisma.$transaction((tx) => recordCheckIn(tx, scope, null, { source: 'self' }));
    return {
      outcome: created.alreadyCheckedIn ? 'already' as const : 'entered' as const,
      name,
      protocol: reservation.protocol,
      checkedInAt: created.checkedInAt.toISOString(),
    };
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
        eventPublication: { select: { logoAsset: { select: { altText: true, state: true, usage: true } } } },
      },
    });
    if (!event?.organizationId || event.capabilities.length === 0) throw new NotFoundException('Evento não encontrado.');
    return event;
  }

  async selfServiceContext(slug: string, accessToken?: string) {
    const event = await this.publishedCredentialEvent(slug);
    this.assertTotemAccess(event.capabilities[0]?.config, accessToken);
    const logo = event.eventPublication?.logoAsset;
    const logoReady = logo?.state === 'ACTIVE' && logo.usage === 'LOGO';
    return {
      eventName: event.name,
      logoUrl: logoReady ? `/api/public/events/${encodeURIComponent(event.slug)}/media/LOGO` : null,
      logoAlt: logoReady ? logo.altText : null,
      methods: readSelfServiceMethods(event.capabilities[0]?.config),
    };
  }

  async selfServicePreview(slug: string, input: unknown, accessToken?: string) {
    const located = await this.locateSelfService(slug, input, accessToken);
    const text = labelText(
      located.reservation.registrationData,
      located.reservation.category.name,
      readLabelConfig(located.event.capabilities[0]?.config),
    );
    const existing = await this.prisma.eventRegistrationCheckIn.findFirst({
      where: {
        reservationId: located.reservation.id,
        eventId: located.event.id,
        organizationId: located.event.organizationId!,
      },
      select: { checkedInAt: true, reversedAt: true },
    });
    return {
      name: text.name ?? deskDisplayName(located.reservation.registrationData),
      category: located.reservation.category.name,
      company: text.company,
      alreadyCheckedIn: Boolean(activeCheckedInAt(existing)),
    };
  }

  async selfServicePrint(slug: string, input: unknown, accessToken?: string) {
    const { event, request, reservation } = await this.locateSelfService(slug, input, accessToken);
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
    const created = await this.prisma.$transaction((tx) => recordCheckIn(
      tx,
      scope,
      null,
      { source: 'self-service', method: request.method },
    ));
    return { ...label, checkedInAt: created.checkedInAt.toISOString(), alreadyCheckedIn: created.alreadyCheckedIn };
  }

  private assertTotemAccess(config: unknown, accessToken: string | undefined) {
    const access = totemAccessDecision(config, accessToken, new Date());
    if (access === 'open' || access === 'valid') return;
    if (access === 'expired') throw new GoneException('Este link de autoatendimento expirou.');
    throw new NotFoundException('Este link de autoatendimento não é válido.');
  }

  private async locateSelfService(slug: string, input: unknown, accessToken?: string) {
    const event = await this.publishedCredentialEvent(slug);
    this.assertTotemAccess(event.capabilities[0]?.config, accessToken);
    const methods = readSelfServiceMethods(event.capabilities[0]?.config);
    let request: { method: SelfServiceMethod; value: string };
    try { request = normalizeSelfServiceRequest(input); } catch (error) {
      if (error instanceof DeskPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    if (!methods.includes(request.method)) throw new BadRequestException('Esta forma de identificação não está disponível neste totem.');
    const reservation = await this.reservationForSelfService(event, request.method, request.value);
    return { event, request, reservation };
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
    if (method === 'PROTOCOL') {
      const reservation = await this.prisma.eventRegistrationReservation.findFirst({
        where: { ...scope, protocol: value },
        select,
      });
      if (!reservation) throw new BadRequestException('Não encontramos uma inscrição confirmada com esses dados.');
      return reservation;
    }
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
      ? 'Encontramos mais de uma inscrição para este documento. Use o QR Code ou o número da inscrição.'
      : 'Encontramos mais de uma inscrição para este e-mail. Use o CPF, o passaporte ou o código.');
    if (found.length === 0) throw new BadRequestException('Não encontramos uma inscrição confirmada com esses dados.');
    return found[0];
  }
}


