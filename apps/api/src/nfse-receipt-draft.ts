import type { Prisma } from '@prisma/client';
import { FiscalInvoicePolicyError, prepareFiscalInvoiceDraft, type FiscalInvoiceSource } from './nfse-draft-policy';

type FiscalSetup = Pick<FiscalInvoiceSource, 'issuerId' | 'recipientId' | 'serviceCode' | 'municipalityIbgeCode'>;

/** Server-only preview for a paid individual receipt. Fiscal setup comes from the caller's verified configuration. */
export async function previewFiscalReceipt(
  db: Pick<Prisma.TransactionClient, 'eventRegistrationPaymentReceipt'>,
  scope: { userId: string; organizationId: string; eventId: string; receiptId: string },
  setup: FiscalSetup,
) {
  if (!scope || [scope.userId, scope.organizationId, scope.eventId, scope.receiptId].some(
    value => typeof value !== 'string' || !value.trim(),
  )) throw new FiscalInvoicePolicyError('Recibo indisponível para preparação fiscal.');
  const receipt = await db.eventRegistrationPaymentReceipt.findFirst({
    where: {
      id: scope.receiptId, organizationId: scope.organizationId, eventId: scope.eventId,
      reservation: { status: 'CONFIRMED', event: { organization: { memberships: { some: {
        userId: scope.userId, status: 'ACTIVE', role: 'OWNER',
      } } } } },
      checkout: { status: 'PAID', paidAt: { not: null } },
    },
    select: {
      id: true, organizationId: true, eventId: true, reservationId: true, amountCents: true,
      checkout: { select: { amountCents: true, reservationId: true } },
    },
  });
  if (!receipt || receipt.checkout.reservationId !== receipt.reservationId ||
      receipt.checkout.amountCents !== receipt.amountCents) {
    throw new FiscalInvoicePolicyError('Recibo indisponível para preparação fiscal.');
  }
  return prepareFiscalInvoiceDraft({
    ...setup, receiptId: receipt.id, eventId: receipt.eventId, organizationId: receipt.organizationId,
    reservationId: receipt.reservationId, amountCents: receipt.amountCents, currency: 'BRL', paymentStatus: 'CONFIRMED',
  });
}
