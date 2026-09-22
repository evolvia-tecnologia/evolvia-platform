import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventStatus, Prisma, RegistrationBenefitKind, RegistrationMode, RegistrationReservationStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from './prisma.service';
import {
  PublicRegistrationInput,
  RegistrationReservationPolicyError,
  calculateRegistrationPrice,
  normalizeIdempotencyKey,
  normalizePublicRegistration,
} from './registration-reservations-policy';

const RESERVATION_MINUTES = 20;
const ACTIVE_STATUSES = [
  RegistrationReservationStatus.PENDING_PAYMENT,
  RegistrationReservationStatus.CONFIRMED,
];

const DEFAULT_FIELDS = [
  { code: 'full_name', label: 'Nome completo', type: 'TEXT', required: true },
  { code: 'preferred_name', label: 'Como deseja ser chamado', type: 'TEXT', required: true },
  { code: 'identity_document', label: 'CPF ou documento estrangeiro', type: 'DOCUMENT', required: true },
  { code: 'email', label: 'E-mail', type: 'EMAIL', required: true },
  { code: 'phone', label: 'Celular / WhatsApp', type: 'PHONE', required: true },
  { code: 'terms_acceptance', label: 'Aceito os termos de inscrição e a Política de Privacidade', type: 'CONSENT', required: true },
] as const;

type PublicField = {
  code: string;
  label: string;
  type: string;
  required: boolean;
  help?: string;
  options?: Array<{ id: string; label: string }>;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalPayload(input: PublicRegistrationInput): string {
  return JSON.stringify({
    categoryId: input.categoryId,
    lotId: input.lotId,
    benefitCode: input.benefitCode ?? null,
    answers: Object.fromEntries(Object.entries(input.answers).sort(([a], [b]) => a.localeCompare(b))),
  });
}

function publicFields(value: Prisma.JsonValue | undefined): PublicField[] {
  const fields = new Map<string, PublicField>(DEFAULT_FIELDS.map((field) => [field.code, { ...field }]));
  if (!Array.isArray(value)) return [...fields.values()];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const field = candidate as Record<string, unknown>;
    if (field.enabled === false || typeof field.code !== 'string' || typeof field.label !== 'string' || typeof field.type !== 'string') continue;
    const existing = fields.get(field.code);
    fields.set(field.code, {
      code: field.code,
      label: field.label,
      type: field.type,
      required: existing ? true : field.required === true,
      ...(typeof field.help === 'string' ? { help: field.help } : {}),
      ...(Array.isArray(field.options) ? { options: field.options as Array<{ id: string; label: string }> } : {}),
    });
  }
  return [...fields.values()];
}

@Injectable()
export class RegistrationReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOptions(slug: string) {
    const now = new Date();
    const event = await this.prisma.event.findUnique({
      where: { slug: slug.trim().toLowerCase() },
      select: {
        id: true,
        organizationId: true,
        name: true,
        slug: true,
        status: true,
        registrationMode: true,
        timeZone: true,
        registrationForm: { select: { fields: true } },
        registrationCatalog: {
          select: {
            categories: {
              where: { active: true },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
              select: {
                id: true,
                name: true,
                description: true,
                capacity: true,
                proofRequirement: true,
                lots: {
                  where: { active: true, startsAt: { lte: now }, endsAt: { gt: now } },
                  orderBy: [{ sortOrder: 'asc' }, { startsAt: 'asc' }],
                  select: { id: true, name: true, priceCents: true, quantity: true, endsAt: true },
                },
              },
            },
          },
        },
      },
    });
    if (!event?.organizationId || event.status !== EventStatus.PUBLISHED) {
      throw new NotFoundException('Inscrições indisponíveis para este evento.');
    }

    const reservations = await this.prisma.eventRegistrationReservation.groupBy({
      by: ['lotId'],
      where: {
        eventId: event.id,
        status: { in: ACTIVE_STATUSES },
        OR: [{ status: RegistrationReservationStatus.CONFIRMED }, { expiresAt: { gt: now } }],
      },
      _count: { _all: true },
    });
    const reservedByLot = new Map(reservations.map((item) => [item.lotId, item._count._all]));
    const categories = (event.registrationCatalog?.categories ?? []).map((category) => {
      const lots = category.lots.map((lot) => {
        const reserved = reservedByLot.get(lot.id) ?? 0;
        const remaining = lot.quantity === null ? null : Math.max(0, lot.quantity - reserved);
        return { ...lot, endsAt: lot.endsAt.toISOString(), remaining };
      });
      return { ...category, lots: lots.filter((lot) => lot.remaining === null || lot.remaining > 0) };
    });
    const available = categories.filter((category) => category.lots.length > 0);
    if (available.length === 0) throw new NotFoundException('Não há lotes disponíveis para inscrição.');

