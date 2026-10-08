import { isIP } from 'node:net';

export const COMPANY_KINDS = ['EXHIBITOR', 'PROVIDER'] as const;
export const NATIONALITIES = ['BRAZILIAN', 'FOREIGN'] as const;
export const CREDENTIAL_KINDS = ['EXHIBITOR', 'ASSEMBLER', 'SERVICE'] as const;
export const ORDER_STATUSES = ['REQUESTED', 'CONFIRMED', 'CANCELLED'] as const;
export const FORM_AUDIENCES = ['EXHIBITOR', 'PROVIDER', 'BOTH'] as const;
export const FORM_KINDS = ['CREDENTIAL', 'REQUEST', 'DOCUMENT'] as const;

export type CompanyKind = (typeof COMPANY_KINDS)[number];
export type Nationality = (typeof NATIONALITIES)[number];
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type FormAudience = (typeof FORM_AUDIENCES)[number];
export type FormKind = (typeof FORM_KINDS)[number];

export class ExhibitorPolicyError extends Error {}

export const EXHIBITOR_ACCESS_DENIED = 'Não foi possível abrir a área do expositor.';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const ID = /^[a-z0-9]{10,40}$/u;

export type ExhibitorCompanyDraft = {
  id: string | null;
  kind: CompanyKind;
  nationality: Nationality;
  document: string;
  loginEmail: string;
  legalName: string;
  tradeName: string;
  segment: string;
  booth: string;
  areaLabel: string;
  quotaExhibitor: number;
  quotaAssembler: number;
  quotaService: number;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  postalCode: string;
  street: string;
  addressNumber: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  country: string;
  phone: string;
};

export type ExhibitorCredentialDraft = {
  id: string | null;
  companyId: string;
  kind: CredentialKind;
  nationality: Nationality;
  document: string;
  fullName: string;
  badgeName: string;
  role: string;
  phone: string;
  mobile: string;
};

const COMPANY_KEYS = [
  'id', 'kind', 'nationality', 'document', 'loginEmail', 'legalName', 'tradeName', 'segment', 'booth', 'areaLabel',
  'quotaExhibitor', 'quotaAssembler', 'quotaService', 'contactName', 'contactRole', 'contactEmail',
  'postalCode', 'street', 'addressNumber', 'complement', 'district', 'city', 'state', 'country', 'phone',
] as const;

