import { createHash, randomBytes } from 'node:crypto';

export class ShowEntrancePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShowEntrancePolicyError';
  }
}

export const STAFF_CODE = /^EVS1\.[a-f0-9]{32}$/u;
export const TURNSTILE_KEY_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const TURNSTILE_ACTIVE_LIMIT = 3;
export const TURNSTILE_PAGE_LIMIT = 200;
export const CHECK_IN_REPEATED_ACTION = 'registration.check_in_repeated';
export const TURNSTILE_DENIED_MESSAGE = 'Ingresso não autorizado.';

const CURSOR = /^[a-z0-9]{10,40}$/u;
const SLUG = /^[a-z0-9-]{3,80}$/u;
const TICKET_STATUSES = ['ALL', 'PAGO', 'ISENTO', 'CANCELADO'] as const;
const VALIDATION_FILTERS = ['ALL', 'VALIDATED', 'PENDING'] as const;

export type ShowTicketStatus = 'PAGO' | 'ISENTO' | 'CANCELADO';
export type TicketStatusFilter = (typeof TICKET_STATUSES)[number];
export type TicketValidationFilter = (typeof VALIDATION_FILTERS)[number];

export type TurnstileShare = {
  shareName: boolean;
  shareTicketType: boolean;
  shareStatus: boolean;
  shareCode: boolean;
};

export type EntranceCode =
  | { kind: 'STAFF'; code: string }
  | { kind: 'TICKET'; code: string }
  | { kind: 'INVALID' };

export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function issueStaffCode(): { code: string; codeHash: string } {
  const code = `EVS1.${randomBytes(16).toString('hex')}`;
  return { code, codeHash: hashSecret(code) };
}

export function issueTurnstileKey(): { secret: string; keyHash: string; keyHint: string } {
  const secret = `evg_${randomBytes(24).toString('base64url')}`;
  return { secret, keyHash: hashSecret(secret), keyHint: secret.slice(-4) };
}

export function parseTurnstileBearer(authorization: unknown): string | null {
  if (typeof authorization !== 'string') return null;
  const match = /^Bearer (evg_[A-Za-z0-9_-]{32,80})$/u.exec(authorization.trim());
  return match ? match[1] : null;
}

export function normalizePublicSlug(slug: unknown): string | null {
  if (typeof slug !== 'string') return null;
  const normalized = slug.trim().toLowerCase();
  return SLUG.test(normalized) ? normalized : null;
}

export function classifyEntranceCode(code: unknown): EntranceCode {
  if (typeof code !== 'string') return { kind: 'INVALID' };
  const trimmed = code.trim();
  if (trimmed.length < 8 || trimmed.length > 120) return { kind: 'INVALID' };
  if (/^evs1\./iu.test(trimmed)) {
    const staff = `EVS1.${trimmed.slice(5).toLowerCase()}`;
    return STAFF_CODE.test(staff) ? { kind: 'STAFF', code: staff } : { kind: 'INVALID' };
  }
  return { kind: 'TICKET', code: trimmed };
}

export function canManageShowOperations(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';
}

function cleanLabel(value: unknown, min: number, max: number, message: string): string {
  const label = typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : '';
  if (label.length < min || label.length > max) throw new ShowEntrancePolicyError(message);
  return label;
}

export function normalizeStaffIdentity(input: { displayName?: unknown; duty?: unknown }): { displayName: string; duty: string } {
  const displayName = cleanLabel(input?.displayName, 2, 80, 'Informe o nome de exibição da equipe, entre 2 e 80 caracteres.');
  const duty = cleanLabel(input?.duty, 2, 40, 'Informe a função da equipe, entre 2 e 40 caracteres.');
  if (displayName.includes('@') || duty.includes('@')) {
    throw new ShowEntrancePolicyError('Use o nome e a função da equipe, sem e-mail.');
  }
  return { displayName, duty };
}

export function normalizeKeyLabel(value: unknown): string {
  const label = cleanLabel(value, 2, 60, 'Informe um nome para a chave, entre 2 e 60 caracteres.');
  if (label.includes('@')) throw new ShowEntrancePolicyError('O nome da chave não pode ser um e-mail.');
  return label;
}

