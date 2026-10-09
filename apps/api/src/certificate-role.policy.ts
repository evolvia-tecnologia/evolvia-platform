export class CertificateRolePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CertificateRolePolicyError';
  }
}

export const CERTIFICATE_ROLES = ['activity', 'approved_submission', 'presentation', 'guest', 'reviewer'] as const;
export type CertificateRole = (typeof CERTIFICATE_ROLES)[number];
export const CERTIFICATE_RELEASE_MODES = ['manual', 'after_end'] as const;
export type CertificateReleaseMode = (typeof CERTIFICATE_RELEASE_MODES)[number];
export const ROLE_CERTIFICATE_BATCH_MAX = 40;

const ROLE_SET = new Set<string>(CERTIFICATE_ROLES);
const UNSAFE = /[<>\u0000-\u001f\u007f]/;
const TAG = /\{([A-Za-z0-9_]+)\}/g;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const ACCEPTED = new Set(['ACCEPTED', 'ACCEPTED_WITH_CHANGES']);

const ROLE_TAGS: Record<CertificateRole, readonly string[]> = {
  activity: ['NOME', 'EVENTO', 'CARGA_HORARIA', 'DATA', 'CODIGO', 'ATIVIDADE'],
  approved_submission: ['NOME', 'EVENTO', 'CARGA_HORARIA', 'DATA', 'CODIGO', 'TITULO', 'PAPEL'],
  presentation: ['NOME', 'EVENTO', 'CARGA_HORARIA', 'DATA', 'CODIGO', 'TITULO', 'PAPEL'],
  guest: ['NOME', 'EVENTO', 'CARGA_HORARIA', 'DATA', 'CODIGO', 'PAPEL'],
  reviewer: ['NOME', 'EVENTO', 'CARGA_HORARIA', 'DATA', 'CODIGO', 'PAPEL'],
};

export const ROLE_CERTIFICATE_LABEL: Record<CertificateRole, string> = {
  activity: 'Atividade',
  approved_submission: 'Submissão aprovada',
  presentation: 'Apresentação',
  guest: 'Convidado',
  reviewer: 'Avaliador',
};

export const DEFAULT_ROLE_TITLE: Record<CertificateRole, string> = {
  activity: 'Certificado de atividade',
  approved_submission: 'Certificado de trabalho',
  presentation: 'Certificado de apresentação',
  guest: 'Certificado de convidado',
  reviewer: 'Certificado de avaliador',
};

export const DEFAULT_ROLE_BODY: Record<CertificateRole, string> = {
  activity: 'Certificamos que **{NOME}** participou da atividade **{ATIVIDADE}** em **{EVENTO}**.',
  approved_submission: 'Certificamos que **{NOME}**, na condição de **{PAPEL}**, teve o trabalho **{TITULO}** aprovado em **{EVENTO}**.',
  presentation: 'Certificamos que **{NOME}** apresentou **{TITULO}** em **{EVENTO}**.',
  guest: 'Certificamos que **{NOME}** participou como convidado de **{EVENTO}**.',
  reviewer: 'Certificamos que **{NOME}** atuou como avaliador em **{EVENTO}**.',
};

export function certificateRoleFeeCents(): 0 {
  return 0;
}

export function parseCertificateRole(value: unknown): CertificateRole {
  if (typeof value !== 'string' || !ROLE_SET.has(value)) {
    throw new CertificateRolePolicyError('Este papel de certificado não existe.');
  }
  return value as CertificateRole;
}

