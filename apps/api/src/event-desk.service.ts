import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CapabilityStatus, EventStatus, MembershipRole, Prisma, RegistrationReservationStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuthorizationService } from './authorization.service';
import { printedCredential } from './credential-label';
import {
  DeskPolicyError,
  deskAllows,
  deskDisplayName,
  deskSearchAllowed,
  labelFieldAllowed,
  mergeLabelConfig,
  mergeSelfServiceConfig,
  normalizeActivityId,
  normalizeDeskSearch,
  normalizeReservationId,
  normalizeLabelConfig,
  normalizeSelfServiceMethods,
  operationalCapabilities,
  readLabelConfig,
  readSelfServiceMethods,
  type OperationalCapability,
} from './event-desk-policy';
import {
  editableRegistrationFields,
  normalizeParticipantEditIdempotencyKey,
  normalizeParticipantRegistrationPatch,
  participantEditHash,
  participantEditPayloadHash,
  ParticipantRegistrationEditPolicyError,
} from './participant-registration-edit-policy';
import { publicRegistrationFields } from './registration-category-fields';
import { PrismaService } from './prisma.service';

const STAFF_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.OPERATOR];

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function policyError(error: unknown): never {
  if (error instanceof DeskPolicyError) throw new BadRequestException(error.message);
  throw error;
}