    return {
      event: {
        name: event.name,
        slug: event.slug,
        registrationMode: event.registrationMode,
        timeZone: event.timeZone,
      },
      categories: available,
      fields: publicFields(event.registrationForm?.fields),
      currency: 'BRL',
      benefitCodeAccepted: true,
      paymentEnabled: false,
      reservationMinutes: RESERVATION_MINUTES,
    };
  }

  async reserve(slug: string, rawInput: PublicRegistrationInput, rawIdempotencyKey?: string) {
    let input: PublicRegistrationInput;
    let idempotencyKey: string;
    try {
      input = normalizePublicRegistration(rawInput);
      idempotencyKey = normalizeIdempotencyKey(rawIdempotencyKey);
    } catch (error) {
      if (error instanceof RegistrationReservationPolicyError) throw new BadRequestException(error.message);
      throw error;
    }

    const payloadHash = sha256(canonicalPayload(input));
    const idempotencyKeyHash = sha256(idempotencyKey);
    const identityHash = sha256(String(input.answers.identity_document));
    const emailHash = sha256(String(input.answers.email));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const event = await tx.event.findUnique({
            where: { slug: slug.trim().toLowerCase() },
            select: {
              id: true,
              organizationId: true,
              status: true,
              registrationMode: true,
              registrationForm: { select: { fields: true } },
            },
          });
          if (!event?.organizationId || event.status !== EventStatus.PUBLISHED) {
            throw new NotFoundException('Inscrições indisponíveis para este evento.');
          }

          const existing = await tx.eventRegistrationReservation.findUnique({
            where: { eventId_idempotencyKeyHash: { eventId: event.id, idempotencyKeyHash } },
          });
          if (existing) {
            if (existing.payloadHash !== payloadHash) {
              throw new ConflictException('A chave de idempotência já foi usada com dados diferentes.');
            }
            return this.toPublicReservation(existing);
          }

          await this.expireStaleReservations(tx, event.id, event.organizationId);

          const allowedFields = new Map(publicFields(event.registrationForm?.fields).map((field) => [field.code, field]));
          for (const field of allowedFields.values()) {
            const value = input.answers[field.code];
            if (field.required && (value === undefined || value === '' || value === false)) {
              throw new BadRequestException(`Preencha o campo obrigatório: ${field.label}.`);
            }
          }
          const unexpected = Object.keys(input.answers).filter((code) => code !== 'registration_type' && !allowedFields.has(code));
          if (unexpected.length > 0) throw new BadRequestException('A ficha contém campos que não pertencem a este evento.');

          const category = await tx.eventRegistrationCategory.findFirst({
            where: {
              id: input.categoryId,
              eventId: event.id,
              organizationId: event.organizationId,
              active: true,
            },
          });
          const now = new Date();
          const lot = await tx.eventRegistrationLot.findFirst({
            where: {
              id: input.lotId,
              categoryId: input.categoryId,
              eventId: event.id,
              organizationId: event.organizationId,
              active: true,
              startsAt: { lte: now },
              endsAt: { gt: now },
            },
          });
          if (!category || !lot) throw new BadRequestException('A categoria ou o lote não está mais disponível.');

          const activeWhere = {
            eventId: event.id,
            status: { in: ACTIVE_STATUSES },
            OR: [{ status: RegistrationReservationStatus.CONFIRMED }, { expiresAt: { gt: now } }],
          } satisfies Prisma.EventRegistrationReservationWhereInput;
          if (lot.quantity !== null) {
            const occupied = await tx.eventRegistrationReservation.count({ where: { ...activeWhere, lotId: lot.id } });
            if (occupied >= lot.quantity) throw new ConflictException('Este lote acabou de esgotar.');
          }
          if (category.capacity !== null) {
            const occupied = await tx.eventRegistrationReservation.count({ where: { ...activeWhere, categoryId: category.id } });
            if (occupied >= category.capacity) throw new ConflictException('Esta categoria acabou de esgotar.');
          }

          let benefit: { id: string; kind: RegistrationBenefitKind; discountPercent: number; maxUses: number } | null = null;
          if (input.benefitCode) {
            const found = await tx.eventRegistrationBenefit.findFirst({
              where: {
                eventId: event.id,
                organizationId: event.organizationId,
                code: input.benefitCode,
                active: true,
                validFrom: { lte: now },
                validUntil: { gt: now },
              },
            });
            if (!found || found.usedCount >= found.maxUses) throw new BadRequestException('O código informado é inválido, expirou ou atingiu o limite.');
            benefit = found;
          }
          if (event.registrationMode === RegistrationMode.INVITATION && benefit?.kind !== RegistrationBenefitKind.INVITATION) {
            throw new BadRequestException('Este evento exige um código de convite válido.');
          }

          const discountPercent = benefit?.discountPercent ?? 0;
          const finalPriceCents = calculateRegistrationPrice(lot.priceCents, discountPercent);
          const requiresPayment = event.registrationMode === RegistrationMode.PAID && finalPriceCents > 0;
          const status = requiresPayment
            ? RegistrationReservationStatus.PENDING_PAYMENT
            : RegistrationReservationStatus.CONFIRMED;
          const expiresAt = requiresPayment ? new Date(now.getTime() + RESERVATION_MINUTES * 60_000) : null;
          const confirmedAt = requiresPayment ? null : now;

          const reservation = await tx.eventRegistrationReservation.create({
            data: {
              organizationId: event.organizationId,
              eventId: event.id,
              categoryId: category.id,
              lotId: lot.id,
              benefitId: benefit?.id,
              protocol: `EVO-${randomBytes(8).toString('hex').toUpperCase()}`,
              idempotencyKeyHash,
              payloadHash,
              identityHash,
              emailHash,
              registrationData: input.answers as Prisma.InputJsonObject,
              basePriceCents: lot.priceCents,
              discountPercent,
              finalPriceCents,
              status,
              expiresAt,
              confirmedAt,
            },
          });
          if (benefit) {
            const consumed = await tx.eventRegistrationBenefit.updateMany({
              where: { id: benefit.id, eventId: event.id, organizationId: event.organizationId, usedCount: { lt: benefit.maxUses } },
              data: { usedCount: { increment: 1 } },
            });
            if (consumed.count !== 1) throw new ConflictException('O código informado não pôde ser reservado.');
          }
          await tx.auditLog.create({
            data: {
              organizationId: event.organizationId,
              eventId: event.id,
              action: 'registration.reservation_created',
              entityType: 'EventRegistrationReservation',
              entityId: reservation.id,
              metadata: {
                status,
                hasBenefit: Boolean(benefit),
                benefitKind: benefit?.kind ?? null,
                basePriceCents: lot.priceCents,
                finalPriceCents,
              } as Prisma.InputJsonObject,
            },
          });
          return this.toPublicReservation(reservation);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Já existe uma inscrição para este documento ou a solicitação foi repetida.');
        }
        throw error;
      }
    }
    throw new ConflictException('Não foi possível concluir a reserva. Tente novamente.');
  }

  private async expireStaleReservations(tx: Prisma.TransactionClient, eventId: string, organizationId: string) {
    const now = new Date();
    const stale = await tx.eventRegistrationReservation.findMany({
      where: {
        eventId,
        organizationId,
        status: RegistrationReservationStatus.PENDING_PAYMENT,
        expiresAt: { lte: now },
      },
      select: { id: true, benefitId: true },
    });
    if (stale.length === 0) return;
    const counts = new Map<string, number>();
    for (const item of stale) if (item.benefitId) counts.set(item.benefitId, (counts.get(item.benefitId) ?? 0) + 1);
    for (const [benefitId, count] of counts) {
      await tx.eventRegistrationBenefit.updateMany({
        where: { id: benefitId, eventId, organizationId, usedCount: { gte: count } },
        data: { usedCount: { decrement: count } },
      });
    }
    await tx.eventRegistrationReservation.updateMany({
      where: { id: { in: stale.map((item) => item.id) }, status: RegistrationReservationStatus.PENDING_PAYMENT },
      data: { status: RegistrationReservationStatus.EXPIRED },
    });
  }

  private toPublicReservation(reservation: {
    protocol: string;
    status: RegistrationReservationStatus;
    basePriceCents: number;
    discountPercent: number;
    finalPriceCents: number;
    expiresAt: Date | null;
    confirmedAt: Date | null;
  }) {
    return {
      protocol: reservation.protocol,
      status: reservation.status,
      basePriceCents: reservation.basePriceCents,
      discountPercent: reservation.discountPercent,
      finalPriceCents: reservation.finalPriceCents,
      expiresAt: reservation.expiresAt?.toISOString() ?? null,
      confirmedAt: reservation.confirmedAt?.toISOString() ?? null,
      paymentEnabled: false,
      nextStep: reservation.status === RegistrationReservationStatus.PENDING_PAYMENT
        ? 'Sua vaga está reservada. O checkout será liberado no próximo corte.'
        : 'Inscrição confirmada. Guarde o protocolo para acompanhamento.',
    };
  }
}
