import { createHash } from 'node:crypto';
import { RegistrationReservationStatus } from '@prisma/client';

export type RegistrationPresenceFilter = 'ALL' | 'VALIDATED' | 'PENDING';

export function normalizeRegistrationPresence(value: unknown): RegistrationPresenceFilter {
  if (value === undefined || value === null || value === '' || value === 'ALL') return 'ALL';
  if (value === 'VALIDATED' || value === 'PENDING') return value;
  throw new Error('Validação inválida.');
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function registrationEmailHash(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL.test(email)) return null;
  return sha256(email);
}

export function registrationDocumentHash(value: string): string | null {
  const document = value.replace(/[ .\-/]/gu, '').toUpperCase();
  if (document.length < 5 || document.length > 40 || !/^[A-Z0-9]+$/u.test(document)) return null;
  return sha256(document);
}

export function effectiveRegistrationStatus(
  status: RegistrationReservationStatus,
  expiresAt: Date | null,
  now: Date,
): RegistrationReservationStatus {
  return status === RegistrationReservationStatus.PENDING_PAYMENT && expiresAt !== null && expiresAt <= now
    ? RegistrationReservationStatus.EXPIRED : status;
}

const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/u;

function sameRecordedPrice(basePriceCents: number, discountPercent: number): number {
  if (!Number.isInteger(basePriceCents) || basePriceCents < 0 || !Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new Error('Preço ou desconto inválido.');
  }
  return Math.round(basePriceCents * (100 - discountPercent) / 100);
}
const PRICE_BLOCK = 'A troca fica bloqueada porque o preço da categoria não é igual ao valor pago. Não há ajuste nem reembolso neste passo.';

export type PaidCategoryChangeCode = 'ok' | 'unpaid' | 'mismatch' | 'price' | 'capacity' | 'lot' | 'unavailable';
export type PaidCategoryChangeDecision =
  | { ok: true; unchanged: boolean }
  | { ok: false; code: Exclude<PaidCategoryChangeCode, 'ok'>; message: string };

export function normalizeCategoryChangeTarget(input: unknown): { categoryId: string; lotId: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Informe a categoria e o lote.');
  const categoryId = (input as { categoryId?: unknown }).categoryId;
  const lotId = (input as { lotId?: unknown }).lotId;
  if (typeof categoryId !== 'string' || typeof lotId !== 'string' || !SAFE_ID.test(categoryId) || !SAFE_ID.test(lotId)) {
    throw new Error('Informe a categoria e o lote.');
  }
  return { categoryId, lotId };
}

export function decidePaidCategoryChange(input: {
  status: string;
  checkoutStatus: string | null;
  paidCents: number | null;
  finalPriceCents: number;
  basePriceCents: number;
  discountPercent: number;
  currentCategoryId: string;
  currentLotId: string;
  targetCategoryId: string;
  targetLotId: string;
  targetLotPriceCents: number;
  targetActive: boolean;
  sameEvent: boolean;
  categoryCapacity: number | null;
  categoryOccupied: number;
  lotQuantity: number | null;
  lotOccupied: number;
}): PaidCategoryChangeDecision {
  if (!input.sameEvent || !input.targetActive) {
    return { ok: false, code: 'unavailable', message: 'A categoria escolhida não está disponível neste evento.' };
  }
  if (input.status !== 'CONFIRMED' || input.checkoutStatus !== 'PAID' || input.paidCents === null) {
    return { ok: false, code: 'unpaid', message: 'Só uma inscrição confirmada e paga pode trocar de categoria neste passo.' };
  }
  if (input.paidCents !== input.finalPriceCents) {
    return { ok: false, code: 'mismatch', message: 'A troca fica bloqueada porque o valor pago não confere com o valor da inscrição.' };
  }
  if (input.targetCategoryId === input.currentCategoryId && input.targetLotId === input.currentLotId) {
    return { ok: true, unchanged: true };
  }
  if (input.targetLotPriceCents !== input.basePriceCents) {
    return { ok: false, code: 'price', message: PRICE_BLOCK };
  }
  let recalculated: number;
  try {
    recalculated = sameRecordedPrice(input.targetLotPriceCents, input.discountPercent);
  } catch {
    return { ok: false, code: 'price', message: PRICE_BLOCK };
  }
  if (recalculated !== input.paidCents) return { ok: false, code: 'price', message: PRICE_BLOCK };
  if (input.targetCategoryId !== input.currentCategoryId && input.categoryCapacity !== null && input.categoryOccupied >= input.categoryCapacity) {
    return { ok: false, code: 'capacity', message: 'Esta categoria não tem vaga para a troca.' };
  }
  if (input.targetLotId !== input.currentLotId && input.lotQuantity !== null && input.lotOccupied >= input.lotQuantity) {
    return { ok: false, code: 'lot', message: 'Este lote não tem vaga para a troca.' };
  }
  return { ok: true, unchanged: false };
}

export function categoryChangePatch(registrationData: unknown, categoryId: string, lotId: string): {
  categoryId: string;
  lotId: string;
  registrationData?: Record<string, unknown>;
} {
  const patch: { categoryId: string; lotId: string; registrationData?: Record<string, unknown> } = { categoryId, lotId };
  if (registrationData && typeof registrationData === 'object' && !Array.isArray(registrationData)
    && Object.prototype.hasOwnProperty.call(registrationData, 'registration_type')) {
    patch.registrationData = { ...(registrationData as Record<string, unknown>), registration_type: categoryId };
  }
  return patch;
}

