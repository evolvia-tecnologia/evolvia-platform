import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventStatus, Prisma, RegistrationBenefitKind, RegistrationMode, RegistrationReservationStatus, RegistrationTermsDocumentState, RegistrationWaitlistStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { IntegrationFoundationService } from './integration-foundation.service';
import type { ConfirmedRegistrationNotice } from './integration-foundation.policy';
import { PrismaService } from './prisma.service';
import { publicRegistrationFields, validateCategoryAnswers } from './registration-category-fields';
import { AsaasCheckoutGateway } from './asaas-checkout.gateway';
import { PaidEventCommissionError, negotiatedCommissionPercent, normalizeFeeBearer } from './paid-event-commission.policy';
import { deskCanConfirmFreeRegistration } from './event-desk-policy';
import {
  PublicRegistrationInput,
  RegistrationReservationPolicyError,
  calculateRegistrationPrice,
  isPublicTicketOffer,
  normalizeIdempotencyKey,
  normalizePublicRegistration,
  publicOfferCategories,
} from './registration-reservations-policy';
import { combinedFreeSeats, freeSeats, waitlistAcceptsEntries } from './registration-waitlist-policy';
import { PublicRegistrationOrderInput, normalizeRegistrationOrder, previewRegistrationOrder } from './registration-order-policy';

const RESERVATION_MINUTES = 20;
const ACTIVE_STATUSES = [
  RegistrationReservationStatus.PENDING_PAYMENT,
  RegistrationReservationStatus.CONFIRMED,
];

