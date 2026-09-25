import { createHash, timingSafeEqual } from 'node:crypto';

export type NormalizedAsaasCheckoutWebhook = {
  providerEventId: string;
  eventType: string;
  externalCheckoutId: string;
  checkoutStatus: string | null;
  amountCents: number | null;
};

export class AsaasCheckoutPolicyError extends Error {}

const SAFE_PROVIDER_ID = /^[A-Za-z0-9_&.-]{4,200}$/u;
const SAFE_EVENT = /^[A-Z][A-Z0-9_]{2,63}$/u;
const SAFE_PROTOCOL = /^EVO-[A-F0-9]{16}$/u;

export function normalizeReservationProtocol(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_PROTOCOL.test(value.trim())) {
    throw new AsaasCheckoutPolicyError('Protocolo de reserva inválido.');
  }
  return value.trim();
}

function centsFromItems(value: unknown): number | null {
  if (!Array.isArray(value)) return null;
  let total = 0;
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new AsaasCheckoutPolicyError('Itens do Checkout Asaas inválidos.');
    }
    const item = candidate as Record<string, unknown>;
    if (!Number.isInteger(item.quantity) || (item.quantity as number) < 1 || (item.quantity as number) > 1_000_000) {
      throw new AsaasCheckoutPolicyError('Quantidade do Checkout Asaas inválida.');
    }
    if (typeof item.value !== 'number' || !Number.isFinite(item.value) || item.value < 0 || item.value > 10_000_000) {
      throw new AsaasCheckoutPolicyError('Valor do Checkout Asaas inválido.');
    }
    const unitCents = Math.round(item.value * 100);
    if (Math.abs(item.value * 100 - unitCents) > 0.000_001) {
      throw new AsaasCheckoutPolicyError('Valor do Checkout Asaas possui precisão inválida.');
    }
    total += unitCents * (item.quantity as number);
    if (!Number.isSafeInteger(total) || total > 1_000_000_000) {
      throw new AsaasCheckoutPolicyError('Valor total do Checkout Asaas excede o limite.');
    }
  }
  return total;
}

export function normalizeAsaasCheckoutWebhook(input: unknown): NormalizedAsaasCheckoutWebhook {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AsaasCheckoutPolicyError('Webhook Asaas inválido.');
  }
  const payload = input as Record<string, unknown>;
  if (typeof payload.id !== 'string' || !SAFE_PROVIDER_ID.test(payload.id)) {
    throw new AsaasCheckoutPolicyError('Identificador do evento Asaas inválido.');
  }
  if (typeof payload.event !== 'string' || !SAFE_EVENT.test(payload.event)) {
    throw new AsaasCheckoutPolicyError('Tipo do evento Asaas inválido.');
  }
  if (!payload.checkout || typeof payload.checkout !== 'object' || Array.isArray(payload.checkout)) {
    throw new AsaasCheckoutPolicyError('Checkout do webhook Asaas inválido.');
  }
  const checkout = payload.checkout as Record<string, unknown>;
  if (typeof checkout.id !== 'string' || !SAFE_PROVIDER_ID.test(checkout.id)) {
    throw new AsaasCheckoutPolicyError('Identificador do Checkout Asaas inválido.');
  }
  const status = checkout.status;
  if (status !== undefined && status !== null && (typeof status !== 'string' || !SAFE_EVENT.test(status))) {
    throw new AsaasCheckoutPolicyError('Status do Checkout Asaas inválido.');
  }
  const amountCents = centsFromItems(checkout.items);
  if (payload.event === 'CHECKOUT_PAID' && (amountCents === null || amountCents <= 0)) {
    throw new AsaasCheckoutPolicyError('O evento de pagamento não contém um valor válido.');
  }
  return {
    providerEventId: payload.id,
    eventType: payload.event,
    externalCheckoutId: checkout.id,
    checkoutStatus: typeof status === 'string' ? status : null,
    amountCents,
  };
}

export function secureTokenMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected || expected.length < 32 || expected.length > 255 || /\s/u.test(expected)) return false;
  const left = createHash('sha256').update(provided).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

export function webhookFingerprint(event: NormalizedAsaasCheckoutWebhook): string {
  return createHash('sha256').update(JSON.stringify(event)).digest('hex');
}