export function isValidCnpj(value: string): boolean {
  if (!/^\d{14}$/u.test(value) || /^(\d)\1{13}$/u.test(value)) return false;
  const digit = (size: number) => {
    let sum = 0;
    let weight = size - 7;
    for (let index = 0; index < size; index += 1) {
      sum += Number(value[index]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return digit(12) === Number(value[12]) && digit(13) === Number(value[13]);
}

export function isValidCpf(value: string): boolean {
  if (!/^\d{11}$/u.test(value) || /^(\d)\1{10}$/u.test(value)) return false;
  return [9, 10].every((size) => {
    const sum = Array.from(value.slice(0, size)).reduce((total, item, index) => total + Number(item) * (size + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return Number(value[size]) === (remainder === 10 ? 0 : remainder);
  });
}

export function quotaFor(kind: CredentialKind, quotas: { quotaExhibitor: number; quotaAssembler: number; quotaService: number }): number {
  if (kind === 'EXHIBITOR') return quotas.quotaExhibitor;
  if (kind === 'ASSEMBLER') return quotas.quotaAssembler;
  return quotas.quotaService;
}

export function normalizeExhibitorCompany(input: unknown): ExhibitorCompanyDraft {
  const raw = object(input, COMPANY_KEYS, 'Ficha do expositor inválida.');
  const kind = oneOf(raw.kind, COMPANY_KINDS, 'Escolha expositor ou prestador.');
  const nationality = oneOf(raw.nationality, NATIONALITIES, 'Escolha empresa brasileira ou estrangeira.');
  const quotas = {
    quotaExhibitor: count(raw.quotaExhibitor, 'Cota de crachá inválida.'),
    quotaAssembler: count(raw.quotaAssembler, 'Cota de crachá inválida.'),
    quotaService: count(raw.quotaService, 'Cota de crachá inválida.'),
  };
  if (kind === 'PROVIDER' && quotas.quotaExhibitor !== 0) {
    throw new ExhibitorPolicyError('Prestador não recebe cota de crachá de expositor.');
  }
  const segment = kind === 'PROVIDER'
    ? requiredText(raw.segment, 2, 80, 'Informe o segmento do prestador.')
    : '';
  if (kind === 'EXHIBITOR' && raw.segment !== undefined && raw.segment !== '') {
    throw new ExhibitorPolicyError('Expositor não usa segmento de prestador.');
  }
  return {
    id: optionalId(raw.id),
    kind,
    nationality,
    document: companyDocument(raw.document, nationality),
    loginEmail: email(raw.loginEmail, 'Informe o e-mail de acesso.'),
    legalName: requiredText(raw.legalName, 2, 160, 'Informe a razão social.'),
    tradeName: requiredText(raw.tradeName, 2, 160, 'Informe o nome fantasia.'),
    segment,
    booth: optionalText(raw.booth, 40),
    areaLabel: optionalText(raw.areaLabel, 40),
    ...quotas,
    contactName: requiredText(raw.contactName, 2, 80, 'Informe o nome do contato.'),
    contactRole: requiredText(raw.contactRole, 2, 60, 'Informe o cargo do contato.'),
    contactEmail: email(raw.contactEmail, 'Informe o e-mail do contato.'),
    postalCode: optionalText(raw.postalCode, 12),
    street: optionalText(raw.street, 80),
    addressNumber: optionalText(raw.addressNumber, 20),
    complement: optionalText(raw.complement, 40),
    district: optionalText(raw.district, 60),
    city: optionalText(raw.city, 60),
    state: optionalText(raw.state, 40),
    country: optionalText(raw.country, 60),
    phone: optionalText(raw.phone, 20),
  };
}

export function normalizeExhibitorCredential(input: unknown): ExhibitorCredentialDraft {
  const raw = object(input, ['id', 'companyId', 'kind', 'nationality', 'document', 'fullName', 'badgeName', 'role', 'phone', 'mobile'], 'Credencial inválida.');
  const nationality = oneOf(raw.nationality, NATIONALITIES, 'Escolha brasileiro ou estrangeiro.');
  if (typeof raw.companyId !== 'string' || !ID.test(raw.companyId)) throw new ExhibitorPolicyError('Empresa inválida.');
  return {
    id: optionalId(raw.id),
    companyId: raw.companyId,
    kind: oneOf(raw.kind, CREDENTIAL_KINDS, 'Escolha expositor, montador ou serviço.'),
    nationality,
    document: personDocument(raw.document, nationality),
    fullName: requiredText(raw.fullName, 2, 80, 'Informe o nome completo.'),
    badgeName: requiredText(raw.badgeName, 2, 40, 'Informe o nome do crachá.'),
    role: requiredText(raw.role, 2, 60, 'Informe o cargo.'),
    phone: optionalText(raw.phone, 20),
    mobile: optionalText(raw.mobile, 20),
  };
}

export function normalizeExhibitorForm(input: unknown): {
  id: string | null;
  sortOrder: number;
  title: string;
  active: boolean;
  required: boolean;
  deadline: string | null;
  audience: FormAudience;
  kind: FormKind;
  credentialKind: CredentialKind | null;
  pdfUrl: string;
  wordUrl: string;
} {
  const raw = object(input, ['id', 'sortOrder', 'title', 'active', 'required', 'deadline', 'audience', 'kind', 'credentialKind', 'pdfUrl', 'wordUrl'], 'Formulário inválido.');
  const kind = oneOf(raw.kind, FORM_KINDS, 'Escolha credencial, solicitação ou documento.');
  const credentialKind = raw.credentialKind === undefined || raw.credentialKind === null || raw.credentialKind === ''
    ? null
    : oneOf(raw.credentialKind, CREDENTIAL_KINDS, 'Escolha o tipo de crachá deste formulário.');
  if (kind !== 'CREDENTIAL' && credentialKind) throw new ExhibitorPolicyError('Só o formulário de credencial escolhe o tipo de crachá.');
  return {
    id: optionalId(raw.id),
    sortOrder: sortOrder(raw.sortOrder),
    title: requiredText(raw.title, 2, 120, 'Informe a descrição do formulário.'),
    active: flag(raw.active, 'Informe se o formulário está ativo.'),
    required: flag(raw.required, 'Informe se o formulário é obrigatório.'),
    deadline: calendarDate(raw.deadline),
    audience: oneOf(raw.audience, FORM_AUDIENCES, 'Escolha expositor, prestador ou ambos.'),
    kind,
    credentialKind,
    pdfUrl: optionalHttps(raw.pdfUrl),
    wordUrl: optionalHttps(raw.wordUrl),
  };
}

export function normalizeExhibitorProduct(input: unknown): { id: string | null; formId: string; title: string; unit: string; priceCents: number; active: boolean } {
  const raw = object(input, ['id', 'formId', 'title', 'unit', 'priceCents', 'active'], 'Produto inválido.');
  if (typeof raw.formId !== 'string' || !ID.test(raw.formId)) throw new ExhibitorPolicyError('Escolha o formulário do produto.');
  if (typeof raw.priceCents !== 'number' || !Number.isInteger(raw.priceCents) || raw.priceCents < 0 || raw.priceCents > 10_000_000) {
    throw new ExhibitorPolicyError('Informe o valor em centavos.');
  }
  return {
    id: optionalId(raw.id),
    formId: raw.formId,
    title: requiredText(raw.title, 2, 80, 'Informe a descrição do produto.'),
    unit: requiredText(raw.unit, 1, 20, 'Informe a medida.'),
    priceCents: raw.priceCents,
    active: raw.active === undefined ? true : flag(raw.active, 'Informe se o produto está disponível.'),
  };
}

export function normalizeExhibitorDownload(input: unknown): { id: string | null; title: string; url: string } {
  const raw = object(input, ['id', 'title', 'url'], 'Download inválido.');
  return { id: optionalId(raw.id), title: requiredText(raw.title, 2, 80, 'Informe a descrição do arquivo.'), url: httpsLink(raw.url) };
}

export function normalizeExhibitorOrder(input: unknown): { productId: string; quantity: number } {
  const raw = object(input, ['productId', 'quantity'], 'Pedido inválido.');
  if (typeof raw.productId !== 'string' || !ID.test(raw.productId)) throw new ExhibitorPolicyError('Produto inválido.');
  const quantity = count(raw.quantity, 'Quantidade inválida.');
  if (quantity < 1) throw new ExhibitorPolicyError('Quantidade inválida.');
  return { productId: raw.productId, quantity };
}

export function normalizeOrganizerExhibitorOrder(input: unknown): { companyId: string; productId: string; quantity: number } {
  const raw = object(input, ['companyId', 'productId', 'quantity'], 'Pedido inválido.');
  if (typeof raw.companyId !== 'string' || !ID.test(raw.companyId)) throw new ExhibitorPolicyError('Empresa inválida.');
  return { companyId: raw.companyId, ...normalizeExhibitorOrder({ productId: raw.productId, quantity: raw.quantity }) };
}

export function normalizeExhibitorOrderStatus(input: unknown): OrderStatus {
  const raw = object(input, ['status'], 'Situação do pedido inválida.');
  return oneOf(raw.status, ORDER_STATUSES, 'Escolha solicitado, confirmado ou cancelado.');
}

export function normalizeCredentialAttendance(input: unknown): { credentialed: boolean; printed: boolean } {
  const raw = object(input, ['credentialed', 'printed'], 'Baixa da credencial inválida.');
  return {
    credentialed: flag(raw.credentialed, 'Informe se a pessoa foi credenciada.'),
    printed: flag(raw.printed, 'Informe se o crachá foi impresso.'),
  };
}

export function normalizeExhibitorRepresentative(input: unknown): { name: string; role: string; email: string } {
  const raw = object(input, ['name', 'role', 'email'], 'Representante inválido.');
  return {
    name: requiredText(raw.name, 2, 80, 'Informe o nome do representante.'),
    role: requiredText(raw.role, 2, 60, 'Informe o cargo do representante.'),
    email: email(raw.email, 'Informe o e-mail do representante.'),
  };
}

export function normalizeExhibitorMessage(input: unknown): { subject: string; body: string } {
  const raw = object(input, ['subject', 'body'], 'Mensagem inválida.');
  return {
    subject: requiredText(raw.subject, 2, 80, 'Informe o assunto.'),
    body: requiredText(raw.body, 2, 1000, 'Informe a mensagem.'),
  };
}

export function normalizeExhibitorAccess(input: unknown): { email: string; document: string } {
  const raw = object(input, ['email', 'document'], EXHIBITOR_ACCESS_DENIED);
  const address = email(raw.email, EXHIBITOR_ACCESS_DENIED);
  const document = accessDocument(raw.document);
  return { email: address, document };
}

export function normalizeOwnCompanyProfile(input: unknown): Pick<ExhibitorCompanyDraft, 'contactName' | 'contactRole' | 'contactEmail' | 'postalCode' | 'street' | 'addressNumber' | 'complement' | 'district' | 'city' | 'state' | 'country' | 'phone'> {
  const raw = object(input, ['contactName', 'contactRole', 'contactEmail', 'postalCode', 'street', 'addressNumber', 'complement', 'district', 'city', 'state', 'country', 'phone'], 'Dados da empresa inválidos.');
  return {
    contactName: requiredText(raw.contactName, 2, 80, 'Informe o nome do contato.'),
    contactRole: requiredText(raw.contactRole, 2, 60, 'Informe o cargo do contato.'),
    contactEmail: email(raw.contactEmail, 'Informe o e-mail do contato.'),
    postalCode: optionalText(raw.postalCode, 12),
    street: optionalText(raw.street, 80),
    addressNumber: optionalText(raw.addressNumber, 20),
    complement: optionalText(raw.complement, 40),
    district: optionalText(raw.district, 60),
    city: optionalText(raw.city, 60),
    state: optionalText(raw.state, 40),
    country: optionalText(raw.country, 60),
    phone: optionalText(raw.phone, 20),
  };
}

function object(input: unknown, keys: readonly string[], message: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ExhibitorPolicyError(message);
  const raw = input as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !keys.includes(key))) throw new ExhibitorPolicyError(message);
  return raw;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], message: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new ExhibitorPolicyError(message);
  return value as T;
}

function optionalId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !ID.test(value)) throw new ExhibitorPolicyError('Identificador inválido.');
  return value;
}