export function normalizeRoleSetting(role: CertificateRole, input: unknown): {
  enabled: boolean;
  releaseMode: CertificateReleaseMode;
  releaseDays: number;
  hours: number | null;
  title: string;
  body: string;
  expectedRevision: number;
} {
  parseCertificateRole(role);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CertificateRolePolicyError('Informe a liberação deste papel.');
  }
  const record = input as Record<string, unknown>;
  if (record.role !== undefined && record.role !== role) {
    throw new CertificateRolePolicyError('O papel do certificado não pode ser trocado neste pedido.');
  }
  return {
    enabled: normalizeEnabled(record.enabled),
    releaseMode: normalizeReleaseMode(record.releaseMode),
    releaseDays: normalizeReleaseDays(record.releaseDays),
    hours: normalizeHours(record.hours),
    title: normalizeTemplate(role, record.title, 'título', 240, DEFAULT_ROLE_TITLE[role]),
    body: normalizeTemplate(role, record.body, 'texto', 4000, DEFAULT_ROLE_BODY[role]),
    expectedRevision: expectedRevision(record.expectedRevision),
  };
}

export function canReleaseRole(input: {
  enabled: boolean;
  releaseMode: CertificateReleaseMode;
  releaseDays: number;
  eventEndDate: Date | null;
  now: Date;
}): boolean {
  if (input.enabled !== true) return false;
  if (input.releaseMode === 'manual') return true;
  if (!input.eventEndDate || Number.isNaN(input.eventEndDate.getTime()) || Number.isNaN(input.now.getTime())) return false;
  const openDay = addDays(saoPauloDay(input.eventEndDate), input.releaseDays);
  return saoPauloDay(input.now) >= openDay;
}

export function canIssueActivityCertificate(input: { releaseOpen: boolean; status: string; hasAccess: boolean }): boolean {
  return input.releaseOpen === true && input.status === 'CONFIRMED' && input.hasAccess === true;
}

export function canIssueApprovedWorkCertificate(input: { releaseOpen: boolean; status: string; isAuthor: boolean }): boolean {
  return input.releaseOpen === true && input.isAuthor === true && ACCEPTED.has(input.status);
}

export function canIssuePresentationCertificate(input: { releaseOpen: boolean; status: string; isPresenter: boolean }): boolean {
  return input.releaseOpen === true && input.isPresenter === true && ACCEPTED.has(input.status);
}

export function canIssueGuestCertificate(input: { releaseOpen: boolean; invitationStatus: string }): boolean {
  return input.releaseOpen === true && input.invitationStatus === 'CONFIRMED';
}

export function canIssueReviewerCertificate(input: { releaseOpen: boolean; submittedWithoutConflict: boolean }): boolean {
  return input.releaseOpen === true && input.submittedWithoutConflict === true;
}

export function workPaperRole(sortOrder: number): 'Autor' | 'Coautor' {
  return sortOrder === 0 ? 'Autor' : 'Coautor';
}

export function registrationEmail(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const email = (data as { email?: unknown }).email;
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > 254 || !EMAIL.test(normalized)) return null;
  return normalized;
}

export function participantOwnsScientificPerson(input: {
  personEmail: string | null;
  registrationEmail: string | null;
  authorCount: number;
  ownerReservationId: string | null;
  reservationId: string;
}): boolean {
  const person = input.personEmail?.trim().toLowerCase() ?? '';
  if (input.registrationEmail && person && person === input.registrationEmail) return true;
  return input.authorCount === 1 && input.ownerReservationId === input.reservationId;
}

export function roleCertificateFacts(input: {
  role: CertificateRole;
  displayName: string;
  eventName: string;
  hours: number | null;
  issuedAt: string;
  code: string;
  subjectLabel: string;
  paperRole: string | null;
}) {
  return {
    displayName: input.displayName,
    eventName: input.eventName,
    hours: input.hours,
    issuedAt: input.issuedAt,
    code: input.code,
    subjectLabel: input.subjectLabel,
    paperRole: input.paperRole ?? ROLE_CERTIFICATE_LABEL[input.role],
  };
}

