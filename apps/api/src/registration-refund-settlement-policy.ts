import { createHash } from 'node:crypto';

// Pure contract: caller must re-read totals and enforce uniqueness/amount caps in
// a SERIALIZABLE database transaction before sending anything to a provider.
export type RefundPaymentScope = {
  organizationId: string;
  eventId: string;
  refundRequestId: string;
  provider: string;
  providerPaymentId: string;
  reservationId: string;
  orderId?: string | null;
};
export type RefundSettlementInput = RefundPaymentScope & {
  decision: 'REQUESTED' | 'APPROVED' | 'REJECTED';
  paymentAmountCents: number;
  confirmedRefundCents: number;
  reservedRefundCents: number;
  requestedRefundCents: number;
};
export type RefundSettlementPlan = {
  idempotencyKey: string;
  paymentKind: 'ORDER' | 'RESERVATION';
  refundRequestId: string;
  requestedRefundCents: number;
  remainingRefundCents: number;
};

export class RefundSettlementPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RefundSettlementPolicyError';
  }
}

function identifier(value: string, field: string): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_:\-]{1,200}$/u.test(value)) {
    throw new RefundSettlementPolicyError(`Identificador inválido: ${field}.`);
  }
  return value;
}
function cents(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RefundSettlementPolicyError(`Valor inválido em centavos: ${field}.`);
  }
  return value;
}

/**
 * Idempotency is anchored to a single refund request + financial transaction,
 * NOT to the requested amount. A conflicting amount must be rejected against
 * the immutable persisted intent, never retried with a fresh provider key.
 */
function validateRefundPaymentScope(scope: RefundPaymentScope): void {
  identifier(scope.organizationId, 'organizationId');
  identifier(scope.eventId, 'eventId');
  identifier(scope.provider, 'provider');
  identifier(scope.providerPaymentId, 'providerPaymentId');
  identifier(scope.refundRequestId, 'refundRequestId');
  identifier(scope.reservationId, 'reservationId');
  if (scope.orderId != null) identifier(scope.orderId, 'orderId');
}

export function refundSettlementIdempotencyKey(scope: RefundPaymentScope): string {
  validateRefundPaymentScope(scope);
  const fields = [
    'evolvia-refund-v2',
    scope.organizationId,
    scope.eventId,
    scope.provider,
    scope.providerPaymentId,
    scope.refundRequestId,
    scope.reservationId,
    scope.orderId ?? '',
  ];
  return createHash('sha256').update(fields.join('\0'), 'utf8').digest('hex');
}

/**
 * Produces an intent only. It does not contact the provider, mark a payment
 * refunded, or revoke credentials. Pending reservations and confirmed refunds
 * must be counted atomically for the payment, including grouped purchases.
 */
export function planRefundSettlement(input: RefundSettlementInput): RefundSettlementPlan {
  const idempotencyKey = refundSettlementIdempotencyKey(input);
  if (input.decision !== 'APPROVED') {
    throw new RefundSettlementPolicyError('Somente pedidos aprovados podem iniciar processamento financeiro.');
  }
  const paid = cents(input.paymentAmountCents, 'paymentAmountCents');
  const confirmed = cents(input.confirmedRefundCents, 'confirmedRefundCents');
  const reserved = cents(input.reservedRefundCents, 'reservedRefundCents');
  const requested = cents(input.requestedRefundCents, 'requestedRefundCents');
  if (paid === 0 || requested === 0 || confirmed > paid || reserved > paid - confirmed) {
    throw new RefundSettlementPolicyError('Saldo do pagamento inválido para reembolso.');
  }
  const remaining = paid - confirmed - reserved;
  if (requested > remaining) {
    throw new RefundSettlementPolicyError('Reembolso supera o saldo disponível do pagamento.');
  }
  return {
    idempotencyKey,
    paymentKind: input.orderId ? 'ORDER' : 'RESERVATION',
    refundRequestId: input.refundRequestId,
    requestedRefundCents: requested,
    remainingRefundCents: remaining - requested,
  };
}

export type ProviderRefundConfirmation = {
  provider: string;
  providerPaymentId: string;
  amountCents: number;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  providerRefundId?: string | null;
};

/**
 * Only a reconciled provider confirmation matching the persisted intent
 * permits a terminal financial success. HTTP acceptance alone never does.
 */
export function confirmRefundSettlement(
  scope: RefundPaymentScope,
  requestedRefundCents: number,
  confirmation: ProviderRefundConfirmation,
): string {
  validateRefundPaymentScope(scope);
  const requested = cents(requestedRefundCents, 'requestedRefundCents');
  if (requested === 0 ||
      confirmation.provider !== scope.provider ||
      confirmation.providerPaymentId !== scope.providerPaymentId ||
      confirmation.amountCents !== requested ||
      confirmation.status !== 'SUCCEEDED' ||
      !confirmation.providerRefundId) {
    throw new RefundSettlementPolicyError('Estorno não confirmado e conciliado pelo provedor.');
  }
  return identifier(confirmation.providerRefundId, 'providerRefundId');
}
