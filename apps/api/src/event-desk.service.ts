import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CapabilityStatus, EventStatus, MembershipRole, Prisma, RegistrationReservationStatus } from '@prisma/client';
import { createHash, randomInt } from 'node:crypto';
import {
  CredentialRafflePolicyError,
  normalizeRaffle,
} from './credential-raffle-policy';
import { AuthorizationService } from './authorization.service';
import {
  activeCheckedInAt,
  activeDeliveredAt,
  CheckInRecordError,
  recordCheckIn,
  recordDayPresence,
  recordMaterial,
  reverseCheckIn,
  reverseDayPresence,
  reverseMaterial,
} from './check-in-record';
import { eventCalendarDay, PresencePolicyError, presenceDay, presenceReversalReason } from './desk-presence.policy';
import { printedCredential } from './credential-label';
import { issueCheckInCode } from './check-in-policy';
import {
  categoryLabelTemplates, labelTemplateForCategory, normalizeCategoryLabelFields,
  updateCategoryLabelTemplate, categoryBadgeItems, normalizeLabelFieldStyles,
} from './credential-category-template.policy';
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
  mergeTotemLink,
  normalizeTotemExpiry,
  TotemLinkPolicyError,
  totemLinkHash,
  totemLinkToken,
  totemLinkView,
} from './totem-link-policy';
import {
  editableRegistrationFields,
  normalizeParticipantEditIdempotencyKey,
  normalizeParticipantRegistrationPatch,
  participantEditHash,
  participantEditPayloadHash,
  ParticipantRegistrationEditPolicyError,
} from './participant-registration-edit-policy';
import { syncShirtSizeField } from './kit-form';
import {
  KIT_EXPORT_ROW_LIMIT,
  KitReportPolicyError,
  kitCsv,
  kitExportLimitMessage,
  kitReportItem,
  normalizeKitReportQuery,
  type KitReportFilters,
  type KitSituation,
} from './kit-report';
import { KitStockPolicyError, SHIRT_SIZE_FIELD_CODE, normalizeKitConfig } from './kit-stock.policy';
import { publicRegistrationFields } from './registration-category-fields';
import { PrismaService } from './prisma.service';
import { stationAvailable } from './scientific-station-policy';

const STAFF_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.OPERATOR];

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function policyError(error: unknown): never {
  if (error instanceof DeskPolicyError || error instanceof PresencePolicyError) throw new BadRequestException(error.message);
  throw error;
}

function recordError(error: unknown): never {
  if (error instanceof CheckInRecordError && error.code === 'ABSENT') {
    throw new NotFoundException('Não há registro ativo para desfazer.');
  }
  if (error instanceof CheckInRecordError && error.code === 'STOCK') {
    throw new ConflictException('Não há estoque deste tamanho.');
  }
  if (error instanceof CheckInRecordError && error.code === 'SIZE_CHANGE') {
    throw new BadRequestException('Confirme a troca do tamanho solicitado antes de registrar a entrega.');
  }
  if (error instanceof CheckInRecordError && error.code === 'SIZE') {
    throw new BadRequestException('Escolha um tamanho de camisa deste evento.');
  }
  if (error instanceof CheckInRecordError && error.code === 'ALREADY') {
    throw new ConflictException('Esta inscrição já retirou material. Estorne a entrega antes de trocar o tamanho.');
  }
  if (error instanceof CheckInRecordError) throw new NotFoundException('Evento não encontrado.');
  throw error;
}

