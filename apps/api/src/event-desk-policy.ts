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

export const SELF_SERVICE_METHODS = ['CPF', 'EMAIL', 'QR', 'PROTOCOL'] as const;
export type SelfServiceMethod = (typeof SELF_SERVICE_METHODS)[number];

const SELF_SERVICE_FLAGS = { CPF: 'cpf', EMAIL: 'email', QR: 'qr', PROTOCOL: 'protocol' } as const;

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
      protocol: enabled.has('PROTOCOL'),
    },
  };
}

export function normalizeSelfServiceMethods(input: unknown): SelfServiceMethod[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new DeskPolicyError('Configuração de autoatendimento inválida.');
  }
  const raw = input as Record<string, unknown>;
  const required = ['cpf', 'email', 'qr'] as const;
  const optional = ['protocol'] as const;
  const allowed = new Set<string>([...required, ...optional]);
  if (Object.keys(raw).some((key) => !allowed.has(key)) || required.some((flag) => typeof raw[flag] !== 'boolean')) {
    throw new DeskPolicyError('Configuração de autoatendimento inválida.');
  }
  if (raw.protocol !== undefined && typeof raw.protocol !== 'boolean') {
    throw new DeskPolicyError('Configuração de autoatendimento inválida.');
  }
  return SELF_SERVICE_METHODS.filter((method) => raw[SELF_SERVICE_FLAGS[method]] === true);
}

export function normalizeSelfServiceDocument(value: string): string {
  const document = value.trim().replace(/[ .\/-]/gu, '').toUpperCase();
  if (!/^[A-Z0-9]{5,40}$/u.test(document)) throw new DeskPolicyError('Informe um CPF ou passaporte válido.');
  // A ficha também recusa 11 dígitos que não formam CPF válido, então nenhum passaporte assim chega ao hash.
  if (/^\d{11}$/u.test(document) && !isValidCpf(document)) throw new DeskPolicyError('Informe um CPF válido.');
  return document;
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
    return { method, value: normalizeSelfServiceDocument(raw.value) };
  }
  if (method === 'EMAIL') {
    const email = raw.value.trim().toLowerCase();
    if (email.length > 254 || !EMAIL.test(email)) throw new DeskPolicyError('Informe um e-mail válido.');
    return { method, value: email };
  }
  if (method === 'PROTOCOL') {
    const protocol = raw.value.trim().toUpperCase();
    if (!PROTOCOL.test(protocol)) throw new DeskPolicyError('Informe o número da inscrição.');
    return { method, value: protocol };
  }
  const code = raw.value.trim();
  if (!/^EVQ1\.[a-z0-9]{10,40}\.[a-f0-9]{64}$/iu.test(code) && !/^EVB1\.[a-z0-9]{10,40}\.[a-f0-9]{16}$/iu.test(code)) {
    throw new DeskPolicyError('QR Code inválido.');
  }
  return { method, value: code };
}

export const LABEL_PRESETS = {
  '4x2': { widthMm: 40, heightMm: 20 },
  '6x3': { widthMm: 60, heightMm: 30 },
  '8x3': { widthMm: 80, heightMm: 30 },
  '9x4': { widthMm: 90, heightMm: 40 },
  '10x5': { widthMm: 100, heightMm: 50 },
} as const;
export type LabelPreset = keyof typeof LABEL_PRESETS | 'custom';
export type LabelCodeMode = 'QR' | 'BARCODE' | 'BOTH';
export type LabelConfig = {
  preset: LabelPreset;
  widthMm: number;
  heightMm: number;
  showName: boolean;
  nameField: string;
  showCompany: boolean;
  companyField: string;
  extraFields: string[];
  showCategory: boolean;
  codeMode: LabelCodeMode;
};

const LABEL_FIELD = /^[a-z][a-z0-9_]{1,63}$/u;
const BLOCKED_LABEL_FIELDS = new Set([
  'identity_document', 'email', 'phone', 'cnpj', 'birth_date', 'sex', 'participant_photo',
  'professional_registration', 'postal_code', 'street', 'address_number', 'address_complement',
  'district', 'terms_acceptance', 'registration_type', 'event_communications_consent',
  'future_communications_consent', 'image_use_consent',
]);

export function labelFieldAllowed(code: string): boolean {
  return LABEL_FIELD.test(code) && !BLOCKED_LABEL_FIELDS.has(code);
}

export function defaultLabelConfig(): LabelConfig {
  // Ciclo 04 / P0 fundador: novas categorias e eventos nascem em 8×3 cm.
  // Modelos personalizados já persistidos continuam intactos via readLabelConfig.
  return {
    preset: '8x3',
    ...LABEL_PRESETS['8x3'],
    showName: true,
    nameField: 'preferred_name',
    showCompany: true,
    companyField: 'institution',
    extraFields: ['city_state'],
    showCategory: true,
    codeMode: 'QR',
  };
}