function count(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 999) throw new ExhibitorPolicyError(message);
  return value;
}

function requiredText(value: unknown, min: number, max: number, message: string): string {
  const text = plain(value, max);
  if (text.length < min) throw new ExhibitorPolicyError(message);
  return text;
}

function optionalText(value: unknown, max: number): string {
  if (value === undefined || value === null || value === '') return '';
  return plain(value, max);
}

function plain(value: unknown, max: number): string {
  if (typeof value !== 'string') throw new ExhibitorPolicyError('Texto inválido.');
  const text = value.trim().replace(/\s+/gu, ' ');
  if (text.length > max || /[<>\u0000]/u.test(text)) throw new ExhibitorPolicyError('Texto inválido.');
  return text;
}

function email(value: unknown, message: string): string {
  if (typeof value !== 'string') throw new ExhibitorPolicyError(message);
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254 || !EMAIL.test(normalized) || /[<>\u0000]/u.test(normalized)) throw new ExhibitorPolicyError(message);
  return normalized;
}

function companyDocument(value: unknown, nationality: Nationality): string {
  if (typeof value !== 'string') throw new ExhibitorPolicyError('Informe o documento da empresa.');
  if (nationality === 'BRAZILIAN') {
    const digits = value.replace(/\D/gu, '');
    if (!isValidCnpj(digits)) throw new ExhibitorPolicyError('Informe um CNPJ válido.');
    return digits;
  }
  const foreign = value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, '');
  if (foreign.length < 5 || foreign.length > 40) throw new ExhibitorPolicyError('Informe o documento da empresa estrangeira.');
  return foreign;
}