function kitPolicyError(error: unknown): never {
  if (error instanceof KitStockPolicyError || error instanceof KitReportPolicyError) throw new BadRequestException(error.message);
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
        profileCode: true,
        eventType: true,
        registrationMode: true,
        timeZone: true,
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
        profileCode: event.profileCode,
        eventType: event.eventType,
        registrationMode: event.registrationMode,
      },
      role: event.role,
      scientificStationAvailable: stationAvailable(event),
      capabilities,
      selfService: readSelfServiceMethods(credential?.config),
      totemLink: totemLinkView(credential?.config, new Date()),
      label: readLabelConfig(credential?.config),
      categoryLabelTemplates: categoryLabelTemplates(credential?.config),
      labelFields: publicRegistrationFields(catalog?.registrationForm?.fields)
        .filter((field) => labelFieldAllowed(field.code) && field.type !== 'PHOTO' && field.type !== 'CONSENT')
        .map((field) => ({ code: field.code, label: field.label, appliesToCategoryIds: field.appliesToCategoryIds ?? [] })),
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
    const [rows, sizes] = await Promise.all([
      this.prisma.eventRegistrationReservation.findMany({
        where: { ...scope, id: { in: ids } },
        select: {
          id: true,
          protocol: true,
          status: true,
          registrationData: true,
          category: { select: { name: true } },
          checkIn: { select: { checkedInAt: true, reversedAt: true } },
          materialDelivery: {
            select: {
              deliveredAt: true,
              reversedAt: true,
              sizeId: true,
              sizeChangeConfirmed: true,
              size: { select: { label: true } },
            },
          },
          dayPresences: { where: { reversedAt: null }, select: { day: true }, orderBy: { day: 'asc' }, take: 31 },
        },
      }),
      this.prisma.eventKitSize.findMany({
        where: scope,
        select: { id: true, label: true },
      }),
    ]);
    const sizeLabels = new Map(sizes.map((size) => [size.id, size.label]));
    const today = this.calendarDay(event.timeZone);
    return {
      items: rows.map((row) => ({
        reservationId: row.id,
        protocol: row.protocol,
        name: deskDisplayName(row.registrationData),
        category: row.category.name,
        status: row.status,
        shirtPreference: this.shirtPreference(row.registrationData, sizeLabels),
        deliveredSizeLabel: row.materialDelivery && !row.materialDelivery.reversedAt ? row.materialDelivery.size?.label ?? null : null,
        ...this.presenceOf(row, today),
      })),
    };
  }

  private shirtPreference(data: Prisma.JsonValue, sizeLabels: Map<string, string>) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const value = (data as Record<string, unknown>)[SHIRT_SIZE_FIELD_CODE];
    if (typeof value !== 'string' || !sizeLabels.has(value)) return null;
    return { sizeId: value, label: sizeLabels.get(value)! };
  }

  private calendarDay(timeZone: string | null) {
    if (!timeZone) return null;
    try { return eventCalendarDay(timeZone); }
    catch { return null; }
  }

  private presenceOf(
    row: {
      checkIn: { checkedInAt: Date; reversedAt: Date | null } | null;
      materialDelivery: { deliveredAt: Date; reversedAt: Date | null } | null;
      dayPresences?: Array<{ day: Date }>;
    },
    today: string | null,
  ) {
    const presenceDays = (row.dayPresences ?? []).map((item) => item.day.toISOString().slice(0, 10));
    return {
      checkedInAt: activeCheckedInAt(row.checkIn),
      checkInReversedAt: row.checkIn?.reversedAt?.toISOString() ?? null,
      materialDeliveredAt: activeDeliveredAt(row.materialDelivery),
      materialReversedAt: row.materialDelivery?.reversedAt?.toISOString() ?? null,
      presenceDays,
      presentToday: Boolean(today && presenceDays.includes(today)),
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
        category: { select: { id: true, name: true } },
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
    const created = await this.prisma.$transaction((tx) => recordCheckIn(tx, scope, userId, { source: 'desk' }) ).catch(recordError);
    return {
      protocol: reservation.protocol,
      checkedInAt: created.checkedInAt.toISOString(),
      alreadyCheckedIn: created.alreadyCheckedIn,
      restored: created.restored,
    };
  }

  async reverseCheckIn(userId: string, eventId: string, input: { reservationId?: unknown; reason?: unknown }) {
    const event = await this.eventFor(userId, eventId);
    this.requirePublished(event.status);
    this.requireCapability(event.capabilities.map((item) => item.code), 'access_control');
    let reservationId: string;
    let reason: string;
    try {
      reservationId = normalizeReservationId(input?.reservationId);
      reason = presenceReversalReason(input?.reason);
    } catch (error) { policyError(error); }
    const reservation = await this.confirmedReservation(event, reservationId);
    const scope = { reservationId, eventId: event.id, organizationId: event.organizationId! };
    try {
      const reversed = await this.prisma.$transaction((tx) => reverseCheckIn(tx, scope, userId, reason));
      return { protocol: reservation.protocol, reversedAt: reversed.reversedAt.toISOString(), checkedInAt: null };
    } catch (error) { recordError(error); }
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
    const orderedFields = labelTemplateForCategory(config?.config, reservation.category.id);
    const template = categoryLabelTemplates(config?.config).find((item) => item.categoryId === reservation.category.id);
    const credential = printedCredential(
      event.name,
      reservation.registrationData,
      reservation.category.name,
      reservation.protocol,
      event.id,
      reservation.id,
      process.env.JWT_SECRET ?? '',
      readLabelConfig(config?.config),
    );
    const orderedContent = categoryBadgeItems(reservation.registrationData, orderedFields, template?.styles);
    return {
      ...credential, name: null, company: null, lines: [], category: null,
      orderedContent,
      qr: orderedFields.includes('qr')
        ? issueCheckInCode(event.id, reservation.id, process.env.JWT_SECRET ?? '')
        : null,
      barcode: null,
    };
  }

  async updateCategoryLabel(userId: string, eventId: string, categoryId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId);
    this.requireOrganizer(event.role);
    this.requireCapability(event.capabilities.map((item) => item.code), 'credential');
    const category = await this.prisma.eventRegistrationCategory.findFirst({
      where: { id: categoryId, eventId: event.id, organizationId: event.organizationId!, active: true },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Categoria deste evento não encontrada.');
    const form = await this.prisma.eventRegistrationForm.findFirst({
      where: { eventId: event.id, organizationId: event.organizationId! },
      select: { fields: true },
    });
    const allowed = publicRegistrationFields(form?.fields)
      .filter((field) => labelFieldAllowed(field.code) && field.type !== 'PHOTO' && field.type !== 'CONSENT')
      .filter((field) => !field.appliesToCategoryIds?.length || field.appliesToCategoryIds.includes(categoryId))
      .map((field) => field.code);
    let fields: string[];
    let styles: ReturnType<typeof normalizeLabelFieldStyles>;
    try {
      const body = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
      if (Object.keys(body).some((key) => key !== 'fields' && key !== 'styles')) throw new DeskPolicyError('Configuração de etiqueta inválida.');
      fields = normalizeCategoryLabelFields(body.fields, allowed);
      styles = normalizeLabelFieldStyles(body.styles, fields);
    } catch (error) { policyError(error); }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const cap = await tx.eventCapability.findFirst({
            where: { eventId: event.id, code: 'credential', status: CapabilityStatus.ACTIVE },
            select: { config: true },
          });
          if (!cap) throw new NotFoundException('Credenciamento indisponível.');
          const config = updateCategoryLabelTemplate(cap.config, categoryId, fields, styles);
          await tx.eventCapability.update({
            where: { eventId_code: { eventId: event.id, code: 'credential' } },
            data: { config: config as Prisma.InputJsonObject },
          });
          await tx.auditLog.create({ data: {
            organizationId: event.organizationId!, eventId: event.id, actorUserId: userId,
            action: 'credential.category_label_updated', entityType: 'EventRegistrationCategory',
            entityId: categoryId,
            metadata: { count: fields.length, fields } as Prisma.InputJsonObject,
          } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return { categoryId, fields, styles };
      } catch (error) {
        if ((error as { code?: string })?.code === 'P2034' && attempt < 2) continue;
        throw error;
      }
    }
    throw new ConflictException('Configuração concorrente. Tente novamente.');
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

  async deliverMaterial(userId: string, eventId: string, input: { reservationId?: unknown; sizeId?: unknown; confirmSizeChange?: unknown }) {
    const event = await this.eventFor(userId, eventId);
    this.requirePublished(event.status);
    this.requireCapability(event.capabilities.map((item) => item.code), 'material_delivery');
    let reservationId: string;
    try { reservationId = normalizeReservationId(input?.reservationId); } catch (error) { policyError(error); }
    const reservation = await this.confirmedReservation(event, reservationId);
    const scope = { reservationId, eventId: event.id, organizationId: event.organizationId! };
    const kit = await this.prisma.eventKitConfig.findUnique({
      where: { eventId_organizationId: { eventId: event.id, organizationId: event.organizationId! } },
      select: { shirtsEnabled: true, sizes: { select: { id: true, label: true, active: true } } },
    });
    const activeSizes = kit?.sizes.filter((item) => item.active) ?? [];
    const shirts = Boolean(kit?.shirtsEnabled && activeSizes.length > 0);
    let request: { sizeId: string; requestedLabel: string | null; confirmSizeChange: boolean } | undefined;
    if (shirts && kit) {
      if (typeof input?.sizeId !== 'string') throw new BadRequestException('Escolha o tamanho de camisa entregue.');
      const size = activeSizes.find((item) => item.id === input.sizeId);
      if (!size) {
        const inactive = kit.sizes.some((item) => item.id === input.sizeId && !item.active);
        throw new BadRequestException(inactive
          ? 'Este tamanho de camisa não está disponível para entrega.'
          : 'Escolha um tamanho de camisa deste evento.');
      }
      const preference = this.shirtPreference(reservation.registrationData, new Map(kit.sizes.map((item) => [item.id, item.label])));
      request = {
        sizeId: size.id,
        requestedLabel: preference?.label ?? null,
        confirmSizeChange: input.confirmSizeChange === true,
      };
    }
    const created = await this.prisma.$transaction((tx) => recordMaterial(tx, scope, userId, request)).catch(recordError);
    return {
      protocol: reservation.protocol,
      deliveredAt: created.deliveredAt.toISOString(),
      alreadyDelivered: created.alreadyDelivered,
      restored: created.restored,
      sizeLabel: created.sizeLabel,
      sizeChangeConfirmed: created.sizeChangeConfirmed,
    };
  }

  async reverseMaterial(userId: string, eventId: string, input: { reservationId?: unknown; reason?: unknown }) {
    const event = await this.eventFor(userId, eventId);
    this.requirePublished(event.status);
    this.requireCapability(event.capabilities.map((item) => item.code), 'material_delivery');
    let reservationId: string;
    let reason: string;
    try {
      reservationId = normalizeReservationId(input?.reservationId);
      reason = presenceReversalReason(input?.reason);
    } catch (error) { policyError(error); }
    const reservation = await this.confirmedReservation(event, reservationId);
    const scope = { reservationId, eventId: event.id, organizationId: event.organizationId! };
    try {
      const reversed = await this.prisma.$transaction((tx) => reverseMaterial(tx, scope, userId, reason));
      return { protocol: reservation.protocol, reversedAt: reversed.reversedAt.toISOString(), deliveredAt: null };
    } catch (error) { recordError(error); }
  }

  async markDayPresence(userId: string, eventId: string, input: { reservationId?: unknown }) {
    const event = await this.eventFor(userId, eventId);
    this.requirePublished(event.status);
    this.requireCapability(event.capabilities.map((item) => item.code), 'access_control');
    let reservationId: string;
    try { reservationId = normalizeReservationId(input?.reservationId); } catch (error) { policyError(error); }
    if (!event.timeZone) throw new BadRequestException('Defina o fuso horário do evento antes de marcar a presença do dia.');
    const reservation = await this.confirmedReservation(event, reservationId);
    let day: string;
    try { day = eventCalendarDay(event.timeZone); } catch (error) { policyError(error); }
    const scope = { reservationId, eventId: event.id, organizationId: event.organizationId!, day: presenceDay(day) };
    const created = await this.prisma.$transaction((tx) => recordDayPresence(tx, scope, userId) ).catch(recordError);
    return {
      protocol: reservation.protocol,
      day,
      recordedAt: created.recordedAt.toISOString(),
      alreadyRecorded: created.alreadyRecorded,
      presentToday: true,
    };
  }

  async reverseDayPresence(userId: string, eventId: string, input: { reservationId?: unknown; reason?: unknown }) {
    const event = await this.eventFor(userId, eventId);
    this.requirePublished(event.status);
    this.requireCapability(event.capabilities.map((item) => item.code), 'access_control');
    let reservationId: string;
    let reason: string;
    try {
      reservationId = normalizeReservationId(input?.reservationId);
      reason = presenceReversalReason(input?.reason);
    } catch (error) { policyError(error); }
    if (!event.timeZone) throw new BadRequestException('Defina o fuso horário do evento antes de desfazer a presença do dia.');
    const reservation = await this.confirmedReservation(event, reservationId);
    let day: string;
    try { day = eventCalendarDay(event.timeZone); } catch (error) { policyError(error); }
    const scope = { reservationId, eventId: event.id, organizationId: event.organizationId!, day: presenceDay(day) };
    try {
      const reversed = await this.prisma.$transaction((tx) => reverseDayPresence(tx, scope, userId, reason));
      return { protocol: reservation.protocol, day, reversedAt: reversed.reversedAt.toISOString(), presentToday: false };
    } catch (error) { recordError(error); }
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

  async issueTotemLink(userId: string, eventId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId);
    this.requireOrganizer(event.role);
    this.requireCapability(event.capabilities.map((item) => item.code), 'credential');
    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException('Publique o evento antes de gerar o link com validade.');
    }
    let expiresAt: Date;
    try { expiresAt = normalizeTotemExpiry(input, new Date()); } catch (error) {
      if (error instanceof TotemLinkPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    const current = await this.prisma.eventCapability.findFirst({
      where: { eventId: event.id, code: 'credential' },
      select: { config: true },
    });
    if (!current) throw new NotFoundException('Evento não encontrado.');
    if (readSelfServiceMethods(current.config).length === 0) {
      throw new BadRequestException('Ligue ao menos uma busca do autoatendimento antes de gerar o link.');
    }
    const token = totemLinkToken();
    const issuedAt = new Date().toISOString();
    const record = { tokenHash: totemLinkHash(token), expiresAt: expiresAt.toISOString(), issuedAt };
    await this.prisma.$transaction(async (tx) => {
      await tx.eventCapability.update({
        where: { eventId_code: { eventId: event.id, code: 'credential' } },
        data: { config: mergeTotemLink(current.config, record) as Prisma.InputJsonObject },
      });
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId!,
          eventId: event.id,
          actorUserId: userId,
          action: 'credential.totem_link_issued',
          entityType: 'Event',
          entityId: event.id,
          metadata: { expiresAt: record.expiresAt } as Prisma.InputJsonObject,
        },
      });
    });
    return {
      path: `/evento/${encodeURIComponent(event.slug)}/autoatendimento/acesso/${token}`,
      expiresAt: record.expiresAt,
    };
  }

  async revokeTotemLink(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId);
    this.requireOrganizer(event.role);
    this.requireCapability(event.capabilities.map((item) => item.code), 'credential');
    const current = await this.prisma.eventCapability.findFirst({
      where: { eventId: event.id, code: 'credential' },
      select: { config: true },
    });
    if (!current) throw new NotFoundException('Evento não encontrado.');
    const previous = totemLinkView(current.config, new Date());
    await this.prisma.$transaction(async (tx) => {
      await tx.eventCapability.update({
        where: { eventId_code: { eventId: event.id, code: 'credential' } },
        data: { config: mergeTotemLink(current.config, null) as Prisma.InputJsonObject },
      });
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId!,
          eventId: event.id,
          actorUserId: userId,
          action: 'credential.totem_link_revoked',
          entityType: 'Event',
          entityId: event.id,
          metadata: { expiresAt: previous.expiresAt } as Prisma.InputJsonObject,
        },
      });
    });
    return { state: 'absent' as const, expiresAt: null };
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

  private requireOperational(codes: string[]) {
    if (operationalCapabilities(codes).length === 0) throw new NotFoundException('Evento não encontrado.');
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

  async kit(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId);
    this.requireCapability(event.capabilities.map((item) => item.code), 'material_delivery');
    return this.kitView(event.id, event.organizationId!);
  }

  async saveKit(userId: string, eventId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId);
    this.requireOrganizer(event.role);
    this.requireCapability(event.capabilities.map((item) => item.code), 'material_delivery');
    if (event.status === EventStatus.CANCELLED || event.status === EventStatus.FINISHED) {
      throw new NotFoundException('Evento não encontrado.');
    }
    let draft;
    try { draft = normalizeKitConfig(input); } catch (error) { kitPolicyError(error); }
    const scope = { eventId: event.id, organizationId: event.organizationId! };
    await this.prisma.$transaction(async (tx) => {
      // The event exists even before the first kit/size. Serialize configuration
      // writers on that stable row before locking sizes in their usual order.
      await tx.$queryRaw`
        SELECT "id" FROM "Event"
        WHERE "id" = ${event.id} AND "organizationId" = ${event.organizationId!}
        FOR UPDATE
      `;
      await tx.$queryRaw`
        SELECT "id" FROM "EventKitSize"
        WHERE "eventId" = ${event.id} AND "organizationId" = ${event.organizationId!}
        ORDER BY "id"
        FOR UPDATE
      `;
      await tx.eventKitConfig.upsert({
        where: { eventId_organizationId: scope },
        create: { ...scope, name: draft.name, shirtsEnabled: draft.shirtsEnabled, updatedByUserId: userId },
        update: { name: draft.name, shirtsEnabled: draft.shirtsEnabled, updatedByUserId: userId },
      });
      const current = await tx.eventKitSize.findMany({ where: scope });
      const counts = await this.deliveryCounts(tx, scope);
      const histories = await this.deliveryHistories(tx, scope);
      const sameLabel = (left: string, right: string) => left.toLocaleLowerCase('pt-BR') === right.toLocaleLowerCase('pt-BR');
      const kept = new Set<string>();
      const planned: Array<{ id?: string; label: string; stockQuantity: number; sortOrder: number }> = [];
      for (const [index, size] of draft.sizes.entries()) {
        const match = size.id
          ? current.find((item) => item.id === size.id)
          : current.find((item) => sameLabel(item.label, size.label) && !kept.has(item.id));
        if (size.id && !match) throw new BadRequestException('Escolha um tamanho de camisa deste evento.');
        const delivered = match ? counts.get(match.id) ?? 0 : 0;
        if (delivered > size.stockQuantity) {
          throw new ConflictException('O estoque previsto não pode ficar menor do que a quantidade já entregue.');
        }
        if (match && (histories.get(match.id) ?? 0) > 0 && !sameLabel(match.label, size.label)) {
          throw new ConflictException('Um tamanho com entregas registradas não pode ser renomeado.');
        }
        if (match) kept.add(match.id);
        planned.push({ ...(match ? { id: match.id } : {}), label: size.label, stockQuantity: size.stockQuantity, sortOrder: index });
      }
      const parked = current.filter((size) => !kept.has(size.id) && (histories.get(size.id) ?? 0) > 0);
      for (const size of current) {
        if (kept.has(size.id)) continue;
        if ((counts.get(size.id) ?? 0) > 0) throw new ConflictException('Não é possível remover um tamanho que ainda tem camisas entregues.');
      }
      const finalLabels = new Map<string, string>();
      for (const size of [...planned.map((size) => ({ id: size.id ?? `new-${size.label}`, label: size.label })), ...parked]) {
        const key = size.label.toLocaleLowerCase('pt-BR');
        const owner = finalLabels.get(key);
        if (owner && owner !== size.id) {
          throw new ConflictException(`O tamanho ${size.label} permanece no histórico e o nome não pode ser usado em outro tamanho.`);
        }
        finalLabels.set(key, size.id);
      }
      for (const size of current) {
        await tx.eventKitSize.update({ where: { id: size.id }, data: { label: `~${size.id}`.slice(0, 40) } });
      }
      for (const size of planned) {
        if (size.id) {
          await tx.eventKitSize.update({
            where: { id: size.id },
            data: { label: size.label, stockQuantity: size.stockQuantity, sortOrder: size.sortOrder, active: true },
          });
        } else {
          await tx.eventKitSize.create({
            data: { ...scope, label: size.label, stockQuantity: size.stockQuantity, sortOrder: size.sortOrder, active: true },
          });
        }
      }
      for (const size of current) {
        if (kept.has(size.id)) continue;
        if (parked.some((item) => item.id === size.id)) {
          await tx.eventKitSize.update({ where: { id: size.id }, data: { label: size.label, active: false } });
        } else {
          await tx.eventKitSize.delete({ where: { id: size.id } });
        }
      }
      const active = await tx.eventKitSize.findMany({
        where: { ...scope, active: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, label: true },
      });
      await syncShirtSizeField(tx, scope, userId, active, draft.shirtsEnabled);
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId!,
          eventId: event.id,
          actorUserId: userId,
          action: 'kit.config_updated',
          entityType: 'EventKitConfig',
          entityId: event.id,
          metadata: {
            name: draft.name,
            shirtsEnabled: draft.shirtsEnabled,
            sizes: active.map((size) => ({ id: size.id, label: size.label })),
          },
        },
      });
    });
    return this.kitView(event.id, event.organizationId!);
  }

  private async deliveryCounts(
    tx: Prisma.TransactionClient | PrismaService,
    scope: { eventId: string; organizationId: string },
  ) {
    const rows = await tx.eventMaterialDelivery.groupBy({
      by: ['sizeId'],
      where: { ...scope, reversedAt: null, sizeId: { not: null } },
      _count: { _all: true },
    });
    return new Map(rows.flatMap((row) => row.sizeId ? [[row.sizeId, row._count._all] as const] : []));
  }

  private async deliveryHistories(
    tx: Prisma.TransactionClient | PrismaService,
    scope: { eventId: string; organizationId: string },
  ) {
    const rows = await tx.eventMaterialDelivery.groupBy({
      by: ['sizeId'],
      where: { ...scope, sizeId: { not: null } },
      _count: { _all: true },
    });
    return new Map(rows.flatMap((row) => row.sizeId ? [[row.sizeId, row._count._all] as const] : []));
  }

  private async kitView(eventId: string, organizationId: string) {
    const scope = { eventId, organizationId };
    const [config, counts] = await Promise.all([
      this.prisma.eventKitConfig.findUnique({
        where: { eventId_organizationId: scope },
        select: {
          name: true,
          shirtsEnabled: true,
          sizes: { orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }], select: { id: true, label: true, stockQuantity: true, active: true } },
        },
      }),
      this.deliveryCounts(this.prisma, scope),
    ]);
    const sizes = (config?.sizes ?? []).filter((size) => size.active).map((size) => {
      const delivered = counts.get(size.id) ?? 0;
      return {
        id: size.id,
        label: size.label,
        forecast: size.stockQuantity,
        delivered,
        available: size.stockQuantity - delivered,
      };
    });
    return {
      name: config?.name ?? '',
      shirtsEnabled: Boolean(config?.shirtsEnabled),
      sizes,
    };
  }

  async kitReport(userId: string, eventId: string, query: unknown) {
    const event = await this.eventFor(userId, eventId);
    this.requireCapability(event.capabilities.map((item) => item.code), 'material_delivery');
    const filters = this.kitReportFilters(query, event.timeZone);
    await this.requireReportSize(event, filters.sizeId);
    const [kit, sizes, page] = await Promise.all([
      this.kitView(event.id, event.organizationId!),
      this.prisma.eventKitSize.findMany({
        where: { eventId: event.id, organizationId: event.organizationId! },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        select: { id: true, label: true, active: true },
      }),
      this.readKitReport(event, filters),
    ]);
    return {
      kit,
      sizes,
      page: filters.page,
      pageSize: filters.pageSize,
      total: page.total,
      items: page.items,
    };
  }

  async exportKitReport(userId: string, eventId: string, query: unknown) {
    const event = await this.eventFor(userId, eventId);
    this.requireOrganizer(event.role);
    this.requireCapability(event.capabilities.map((item) => item.code), 'material_delivery');
    const filters = this.kitReportFilters(query, event.timeZone, true);
    await this.requireReportSize(event, filters.sizeId);
    const total = await this.countKitReport(event, filters);
    if (total > KIT_EXPORT_ROW_LIMIT) throw new BadRequestException(kitExportLimitMessage(total));
    const page = await this.readKitReport(event, { ...filters, page: 1, pageSize: Math.max(total, 1) });
    return kitCsv(page.items);
  }

  private kitReportFilters(query: unknown, timeZone: string | null, asExport = false) {
    try { return normalizeKitReportQuery(query, timeZone, { export: asExport }); }
    catch (error) { kitPolicyError(error); }
  }

  private async requireReportSize(
    event: { id: string; organizationId: string | null },
    sizeId: string | undefined,
  ) {
    if (!sizeId) return;
    const size = await this.prisma.eventKitSize.findFirst({
      where: { id: sizeId, eventId: event.id, organizationId: event.organizationId! },
      select: { id: true },
    });
    if (!size) throw new BadRequestException('Escolha um tamanho de camisa deste evento.');
  }

  private kitReportWhere(
    event: { id: string; organizationId: string | null },
    filters: KitReportFilters,
  ) {
    const parts = [
      Prisma.sql`r."eventId" = ${event.id}`,
      Prisma.sql`r."organizationId" = ${event.organizationId!}`,
      Prisma.sql`r."status" = 'CONFIRMED'`,
    ];
    if (filters.situation === 'ENTREGUE') parts.push(Prisma.sql`d."reservationId" IS NOT NULL AND d."reversedAt" IS NULL`);
    if (filters.situation === 'ESTORNADO') parts.push(Prisma.sql`d."reversedAt" IS NOT NULL`);
    if (filters.situation === 'PENDENTE') parts.push(Prisma.sql`d."reservationId" IS NULL`);
    if (filters.sizeId) parts.push(Prisma.sql`d."sizeId" = ${filters.sizeId}`);
    if (filters.from) parts.push(Prisma.sql`d."deliveredAt" >= ${filters.from}`);
    if (filters.toExclusive) parts.push(Prisma.sql`d."deliveredAt" < ${filters.toExclusive}`);
    return Prisma.join(parts, ' AND ');
  }

  private async countKitReport(
    event: { id: string; organizationId: string | null },
    filters: KitReportFilters,
  ) {
    const where = this.kitReportWhere(event, filters);
    const totals = await this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM "EventRegistrationReservation" r
      LEFT JOIN "EventMaterialDelivery" d
        ON d."reservationId" = r."id"
       AND d."eventId" = r."eventId"
       AND d."organizationId" = r."organizationId"
      WHERE ${where}
    `);
    const total = Number(totals[0]?.total ?? 0);
    if (!Number.isSafeInteger(total)) throw new BadRequestException('Não foi possível montar o relatório.');
    return total;
  }

  private async readKitReport(
    event: { id: string; organizationId: string | null; timeZone?: string | null },
    filters: KitReportFilters,
  ) {
    const where = this.kitReportWhere(event, filters);
    const offset = (filters.page - 1) * filters.pageSize;
    const [total, idRows, sizes] = await Promise.all([
      this.countKitReport(event, filters),
      this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT r."id"
        FROM "EventRegistrationReservation" r
        LEFT JOIN "EventMaterialDelivery" d
          ON d."reservationId" = r."id"
         AND d."eventId" = r."eventId"
         AND d."organizationId" = r."organizationId"
        WHERE ${where}
        ORDER BY d."deliveredAt" DESC NULLS LAST, r."protocol" ASC, r."id" ASC
        OFFSET ${offset}
        LIMIT ${filters.pageSize}
      `),
      this.prisma.eventKitSize.findMany({
        where: { eventId: event.id, organizationId: event.organizationId! },
        select: { id: true, label: true },
      }),
    ]);
    const ids = idRows.map((row) => row.id);
    if (ids.length === 0) return { total, items: [] };
    const rows = await this.prisma.eventRegistrationReservation.findMany({
      where: { id: { in: ids }, eventId: event.id, organizationId: event.organizationId! },
      select: {
        id: true,
        protocol: true,
        registrationData: true,
        materialDelivery: {
          select: {
            requestedSizeLabel: true,
            deliveredAt: true,
            reversedAt: true,
            size: { select: { label: true } },
          },
        },
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const labels = new Map(sizes.map((size) => [size.id, size.label]));
    return {
      total,
      items: ids.flatMap((id) => {
        const row = byId.get(id);
        return row ? [this.toKitReportItem(row, labels)] : [];
      }),
    };
  }

  private toKitReportItem(
    row: {
      protocol: string;
      registrationData: Prisma.JsonValue;
      materialDelivery: {
        requestedSizeLabel: string | null;
        deliveredAt: Date;
        reversedAt: Date | null;
        size: { label: string } | null;
      } | null;
    },
    sizeLabels: Map<string, string>,
  ) {
    const delivery = row.materialDelivery;
    const situation: KitSituation = !delivery ? 'PENDENTE' : delivery.reversedAt ? 'ESTORNADO' : 'ENTREGUE';
    const preference = this.shirtPreference(row.registrationData, sizeLabels);
    return kitReportItem({
      protocol: row.protocol,
      name: deskDisplayName(row.registrationData),
      requestedSizeLabel: delivery?.requestedSizeLabel ?? preference?.label ?? null,
      deliveredSizeLabel: delivery?.size?.label ?? null,
      situation,
      at: delivery ? delivery.deliveredAt : null,
    });
  }

  async report(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId);
    this.requireOperational(event.capabilities.map((item) => item.code));
    const scope = { eventId: event.id, organizationId: event.organizationId! };
    const [registrations, confirmed, checkedIn, materialDelivered, rows, draws] = await Promise.all([
      this.prisma.eventRegistrationReservation.count({ where: scope }),
      this.prisma.eventRegistrationReservation.count({ where: { ...scope, status: RegistrationReservationStatus.CONFIRMED } }),
      this.prisma.eventRegistrationCheckIn.count({ where: { ...scope, reversedAt: null } }),
      this.prisma.eventMaterialDelivery.count({ where: { ...scope, reversedAt: null } }),
      this.prisma.eventRegistrationReservation.findMany({
        where: scope,
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          id: true,
          protocol: true,
          status: true,
          registrationData: true,
          category: { select: { name: true } },
          checkIn: { select: { checkedInAt: true, reversedAt: true } },
          materialDelivery: { select: { deliveredAt: true, reversedAt: true } },
        },
      }),
      this.prisma.auditLog.findMany({
        where: { ...scope, action: 'credential.raffle_drawn' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { createdAt: true, metadata: true },
      }),
    ]);
    const kit = await this.kitView(event.id, event.organizationId!);
    return {
      counts: { registrations, confirmed, checkedIn, materialDelivered },
      kit,
      truncated: registrations > rows.length,
      items: rows.map((row) => ({
        reservationId: row.id,
        protocol: row.protocol,
        name: deskDisplayName(row.registrationData),
        category: row.category.name,
        status: row.status,
        checkedInAt: activeCheckedInAt(row.checkIn),
        materialDeliveredAt: activeDeliveredAt(row.materialDelivery),
      })),
      draws: draws.flatMap((draw) => {
        const metadata = draw.metadata;
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
        const record = metadata as Record<string, unknown>;
        if (typeof record.protocol !== 'string' || typeof record.name !== 'string') return [];
        return [{
          at: draw.createdAt.toISOString(),
          protocol: record.protocol,
          name: record.name,
          scope: typeof record.scope === 'string' ? record.scope : 'ALL',
        }];
      }),
    };
  }

  async draw(userId: string, eventId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId);
    this.requirePublished(event.status);
    this.requireOperational(event.capabilities.map((item) => item.code));
    let request;
    try { request = normalizeRaffle(input); } catch (error) {
      if (error instanceof CredentialRafflePolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    if (request.categoryId) {
      const category = await this.prisma.eventRegistrationCategory.findFirst({
        where: { id: request.categoryId, eventId: event.id, organizationId: event.organizationId! },
        select: { id: true },
      });
      if (!category) throw new BadRequestException('Escolha a categoria deste evento.');
    }
    if (request.activityId) {
      const activity = await this.prisma.scientificProgramActivity.findFirst({
        where: { id: request.activityId, eventId: event.id, organizationId: event.organizationId! },
        select: { id: true },
      });
      if (!activity) throw new BadRequestException('Escolha a atividade deste evento.');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Event" WHERE "id" = ${event.id} AND "organizationId" = ${event.organizationId!} FOR UPDATE`);
      const category = request.categoryId
        ? Prisma.sql`AND r."categoryId" = ${request.categoryId}` : Prisma.empty;
      const activity = request.activityId
        ? Prisma.sql`AND EXISTS (SELECT 1 FROM "EventActivityAccess" a WHERE a."reservationId" = r."id" AND a."eventId" = r."eventId" AND a."organizationId" = r."organizationId" AND a."activityId" = ${request.activityId})`
        : Prisma.empty;
      const previous = request.allowRepeat ? Prisma.empty
        : Prisma.sql`AND NOT EXISTS (SELECT 1 FROM "AuditLog" d WHERE d."eventId" = r."eventId" AND d."organizationId" = r."organizationId" AND d."action" = 'credential.raffle_drawn' AND d."entityType" = 'EventRegistrationReservation' AND d."entityId" = r."id")`;
      const scope = Prisma.sql`r."eventId" = ${event.id} AND r."organizationId" = ${event.organizationId!} AND r."status" = 'CONFIRMED' ${category} ${activity} ${previous}`;
      const totals = await tx.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`SELECT COUNT(*) AS total FROM "EventRegistrationReservation" r WHERE ${scope}`);
      const total = Number(totals[0]?.total ?? 0);
      if (!Number.isSafeInteger(total) || total < 1 || total >= 2 ** 48) {
        throw new BadRequestException('Não há inscrição confirmada disponível neste grupo.');
      }
      const offset = randomInt(total);
      const selected = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT r."id" FROM "EventRegistrationReservation" r WHERE ${scope} ORDER BY r."id" OFFSET ${offset} LIMIT 1 FOR UPDATE OF r`);
      const reservationId = selected[0]?.id;
      if (!reservationId) throw new ConflictException('O grupo mudou durante o sorteio. Tente de novo.');
      const winner = await tx.eventRegistrationReservation.findFirst({
        where: { id: reservationId, eventId: event.id, organizationId: event.organizationId!, status: RegistrationReservationStatus.CONFIRMED },
        include: { category: { select: { name: true } } },
      });
      if (!winner) throw new ConflictException('A inscrição mudou durante o sorteio. Tente de novo.');
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId!,
          eventId: event.id,
          actorUserId: userId,
          action: 'credential.raffle_drawn',
          entityType: 'EventRegistrationReservation',
          entityId: winner.id,
          metadata: {
            reservationId: winner.id,
            protocol: winner.protocol,
            name: deskDisplayName(winner.registrationData),
            scope: request.scope,
            allowRepeat: request.allowRepeat,
          } as Prisma.InputJsonObject,
        },
      });
      return {
        winner: {
          reservationId: winner.id,
          protocol: winner.protocol,
          name: deskDisplayName(winner.registrationData),
          category: winner.category.name,
        },
      };
    });
  }
}