@Injectable()
export class EventDeskService {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationService) {}

  private async eventFor(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        registrationMode: true,
        organizationId: true,
        capabilities: { where: { status: CapabilityStatus.ACTIVE }, select: { code: true } },
      },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    const membership = await this.authorization.requireRole(userId, event.organizationId, STAFF_ROLES);
    return { ...event, role: membership.role };
  }

  private requireCapability(codes: string[], capability: OperationalCapability) {
    if (!deskAllows(codes, capability)) throw new NotFoundException('Evento não encontrado.');
  }

  private requirePublished(status: EventStatus) {
    if (status !== EventStatus.PUBLISHED) throw new NotFoundException('Evento não encontrado.');
  }

  private requireOrganizer(role: MembershipRole) {
    if (role === MembershipRole.OPERATOR) throw new NotFoundException('Evento não encontrado.');
  }

  async context(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId);
    const codes = event.capabilities.map((item) => item.code);
    const capabilities = operationalCapabilities(codes);
    const credential = capabilities.includes('credential')
      ? await this.prisma.eventCapability.findFirst({
        where: { eventId: event.id, code: 'credential' },
        select: { config: true },
      })
      : null;
    const activities = capabilities.includes('access_control')
      ? await this.prisma.scientificProgramActivity.findMany({
        where: { eventId: event.id, organizationId: event.organizationId! },
        orderBy: [{ startAt: 'asc' }, { title: 'asc' }],
        select: { id: true, title: true, startAt: true },
        take: 1000,
      })
      : [];
    const catalog = capabilities.includes('registration') || capabilities.includes('credential')
      ? await this.prisma.event.findUnique({
        where: { id: event.id },
        select: {
          registrationForm: { select: { fields: true } },
          registrationCatalog: {
            select: {
              categories: {
                where: { active: true },
                orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                select: {
                  id: true,
                  name: true,
                  lots: {
                    where: { active: true },
                    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                    select: { id: true, name: true, priceCents: true },
                  },
                },
              },
            },
          },
        },
      })
      : null;
    return {
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug,
        status: event.status,
        registrationMode: event.registrationMode,
      },
      role: event.role,
      capabilities,
      selfService: readSelfServiceMethods(credential?.config),
      label: readLabelConfig(credential?.config),
      labelFields: publicRegistrationFields(catalog?.registrationForm?.fields)
        .filter((field) => labelFieldAllowed(field.code) && field.type !== 'PHOTO' && field.type !== 'CONSENT')
        .map((field) => ({ code: field.code, label: field.label })),
      activities: activities.map((activity) => ({
        id: activity.id,
        title: activity.title,
        startAt: activity.startAt.toISOString(),
      })),
      categories: (catalog?.registrationCatalog?.categories ?? []).map((category) => ({
        id: category.id,
        name: category.name,
        lots: category.lots,
      })),
      fields: capabilities.includes('registration') ? publicRegistrationFields(catalog?.registrationForm?.fields) : [],
    };
  }

  async search(userId: string, eventId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId);
    const codes = event.capabilities.map((item) => item.code);
    if (!deskSearchAllowed(codes)) throw new NotFoundException('Evento não encontrado.');
    let query;
    try { query = normalizeDeskSearch(input); } catch (error) { policyError(error); }
    const scope = { eventId: event.id, organizationId: event.organizationId! };
    let ids: string[] = [];
    if (query.kind === 'PROTOCOL') {
      const found = await this.prisma.eventRegistrationReservation.findFirst({
        where: { ...scope, protocol: query.value },
        select: { id: true },
      });
      ids = found ? [found.id] : [];
    } else if (query.kind === 'EMAIL') {
      const found = await this.prisma.eventRegistrationReservation.findMany({
        where: { ...scope, emailHash: sha256(query.value) },
        select: { id: true },
        take: 25,
      });
      ids = found.map((item) => item.id);
    } else if (query.kind === 'DOCUMENT') {
      const found = await this.prisma.eventRegistrationReservation.findMany({
        where: { ...scope, identityHash: sha256(query.value) },
        select: { id: true },
        take: 25,
      });
      ids = found.map((item) => item.id);
    } else {
      const pattern = `%${query.value}%`;
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "EventRegistrationReservation"
        WHERE "eventId" = ${event.id} AND "organizationId" = ${event.organizationId}
        AND (
          "registrationData"->>'full_name' ILIKE ${pattern}
          OR "registrationData"->>'preferred_name' ILIKE ${pattern}
        )
        ORDER BY "createdAt" DESC
        LIMIT 25
      `;
      ids = rows.map((row) => row.id);
    }
    if (ids.length === 0) return { items: [] };
    const rows = await this.prisma.eventRegistrationReservation.findMany({
      where: { ...scope, id: { in: ids } },
      select: {
        id: true,
        protocol: true,
        status: true,
        registrationData: true,
        category: { select: { name: true } },
        checkIn: { select: { checkedInAt: true } },
        materialDelivery: { select: { deliveredAt: true } },
      },
    });
    return {
      items: rows.map((row) => ({
        reservationId: row.id,
        protocol: row.protocol,
        name: deskDisplayName(row.registrationData),
        category: row.category.name,
        status: row.status,
        checkedInAt: row.checkIn?.checkedInAt.toISOString() ?? null,
        materialDeliveredAt: row.materialDelivery?.deliveredAt.toISOString() ?? null,
      })),
    };
  }

  private async confirmedReservation(event: { id: string; organizationId: string | null }, reservationId: string) {
    const reservation = await this.prisma.eventRegistrationReservation.findFirst({
      where: { id: reservationId, eventId: event.id, organizationId: event.organizationId! },
      select: {
        id: true,
        protocol: true,
        status: true,
        registrationData: true,
        category: { select: { name: true } },
      },
    });
    if (!reservation || reservation.status !== RegistrationReservationStatus.CONFIRMED) {
      throw new BadRequestException('A inscrição confirmada deste evento não foi encontrada.');
    }
    return reservation;
  }

  async checkInReservation(userId: string, eventId: string, input: { reservationId?: unknown }) {
    const event = await this.eventFor(userId, eventId);
    this.requirePublished(event.status);
    this.requireCapability(event.capabilities.map((item) => item.code), 'access_control');
    let reservationId: string;
    try { reservationId = normalizeReservationId(input?.reservationId); } catch (error) { policyError(error); }
    const reservation = await this.confirmedReservation(event, reservationId);
    const scope = { reservationId, eventId: event.id, organizationId: event.organizationId! };
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const checkIn = await tx.eventRegistrationCheckIn.create({ data: { ...scope, actorUserId: userId } });
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId!,
            eventId: event.id,
            actorUserId: userId,
            action: 'registration.checked_in',
            entityType: 'EventRegistrationReservation',
            entityId: reservationId,
            metadata: { source: 'desk', checkedInAt: checkIn.checkedInAt.toISOString() } as Prisma.InputJsonObject,
          },
        });
        return checkIn;
      });
      return { protocol: reservation.protocol, checkedInAt: created.checkedInAt.toISOString(), alreadyCheckedIn: false };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.eventRegistrationCheckIn.findFirst({
        where: scope,
        select: { checkedInAt: true },
      });
      if (!existing) throw error;
      return { protocol: reservation.protocol, checkedInAt: existing.checkedInAt.toISOString(), alreadyCheckedIn: true };
    }
  }

  async badge(userId: string, eventId: string, input: { reservationId?: unknown }) {
    const event = await this.eventFor(userId, eventId);
    this.requirePublished(event.status);
    this.requireCapability(event.capabilities.map((item) => item.code), 'credential');
    let reservationId: string;
    try { reservationId = normalizeReservationId(input?.reservationId); } catch (error) { policyError(error); }
    const reservation = await this.confirmedReservation(event, reservationId);
    const config = await this.prisma.eventCapability.findFirst({
      where: { eventId: event.id, code: 'credential' },
      select: { config: true },
    });
    return printedCredential(
      event.name,
      reservation.registrationData,
      reservation.category.name,
      reservation.protocol,
      event.id,
      reservation.id,
      process.env.JWT_SECRET ?? '',
      readLabelConfig(config?.config),
    );
  }

  async updateLabel(userId: string, eventId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId);
    this.requireOrganizer(event.role);
    this.requireCapability(event.capabilities.map((item) => item.code), 'credential');
    let label;
    try { label = normalizeLabelConfig(input); } catch (error) { policyError(error); }
    const current = await this.prisma.eventCapability.findFirst({
      where: { eventId: event.id, code: 'credential' },
      select: { config: true },
    });
    if (!current) throw new NotFoundException('Evento não encontrado.');
    await this.prisma.$transaction(async (tx) => {
      await tx.eventCapability.update({
        where: { eventId_code: { eventId: event.id, code: 'credential' } },
        data: { config: mergeLabelConfig(current.config, label) as Prisma.InputJsonObject },
      });
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId!,
          eventId: event.id,
          actorUserId: userId,
          action: 'credential.label_updated',
          entityType: 'Event',
          entityId: event.id,
          metadata: {
            preset: label.preset,
            widthMm: label.widthMm,
            heightMm: label.heightMm,
            codeMode: label.codeMode,
            showName: label.showName,
            showCompany: label.showCompany,
            showCategory: label.showCategory,
          } as Prisma.InputJsonObject,
        },
      });
    });
    return { label };
  }

  async deliverMaterial(userId: string, eventId: string, input: { reservationId?: unknown }) {
    const event = await this.eventFor(userId, eventId);
    this.requirePublished(event.status);
    this.requireCapability(event.capabilities.map((item) => item.code), 'material_delivery');
    let reservationId: string;
    try { reservationId = normalizeReservationId(input?.reservationId); } catch (error) { policyError(error); }
    const reservation = await this.confirmedReservation(event, reservationId);
    const scope = { reservationId, eventId: event.id, organizationId: event.organizationId! };
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const delivery = await tx.eventMaterialDelivery.create({ data: { ...scope, actorUserId: userId } });
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId!,
            eventId: event.id,
            actorUserId: userId,
            action: 'registration.material_delivered',
            entityType: 'EventRegistrationReservation',
            entityId: reservationId,
            metadata: { deliveredAt: delivery.deliveredAt.toISOString() } as Prisma.InputJsonObject,
          },
        });
        return delivery;
      });
      return { protocol: reservation.protocol, deliveredAt: created.deliveredAt.toISOString(), alreadyDelivered: false };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.eventMaterialDelivery.findFirst({ where: scope, select: { deliveredAt: true } });
      if (!existing) throw error;
      return { protocol: reservation.protocol, deliveredAt: existing.deliveredAt.toISOString(), alreadyDelivered: true };
    }
  }

  async recordActivityAccess(userId: string, eventId: string, input: { reservationId?: unknown; activityId?: unknown }) {
    const event = await this.eventFor(userId, eventId);
    this.requirePublished(event.status);
    this.requireCapability(event.capabilities.map((item) => item.code), 'access_control');
    let reservationId: string;
    let activityId: string;
    try {
      reservationId = normalizeReservationId(input?.reservationId);
      activityId = normalizeActivityId(input?.activityId);
    } catch (error) { policyError(error); }
    const reservation = await this.confirmedReservation(event, reservationId);
    const activity = await this.prisma.scientificProgramActivity.findFirst({
      where: { id: activityId, eventId: event.id, organizationId: event.organizationId! },
      select: { id: true, title: true },
    });
    if (!activity) throw new NotFoundException('Atividade não encontrada.');
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const access = await tx.eventActivityAccess.create({
          data: { reservationId, activityId, eventId: event.id, organizationId: event.organizationId!, actorUserId: userId },
        });
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId!,
            eventId: event.id,
            actorUserId: userId,
            action: 'registration.activity_accessed',
            entityType: 'ScientificProgramActivity',
            entityId: activityId,
            metadata: { reservationId, accessedAt: access.accessedAt.toISOString() } as Prisma.InputJsonObject,
          },
        });
        return access;
      });
      return { protocol: reservation.protocol, activity: activity.title, accessedAt: created.accessedAt.toISOString(), alreadyRecorded: false };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.eventActivityAccess.findFirst({
        where: { reservationId, activityId, eventId: event.id, organizationId: event.organizationId! },
        select: { accessedAt: true },
      });
      if (!existing) throw error;
      return { protocol: reservation.protocol, activity: activity.title, accessedAt: existing.accessedAt.toISOString(), alreadyRecorded: true };
    }
  }

  async updateSelfService(userId: string, eventId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId);
    this.requireOrganizer(event.role);
    this.requireCapability(event.capabilities.map((item) => item.code), 'credential');
    let methods;
    try { methods = normalizeSelfServiceMethods(input); } catch (error) { policyError(error); }
    const current = await this.prisma.eventCapability.findFirst({
      where: { eventId: event.id, code: 'credential' },
      select: { config: true },
    });
    if (!current) throw new NotFoundException('Evento não encontrado.');
    await this.prisma.$transaction(async (tx) => {
      await tx.eventCapability.update({
        where: { eventId_code: { eventId: event.id, code: 'credential' } },
        data: { config: mergeSelfServiceConfig(current.config, methods) as Prisma.InputJsonObject },
      });
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId!,
          eventId: event.id,
          actorUserId: userId,
          action: 'credential.self_service_updated',
          entityType: 'Event',
          entityId: event.id,
          metadata: { methods } as Prisma.InputJsonObject,
        },
      });
    });
    return { methods };
  }

  async registrationTarget(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId);
    this.requirePublished(event.status);
    this.requireCapability(event.capabilities.map((item) => item.code), 'registration');
    return { slug: event.slug, organizationId: event.organizationId! };
  }

  async registrationRecord(userId: string, eventId: string, reservationIdValue: string) {
    const event = await this.eventFor(userId, eventId);
    this.requirePublished(event.status);
    this.requireDeskEdit(event.capabilities.map((item) => item.code));
    let reservationId: string;
    try { reservationId = normalizeReservationId(reservationIdValue); } catch (error) { policyError(error); }
    const reservation = await this.editableReservation(event, reservationId);
    let fields;
    try { fields = editableRegistrationFields(reservation.event.registrationForm?.fields, reservation.registrationData); }
    catch (error) {
      if (error instanceof ParticipantRegistrationEditPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    return {
      reservationId: reservation.id,
      protocol: reservation.protocol,
      revision: reservation.registrationRevision,
      fields,
      locked: ['identity_document', 'email', 'category', 'lot', 'payment', 'billing'],
    };
  }

  async correctRegistration(
    userId: string,
    eventId: string,
    reservationIdValue: string,
    idempotencyKeyValue: string | undefined,
    inputValue: unknown,
  ) {
    const event = await this.eventFor(userId, eventId);
    this.requirePublished(event.status);
    this.requireDeskEdit(event.capabilities.map((item) => item.code));
    let reservationId: string;
    let idempotencyKey: string;
    try {
      reservationId = normalizeReservationId(reservationIdValue);
      idempotencyKey = normalizeParticipantEditIdempotencyKey(idempotencyKeyValue);
    } catch (error) { policyError(error); }
    const idempotencyKeyHash = participantEditHash(idempotencyKey);
    try {
      await this.prisma.$transaction(async (tx) => {
        const reservation = await this.editableReservation(event, reservationId, tx);
        const fields = editableRegistrationFields(reservation.event.registrationForm?.fields, reservation.registrationData);
        const patch = normalizeParticipantRegistrationPatch(inputValue, fields);
        const payloadHash = participantEditPayloadHash(patch);
        const replay = await tx.participantRegistrationRevision.findUnique({
          where: { reservationId_idempotencyKeyHash: { reservationId: reservation.id, idempotencyKeyHash } },
          select: { payloadHash: true },
        });
        if (replay) {
          if (replay.payloadHash !== payloadHash) throw new ConflictException('A Idempotency-Key já foi usada com outro conteúdo.');
          return;
        }
        if (reservation.registrationRevision !== patch.expectedRevision) {
          throw new ConflictException('A inscrição foi atualizada em outra sessão. Recarregue antes de salvar.');
        }
        const current = (reservation.registrationData as Prisma.JsonObject | null) ?? {};
        const previousEditable = Object.fromEntries(fields.map((field) => [field.code, current[field.code] ?? null]));
        const nextData = { ...current, ...patch.updates };
        const nextEditable = Object.fromEntries(fields.map((field) => [field.code, nextData[field.code] ?? null]));
        const normalizedAnswer = (value: unknown) => value == null || value === '' || (Array.isArray(value) && value.length === 0) ? '' : value;
        const changedFieldCodes = Object.keys(patch.updates).filter((code) =>
          JSON.stringify(normalizedAnswer(current[code])) !== JSON.stringify(normalizedAnswer(patch.updates[code])));
        if (changedFieldCodes.length === 0) throw new BadRequestException('Nenhuma alteração efetiva foi informada.');
        const updated = await tx.eventRegistrationReservation.updateMany({
          where: {
            id: reservation.id,
            eventId: event.id,
            organizationId: event.organizationId!,
            registrationRevision: patch.expectedRevision,
            status: { in: [RegistrationReservationStatus.PENDING_PAYMENT, RegistrationReservationStatus.CONFIRMED] },
          },
          data: { registrationData: nextData as Prisma.InputJsonObject, registrationRevision: { increment: 1 } },
        });
        if (updated.count !== 1) throw new ConflictException('A inscrição foi atualizada em outra sessão. Recarregue antes de salvar.');
        await tx.participantRegistrationRevision.create({
          data: {
            reservationId: reservation.id,
            organizationId: event.organizationId!,
            eventId: event.id,
            fromRevision: patch.expectedRevision,
            toRevision: patch.expectedRevision + 1,
            previousEditableData: previousEditable as Prisma.InputJsonObject,
            nextEditableData: nextEditable as Prisma.InputJsonObject,
            changedFieldCodes,
            idempotencyKeyHash,
            payloadHash,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId!,
            eventId: event.id,
            actorUserId: userId,
            action: 'registration.desk_corrected',
            entityType: 'EventRegistrationReservation',
            entityId: reservation.id,
            metadata: { revision: patch.expectedRevision + 1, changedFieldCodes } as Prisma.InputJsonObject,
          },
        });
      });
    } catch (error) {
      if (error instanceof ParticipantRegistrationEditPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    return this.registrationRecord(userId, eventId, reservationId);
  }

  private requireDeskEdit(codes: string[]) {
    if (!deskAllows(codes, 'credential') && !deskAllows(codes, 'registration')) {
      throw new NotFoundException('Evento não encontrado.');
    }
  }

  private async editableReservation(
    event: { id: string; organizationId: string | null },
    reservationId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const reservation = await tx.eventRegistrationReservation.findFirst({
      where: {
        id: reservationId,
        eventId: event.id,
        organizationId: event.organizationId!,
        status: { in: [RegistrationReservationStatus.CONFIRMED, RegistrationReservationStatus.PENDING_PAYMENT] },
      },
      select: {
        id: true,
        protocol: true,
        registrationData: true,
        registrationRevision: true,
        event: { select: { registrationForm: { select: { fields: true, publishedVersion: true } } } },
      },
    });
    if (!reservation?.event.registrationForm || reservation.event.registrationForm.publishedVersion < 1) {
      throw new NotFoundException('Evento não encontrado.');
    }
    return reservation;
  }
}
