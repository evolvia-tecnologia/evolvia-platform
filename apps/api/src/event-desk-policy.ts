export type DeskSearchKind = 'NAME' | 'EMAIL' | 'DOCUMENT' | 'PROTOCOL';

export type DeskSearchInput = { kind: DeskSearchKind; value: string };

export class DeskPolicyError extends Error {}

const KINDS = new Set<DeskSearchKind>(['NAME', 'EMAIL', 'DOCUMENT', 'PROTOCOL']);
const PROTOCOL = /^EVO-[A-F0-9]{16}$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const RESERVATION_ID = /^[a-z0-9]{10,40}$/u;
const ACTIVITY_ID = /^[a-z0-9]{10,40}$/u;

const OPERATIONAL = ['credential', 'access_control', 'material_delivery', 'registration'] as const;
export type OperationalCapability = (typeof OPERATIONAL)[number];

export function operationalCapabilities(active: readonly string[]): OperationalCapability[] {
  const enabled = new Set(active);
  return OPERATIONAL.filter((code) => enabled.has(code));
}

export function deskAllows(active: readonly string[], capability: OperationalCapability): boolean {
  return operationalCapabilities(active).includes(capability);
}

export function deskSearchAllowed(active: readonly string[]): boolean {
  return operationalCapabilities(active).some((code) => code === 'credential' || code === 'access_control' || code === 'material_delivery');
}

export function normalizeDeskSearch(input: unknown): DeskSearchInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DeskPolicyError('Busca inválida.');
  const raw = input as Record<string, unknown>;
  if (Object.keys(raw).some((key) => key !== 'kind' && key !== 'value') || !KINDS.has(raw.kind as DeskSearchKind) || typeof raw.value !== 'string' || raw.value.length > 254) {
    throw new DeskPolicyError('Busca inválida.');
  }
  const kind = raw.kind as DeskSearchKind;
  const value = raw.value.trim();
  if (kind === 'NAME') {
    const name = value.replace(/\s+/gu, ' ');
    if (!/^[\p{L}\p{M} .'-]{3,80}$/u.test(name) || (name.match(/\p{L}/gu)?.length ?? 0) < 3) {
      throw new DeskPolicyError('Informe ao menos três letras do nome.');
    }
    return { kind, value: name };
  }
  if (kind === 'EMAIL') {
    const email = value.toLowerCase();
    if (email.length > 254 || !EMAIL.test(email)) throw new DeskPolicyError('E-mail inválido.');
    return { kind, value: email };
  }
  if (kind === 'DOCUMENT') {
    if (!/^[A-Za-z0-9 ./-]{5,50}$/u.test(value)) throw new DeskPolicyError('Documento inválido.');
    const document = value.replace(/[ ./-]/gu, '').toUpperCase();
    if (document.length < 5 || document.length > 40) throw new DeskPolicyError('Documento inválido.');
    return { kind, value: document };
  }
  const protocol = value.toUpperCase();
  if (!PROTOCOL.test(protocol)) throw new DeskPolicyError('Protocolo inválido.');
  return { kind, value: protocol };
}

export function normalizeReservationId(value: unknown): string {
  if (typeof value !== 'string' || !RESERVATION_ID.test(value)) throw new DeskPolicyError('Inscrição inválida.');
  return value;
}

export function normalizeActivityId(value: unknown): string {
  if (typeof value !== 'string' || !ACTIVITY_ID.test(value)) throw new DeskPolicyError('Atividade inválida.');
  return value;
}

export function deskDisplayName(data: unknown): string {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Participante';
  const record = data as Record<string, unknown>;
  const preferred = typeof record.preferred_name === 'string' ? record.preferred_name.trim() : '';
  const full = typeof record.full_name === 'string' ? record.full_name.trim() : '';
  const name = preferred || full;
  if (name.length < 2 || name.length > 180) return 'Participante';
  return name;
}

export function deskCanConfirmFreeRegistration(finalPriceCents: number): boolean {
  return finalPriceCents === 0;
}