function personDocument(value: unknown, nationality: Nationality): string {
  if (typeof value !== 'string') throw new ExhibitorPolicyError('Informe o documento da pessoa.');
  if (nationality === 'BRAZILIAN') {
    const digits = value.replace(/\D/gu, '');
    if (!isValidCpf(digits)) throw new ExhibitorPolicyError('Informe um CPF válido.');
    return digits;
  }
  const passport = value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, '');
  if (passport.length < 5 || passport.length > 20) throw new ExhibitorPolicyError('Informe o passaporte.');
  return passport;
}

function sortOrder(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 999) {
    throw new ExhibitorPolicyError('Informe a ordenação de 1 a 999.');
  }
  return value;
}

function calendarDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new ExhibitorPolicyError('Informe o prazo.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new ExhibitorPolicyError('Informe o prazo.');
  }
  return value;
}

function optionalHttps(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  return httpsLink(value);
}

function flag(value: unknown, message: string): boolean {
  if (typeof value !== 'boolean') throw new ExhibitorPolicyError(message);
  return value;
}

function accessDocument(value: unknown): string {
  if (typeof value !== 'string') throw new ExhibitorPolicyError(EXHIBITOR_ACCESS_DENIED);
  const digits = value.replace(/\D/gu, '');
  if (digits.length === 14 && isValidCnpj(digits)) return digits;
  const foreign = value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, '');
  if (foreign.length < 5 || foreign.length > 40) throw new ExhibitorPolicyError(EXHIBITOR_ACCESS_DENIED);
  return foreign;
}

function httpsLink(value: unknown): string {
  if (typeof value !== 'string' || value.length > 500) throw new ExhibitorPolicyError('Informe um link https.');
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new ExhibitorPolicyError('Informe um link https.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new ExhibitorPolicyError('O arquivo precisa ser um link https.');
  const host = url.hostname.toLowerCase();
  if (isIP(host.replace(/^\[|\]$/gu, '')) !== 0 || !/^[a-z0-9.-]+$/u.test(host) || host.endsWith('.') || host.includes('..') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.')) {
    throw new ExhibitorPolicyError('Informe um endereço público.');
  }
  return url.toString();
}


export function exhibitorDeadlineClosed(deadline: Date | null, now: Date = new Date()): boolean {
  if (!deadline) return false;
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  const currentDate = `${part('year')}-${part('month')}-${part('day')}`;
  return deadline.toISOString().slice(0, 10) < currentDate;
}