function flag(value: unknown): boolean | null {
  if (value === undefined) return false;
  if (value === true || value === false) return value;
  return null;
}

export function normalizeTurnstileShare(input: unknown): TurnstileShare {
  if (!input || typeof input !== 'object') {
    throw new ShowEntrancePolicyError('Selecione os dados que a catraca pode receber.');
  }
  const record = input as Record<string, unknown>;
  const shareName = flag(record.shareName);
  const shareTicketType = flag(record.shareTicketType);
  const shareStatus = flag(record.shareStatus);
  const shareCode = flag(record.shareCode);
  if (shareName === null || shareTicketType === null || shareStatus === null || shareCode === null) {
    throw new ShowEntrancePolicyError('Marque os dados da catraca como sim ou não.');
  }
  if (!shareName && !shareTicketType && !shareStatus && !shareCode) {
    throw new ShowEntrancePolicyError('Marque ao menos um dado para a catraca.');
  }
  return { shareName, shareTicketType, shareStatus, shareCode };
}

export function showTicketStatus(input: {
  status: string;
  finalPriceCents: number;
  checkoutStatus: string | null;
}): ShowTicketStatus | null {
  if (input.status === 'CANCELLED') return 'CANCELADO';
  if (input.status !== 'CONFIRMED') return null;
  if (input.finalPriceCents === 0) return 'ISENTO';
  if (input.checkoutStatus === 'PAID' && input.finalPriceCents > 0) return 'PAGO';
  return null;
}

function cleanParticipantName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/gu, ' ');
  if (name.length < 2 || name.length > 120 || name.includes('@')) return null;
  if (/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/u.test(name)) return null;
  return name;
}

export function registrationDisplayName(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  return cleanParticipantName(record.preferred_name) ?? cleanParticipantName(record.full_name);
}

export function projectTurnstileTicket(share: TurnstileShare, ticket: {
  participantName: string | null;
  ticketType: string;
  status: ShowTicketStatus;
  ticketCode: string;
}): Record<string, string> {
  const projected: Record<string, string> = {};
  if (share.shareName && ticket.participantName) projected.participantName = ticket.participantName;
  if (share.shareTicketType) projected.ticketType = ticket.ticketType;
  if (share.shareStatus) projected.status = ticket.status;
  if (share.shareCode && ticket.ticketCode) projected.ticketCode = ticket.ticketCode;
  return projected;
}

export function normalizeCursor(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !CURSOR.test(value)) throw new ShowEntrancePolicyError('Cursor inválido.');
  return value;
}

export function normalizePage(value: unknown): number {
  if (value === undefined || value === null || value === '') return 1;
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,3}$/u.test(value)) {
    throw new ShowEntrancePolicyError('Página inválida.');
  }
  const page = Number(value);
  if (page > 1000) throw new ShowEntrancePolicyError('Página inválida.');
  return page;
}

export function normalizeTicketStatusFilter(value: unknown): TicketStatusFilter {
  if (value === undefined || value === null || value === '') return 'ALL';
  if (typeof value !== 'string' || !TICKET_STATUSES.includes(value as TicketStatusFilter)) {
    throw new ShowEntrancePolicyError('Situação inválida.');
  }
  return value as TicketStatusFilter;
}

export function normalizeTicketValidationFilter(value: unknown): TicketValidationFilter {
  if (value === undefined || value === null || value === '') return 'ALL';
  if (typeof value !== 'string' || !VALIDATION_FILTERS.includes(value as TicketValidationFilter)) {
    throw new ShowEntrancePolicyError('Validação inválida.');
  }
  return value as TicketValidationFilter;
}

const RESOURCE_ID = /^[a-z0-9]{10,40}$/u;

export function normalizeResourceId(value: unknown, message: string): string {
  if (typeof value !== 'string' || !RESOURCE_ID.test(value)) throw new ShowEntrancePolicyError(message);
  return value;
}
