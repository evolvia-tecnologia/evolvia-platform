import {
  BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { EventStatus, Prisma, RegistrationCheckoutStatus, RegistrationReservationStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from './prisma.service';
import { categoryProofPaymentBlock } from './registration-category-proof.policy';
import {
  PaidEventCommissionError, negotiatedCommissionPercent, normalizeFeeBearer,
  quotePlatformCommission, registrationCountry,
} from './paid-event-commission.policy';
import { normalizeIdempotencyKey, RegistrationReservationPolicyError } from './registration-reservations-policy';

const MIN_CHECKOUT_MINUTES = 10;
const PROVIDER = 'ASAAS';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * First stage of a grouped checkout. This service deliberately does not call
 * Asaas or expose an endpoint. The persisted intent will be activated only
 * when grouped webhook reconciliation is implemented and independently tested.
 */
@Injectable()
export class RegistrationOrderCheckoutIntentService {
  constructor(private readonly prisma: PrismaService) {}

  async prepare(slugValue: string, orderId: string, rawIdempotencyKey?: string) {
    if (typeof orderId !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/u.test(orderId)) {
      throw new BadRequestException('Identificador do pedido inválido.');
    }
    let idempotencyKey: string;
    try { idempotencyKey = normalizeIdempotencyKey(rawIdempotencyKey); }
    catch (error) {
      if (error instanceof RegistrationReservationPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    const keyHash = digest(idempotencyKey);
    const slug = slugValue.trim().toLowerCase();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const event = await tx.event.findUnique({
            where: { slug },
            select: { id: true, organizationId: true, status: true },
          });
          if (!event?.organizationId || event.status !== EventStatus.PUBLISHED) {
            throw new NotFoundException('Pedido não encontrado.');
          }
          const organizationId = event.organizationId;
          const order = await tx.eventRegistrationOrder.findFirst({
            where: { id: orderId, eventId: event.id, organizationId },
            include: {
              entries: {
                orderBy: { position: 'asc' },
                include: {
                  reservation: {
                    select: {
                      id: true, status: true, finalPriceCents: true, registrationData: true, expiresAt: true,
                      category: { select: { proofRequirement: true } },
                      categoryProof: { select: { state: true } },
                    },
                  },
                },
              },
            },
          });
          if (!order) throw new NotFoundException('Pedido não encontrado.');
          const now = new Date();
          const minimumExpiry = new Date(now.getTime() + MIN_CHECKOUT_MINUTES * 60_000);
          if (order.status !== RegistrationReservationStatus.PENDING_PAYMENT
            || !order.expiresAt || order.expiresAt <= minimumExpiry
            || order.entries.length < 2 || order.entries.length > 10) {
            throw new ConflictException('O pedido não possui reservas válidas para iniciar o checkout.');
          }
          let subtotal = 0;
          for (const entry of order.entries) {
            const reservation = entry.reservation;
            if (!reservation || reservation.status !== RegistrationReservationStatus.PENDING_PAYMENT
              || !reservation.expiresAt || reservation.expiresAt <= minimumExpiry
              || reservation.finalPriceCents !== entry.finalPriceCents || reservation.finalPriceCents <= 0) {
              throw new ConflictException('As reservas do pedido não estão prontas para pagamento conjunto.');
            }
            const proofBlock = categoryProofPaymentBlock(
              reservation.category.proofRequirement, reservation.categoryProof?.state ?? null,
            );
            if (proofBlock) throw new ConflictException(proofBlock);
            subtotal += reservation.finalPriceCents;
          }
          if (!Number.isSafeInteger(subtotal) || subtotal !== order.subtotalCents) {
            throw new ConflictException('O total do pedido não corresponde às inscrições reservadas.');
          }

          const [responsibility, seller] = await Promise.all([
            tx.eventFinancialResponsibility.findUnique({ where: { eventId: event.id } }),
            tx.organizationLegalProfile.findUnique({ where: { organizationId } }),
          ]);
          if (!responsibility || !seller || responsibility.organizationId !== organizationId
            || responsibility.sellerLegalProfileRevision !== seller.revision) {
            throw new ConflictException('O responsável financeiro precisa ser confirmado.');
          }
          let amountCents = 0;
          let organizerCents = 0;
          let platformCents = 0;
          let percent: number;
          let bearer: ReturnType<typeof normalizeFeeBearer>;
          try {
            percent = negotiatedCommissionPercent();
            bearer = normalizeFeeBearer(responsibility.feeBearer);
            for (const entry of order.entries) {
              const reservation = entry.reservation!;
              const quote = quotePlatformCommission({
                surface: 'registration', ticketCents: reservation.finalPriceCents,
                percent, bearer, country: registrationCountry(reservation.registrationData),
              });
              amountCents += quote.buyerCents;
              organizerCents += quote.organizerCents;
              platformCents += quote.platformCents;
            }
          } catch (error) {
            if (error instanceof PaidEventCommissionError) throw new ConflictException(error.message);
            throw error;
          }
          if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 1_000_000_000
            || !Number.isSafeInteger(organizerCents) || organizerCents <= 0) {
            throw new ConflictException('Valor total do checkout inválido.');
          }
          if (!seller.asaasWalletId) {
            throw new ConflictException('A carteira Asaas do organizador deve estar configurada.');
          }
          const requestHash = digest(JSON.stringify({
            eventId: event.id, organizationId, orderId, subtotal, amountCents,
            organizerCents, platformCents, percent, bearer, sellerRevision: seller.revision,
          }));
          const existing = await tx.eventRegistrationOrderCheckout.findUnique({
            where: { orderId },
          });
          // A unique order lookup must still enforce the event/tenant boundary.
          if (existing && (existing.eventId !== event.id || existing.organizationId !== organizationId)) {
            throw new ConflictException('Checkout não pertence ao evento ou organização.');
          }
          if (existing) {
            if (existing.idempotencyKeyHash !== keyHash || existing.requestHash !== requestHash) {
              throw new ConflictException('O pedido já possui checkout com outra chave ou valores.');
            }
            return {
              orderId, checkoutId: existing.id, status: existing.status,
              amountCents: existing.amountCents, providerInitiated: Boolean(existing.providerCheckoutId),
              expiresAt: existing.expiresAt.toISOString(),
            };
          }
          const created = await tx.eventRegistrationOrderCheckout.create({
            data: {
              organizationId, eventId: event.id, orderId, provider: PROVIDER,
              idempotencyKeyHash: keyHash, requestHash,
              status: RegistrationCheckoutStatus.CREATING,
              failureCode: 'provider_not_started',
              amountCents, expiresAt: order.expiresAt,
            },
          });
          await tx.auditLog.create({
            data: {
              organizationId, eventId: event.id, action: 'registration.order_checkout_prepared',
              entityType: 'EventRegistrationOrderCheckout', entityId: created.id,
              metadata: {
                entryCount: order.entries.length, subtotalCents: subtotal, amountCents,
                organizerCents, platformCents, providerInitiated: false,
              } as Prisma.InputJsonObject,
            },
          });
          return {
            orderId, checkoutId: created.id, status: created.status,
            amountCents: created.amountCents, providerInitiated: false,
            expiresAt: created.expiresAt.toISOString(),
          };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') continue;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          // Concurrent checkout preparation can win the unique order/key constraint.
          // Retry the SERIALIZABLE transaction so the existing checkout is read
          // and its key/request hash are checked before any idempotent replay.
          continue;
        }
        throw error;
      }
    }
    throw new ServiceUnavailableException('O checkout está concorrente. Tente novamente.');
  }
}
