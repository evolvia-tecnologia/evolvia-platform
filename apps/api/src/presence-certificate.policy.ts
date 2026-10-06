export class PresenceCertificatePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PresenceCertificatePolicyError';
  }
}

export const CERTIFICATE_ROLE = 'participation' as const;
export const CERTIFICATE_FEE_CENTS = 0;

const CODE = /^[a-f0-9]{32}$/;
const UNSAFE_NAME = /[<>\u0000-\u001f\u007f]/;

export function certificateFeeCents(): 0 {
  return CERTIFICATE_FEE_CENTS;
}

export function normalizeCertificateHours(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 999) {
    throw new PresenceCertificatePolicyError('A carga horária precisa ser um número inteiro de 1 a 999, ou ficar em branco.');
  }
  return value;
}

export function normalizeCertificateEnabled(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new PresenceCertificatePolicyError('Informe se o certificado de participação está liberado.');
  }
  return value;
}

export function normalizeCertificateSetting(input: unknown): { enabled: boolean; hours: number | null; expectedRevision: number } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PresenceCertificatePolicyError('Informe a liberação do certificado.');
  }
  const record = input as Record<string, unknown>;
  if (typeof record.expectedRevision !== 'number' || !Number.isInteger(record.expectedRevision) || record.expectedRevision < 0) {
    throw new PresenceCertificatePolicyError('Recarregue a tela antes de salvar o certificado.');
  }
  return {
    enabled: normalizeCertificateEnabled(record.enabled),
    hours: normalizeCertificateHours(record.hours),
    expectedRevision: record.expectedRevision,
  };
}

export function certificateDisplayName(data: unknown): string {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new PresenceCertificatePolicyError('O nome da inscrição não pode ir para o certificado.');
  }
  const record = data as Record<string, unknown>;
  const preferred = typeof record.preferred_name === 'string' ? record.preferred_name : '';
  const full = typeof record.full_name === 'string' ? record.full_name : '';
  const raw = preferred.trim() || full.trim();
  const name = raw.replace(/[ \t]+/g, ' ');
  if (name.length < 2 || name.length > 180 || UNSAFE_NAME.test(raw)) {
    throw new PresenceCertificatePolicyError('O nome da inscrição não pode ir para o certificado.');
  }
  return name;
}

export function normalizeCertificateCode(value: unknown): string {
  if (typeof value !== 'string') throw new PresenceCertificatePolicyError('Código de certificado inválido.');
  const code = value.trim().toLowerCase();
  if (!CODE.test(code)) throw new PresenceCertificatePolicyError('Código de certificado inválido.');
  return code;
}

export function canIssuePresenceCertificate(input: { enabled: boolean; status: string; checkedIn: boolean }): boolean {
  return input.enabled === true && input.status === 'CONFIRMED' && input.checkedIn === true;
}

export function publicCertificateView(input: {
  eventName: string;
  displayName: string;
  hours: number | null;
  issuedAt: string;
}) {
  return {
    authentic: true as const,
    role: CERTIFICATE_ROLE,
    eventName: input.eventName,
    displayName: input.displayName,
    hours: input.hours,
    issuedAt: input.issuedAt,
    feeCents: certificateFeeCents(),
  };
}