export function readLabelConfig(config: unknown): LabelConfig {
  const defaults = defaultLabelConfig();
  if (!config || typeof config !== 'object' || Array.isArray(config)) return defaults;
  const { label, categoryLabelTemplates } = config as { label?: unknown; categoryLabelTemplates?: unknown };
  const hasSavedTemplate = Array.isArray(categoryLabelTemplates) && categoryLabelTemplates.length > 0;
  if (!label && !hasSavedTemplate) return defaults;
  // Existing layouts may rely on the old implicit paper or omit extraFields.
  const legacy = { ...defaults, preset: '9x4' as const, ...LABEL_PRESETS['9x4'], extraFields: [] };
  if (!label || typeof label !== 'object' || Array.isArray(label)) return legacy;
  try {
    // Old printer settings may predate extraFields or other optional controls.
    // Hydrate only known keys on READ: a missing key must not reset valid
    // historical name/company fields, paper size, category or barcode mode.
    // Writes still use the strict normalizeLabelConfig contract below.
    const stored = label as Record<string, unknown>;
    const hydrated: Record<string, unknown> = { ...legacy };
    for (const key of Object.keys(defaults)) {
      if (Object.prototype.hasOwnProperty.call(stored, key)) hydrated[key] = stored[key];
    }
    return normalizeLabelConfig(hydrated);
  } catch {
    return legacy;
  }
}

export function normalizeLabelConfig(input: unknown): LabelConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DeskPolicyError('Configuração da etiqueta inválida.');
  const raw = input as Record<string, unknown>;
  const allowed = new Set(['preset', 'widthMm', 'heightMm', 'showName', 'nameField', 'showCompany', 'companyField', 'extraFields', 'showCategory', 'codeMode']);
  if (Object.keys(raw).some((key) => !allowed.has(key))) throw new DeskPolicyError('Configuração da etiqueta inválida.');
  if (typeof raw.preset !== 'string' || (raw.preset !== 'custom' && !Object.hasOwn(LABEL_PRESETS, raw.preset))) {
    throw new DeskPolicyError('Tamanho da etiqueta inválido.');
  }
  const preset = raw.preset as LabelPreset;
  const size = preset === 'custom'
    ? { widthMm: raw.widthMm, heightMm: raw.heightMm }
    : LABEL_PRESETS[preset];
  const widthMm = Number(size.widthMm);
  const heightMm = Number(size.heightMm);
  if (!Number.isInteger(widthMm) || !Number.isInteger(heightMm) || widthMm < 30 || widthMm > 120 || heightMm < 15 || heightMm > 80) {
    throw new DeskPolicyError('A etiqueta personalizada precisa ter entre 3×1,5 cm e 12×8 cm.');
  }
  const nameField = typeof raw.nameField === 'string' ? raw.nameField : '';
  const companyField = typeof raw.companyField === 'string' ? raw.companyField : '';
  if (!labelFieldAllowed(nameField) || !labelFieldAllowed(companyField)) throw new DeskPolicyError('Escolha campos da ficha que podem sair na etiqueta.');
  if (!Array.isArray(raw.extraFields) || raw.extraFields.length > 2 || raw.extraFields.some((field) => typeof field !== 'string' || !labelFieldAllowed(field))) {
    throw new DeskPolicyError('Escolha até dois campos da ficha para as linhas da etiqueta.');
  }
  const extraFields = [...new Set(raw.extraFields)];
  if (extraFields.includes(nameField) || extraFields.includes(companyField)) throw new DeskPolicyError('Use cada campo uma única vez na etiqueta.');
  if (typeof raw.showName !== 'boolean' || typeof raw.showCompany !== 'boolean' || typeof raw.showCategory !== 'boolean') {
    throw new DeskPolicyError('Configuração da etiqueta inválida.');
  }
  if (raw.codeMode !== 'QR' && raw.codeMode !== 'BARCODE' && raw.codeMode !== 'BOTH') throw new DeskPolicyError('Escolha o código da etiqueta.');
  return {
    preset,
    widthMm,
    heightMm,
    showName: raw.showName,
    nameField,
    showCompany: raw.showCompany,
    companyField,
    extraFields,
    showCategory: raw.showCategory,
    codeMode: raw.codeMode,
  };
}

export function mergeLabelConfig(current: unknown, label: LabelConfig): Record<string, unknown> {
  const base = current && typeof current === 'object' && !Array.isArray(current)
    ? { ...(current as Record<string, unknown>) }
    : {};
  // Updating printer controls must not silently erase unknown historical
  // keys that may still be used by older label configurations. The current
  // contract is validated before this merge; legacy keys remain inert here.
  const previous = base.label && typeof base.label === 'object' && !Array.isArray(base.label)
    ? base.label as Record<string, unknown>
    : {};
  return { ...base, label: { ...previous, ...label } };
}

function labelValue(data: Record<string, unknown>, code: string): string {
  const value = data[code];
  // Never truncate the historical label path before layout can measure it.
  // The shared renderer scales text and warns about unreadable paper sizes.
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (code === 'institution') {
    const company = [data.company, data.company_name, data.organization]
      .find((candidate): candidate is string => typeof candidate === 'string' && Boolean(candidate.trim()));
    if (company) return company.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (code === 'city_state') {
    return [labelValue(data, 'city'), labelValue(data, 'state')].filter(Boolean).join(' / ');
  }
  return '';
}

export function labelText(data: unknown, categoryName: string, config: LabelConfig) {
  const record = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
  const named = labelValue(record, config.nameField) || deskDisplayName(data);
  return {
    name: config.showName ? named : null,
    company: config.showCompany ? labelValue(record, config.companyField) || null : null,
    lines: config.extraFields.map((field) => labelValue(record, field)).filter((line) => line.length > 0),
    category: config.showCategory ? categoryName : null,
  };
}


