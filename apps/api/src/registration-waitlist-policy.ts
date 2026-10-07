import { createHash } from 'node:crypto';

export class RegistrationWaitlistPolicyError extends Error {}

export const WAITLIST_OFFER_MINUTES_MIN = 15;
export const WAITLIST_OFFER_MINUTES_MAX = 10_080;
export const WAITLIST_ORDER_LABEL = 'Ordem de entrada na fila: quem entrou primeiro recebe a próxima vaga. Quem sai e volta vai para o fim.';

export type WaitlistStatus = 'WAITING' | 'OFFERED' | 'ACCEPTED' | 'LEFT' | 'OFFER_EXPIRED';
export type WaitlistConfigInput = { enabled: boolean; offerMinutes: number | null; closesAt: Date | null };

const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/u;
const SAFE_KEY = /^[A-Za-z0-9._:-]{16,128}$/u;

export function normalizeWaitlistLotId(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new RegistrationWaitlistPolicyError('Selecione um lote válido.');
  return value;
}

export function normalizeWaitlistKey(value: unknown): string {
  const key = typeof value === 'string' ? value.trim() : '';
  if (!SAFE_KEY.test(key)) throw new RegistrationWaitlistPolicyError('Envie uma chave Idempotency-Key válida com 16 a 128 caracteres.');
  return key;
}

export function normalizeWaitlistConfig(raw: unknown, now: Date, lotEndsAt: Date): WaitlistConfigInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RegistrationWaitlistPolicyError('Envie a configuração da fila.');
  const input = raw as Record<string, unknown>;
  if (typeof input.enabled !== 'boolean') throw new RegistrationWaitlistPolicyError('Informe se a fila fica ativa.');
  let offerMinutes: number | null = null;
  if (input.offerMinutes !== undefined && input.offerMinutes !== null) {
    if (typeof input.offerMinutes !== 'number' || !Number.isInteger(input.offerMinutes)
      || input.offerMinutes < WAITLIST_OFFER_MINUTES_MIN || input.offerMinutes > WAITLIST_OFFER_MINUTES_MAX) {
      throw new RegistrationWaitlistPolicyError('O prazo para confirmar a vaga deve ficar entre 15 minutos e 7 dias.');
    }
    offerMinutes = input.offerMinutes;
  }
  if (input.enabled && offerMinutes === null) {
    throw new RegistrationWaitlistPolicyError('Defina o prazo para a pessoa confirmar a vaga oferecida.');
  }
  let closesAt: Date | null = null;
  if (input.closesAt !== undefined && input.closesAt !== null && input.closesAt !== '') {
    if (typeof input.closesAt !== 'string') throw new RegistrationWaitlistPolicyError('Informe uma data válida para encerrar a fila.');
    const parsed = new Date(input.closesAt);
    if (Number.isNaN(parsed.getTime())) throw new RegistrationWaitlistPolicyError('Informe uma data válida para encerrar a fila.');
    if (input.enabled && parsed <= now) throw new RegistrationWaitlistPolicyError('A data de encerramento da fila precisa estar no futuro.');
    if (parsed > lotEndsAt) throw new RegistrationWaitlistPolicyError('A fila precisa encerrar até o fim do lote.');
    closesAt = parsed;
  }
  return { enabled: input.enabled, offerMinutes, closesAt };
}

export function waitlistAcceptsEntries(lot: { waitlistEnabled: boolean; waitlistClosesAt: Date | null; endsAt: Date }, now: Date): boolean {
  if (!lot.waitlistEnabled || lot.endsAt <= now) return false;
  return lot.waitlistClosesAt === null || lot.waitlistClosesAt > now;
}

export function freeSeats(capacity: number | null, reserved: number, offered: number): number | null {
  if (capacity === null) return null;
  return Math.max(0, capacity - reserved - offered);
}

export function combinedFreeSeats(lotFree: number | null, categoryFree: number | null): number | null {
  if (lotFree === null) return categoryFree;
  if (categoryFree === null) return lotFree;
  return Math.min(lotFree, categoryFree);
}

export function offerExpiresAt(now: Date, offerMinutes: number, lotEndsAt: Date): Date {
  const candidate = new Date(now.getTime() + offerMinutes * 60_000);
  return candidate < lotEndsAt ? candidate : lotEndsAt;
}

export function effectiveWaitlistStatus(status: WaitlistStatus, offerExpiresAtValue: Date | null, now: Date): WaitlistStatus {
  if (status === 'OFFERED' && (!offerExpiresAtValue || offerExpiresAtValue <= now)) return 'OFFER_EXPIRED';
  return status;
}

export function waitlistEntryCode(entryId: string): string {
  return `FILA-${createHash('sha256').update(`waitlist:${entryId}`).digest('hex').slice(0, 8).toUpperCase()}`;
}

export function queueOrder(left: { queuedAt: Date; id: string }, right: { queuedAt: Date; id: string }): number {
  const delta = left.queuedAt.getTime() - right.queuedAt.getTime();
  if (delta !== 0) return delta;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
