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

export const SELF_SERVICE_METHODS = ['CPF', 'EMAIL', 'QR'] as const;
export type SelfServiceMethod = (typeof SELF_SERVICE_METHODS)[number];

const SELF_SERVICE_FLAGS = { CPF: 'cpf', EMAIL: 'email', QR: 'qr' } as const;

export function readSelfServiceMethods(config: unknown): SelfServiceMethod[] {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return [];
  const selfService = (config as { selfService?: unknown }).selfService;
  if (!selfService || typeof selfService !== 'object' || Array.isArray(selfService)) return [];
  const record = selfService as Record<string, unknown>;
  return SELF_SERVICE_METHODS.filter((method) => record[SELF_SERVICE_FLAGS[method]] === true);
}

export function mergeSelfServiceConfig(current: unknown, methods: readonly SelfServiceMethod[]): Record<string, unknown> {
  const base = current && typeof current === 'object' && !Array.isArray(current)
    ? { ...(current as Record<string, unknown>) }
    : {};
  const enabled = new Set(methods);
  return {
    ...base,
    selfService: {
      cpf: enabled.has('CPF'),
      email: enabled.has('EMAIL'),
      qr: enabled.has('QR'),
    },
  };
}

export function normalizeSelfServiceMethods(input: unknown): SelfServiceMethod[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new DeskPolicyError('Configuração de autoatendimento inválida.');
  }
  const raw = input as Record<string, unknown>;
  const flags = ['cpf', 'email', 'qr'] as const;
  if (Object.keys(raw).some((key) => !flags.includes(key as typeof flags[number])) || flags.some((flag) => typeof raw[flag] !== 'boolean')) {
    throw new DeskPolicyError('Configuração de autoatendimento inválida.');
  }
  return SELF_SERVICE_METHODS.filter((method) => raw[SELF_SERVICE_FLAGS[method]] === true);
}

function isValidCpf(value: string): boolean {
  if (!/^\d{11}$/u.test(value) || /^(\d)\1{10}$/u.test(value)) return false;
  return [9, 10].every((size) => {
    const sum = Array.from(value.slice(0, size)).reduce((total, digit, index) => total + Number(digit) * (size + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return Number(value[size]) === (remainder === 10 ? 0 : remainder);
  });
}

export function normalizeSelfServiceRequest(input: unknown): { method: SelfServiceMethod; value: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DeskPolicyError('Identificação inválida.');
  const raw = input as Record<string, unknown>;
  if (Object.keys(raw).some((key) => key !== 'method' && key !== 'value') || !SELF_SERVICE_METHODS.includes(raw.method as SelfServiceMethod)) {
    throw new DeskPolicyError('Identificação inválida.');
  }
  const method = raw.method as SelfServiceMethod;
  if (typeof raw.value !== 'string' || raw.value.length > 254) throw new DeskPolicyError('Identificação inválida.');
  if (method === 'CPF') {
    const digits = raw.value.replace(/\D/gu, '');
    if (!isValidCpf(digits)) throw new DeskPolicyError('Informe um CPF válido.');
    return { method, value: digits };
  }
  if (method === 'EMAIL') {
    const email = raw.value.trim().toLowerCase();
    if (email.length > 254 || !EMAIL.test(email)) throw new DeskPolicyError('Informe um e-mail válido.');
    return { method, value: email };
  }
  const code = raw.value.trim();
  if (!/^EVQ1\.[a-z0-9]{10,40}\.[a-f0-9]{64}$/iu.test(code)) throw new DeskPolicyError('QR Code inválido.');
  return { method, value: code };
}
