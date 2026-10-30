import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
  ServiceUnavailableException, UnauthorizedException, UnprocessableEntityException,
} from '@nestjs/common';
import { EventStatus, Prisma, RegistrationCheckoutStatus, RegistrationReservationStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AsaasCheckoutGateway, AsaasGatewayError } from './asaas-checkout.gateway';
import {
  asaasStubPaidWebhook, authorizeAsaasCheckoutWebhook, normalizeAsaasCheckoutWebhook,
  webhookFingerprint, type NormalizedAsaasCheckoutWebhook,
} from './asaas-checkout-policy';
import { IntegrationFoundationService } from './integration-foundation.service';
import type { ConfirmedRegistrationNotice } from './integration-foundation.policy';
import { PaidEventCommissionError, asaasOrganizerSplit, negotiatedCommissionPercent, normalizeFeeBearer, quotePlatformCommission, registrationCountry, type CommissionQuote } from './paid-event-commission.policy';
import { PrismaService } from './prisma.service';
import { normalizeIdempotencyKey, RegistrationReservationPolicyError } from './registration-reservations-policy';
import { RegistrationOrderCheckoutIntentService } from './registration-order-checkout-intent.service';

const PROVIDER = 'ASAAS';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class RegistrationOrderCheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intent: RegistrationOrderCheckoutIntentService,
    private readonly gateway: AsaasCheckoutGateway,
    private readonly foundation: IntegrationFoundationService,
  ) {}

  private publicState(checkout: {
    status: RegistrationCheckoutStatus; checkoutUrl: string | null;
    amountCents: number; expiresAt: Date; paidAt: Date | null;
  }, orderId: string) {
    return {
      orderId, status: checkout.status, amountCents: checkout.amountCents,
      checkoutUrl: checkout.status === RegistrationCheckoutStatus.ACTIVE ? checkout.checkoutUrl : null,
      expiresAt: checkout.expiresAt.toISOString(), paidAt: checkout.paidAt?.toISOString() ?? null,
    };
  }

  async getStatus(slugValue: string, orderId: string, rawKey?: string) {
    let key: string;
    try { key = normalizeIdempotencyKey(rawKey); }
    catch (error) {
      if (error instanceof RegistrationReservationPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    const event = await this.prisma.event.findUnique({
      where: { slug: slugValue.trim().toLowerCase() },
      select: { id: true, organizationId: true, status: true },
    });
    if (!event?.organizationId || event.status !== EventStatus.PUBLISHED) throw new NotFoundException('Pedido não encontrado.');
    const order = await this.prisma.eventRegistrationOrder.findFirst({
      where: { id: orderId, eventId: event.id, organizationId: event.organizationId, idempotencyKeyHash: hash(key) },
      include: { checkout: true, entries: { orderBy: { position: 'asc' }, select: {
        position: true, reservation: { select: { protocol: true, status: true } },
      } } },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    return {
      orderId: order.id, status: order.status, subtotalCents: order.subtotalCents,
      entries: order.entries.map((entry) => ({ position: entry.position, protocol: entry.reservation?.protocol, status: entry.reservation?.status })),
      checkout: order.checkout ? this.publicState(order.checkout, order.id) : null,
    };
  }

  async create(slugValue: string, orderId: string, key?: string) {
    let normalizedKey: string;
    try { normalizedKey = normalizeIdempotencyKey(key); }
    catch (error) {
      if (error instanceof RegistrationReservationPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    const slug = slugValue.trim().toLowerCase();
    const event = await this.prisma.event.findUnique({
      where: { slug }, select: { id: true, organizationId: true, name: true, status: true },
    });
    if (!event?.organizationId || event.status !== EventStatus.PUBLISHED) throw new NotFoundException('Pedido não encontrado.');
    const organizationId = event.organizationId;
    // The reservation key is also the checkout capability: a leaked opaque order
    // ID alone must not let another caller lock or initiate somebody else's order.
    const owned = await this.prisma.eventRegistrationOrder.findFirst({
      where: {
        id: orderId, eventId: event.id, organizationId,
        idempotencyKeyHash: hash(normalizedKey),
      },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('Pedido não encontrado.');
    // Replays after payment must not re-enter intent.prepare: the order is no
    // longer PENDING_PAYMENT, although its original checkout remains valid.
    // Scope the read by tenant, event, order and the opaque checkout capability.
    // Never call Asaas again for a checkout already created or paid.
    const existingCheckout = await this.prisma.eventRegistrationOrderCheckout.findFirst({
      where: {
        orderId, eventId: event.id, organizationId,
        idempotencyKeyHash: hash(normalizedKey),
        status: { in: [RegistrationCheckoutStatus.ACTIVE, RegistrationCheckoutStatus.PAID] },
      },
    });
    if (existingCheckout && (existingCheckout.status === RegistrationCheckoutStatus.ACTIVE
      || existingCheckout.status === RegistrationCheckoutStatus.PAID)) {
      if (!existingCheckout.providerCheckoutId) {
        throw new ServiceUnavailableException('Checkout em conciliação segura.');
      }
      await this.reconcilePending(existingCheckout.providerCheckoutId);
      const current = await this.prisma.eventRegistrationOrderCheckout.findUniqueOrThrow({
        where: { id: existingCheckout.id },
      });
      return this.publicState(current, orderId);
    }
    // Existing paid/active checkouts remain readable when the provider is
    // temporarily disabled; only a genuinely new charge needs live gateway.
    if (!this.gateway.isConfigured()) throw new UnprocessableEntityException('O pagamento está temporariamente indisponível.');
    const prepared = await this.intent.prepare(slugValue, orderId, normalizedKey);
    const checkout = await this.prisma.eventRegistrationOrderCheckout.findFirst({
      where: { id: prepared.checkoutId, orderId, eventId: event.id, organizationId },
      include: { order: { include: { entries: { include: {
        reservation: { select: { finalPriceCents: true, registrationData: true } },
      } } } } },
    });
    if (!checkout) throw new NotFoundException('Checkout não encontrado.');
    if (checkout.status === RegistrationCheckoutStatus.ACTIVE || checkout.status === RegistrationCheckoutStatus.PAID) {
      // Reconcile a provider callback that arrived before the checkout ID was
      // persisted, including after an earlier worker crashed during replay.
      if (checkout.providerCheckoutId) await this.reconcilePending(checkout.providerCheckoutId);
      const current = await this.prisma.eventRegistrationOrderCheckout.findUniqueOrThrow({
        where: { id: checkout.id },
      });
      return this.publicState(current, orderId);
    }
    if (checkout.status === RegistrationCheckoutStatus.CREATING && checkout.failureCode === 'provider_inflight'
      && checkout.updatedAt <= new Date(Date.now() - 120_000)) {
      // A crashed worker may have reached Asaas. Never send a second charge.
      await this.prisma.eventRegistrationOrderCheckout.updateMany({
        where: {
          id: checkout.id, eventId: event.id, organizationId,
          status: RegistrationCheckoutStatus.CREATING,
          failureCode: 'provider_inflight', updatedAt: { lte: new Date(Date.now() - 120_000) },
        },
        data: { status: RegistrationCheckoutStatus.UNKNOWN, failureCode: 'creation_interrupted' },
      });
      throw new ServiceUnavailableException('Pagamento interrompido e encaminhado para conciliação segura.');
    }
    if (checkout.status !== RegistrationCheckoutStatus.CREATING || checkout.failureCode !== 'provider_not_started') {
      throw new ServiceUnavailableException('Pagamento em processamento ou conciliação segura.');
    }
    const [responsibility, seller] = await Promise.all([
      this.prisma.eventFinancialResponsibility.findUnique({ where: { eventId: event.id } }),
      this.prisma.organizationLegalProfile.findUnique({ where: { organizationId } }),
    ]);
    if (!responsibility || !seller || responsibility.organizationId !== event.organizationId
      || responsibility.sellerLegalProfileRevision !== seller.revision) {
      throw new ConflictException('Responsável financeiro desatualizado.');
    }
    let quote: CommissionQuote;
    let split: { walletId: string; fixedValue: number };
    try {
      const percent = negotiatedCommissionPercent();
      const bearer = normalizeFeeBearer(responsibility.feeBearer);
      let buyerCents = 0;
      let organizerCents = 0;
      let platformCents = 0;
      let ticketCents = 0;
      let international = false;
      let first: CommissionQuote | null = null;
      for (const entry of checkout.order.entries) {
        if (!entry.reservation) throw new ConflictException('Entrada sem reserva.');
        const line = quotePlatformCommission({
          surface: 'registration', ticketCents: entry.reservation.finalPriceCents,
          percent, bearer, country: registrationCountry(entry.reservation.registrationData),
        });
        first ??= line;
        buyerCents += line.buyerCents;
        organizerCents += line.organizerCents;
        platformCents += line.platformCents;
        ticketCents += line.ticketCents;
        international ||= line.market === 'INTERNATIONAL';
      }
      if (!first || !Number.isSafeInteger(buyerCents) || buyerCents !== checkout.amountCents
        || !Number.isSafeInteger(organizerCents) || organizerCents <= 0) {
        throw new ConflictException('Valor do checkout divergente.');
      }
      quote = {
        ...first, buyerCents, organizerCents, platformCents, ticketCents,
        market: international ? 'INTERNATIONAL' : 'BR',
        billingTypes: international ? ['CREDIT_CARD'] : ['PIX', 'CREDIT_CARD'],
        chargeTypes: international ? ['DETACHED'] : ['DETACHED', 'INSTALLMENT'],
        maxInstallmentCount: international ? null : 6,
      };
      split = asaasOrganizerSplit(quote, seller.asaasWalletId
        || (this.gateway.isStubMode() ? this.gateway.stubOrganizerWalletId() : null));
    } catch (error) {
      if (error instanceof PaidEventCommissionError) throw new ConflictException(error.message);
      throw error;
    }
    // A single compare-and-set claims the provider call. Concurrent requests never
    // issue a second charge. An interrupted call becomes UNKNOWN, never auto-retried.
    const claim = await this.prisma.eventRegistrationOrderCheckout.updateMany({
      where: {
        id: checkout.id, eventId: event.id, organizationId,
        status: RegistrationCheckoutStatus.CREATING, failureCode: 'provider_not_started',
      },
      data: { failureCode: 'provider_inflight' },
    });
    if (claim.count !== 1) throw new ConflictException('Checkout já iniciado. Aguarde a conciliação.');

    try {
      const remaining = Math.floor((checkout.expiresAt.getTime() - Date.now()) / 60_000);
      if (remaining < 10) throw new AsaasGatewayError('checkout_window_elapsed', 'SAFE');
      const created = await this.gateway.createCheckout({
        reservationId: orderId, protocol: orderId, orderId,
        eventName: event.name, slug, amountCents: quote.buyerCents,
        minutesToExpire: Math.min(1440, remaining),
        billingTypes: quote.billingTypes, chargeTypes: quote.chargeTypes,
        maxInstallmentCount: quote.maxInstallmentCount, split,
      });
      const updated = await this.prisma.$transaction(async (tx) => {
        const changed = await tx.eventRegistrationOrderCheckout.updateMany({
          where: {
            id: checkout.id, eventId: event.id, organizationId,
            status: RegistrationCheckoutStatus.CREATING, failureCode: 'provider_inflight',
          },
          data: {
            providerCheckoutId: created.providerCheckoutId, checkoutUrl: created.checkoutUrl,
            status: RegistrationCheckoutStatus.ACTIVE, failureCode: null,
          },
        });
        if (changed.count !== 1) throw new ConflictException('Checkout alterado durante a criação.');
        await tx.auditLog.create({ data: {
          organizationId, eventId: event.id,
          action: 'registration.order_checkout_created',
          entityType: 'EventRegistrationOrderCheckout', entityId: checkout.id,
          metadata: { entryCount: checkout.order.entries.length, amountCents: quote.buyerCents,
            organizerCents: quote.organizerCents, platformCents: quote.platformCents } as Prisma.InputJsonObject,
        } });
        return tx.eventRegistrationOrderCheckout.findUniqueOrThrow({ where: { id: checkout.id } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      await this.reconcilePending(created.providerCheckoutId);
      if (this.gateway.isStubMode()) {
        await this.receiveWebhook(this.gateway.webhookToken(), asaasStubPaidWebhook(created.providerCheckoutId, quote.buyerCents));
      }
      const current = await this.prisma.eventRegistrationOrderCheckout.findUniqueOrThrow({ where: { id: updated.id } });
      return this.publicState(current, orderId);
    } catch (error) {
      const safe = error instanceof AsaasGatewayError && error.retrySafety === 'SAFE';
      if (safe) {
        // A definitively rejected provider request cannot have charged anyone.
        // Compensate all reservations together; never release on ambiguous errors.
        await this.prisma.$transaction(async (tx) => {
          const changed = await tx.eventRegistrationOrderCheckout.updateMany({
            where: {
              id: checkout.id, eventId: event.id, organizationId,
              status: RegistrationCheckoutStatus.CREATING, failureCode: 'provider_inflight',
            },
            data: { status: RegistrationCheckoutStatus.FAILED, failureCode: (error as AsaasGatewayError).code },
          });
          if (changed.count !== 1) return;
          const entries = await tx.eventRegistrationOrderEntry.findMany({
            where: { orderId, eventId: event.id, organizationId },
            select: { reservationId: true },
          });
          for (const entry of entries) if (entry.reservationId) {
            await tx.eventRegistrationReservation.updateMany({
              where: {
                id: entry.reservationId, eventId: event.id, organizationId,
                status: RegistrationReservationStatus.PENDING_PAYMENT,
              },
              data: { status: RegistrationReservationStatus.CANCELLED },
            });
          }
          await tx.eventRegistrationOrder.updateMany({
            where: {
              id: orderId, eventId: event.id, organizationId,
              status: RegistrationReservationStatus.PENDING_PAYMENT,
            },
            data: { status: RegistrationReservationStatus.CANCELLED, expiresAt: null },
          });
          await tx.auditLog.create({ data: {
            organizationId, eventId: event.id,
            action: 'registration.order_checkout_safe_failure',
            entityType: 'EventRegistrationOrderCheckout', entityId: checkout.id,
            metadata: { reason: (error as AsaasGatewayError).code } as Prisma.InputJsonObject,
          } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } else {
        await this.prisma.eventRegistrationOrderCheckout.updateMany({
          where: {
            id: checkout.id, eventId: event.id, organizationId,
            status: RegistrationCheckoutStatus.CREATING,
          },
          data: {
            status: RegistrationCheckoutStatus.UNKNOWN,
            failureCode: error instanceof AsaasGatewayError ? error.code : 'provider_or_persistence_ambiguous',
          },
        });
      }
      if (safe) throw new UnprocessableEntityException(error.message);
      throw new ServiceUnavailableException('Checkout encaminhado para conciliação segura, sem nova cobrança automática.');
    }
  }

  async ownsProviderCheckout(providerCheckoutId: string): Promise<boolean> {
    const checkout = await this.prisma.eventRegistrationOrderCheckout.findFirst({
      where: { provider: PROVIDER, providerCheckoutId }, select: { id: true },
    });
    return Boolean(checkout);
  }

  async receiveWebhook(rawToken: string | undefined, rawBody: unknown) {
    if (!authorizeAsaasCheckoutWebhook(rawToken)) throw new UnauthorizedException('Webhook não autorizado.');
    let event: NormalizedAsaasCheckoutWebhook;
    try { event = normalizeAsaasCheckoutWebhook(rawBody); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Webhook inválido.'); }
    return this.applyWebhook(event);
  }

  private async reconcilePending(externalCheckoutId: string) {
    const pending = await this.prisma.asaasCheckoutWebhookEvent.findMany({
      where: { externalCheckoutId, processedAt: null }, orderBy: { createdAt: 'asc' }, take: 20,
    });
    for (const stored of pending) {
      await this.applyWebhook({
        providerEventId: stored.providerEventId, eventType: stored.eventType,
        externalCheckoutId: stored.externalCheckoutId,
        checkoutStatus: stored.checkoutStatus, amountCents: stored.amountCents,
      });
    }
  }

  private async applyWebhook(event: NormalizedAsaasCheckoutWebhook) {
    const fingerprint = webhookFingerprint(event);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const outcome = await this.prisma.$transaction(async (tx) => {
      const checkout = await tx.eventRegistrationOrderCheckout.findFirst({
        where: { provider: PROVIDER, providerCheckoutId: event.externalCheckoutId },
        include: { order: { include: { entries: { include: {
          reservation: { select: { id: true, protocol: true, status: true, expiresAt: true, benefitId: true } },
        } } } } },
      });
      if (!checkout) return { accepted: true, queued: true, duplicate: false, notices: [] as ConfirmedRegistrationNotice[] };
      const previous = await tx.asaasCheckoutWebhookEvent.findUnique({ where: { providerEventId: event.providerEventId } });
      if (previous && previous.payloadHash !== fingerprint) {
        throw new ConflictException('Webhook repetido com conteúdo divergente.');
      }
      if (previous && previous.externalCheckoutId !== event.externalCheckoutId) {
        throw new ConflictException('Webhook vinculado a outro checkout.');
      }
      if (previous?.processedAt) return { accepted: true, queued: false, duplicate: true, notices: [] as ConfirmedRegistrationNotice[] };
      const stored = previous ?? await tx.asaasCheckoutWebhookEvent.create({ data: {
        providerEventId: event.providerEventId, externalCheckoutId: event.externalCheckoutId,
        eventType: event.eventType, checkoutStatus: event.checkoutStatus,
        amountCents: event.amountCents, payloadHash: fingerprint,
        organizationId: checkout.organizationId, eventId: checkout.eventId,
        checkoutId: checkout.id,
      } });
      const now = new Date();
      const entries = checkout.order.entries;
      const valid = entries.length >= 2 && entries.length <= 10
        && entries.every((entry) => entry.reservation?.status === RegistrationReservationStatus.PENDING_PAYMENT
          && entry.reservation.expiresAt && entry.reservation.expiresAt > now);
      const notices: ConfirmedRegistrationNotice[] = [];
      if (event.eventType === 'CHECKOUT_PAID') {
        if (checkout.status === RegistrationCheckoutStatus.PAID && checkout.order.status === RegistrationReservationStatus.CONFIRMED) {
          // Already committed by another provider event: no duplicate notification.
        } else if (event.amountCents === checkout.amountCents && valid
          && checkout.order.status === RegistrationReservationStatus.PENDING_PAYMENT
          && checkout.status !== RegistrationCheckoutStatus.PAID_REVIEW) {
          for (const entry of entries) {
            const reservation = entry.reservation!;
            const updated = await tx.eventRegistrationReservation.updateMany({
              where: {
                id: reservation.id, eventId: checkout.eventId, organizationId: checkout.organizationId,
                status: RegistrationReservationStatus.PENDING_PAYMENT, expiresAt: { gt: now },
              },
              data: { status: RegistrationReservationStatus.CONFIRMED, confirmedAt: now, expiresAt: null },
            });
            if (updated.count !== 1) throw new ConflictException('Confirmação concorrente de inscrição.');
          }
          await tx.eventRegistrationOrder.update({
            where: { id: checkout.orderId }, data: { status: RegistrationReservationStatus.CONFIRMED, expiresAt: null },
          });
          await tx.eventRegistrationOrderCheckout.update({
            where: { id: checkout.id }, data: { status: RegistrationCheckoutStatus.PAID, paidAt: now, failureCode: null },
          });
          const eventRow = await tx.event.findFirst({
            where: { id: checkout.eventId, organizationId: checkout.organizationId }, select: { slug: true },
          });
          if (eventRow?.slug) for (const entry of entries) {
            notices.push({
              organizationId: checkout.organizationId, eventId: checkout.eventId,
              reservationId: entry.reservation!.id, protocol: entry.reservation!.protocol, slug: eventRow.slug,
            });
          }
          await tx.auditLog.create({ data: {
            organizationId: checkout.organizationId, eventId: checkout.eventId,
            action: 'registration.order_payment_confirmed',
            entityType: 'EventRegistrationOrderCheckout', entityId: checkout.id,
            metadata: { entryCount: entries.length, amountCents: checkout.amountCents,
              source: 'authenticated_webhook' } as Prisma.InputJsonObject,
          } });
        } else {
          await tx.eventRegistrationOrderCheckout.update({
            where: { id: checkout.id }, data: {
              status: RegistrationCheckoutStatus.PAID_REVIEW, paidAt: now,
              failureCode: event.amountCents !== checkout.amountCents ? 'amount_mismatch' : 'late_or_inconsistent_order',
            },
          });
          await tx.auditLog.create({ data: {
            organizationId: checkout.organizationId, eventId: checkout.eventId,
            action: 'registration.order_payment_requires_reconciliation',
            entityType: 'EventRegistrationOrderCheckout', entityId: checkout.id,
            metadata: { reason: event.amountCents !== checkout.amountCents ? 'amount_mismatch' : 'late_or_inconsistent_order' } as Prisma.InputJsonObject,
          } });
        }
      } else if ((event.eventType === 'CHECKOUT_CANCELED' || event.eventType === 'CHECKOUT_EXPIRED')
        && checkout.status !== RegistrationCheckoutStatus.PAID
        && checkout.status !== RegistrationCheckoutStatus.PAID_REVIEW) {
        const status = event.eventType === 'CHECKOUT_CANCELED'
          ? RegistrationReservationStatus.CANCELLED : RegistrationReservationStatus.EXPIRED;
        for (const entry of entries) {
          if (!entry.reservation) throw new ConflictException('Entrada sem reserva.');
          await tx.eventRegistrationReservation.updateMany({
            where: {
              id: entry.reservation.id, eventId: checkout.eventId, organizationId: checkout.organizationId,
              status: RegistrationReservationStatus.PENDING_PAYMENT,
            },
            data: { status },
          });
        }
        await tx.eventRegistrationOrder.update({ where: { id: checkout.orderId }, data: { status, expiresAt: null } });
        await tx.eventRegistrationOrderCheckout.update({
          where: { id: checkout.id }, data: {
            status: event.eventType === 'CHECKOUT_CANCELED'
              ? RegistrationCheckoutStatus.CANCELED : RegistrationCheckoutStatus.EXPIRED,
          },
        });
      } else if (event.eventType === 'CHECKOUT_CREATED' && checkout.status === RegistrationCheckoutStatus.CREATING) {
        await tx.eventRegistrationOrderCheckout.update({
          where: { id: checkout.id }, data: { status: RegistrationCheckoutStatus.ACTIVE },
        });
      }
      await tx.asaasCheckoutWebhookEvent.update({
        where: { id: stored.id }, data: { processedAt: now, organizationId: checkout.organizationId, eventId: checkout.eventId },
      });
      return { accepted: true, queued: false, duplicate: Boolean(previous), notices };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    // The transaction is committed before any external notification. A failed
    // notification must not undo payment; retry delivery through the outbox.
    for (const notice of outcome.notices) {
      try { await this.foundation.notifyRegistrationConfirmed(notice); }
      catch { /* Durable confirmation is already committed; delivery is independent. */ }
    }
        return { accepted: outcome.accepted, queued: outcome.queued, duplicate: outcome.duplicate };
      } catch (error) {
        // Two provider retries can race on the unique event ID or SERIALIZABLE
        // snapshot. Replay the committed winner and compare its fingerprint.
        if (error instanceof Prisma.PrismaClientKnownRequestError
          && (error.code === 'P2002' || error.code === 'P2034')) continue;
        throw error;
      }
    }
    throw new ServiceUnavailableException('Webhook concorrente em conciliação segura.');
  }
}