export function renderRoleTemplate(role: CertificateRole, template: string, facts: ReturnType<typeof roleCertificateFacts>): string {
  const issued = new Date(facts.issuedAt);
  const date = Number.isNaN(issued.getTime())
    ? ''
    : new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(issued);
  const map: Record<string, string> = {
    NOME: facts.displayName,
    EVENTO: facts.eventName,
    CARGA_HORARIA: facts.hours == null ? 'não informada' : String(facts.hours),
    DATA: date,
    CODIGO: facts.code,
    ATIVIDADE: facts.subjectLabel,
    TITULO: facts.subjectLabel,
    PAPEL: facts.paperRole,
  };
  const allowed = new Set(ROLE_TAGS[role]);
  return template.replace(TAG, (full, tag: string) => allowed.has(tag) ? map[tag] ?? '' : full);
}

export function publicRoleCertificateView(input: {
  role: CertificateRole;
  eventName: string;
  displayName: string;
  hours: number | null;
  issuedAt: string;
  code: string;
  title: string;
  body: string;
  subjectLabel: string;
  paperRole: string | null;
}) {
  const facts = roleCertificateFacts(input);
  return {
    authentic: true as const,
    role: input.role,
    eventName: input.eventName,
    displayName: input.displayName,
    hours: input.hours,
    issuedAt: input.issuedAt,
    feeCents: certificateRoleFeeCents(),
    title: renderRoleTemplate(input.role, input.title, facts),
    body: renderRoleTemplate(input.role, input.body, facts),
    artAlt: null,
    hasArt: false,
  };
}

export function sanitizeCertificateName(value: unknown): string {
  if (typeof value !== 'string') throw new CertificateRolePolicyError('O nome não pode ir para o certificado.');
  const name = value.trim().replace(/[ \t]+/g, ' ');
  if (name.length < 2 || name.length > 180 || UNSAFE.test(value)) {
    throw new CertificateRolePolicyError('O nome não pode ir para o certificado.');
  }
  return name;
}

export function sanitizeSubjectLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const label = value.trim().replace(/[ \t]+/g, ' ').slice(0, 240);
  if (label.length < 2 || UNSAFE.test(value)) {
    throw new CertificateRolePolicyError('O título não pode ir para o certificado.');
  }
  return label;
}

export function saoPauloDay(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

function normalizeEnabled(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new CertificateRolePolicyError('Informe se este papel está liberado.');
  return value;
}

function normalizeReleaseMode(value: unknown): CertificateReleaseMode {
  if (value !== 'manual' && value !== 'after_end') {
    throw new CertificateRolePolicyError('A liberação é manual ou alguns dias depois do fim do evento.');
  }
  return value;
}

function normalizeReleaseDays(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 30) {
    throw new CertificateRolePolicyError('Os dias depois do fim do evento ficam entre 0 e 30.');
  }
  return value;
}

function normalizeHours(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 999) {
    throw new CertificateRolePolicyError('A carga horária precisa ser um número inteiro de 1 a 999, ou ficar em branco.');
  }
  return value;
}

function normalizeTemplate(role: CertificateRole, value: unknown, label: string, max: number, fallback: string): string {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return fallback;
  if (typeof value !== 'string') throw new CertificateRolePolicyError(`Informe o ${label} do certificado.`);
  const text = value.replace(/\r\n/g, '\n');
  if (text.length > max) throw new CertificateRolePolicyError(`O ${label} do certificado passa de ${max} caracteres.`);
  if (/[<>]/.test(text) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    throw new CertificateRolePolicyError('Use a formatação do editor. HTML não entra no certificado.');
  }
  const allowed = new Set(ROLE_TAGS[role]);
  const unknown = [...text.matchAll(TAG)].map((match) => match[1]).find((tag) => !allowed.has(tag));
  if (unknown) {
    throw new CertificateRolePolicyError(`A tag {${unknown}} não existe neste papel. Use ${[...allowed].map((tag) => `{${tag}}`).join(', ')}.`);
  }
  return text;
}

function expectedRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new CertificateRolePolicyError('Recarregue a tela antes de salvar o certificado.');
  }
  return value;
}
