import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOTEM_LINK_MIN_MINUTES = 30;
export const TOTEM_LINK_MAX_DAYS = 90;

const TOKEN = /^[a-f0-9]{64}$/u;
const FIELDS = new Set(['tokenHash', 'expiresAt', 'issuedAt']);

export class TotemLinkPolicyError extends Error {}

export type TotemLinkRecord = {
  tokenHash: string;
  expiresAt: string;
  issuedAt: string;
};

export type TotemLinkView = {
  state: 'absent' | 'active' | 'expired';
  expiresAt: string | null;
};

export function totemLinkToken(): string {
  return randomBytes(32).toString('hex');
}

export function totemLinkHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function hashesMatch(stored: string, presented: string): boolean {
  if (!TOKEN.test(stored) || !TOKEN.test(presented)) return false;
  return timingSafeEqual(Buffer.from(stored, 'hex'), Buffer.from(presented, 'hex'));
}

export function readTotemLink(config: unknown): TotemLinkRecord | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
  const raw = (config as { totemLink?: unknown }).totemLink;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (Object.keys(record).some((key) => !FIELDS.has(key))) return null;
  if (typeof record.tokenHash !== 'string' || !TOKEN.test(record.tokenHash)) return null;
  if (typeof record.expiresAt !== 'string' || typeof record.issuedAt !== 'string') return null;
  const expiresAt = Date.parse(record.expiresAt);
  const issuedAt = Date.parse(record.issuedAt);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(issuedAt)) return null;
  return {
    tokenHash: record.tokenHash,
    expiresAt: new Date(expiresAt).toISOString(),
    issuedAt: new Date(issuedAt).toISOString(),
  };
}

export function totemLinkView(config: unknown, now: Date): TotemLinkView {
  const record = readTotemLink(config);
  if (!record) return { state: 'absent', expiresAt: null };
  const expiresAt = new Date(record.expiresAt);
  return {
    state: expiresAt.getTime() > now.getTime() ? 'active' : 'expired',
    expiresAt: expiresAt.toISOString(),
  };
}

export function normalizeTotemExpiry(input: unknown, now: Date): Date {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TotemLinkPolicyError('Informe a data de validade do link.');
  }
  const raw = input as Record<string, unknown>;
  if (Object.keys(raw).some((key) => key !== 'expiresAt') || typeof raw.expiresAt !== 'string') {
    throw new TotemLinkPolicyError('Informe a data de validade do link.');
  }
  const expiresAt = new Date(raw.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) throw new TotemLinkPolicyError('Informe a data de validade do link.');
  const earliest = now.getTime() + TOTEM_LINK_MIN_MINUTES * 60_000;
  const latest = now.getTime() + TOTEM_LINK_MAX_DAYS * 24 * 60 * 60_000;
  if (expiresAt.getTime() < earliest) throw new TotemLinkPolicyError('A validade precisa ser de pelo menos 30 minutos.');
  if (expiresAt.getTime() > latest) throw new TotemLinkPolicyError('A validade pode ir até 90 dias.');
  return expiresAt;
}

export function mergeTotemLink(current: unknown, record: TotemLinkRecord | null): Record<string, unknown> {
  const base = current && typeof current === 'object' && !Array.isArray(current)
    ? { ...(current as Record<string, unknown>) }
    : {};
  if (!record) {
    delete base.totemLink;
    return base;
  }
  return { ...base, totemLink: record };
}

export function assessTotemAccess(config: unknown, token: string, now: Date): 'valid' | 'expired' | 'rejected' {
  if (!TOKEN.test(token)) return 'rejected';
  const record = readTotemLink(config);
  if (!record || !hashesMatch(record.tokenHash, totemLinkHash(token))) return 'rejected';
  return new Date(record.expiresAt).getTime() > now.getTime() ? 'valid' : 'expired';
}

/** Sem link, o totem público permanece aberto, mesmo com token antigo. Com link, omitir o token não abre. */
export function totemAccessDecision(config: unknown, token: string | undefined, now: Date): 'open' | 'valid' | 'expired' | 'rejected' {
  const record = readTotemLink(config);
  if (!record) return 'open';
  if (token === undefined || token.trim() === '') return 'rejected';
  return assessTotemAccess(config, token, now);
}