export function activeWaitlistOfferWhere(eventId: string, now: Date) {
  return {
    eventId,
    status: RegistrationWaitlistStatus.OFFERED,
    offerExpiresAt: { gt: now },
  } satisfies Prisma.EventRegistrationWaitlistEntryWhereInput;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalPayload(input: PublicRegistrationInput): string {
  return JSON.stringify({
    categoryId: input.categoryId,
    lotId: input.lotId,
    benefitCode: input.benefitCode ?? null,
    answers: Object.fromEntries(Object.entries(input.answers).sort(([a], [b]) => a.localeCompare(b))),
    billing: input.billing ? {
      payer: { kind: input.billing.payer.kind, name: input.billing.payer.name, document: input.billing.payer.document, email: input.billing.payer.email },
      recipient: { kind: input.billing.recipient.kind, name: input.billing.recipient.name, document: input.billing.recipient.document, email: input.billing.recipient.email },
    } : null,
  });
}

@Injectable()
export class RegistrationReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasCheckoutGateway,
    private readonly webhooks: IntegrationFoundationService,
  ) {}

  private async resolveFormSchema(
    client: Prisma.TransactionClient | PrismaService,
    event: {
      id: string;
      organizationId: string | null;
      registrationForm: { id: string; fields: Prisma.JsonValue; publishedVersion: number } | null;
    },
  ): Promise<{ schema: Prisma.JsonValue | undefined; formVersion: number | null }> {
    if (!event.organizationId) throw new NotFoundException('Inscrições indisponíveis para este evento.');
    const form = event.registrationForm;
    let schema: Prisma.JsonValue | undefined = form?.fields;
    let formVersion: number | null = null;
    if (form?.publishedVersion) {
      const version = await client.eventRegistrationFormVersion.findFirst({
        where: { formId: form.id, version: form.publishedVersion, eventId: event.id, organizationId: event.organizationId },
        select: { schema: true, version: true },
      });
      if (!version) throw new ConflictException('A ficha publicada está indisponível.');
      schema = version.schema;
      formVersion = version.version;
    } else if (Array.isArray(schema)) {
      schema = schema.filter((field) => {
        if (!field || typeof field !== 'object' || Array.isArray(field)) return true;
        const scopes = (field as Record<string, unknown>).appliesToCategoryIds;
        return !Array.isArray(scopes) || scopes.length === 0;
      });
    }
    return { schema, formVersion };
  }

  private async publicTerms(organizationId: string, eventId: string, slug: string) {
    const document = await this.prisma.eventRegistrationTermsDocument.findFirst({
      where: { organizationId, eventId, state: RegistrationTermsDocumentState.ACTIVE },
      select: { fileName: true, version: true },
    });
    if (!document) return null;
    return {
      fileName: document.fileName,
      version: document.version,
      url: `/api/public/events/${encodeURIComponent(slug)}/registration/terms`,
    };
  }

  private async platformCommission(eventId: string) {
    const responsibility = await this.prisma.eventFinancialResponsibility.findUnique({
      where: { eventId },
      select: { feeBearer: true },
    });
    let percent: number | null = null;
    try {
      percent = negotiatedCommissionPercent();
    } catch (error) {
      if (!(error instanceof PaidEventCommissionError)) throw error;
    }
    return {
      percent,
      bearer: normalizeFeeBearer(responsibility?.feeBearer),
      certificateCents: 0 as const,
      submissionCents: 0 as const,
    };
  }

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
        profileCode: true,
        eventType: true,
        registrationMode: true,
        timeZone: true,
        registrationForm: { select: { id: true, fields: true, publishedVersion: true } },
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
                  select: {
                    id: true, name: true, priceCents: true, quantity: true, endsAt: true,
                    waitlistEnabled: true, waitlistClosesAt: true, waitlistOfferMinutes: true,
                  },
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

    const activeReservation = {
      eventId: event.id,
      status: { in: ACTIVE_STATUSES },
      OR: [{ status: RegistrationReservationStatus.CONFIRMED }, { expiresAt: { gt: now } }],
    } satisfies Prisma.EventRegistrationReservationWhereInput;
    const activeOffer = activeWaitlistOfferWhere(event.id, now);
    const [reservations, categoryReservations, offers, categoryOffers, waiting] = await Promise.all([
      this.prisma.eventRegistrationReservation.groupBy({ by: ['lotId'], where: activeReservation, _count: { _all: true } }),
      this.prisma.eventRegistrationReservation.groupBy({ by: ['categoryId'], where: activeReservation, _count: { _all: true } }),
      this.prisma.eventRegistrationWaitlistEntry.groupBy({ by: ['lotId'], where: activeOffer, _count: { _all: true } }),
      this.prisma.eventRegistrationWaitlistEntry.groupBy({ by: ['categoryId'], where: activeOffer, _count: { _all: true } }),
      this.prisma.eventRegistrationWaitlistEntry.groupBy({
        by: ['lotId'], where: { eventId: event.id, status: RegistrationWaitlistStatus.WAITING }, _count: { _all: true },
      }),
    ]);
    const reservedByLot = new Map(reservations.map((item) => [item.lotId, item._count._all]));
    const reservedByCategory = new Map(categoryReservations.map((item) => [item.categoryId, item._count._all]));
    const offeredByLot = new Map(offers.map((item) => [item.lotId, item._count._all]));
    const offeredByCategory = new Map(categoryOffers.map((item) => [item.categoryId, item._count._all]));
    const waitingByLot = new Map(waiting.map((item) => [item.lotId, item._count._all]));
    const waitlist: Array<{
      categoryId: string; categoryName: string; lotId: string; lotName: string; priceCents: number;
      endsAt: string; closesAt: string | null; offerMinutes: number | null;
    }> = [];
    const categories = (event.registrationCatalog?.categories ?? []).map((category) => {
      const categoryFree = freeSeats(category.capacity, reservedByCategory.get(category.id) ?? 0, offeredByCategory.get(category.id) ?? 0);
      const lots = category.lots.flatMap((lot) => {
        const lotFree = freeSeats(lot.quantity, reservedByLot.get(lot.id) ?? 0, offeredByLot.get(lot.id) ?? 0);
        const { waitlistEnabled, waitlistClosesAt, waitlistOfferMinutes, ...publicLot } = lot;
        if (waitlistEnabled && (combinedFreeSeats(lotFree, categoryFree) === 0 || (waitingByLot.get(lot.id) ?? 0) > 0)) {
          if (waitlistAcceptsEntries(lot, now)) {
            waitlist.push({
              categoryId: category.id, categoryName: category.name, lotId: lot.id, lotName: lot.name,
              priceCents: lot.priceCents, endsAt: lot.endsAt.toISOString(),
              closesAt: waitlistClosesAt?.toISOString() ?? null, offerMinutes: waitlistOfferMinutes,
            });
          }
          return [];
        }
        if (lotFree === 0) return [];
        return [{ ...publicLot, endsAt: lot.endsAt.toISOString(), remaining: lotFree }];
      });
      // A categoria pode ter limite próprio além da capacidade de cada lote.
      // Expor apenas o número agregado de vagas, sem participantes ou reservas.
      return { ...category, remaining: categoryFree, lots };
    });
    const available = categories.filter((category) => category.lots.length > 0);
    const publicCategories = publicOfferCategories(available, {
      registrationMode: event.registrationMode,
      profileCode: event.profileCode,
      eventType: event.eventType,
    });
    if (publicCategories.length === 0 && waitlist.length === 0) throw new NotFoundException('Não há lotes disponíveis para inscrição.');

    const { schema, formVersion } = await this.resolveFormSchema(this.prisma, event);

    return {
      event: {
        name: event.name,
        slug: event.slug,
        profileCode: event.profileCode,
        eventType: event.eventType,
        registrationMode: event.registrationMode,
        timeZone: event.timeZone,
      },
      categories: publicCategories,
      waitlist,
      fields: publicRegistrationFields(schema),
      formVersion,
      terms: await this.publicTerms(event.organizationId, event.id, event.slug),
      currency: 'BRL',
      benefitCodeAccepted: true,
      paymentEnabled: this.asaas.isConfigured(),
      reservationMinutes: RESERVATION_MINUTES,
      platformCommission: await this.platformCommission(event.id),
    };
  }

  // Leitura pública e sem efeitos externos: não reserva vagas, não gera cobrança
  // e não promete preço final antes de aprovar eventuais comprovações e descontos.
  async previewOrder(slug: string, rawInput: PublicRegistrationOrderInput) {
    let order: ReturnType<typeof normalizeRegistrationOrder>;
    try {
      order = normalizeRegistrationOrder(rawInput);
    } catch (error) {
      if (error instanceof RegistrationReservationPolicyError) throw new BadRequestException(error.message);
      throw error;
    }

    const options = await this.getOptions(slug);
    if (!options.terms) {
      throw new BadRequestException('Os termos e a Política de Privacidade precisam estar publicados.');
    }
    try {
      for (const entry of order.entries) {
        const categoryFields = options.fields.filter((field) =>
          !field.appliesToCategoryIds?.length || field.appliesToCategoryIds.includes(entry.categoryId));
        validateCategoryAnswers(entry.answers, categoryFields, entry.categoryId);
      }
      const preview = previewRegistrationOrder(order, options);
      return {
        ...preview, currency: 'BRL' as const,
        // Identidade, respostas, CPF, e-mail e dados do pagador nunca retornam.
        expiresAt: null,
        requiresProof: order.entries.some((entry) =>
          options.categories.find((cat) => cat.id === entry.categoryId)?.proofRequirement !== 'NONE'),
      };
    } catch (error) {
      if (error instanceof RegistrationReservationPolicyError || error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async getWaitlistOfferOptions(slug: string, userId: string, lotId: string) {
    const now = new Date();
    const event = await this.prisma.event.findUnique({
      where: { slug: slug.trim().toLowerCase() },
      select: {
        id: true, organizationId: true, name: true, slug: true, status: true, registrationMode: true, timeZone: true,
        registrationForm: { select: { id: true, fields: true, publishedVersion: true } },
      },
    });
    if (!event?.organizationId || event.status !== EventStatus.PUBLISHED) {
      throw new NotFoundException('Inscrições indisponíveis para este evento.');
    }
    const offer = await this.prisma.eventRegistrationWaitlistEntry.findFirst({
      where: { ...activeWaitlistOfferWhere(event.id, now), organizationId: event.organizationId, lotId, userId },
      select: {
        offerExpiresAt: true,
        category: { select: { id: true, name: true, description: true, capacity: true, proofRequirement: true, active: true } },
        lot: { select: { id: true, name: true, priceCents: true, quantity: true, endsAt: true, startsAt: true, active: true } },
      },
    });
    if (!offer || !offer.category.active || !offer.lot.active || offer.lot.startsAt > now || offer.lot.endsAt <= now) {
      throw new NotFoundException('Não há vaga oferecida pela fila para você neste lote.');
    }
    const { schema, formVersion } = await this.resolveFormSchema(this.prisma, event);
    const { active: _categoryActive, ...category } = offer.category;
    const { active: _lotActive, startsAt: _startsAt, ...lot } = offer.lot;
    return {
      event: { name: event.name, slug: event.slug, registrationMode: event.registrationMode, timeZone: event.timeZone },
      categories: [{ ...category, lots: [{ ...lot, endsAt: lot.endsAt.toISOString(), remaining: 1 }] }],
      waitlist: [],
      offerExpiresAt: offer.offerExpiresAt!.toISOString(),
      fields: publicRegistrationFields(schema),
      formVersion,
      terms: await this.publicTerms(event.organizationId, event.id, event.slug),
      currency: 'BRL',
      benefitCodeAccepted: true,
      paymentEnabled: this.asaas.isConfigured(),
      reservationMinutes: RESERVATION_MINUTES,
      platformCommission: await this.platformCommission(event.id),
    };
  }

  async reserve(
    slug: string,
    rawInput: PublicRegistrationInput,
    rawIdempotencyKey?: string,
    options?: { actorUserId?: string; desk?: boolean; waitlistUserId?: string },
  ) {
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
      let notice: ConfirmedRegistrationNotice | null = null;
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          notice = null;
          const event = await tx.event.findUnique({
            where: { slug: slug.trim().toLowerCase() },
            select: {
              id: true,
              organizationId: true,
              slug: true,
              status: true,
              registrationMode: true,
              profileCode: true,
              eventType: true,
              registrationForm: { select: { id: true, fields: true, publishedVersion: true } },
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
            return this.toPublicReservation(existing, isPublicTicketOffer(event.profileCode, event.eventType));
          }

          await this.expireStaleReservations(tx, event.id, event.organizationId);

          const { schema, formVersion } = await this.resolveFormSchema(tx, event);
          const terms = await tx.eventRegistrationTermsDocument.findFirst({
            where: { eventId: event.id, organizationId: event.organizationId, state: RegistrationTermsDocumentState.ACTIVE },
            select: { id: true, version: true, checksumSha256: true },
          });
          if (!terms) throw new BadRequestException('Os termos de inscrição e a Política de Privacidade do evento ainda não foram configurados pela organização.');
          try {
            validateCategoryAnswers(input.answers, publicRegistrationFields(schema, input.categoryId), input.categoryId);
          } catch (error) {
            throw new BadRequestException(error instanceof Error ? error.message : 'Ficha inválida.');
          }

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

          const offer = options?.waitlistUserId
            ? await tx.eventRegistrationWaitlistEntry.findUnique({
              where: { lotId_userId: { lotId: lot.id, userId: options.waitlistUserId } },
            })
            : null;
          if (options?.waitlistUserId) {
            if (!offer || offer.eventId !== event.id || offer.status !== RegistrationWaitlistStatus.OFFERED
              || !offer.offerExpiresAt || offer.offerExpiresAt <= now) {
              throw new ConflictException('A vaga oferecida pela fila expirou ou não está mais ativa.');
            }
            if (offer.identityHash !== identityHash || offer.emailHash !== emailHash) {
              throw new BadRequestException('Use na ficha o mesmo documento informado na fila e o e-mail da sua conta.');
            }
          } else if (lot.waitlistEnabled) {
            const waiting = await tx.eventRegistrationWaitlistEntry.count({
              where: { eventId: event.id, lotId: lot.id, status: RegistrationWaitlistStatus.WAITING },
            });
            if (waiting > 0) throw new ConflictException('Este lote tem fila de espera. Entre na fila para concorrer à próxima vaga.');
          }

          const activeWhere = {
            eventId: event.id,
            status: { in: ACTIVE_STATUSES },
            OR: [{ status: RegistrationReservationStatus.CONFIRMED }, { expiresAt: { gt: now } }],
          } satisfies Prisma.EventRegistrationReservationWhereInput;
          const otherOffers = {
            ...activeWaitlistOfferWhere(event.id, now),
            ...(offer ? { NOT: { id: offer.id } } : {}),
          } satisfies Prisma.EventRegistrationWaitlistEntryWhereInput;
          if (lot.quantity !== null) {
            const occupied = await tx.eventRegistrationReservation.count({ where: { ...activeWhere, lotId: lot.id } })
              + await tx.eventRegistrationWaitlistEntry.count({ where: { ...otherOffers, lotId: lot.id } });
            if (occupied >= lot.quantity) throw new ConflictException('Este lote acabou de esgotar.');
          }
          if (category.capacity !== null) {
            const occupied = await tx.eventRegistrationReservation.count({ where: { ...activeWhere, categoryId: category.id } })
              + await tx.eventRegistrationWaitlistEntry.count({ where: { ...otherOffers, categoryId: category.id } });
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
          if (options?.desk && !deskCanConfirmFreeRegistration(finalPriceCents)) {
            throw new BadRequestException('Inscrição paga não é confirmada no posto. A pessoa conclui o pagamento na página pública.');
          }
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
              registrationFormVersion: formVersion,
              termsDocumentId: terms.id,
              termsDocumentVersion: terms.version,
              ...(requiresPayment && input.billing ? { billingSnapshot: input.billing as Prisma.InputJsonObject } : {}),
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
          if (offer) {
            const accepted = await tx.eventRegistrationWaitlistEntry.updateMany({
              where: { id: offer.id, status: RegistrationWaitlistStatus.OFFERED, offerExpiresAt: { gt: now } },
              data: { status: RegistrationWaitlistStatus.ACCEPTED, reservationId: reservation.id },
            });
            if (accepted.count !== 1) throw new ConflictException('A vaga oferecida pela fila expirou ou não está mais ativa.');
          }
          await tx.auditLog.create({
            data: {
              organizationId: event.organizationId,
              eventId: event.id,
              actorUserId: options?.actorUserId ?? options?.waitlistUserId,
              action: 'registration.reservation_created',
              entityType: 'EventRegistrationReservation',
              entityId: reservation.id,
              metadata: {
                status,
                channel: options?.desk ? 'desk' : offer ? 'waitlist' : 'public',
                hasBenefit: Boolean(benefit),
                benefitKind: benefit?.kind ?? null,
                basePriceCents: lot.priceCents,
                finalPriceCents,
                termsDocumentVersion: terms.version,
                termsChecksumSha256: terms.checksumSha256,
              } as Prisma.InputJsonObject,
            },
          });
          if (status === RegistrationReservationStatus.CONFIRMED) {
            notice = {
              organizationId: event.organizationId,
              eventId: event.id,
              reservationId: reservation.id,
              protocol: reservation.protocol,
              slug: event.slug,
            };
          }
          return this.toPublicReservation(reservation, isPublicTicketOffer(event.profileCode, event.eventType));
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        if (notice) await this.webhooks.notifyRegistrationConfirmed(notice);
        return result;
      } catch (error) {
        notice = null;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') continue;
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
  }, ticketEvent = false) {
    return {
      protocol: reservation.protocol,
      status: reservation.status,
      basePriceCents: reservation.basePriceCents,
      discountPercent: reservation.discountPercent,
      finalPriceCents: reservation.finalPriceCents,
      expiresAt: reservation.expiresAt?.toISOString() ?? null,
      confirmedAt: reservation.confirmedAt?.toISOString() ?? null,
      paymentEnabled: this.asaas.isConfigured(),
      nextStep: reservation.status === RegistrationReservationStatus.PENDING_PAYMENT
        ? this.asaas.isConfigured()
          ? 'Sua vaga está reservada. Inicie o pagamento seguro antes do vencimento.'
          : 'Sua vaga está reservada, mas o pagamento está temporariamente indisponível.'
        : ticketEvent
          ? 'Ingresso confirmado. Guarde o protocolo para acompanhamento.'
          : 'Inscrição confirmada. Guarde o protocolo para acompanhamento.',
    };
  }
}

