import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventStatus, Prisma, RegistrationCheckoutStatus, RegistrationReservationStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AsaasCheckoutGateway, AsaasGatewayError } from './asaas-checkout.gateway';
import {
  AsaasCheckoutPolicyError,
  NormalizedAsaasCheckoutWebhook,
  normalizeAsaasCheckoutWebhook,
  normalizeReservationProtocol,
  secureTokenMatches,
  webhookFingerprint,
} from './asaas-checkout-policy';
import type { ConfirmedRegistrationNotice } from './integration-foundation.policy';
import { IntegrationFoundationService } from './integration-foundation.service';
import { PrismaService } from './prisma.service';
import { categoryProofPaymentBlock } from './registration-category-proof.policy';
import { RegistrationReservationPolicyError, normalizeIdempotencyKey } from './registration-reservations-policy';

const PROVIDER = 'ASAAS';
const MIN_CHECKOUT_MINUTES = 10;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AsaasCheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AsaasCheckoutGateway,
    private readonly foundation: IntegrationFoundationService,
  ) {}

  isConfigured(): boolean {
    return this.gateway.isConfigured();
  }

  async createCheckout(slugValue: string, protocolValue: string, rawIdempotencyKey?: string) {
    let protocol: string;
    let idempotencyKey: string;
    try {
      protocol = normalizeReservationProtocol(protocolValue);
      idempotencyKey = normalizeIdempotencyKey(rawIdempotencyKey);
    } catch (error) {
      if (error instanceof AsaasCheckoutPolicyError || error instanceof RegistrationReservationPolicyError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    if (!this.gateway.isConfigured()) throw new ServiceUnavailableException('O pagamento está temporariamente indisponível.');

    const slug = slugValue.trim().toLowerCase();
    const event = await this.prisma.event.findUnique({
      where: { slug },
      select: { id: true, organizationId: true, name: true, status: true },
    });
    if (!event?.organizationId || event.status !== EventStatus.PUBLISHED) throw new NotFoundException('Reserva não encontrada.');
    const organizationId = event.organizationId;
    const [responsibility, seller] = await Promise.all([
      this.prisma.eventFinancialResponsibility.findUnique({ where: { eventId: event.id } }),
      this.prisma.organizationLegalProfile.findUnique({ where: { organizationId } }),
    ]);
    if (!responsibility || !seller || responsibility.organizationId !== organizationId
      || responsibility.sellerLegalProfileRevision !== seller.revision) {
      throw new ConflictException('O responsável financeiro do evento pago precisa ser confirmado antes de iniciar o pagamento.');
    }

    const reservation = await this.prisma.eventRegistrationReservation.findFirst({
      where: { protocol, eventId: event.id, organizationId },
      select: {
        id: true,
        protocol: true,
        status: true,
        finalPriceCents: true,
        billingSnapshot: true,
        expiresAt: true,
        category: { select: { proofRequirement: true } },
        categoryProof: { select: { state: true } },
      },
    });
    if (!reservation) throw new NotFoundException('Reserva não encontrada.');
    const proofBlock = categoryProofPaymentBlock(reservation.category.proofRequirement, reservation.categoryProof?.state ?? null);
    if (proofBlock) throw new ConflictException(proofBlock);
    const now = new Date();
    const remainingMinutes = reservation.expiresAt
      ? Math.floor((reservation.expiresAt.getTime() - now.getTime()) / 60_000)
      : 0;
    if (reservation.status !== RegistrationReservationStatus.PENDING_PAYMENT || reservation.finalPriceCents <= 0) {
      throw new ConflictException('Esta reserva não aceita início de pagamento.');
    }
    if (!reservation.expiresAt || remainingMinutes < MIN_CHECKOUT_MINUTES) {
      await this.expireReservation(reservation.id, event.id, organizationId, 'checkout_window_elapsed');
      throw new ConflictException('A reserva não possui tempo suficiente para iniciar o pagamento.');
    }

    const idempotencyKeyHash = sha256(idempotencyKey);
    const requestHash = sha256(`${event.id}:${reservation.id}:${reservation.finalPriceCents}${reservation.billingSnapshot ? `:${JSON.stringify(reservation.billingSnapshot)}` : ''}`);
    let checkout = await this.prisma.eventRegistrationCheckout.findUnique({ where: { reservationId: reservation.id } });
    if (checkout) {
      if (checkout.idempotencyKeyHash !== idempotencyKeyHash || checkout.requestHash !== requestHash) {
        throw new ConflictException('A reserva já possui uma tentativa de checkout com outra chave.');
      }
      if (checkout.status === RegistrationCheckoutStatus.ACTIVE || checkout.status === RegistrationCheckoutStatus.PAID) {
        return this.toPublicCheckout(protocol, reservation.status, checkout);
      }
      if (checkout.status === RegistrationCheckoutStatus.CREATING) {
        const staleBefore = new Date(now.getTime() - 120_000);
        if (checkout.updatedAt > staleBefore) {
          throw new ConflictException('O checkout já está sendo criado. Aguarde alguns segundos.');
        }
        await this.prisma.eventRegistrationCheckout.updateMany({
          where: { id: checkout.id, status: RegistrationCheckoutStatus.CREATING, updatedAt: { lte: staleBefore } },
          data: { status: RegistrationCheckoutStatus.UNKNOWN, failureCode: 'creation_interrupted' },
        });
        throw new ServiceUnavailableException('O pagamento está em conciliação segura. Consulte novamente em instantes.');
      }
      if (checkout.status === RegistrationCheckoutStatus.UNKNOWN || checkout.status === RegistrationCheckoutStatus.PAID_REVIEW) {
        throw new ServiceUnavailableException('O pagamento está em conciliação segura. Consulte novamente em instantes.');
      }
      checkout = await this.prisma.eventRegistrationCheckout.update({
        where: { id: checkout.id },
        data: { status: RegistrationCheckoutStatus.CREATING, failureCode: null },
      });
    } else {
      try {
        checkout = await this.prisma.eventRegistrationCheckout.create({
          data: {
            organizationId,
            eventId: event.id,
            reservationId: reservation.id,
            provider: PROVIDER,
            idempotencyKeyHash,
            requestHash,
            status: RegistrationCheckoutStatus.CREATING,
            amountCents: reservation.finalPriceCents,
            sellerSnapshot: { kind: seller.kind, legalName: seller.legalName, taxId: seller.taxId, revision: seller.revision },
            expiresAt: reservation.expiresAt,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('A reserva já possui um checkout ou a chave foi reutilizada.');
        }
        throw error;
      }
    }

    try {
      const created = await this.gateway.createCheckout({
        reservationId: reservation.id,
        protocol,
        eventName: event.name,
        slug,
        amountCents: reservation.finalPriceCents,
        minutesToExpire: Math.min(1_440, remainingMinutes),
      });
      const active = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.eventRegistrationCheckout.update({
          where: { id: checkout.id },
          data: {
            providerCheckoutId: created.providerCheckoutId,
            checkoutUrl: created.checkoutUrl,
            status: RegistrationCheckoutStatus.ACTIVE,
            failureCode: null,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            eventId: event.id,
            action: 'registration.checkout_created',
            entityType: 'EventRegistrationCheckout',
            entityId: updated.id,
            metadata: { provider: PROVIDER, amountCents: updated.amountCents, status: updated.status } as Prisma.InputJsonObject,
          },
        });
        return updated;
      });
      await this.reconcilePendingEvents(created.providerCheckoutId);
      const current = await this.prisma.eventRegistrationCheckout.findUniqueOrThrow({ where: { id: active.id } });
      const currentReservation = await this.prisma.eventRegistrationReservation.findUniqueOrThrow({ where: { id: reservation.id } });
      return this.toPublicCheckout(protocol, currentReservation.status, current);
    } catch (error) {
      if (error instanceof AsaasGatewayError) {
        const status = error.retrySafety === 'SAFE' ? RegistrationCheckoutStatus.FAILED : RegistrationCheckoutStatus.UNKNOWN;
        await this.prisma.eventRegistrationCheckout.updateMany({
          where: { id: checkout.id, status: RegistrationCheckoutStatus.CREATING },
          data: { status, failureCode: error.code },
        });
        throw new ServiceUnavailableException(error.message);
      }
      await this.prisma.eventRegistrationCheckout.updateMany({
        where: { id: checkout.id, status: RegistrationCheckoutStatus.CREATING },
        data: { status: RegistrationCheckoutStatus.UNKNOWN, failureCode: 'persistence_after_provider' },
      });
      throw new ServiceUnavailableException('O checkout foi encaminhado para conciliação segura.');
    }
  }

  async getStatus(slugValue: string, protocolValue: string) {
    let protocol: string;
    try { protocol = normalizeReservationProtocol(protocolValue); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Protocolo inválido.'); }
    const event = await this.prisma.event.findUnique({
      where: { slug: slugValue.trim().toLowerCase() },
      select: { id: true, organizationId: true, status: true },
    });
    if (!event?.organizationId || event.status !== EventStatus.PUBLISHED) throw new NotFoundException('Reserva não encontrada.');
    const reservation = await this.prisma.eventRegistrationReservation.findFirst({
      where: { protocol, eventId: event.id, organizationId: event.organizationId },
      include: { checkout: true, category: { select: { proofRequirement: true } }, categoryProof: { select: { state: true } } },
    });
    if (!reservation) throw new NotFoundException('Reserva não encontrada.');
    if (reservation.status === RegistrationReservationStatus.PENDING_PAYMENT && reservation.expiresAt && reservation.expiresAt <= new Date()) {
      await this.expireReservation(reservation.id, event.id, event.organizationId, 'reservation_elapsed');
      const refreshed = await this.prisma.eventRegistrationReservation.findUniqueOrThrow({
        where: { id: reservation.id },
        include: { checkout: true, category: { select: { proofRequirement: true } }, categoryProof: { select: { state: true } } },
      });
      return this.toPublicCheckout(protocol, refreshed.status, refreshed.checkout, refreshed.category.proofRequirement, refreshed.categoryProof?.state ?? null);
    }
    return this.toPublicCheckout(protocol, reservation.status, reservation.checkout, reservation.category.proofRequirement, reservation.categoryProof?.state ?? null);
  }

  async receiveWebhook(rawToken: string | undefined, rawBody: unknown) {
    if (!secureTokenMatches(rawToken, this.gateway.webhookToken())) throw new UnauthorizedException('Webhook não autorizado.');
    let event: NormalizedAsaasCheckoutWebhook;
    try { event = normalizeAsaasCheckoutWebhook(rawBody); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Webhook inválido.'); }
    const fingerprint = webhookFingerprint(event);

    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        const duplicate = await tx.asaasCheckoutWebhookEvent.findUnique({ where: { providerEventId: event.providerEventId } });
        if (duplicate) {
          if (duplicate.payloadHash !== fingerprint) throw new ConflictException('O identificador do webhook já foi recebido com outro conteúdo.');
          if (duplicate.processedAt) return { response: { accepted: true, duplicate: true, queued: false }, confirmed: null };
          const knownCheckout = await tx.eventRegistrationCheckout.findFirst({
            where: { provider: PROVIDER, providerCheckoutId: duplicate.externalCheckoutId },
          });
          if (!knownCheckout) return { response: { accepted: true, duplicate: true, queued: true }, confirmed: null };
          await tx.asaasCheckoutWebhookEvent.update({
            where: { id: duplicate.id },
            data: { organizationId: knownCheckout.organizationId, eventId: knownCheckout.eventId, checkoutId: knownCheckout.id },
          });
          const confirmed = await this.applyStoredEvent(tx, duplicate.id, knownCheckout, event);
          return { response: { accepted: true, duplicate: true, queued: false }, confirmed };
        }
        const checkout = await tx.eventRegistrationCheckout.findFirst({
          where: { provider: PROVIDER, providerCheckoutId: event.externalCheckoutId },
        });
        const stored = await tx.asaasCheckoutWebhookEvent.create({
          data: {
            ...(checkout ? { organizationId: checkout.organizationId, eventId: checkout.eventId, checkoutId: checkout.id } : {}),
            providerEventId: event.providerEventId,
            externalCheckoutId: event.externalCheckoutId,
            eventType: event.eventType,
            checkoutStatus: event.checkoutStatus,
            amountCents: event.amountCents,
            payloadHash: fingerprint,
          },
        });
        if (!checkout) return { response: { accepted: true, duplicate: false, queued: true }, confirmed: null };
        const confirmed = await this.applyStoredEvent(tx, stored.id, checkout, event);
        return { response: { accepted: true, duplicate: false, queued: false }, confirmed };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (outcome.confirmed) await this.foundation.notifyRegistrationConfirmed(outcome.confirmed);
      return outcome.response;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.asaasCheckoutWebhookEvent.findUnique({ where: { providerEventId: event.providerEventId } });
        if (!duplicate || duplicate.payloadHash !== fingerprint) {
          throw new ConflictException('O identificador do webhook já foi recebido com outro conteúdo.');
        }
        return { accepted: true, duplicate: true, queued: duplicate?.processedAt === null };
      }
      throw error;
    }
  }

  private async reconcilePendingEvents(externalCheckoutId: string) {
    const events = await this.prisma.asaasCheckoutWebhookEvent.findMany({
      where: { externalCheckoutId, processedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { providerEventId: true },
      take: 20,
    });
    for (const event of events) await this.processStoredEvent(event.providerEventId);
  }

  private async processStoredEvent(providerEventId: string) {
    const confirmed = await this.prisma.$transaction(async (tx) => {
      const stored = await tx.asaasCheckoutWebhookEvent.findUnique({ where: { providerEventId } });
      if (!stored || stored.processedAt) return null;
      const checkout = await tx.eventRegistrationCheckout.findFirst({
        where: { provider: PROVIDER, providerCheckoutId: stored.externalCheckoutId },
      });
      if (!checkout) return null;
      const event: NormalizedAsaasCheckoutWebhook = {
        providerEventId: stored.providerEventId,
        eventType: stored.eventType,
        externalCheckoutId: stored.externalCheckoutId,
        checkoutStatus: stored.checkoutStatus,
        amountCents: stored.amountCents,
      };
      await tx.asaasCheckoutWebhookEvent.update({
        where: { id: stored.id },
        data: { organizationId: checkout.organizationId, eventId: checkout.eventId, checkoutId: checkout.id },
      });
      return this.applyStoredEvent(tx, stored.id, checkout, event);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (confirmed) await this.foundation.notifyRegistrationConfirmed(confirmed);
  }

  private async applyStoredEvent(
    tx: Prisma.TransactionClient,
    storedId: string,
    checkout: { id: string; organizationId: string; eventId: string; reservationId: string; amountCents: number; status: RegistrationCheckoutStatus; expiresAt: Date; paidAt: Date | null; sellerSnapshot: Prisma.JsonValue | null },
    event: NormalizedAsaasCheckoutWebhook,
  ): Promise<ConfirmedRegistrationNotice | null> {
    const now = new Date();
    const reservation = await tx.eventRegistrationReservation.findFirst({
      where: { id: checkout.reservationId, eventId: checkout.eventId, organizationId: checkout.organizationId },
      select: { id: true, protocol: true, status: true, benefitId: true, expiresAt: true },
    });
    if (!reservation) throw new NotFoundException('Reserva financeira não encontrada.');
    let confirmed: ConfirmedRegistrationNotice | null = null;

    if (event.eventType === 'CHECKOUT_PAID') {
      const amountMatches = event.amountCents === checkout.amountCents;
      const canConfirm = amountMatches
        && reservation.status === RegistrationReservationStatus.PENDING_PAYMENT
        && Boolean(reservation.expiresAt && reservation.expiresAt > now);
      const paidAt = checkout.paidAt ?? now;
      if (reservation.status === RegistrationReservationStatus.CONFIRMED && amountMatches) {
        await tx.eventRegistrationCheckout.update({ where: { id: checkout.id }, data: { status: RegistrationCheckoutStatus.PAID, paidAt } });
      } else if (canConfirm) {
        await tx.eventRegistrationReservation.update({
          where: { id: reservation.id },
          data: { status: RegistrationReservationStatus.CONFIRMED, confirmedAt: now, expiresAt: null },
        });
        await tx.eventRegistrationCheckout.update({ where: { id: checkout.id }, data: { status: RegistrationCheckoutStatus.PAID, paidAt } });
        await tx.auditLog.create({
          data: {
            organizationId: checkout.organizationId,
            eventId: checkout.eventId,
            action: 'registration.payment_confirmed',
            entityType: 'EventRegistrationCheckout',
            entityId: checkout.id,
            metadata: { provider: PROVIDER, amountCents: checkout.amountCents, source: 'authenticated_webhook' } as Prisma.InputJsonObject,
          },
        });
        const eventRow = await tx.event.findFirst({
          where: { id: checkout.eventId, organizationId: checkout.organizationId },
          select: { slug: true },
        });
        if (eventRow?.slug) {
          confirmed = {
            organizationId: checkout.organizationId,
            eventId: checkout.eventId,
            reservationId: reservation.id,
            protocol: reservation.protocol,
            slug: eventRow.slug,
          };
        }
      } else {
        await tx.eventRegistrationCheckout.update({ where: { id: checkout.id }, data: { status: RegistrationCheckoutStatus.PAID_REVIEW, paidAt: now, failureCode: amountMatches ? 'late_payment' : 'amount_mismatch' } });
        await tx.auditLog.create({
          data: {
            organizationId: checkout.organizationId,
            eventId: checkout.eventId,
            action: 'registration.payment_requires_reconciliation',
            entityType: 'EventRegistrationCheckout',
            entityId: checkout.id,
            metadata: { provider: PROVIDER, reason: amountMatches ? 'late_payment' : 'amount_mismatch' } as Prisma.InputJsonObject,
          },
        });
      }
      if (amountMatches && (canConfirm || reservation.status === RegistrationReservationStatus.CONFIRMED)
        && checkout.sellerSnapshot && typeof checkout.sellerSnapshot === 'object' && !Array.isArray(checkout.sellerSnapshot)) {
        const createdReceipt = await tx.eventRegistrationPaymentReceipt.createMany({
          skipDuplicates: true,
          data: {
            organizationId: checkout.organizationId,
            eventId: checkout.eventId,
            reservationId: checkout.reservationId,
            checkoutId: checkout.id,
            number: `EVO-R-${sha256(checkout.id).slice(0, 20).toUpperCase()}`,
            sellerSnapshot: checkout.sellerSnapshot as Prisma.InputJsonObject,
            amountCents: checkout.amountCents,
            paidAt,
          },
        });
        if (createdReceipt.count === 1) await tx.auditLog.create({
          data: {
            organizationId: checkout.organizationId,
            eventId: checkout.eventId,
            action: 'registration.payment_receipt_issued',
            entityType: 'EventRegistrationPaymentReceipt',
            entityId: checkout.id,
            metadata: { amountCents: checkout.amountCents } as Prisma.InputJsonObject,
          },
        });
      }
    } else if (
      (event.eventType === 'CHECKOUT_CANCELED' || event.eventType === 'CHECKOUT_EXPIRED')
      && checkout.status !== RegistrationCheckoutStatus.PAID
      && checkout.status !== RegistrationCheckoutStatus.PAID_REVIEW
    ) {
      const reservationStatus = event.eventType === 'CHECKOUT_CANCELED'
        ? RegistrationReservationStatus.CANCELLED
        : RegistrationReservationStatus.EXPIRED;
      await this.releaseReservation(tx, reservation, checkout.eventId, checkout.organizationId, reservationStatus);
      await tx.eventRegistrationCheckout.update({
        where: { id: checkout.id },
        data: { status: event.eventType === 'CHECKOUT_CANCELED' ? RegistrationCheckoutStatus.CANCELED : RegistrationCheckoutStatus.EXPIRED },
      });
    } else if (event.eventType === 'CHECKOUT_CREATED' && checkout.status === RegistrationCheckoutStatus.CREATING) {
      await tx.eventRegistrationCheckout.update({ where: { id: checkout.id }, data: { status: RegistrationCheckoutStatus.ACTIVE } });
    }
    await tx.asaasCheckoutWebhookEvent.update({ where: { id: storedId }, data: { processedAt: now } });
    return confirmed;
  }

  private async expireReservation(reservationId: string, eventId: string, organizationId: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const reservation = await tx.eventRegistrationReservation.findFirst({
        where: { id: reservationId, eventId, organizationId },
        select: { id: true, status: true, benefitId: true, expiresAt: true },
      });
      if (!reservation) return;
      await this.releaseReservation(tx, reservation, eventId, organizationId, RegistrationReservationStatus.EXPIRED);
      await tx.eventRegistrationCheckout.updateMany({
        where: { reservationId, eventId, organizationId, status: { notIn: [RegistrationCheckoutStatus.PAID, RegistrationCheckoutStatus.PAID_REVIEW] } },
        data: { status: RegistrationCheckoutStatus.EXPIRED, failureCode: reason },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async releaseReservation(
    tx: Prisma.TransactionClient,
    reservation: { id: string; status: RegistrationReservationStatus; benefitId: string | null },
    eventId: string,
    organizationId: string,
    status: RegistrationReservationStatus,
  ) {
    const released = await tx.eventRegistrationReservation.updateMany({
      where: { id: reservation.id, eventId, organizationId, status: RegistrationReservationStatus.PENDING_PAYMENT },
      data: { status },
    });
    if (released.count === 1 && reservation.benefitId) {
      await tx.eventRegistrationBenefit.updateMany({
        where: { id: reservation.benefitId, eventId, organizationId, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      });
    }
  }

  private toPublicCheckout(
    protocol: string,
    reservationStatus: RegistrationReservationStatus,
    checkout: { status: RegistrationCheckoutStatus; checkoutUrl: string | null; amountCents: number; expiresAt: Date; paidAt: Date | null } | null,
    proofRequirement: 'NONE' | 'OPTIONAL' | 'REQUIRED_BEFORE_PAYMENT' = 'NONE',
    proofState: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | null = null,
  ) {
    const proofBlock = categoryProofPaymentBlock(proofRequirement, proofState);
    return {
      protocol,
      reservationStatus,
      checkoutStatus: checkout?.status ?? null,
      amountCents: checkout?.amountCents ?? null,
      checkoutUrl: checkout?.status === RegistrationCheckoutStatus.ACTIVE ? checkout.checkoutUrl : null,
      expiresAt: checkout?.expiresAt.toISOString() ?? null,
      paidAt: checkout?.paidAt?.toISOString() ?? null,
      paymentConfirmed: reservationStatus === RegistrationReservationStatus.CONFIRMED,
      categoryProof: {
        required: proofRequirement === 'REQUIRED_BEFORE_PAYMENT',
        state: proofRequirement === 'NONE' ? null : proofState,
      },
      nextStep: reservationStatus === RegistrationReservationStatus.CONFIRMED
        ? 'Pagamento confirmado pelo Asaas. Sua inscrição está confirmada.'
        : proofBlock && reservationStatus === RegistrationReservationStatus.PENDING_PAYMENT
          ? proofBlock
          : checkout?.status === RegistrationCheckoutStatus.PAID_REVIEW
            ? 'Pagamento recebido e encaminhado para conciliação segura.'
            : reservationStatus === RegistrationReservationStatus.PENDING_PAYMENT
              ? 'Conclua o pagamento no ambiente seguro do Asaas e aguarde a confirmação automática.'
              : 'Esta reserva não está mais disponível para pagamento.',
    };
  }
}

