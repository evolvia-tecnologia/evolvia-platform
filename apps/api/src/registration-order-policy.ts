import { createHash } from 'node:crypto';
import {
  BillingDeclaration,
  PublicRegistrationInput,
  RegistrationReservationPolicyError,
  normalizePublicRegistration,
} from './registration-reservations-policy';

export const MIN_REGISTRATION_ORDER_ENTRIES = 2;
export const MAX_REGISTRATION_ORDER_ENTRIES = 10;

export type RegistrationOrderEntryInput = Omit<PublicRegistrationInput, 'billing'>;

export type PublicRegistrationOrderInput = {
  entries: RegistrationOrderEntryInput[];
  billing?: BillingDeclaration;
};

export type NormalizedRegistrationOrder = {
  entries: RegistrationOrderEntryInput[];
  billing?: BillingDeclaration;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function canonicalRegistrationOrderPayload(input: NormalizedRegistrationOrder): string {
  return JSON.stringify(stableValue(input));
}

export function registrationOrderPayloadHash(input: NormalizedRegistrationOrder): string {
  return createHash('sha256').update(canonicalRegistrationOrderPayload(input)).digest('hex');
}

export function normalizeRegistrationOrder(input: PublicRegistrationOrderInput): NormalizedRegistrationOrder {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.entries)) {
    throw new RegistrationReservationPolicyError('Informe as entradas da compra.');
  }
  if (
    input.entries.length < MIN_REGISTRATION_ORDER_ENTRIES
    || input.entries.length > MAX_REGISTRATION_ORDER_ENTRIES
  ) {
    throw new RegistrationReservationPolicyError(
      `A compra deve ter entre ${MIN_REGISTRATION_ORDER_ENTRIES} e ${MAX_REGISTRATION_ORDER_ENTRIES} entradas.`,
    );
  }

  const entries: RegistrationOrderEntryInput[] = [];
  const identities = new Set<string>();
  let normalizedBilling: BillingDeclaration | undefined;

  for (const rawEntry of input.entries) {
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
      throw new RegistrationReservationPolicyError('Uma das entradas da compra é inválida.');
    }
    if (Object.prototype.hasOwnProperty.call(rawEntry, 'billing')) {
      throw new RegistrationReservationPolicyError(
        'Informe os dados de cobrança uma única vez para a compra.',
      );
    }

    const normalized = normalizePublicRegistration({
      ...(rawEntry as RegistrationOrderEntryInput),
      billing: entries.length === 0 ? input.billing : undefined,
    });
    const identity = String(normalized.answers.identity_document);
    if (identities.has(identity)) {
      throw new RegistrationReservationPolicyError(
        'Cada entrada da compra deve usar uma identidade diferente.',
      );
    }
    identities.add(identity);
    normalizedBilling ??= normalized.billing;

    entries.push({
      categoryId: normalized.categoryId,
      lotId: normalized.lotId,
      ...(normalized.benefitCode ? { benefitCode: normalized.benefitCode } : {}),
      answers: normalized.answers,
    });
  }

  return {
    entries,
    ...(normalizedBilling ? { billing: normalizedBilling } : {}),
  };
}

export type PublicOrderOffer = {
  categories: ReadonlyArray<{
    id: string;
    lots: ReadonlyArray<{ id: string; priceCents: number; remaining: number | null }>;
  }>;
};

export function previewRegistrationOrder(
  order: NormalizedRegistrationOrder, offer: PublicOrderOffer,
): {
  entryCount: number;
  subtotalCents: number;
  entries: Array<{ categoryId: string; lotId: string; priceCents: number }>;
  stockReserved: false;
} {
  const quantities = new Map<string, number>();
  const lines: Array<{ categoryId: string; lotId: string; priceCents: number }> = [];
  let subtotalCents = 0;
  for (const entry of order.entries) {
    // Discounts are currently individual and may require proof/authorization.
    // Never advertise an incorrect final price in an uncommitted multi-entry cart.
    if (entry.benefitCode) throw new RegistrationReservationPolicyError('Descontos exigem validação individual antes da reserva.');
    const category = offer.categories.find((item) => item.id === entry.categoryId);
    const lot = category?.lots.find((item) => item.id === entry.lotId);
    if (!lot || !Number.isSafeInteger(lot.priceCents) || lot.priceCents < 0) {
      throw new RegistrationReservationPolicyError('Categoria ou lote indisponível para a compra.');
    }
    const key = `${entry.categoryId}:${entry.lotId}`;
    const quantity = (quantities.get(key) ?? 0) + 1;
    if (lot.remaining !== null && (!Number.isSafeInteger(lot.remaining) || quantity > lot.remaining)) {
      throw new RegistrationReservationPolicyError('Não existem vagas suficientes para todas as entradas.');
    }
    quantities.set(key, quantity);
    subtotalCents += lot.priceCents;
    if (!Number.isSafeInteger(subtotalCents)) throw new RegistrationReservationPolicyError('Total da compra fora do limite permitido.');
    lines.push({ categoryId: entry.categoryId, lotId: entry.lotId, priceCents: lot.priceCents });
  }
  return { entryCount: lines.length, subtotalCents, entries: lines, stockReserved: false };
}
