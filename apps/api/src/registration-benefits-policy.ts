export type RegistrationMode = 'FREE' | 'PAID' | 'INVITATION';
export type RegistrationBenefitKind = 'COUPON' | 'INVITATION' | 'COURTESY';

export type RegistrationBenefitInput = {
  code: string;
  name: string;
  kind: RegistrationBenefitKind;
  discountPercent?: number;
  maxUses: number;
  validFrom: string;
  validUntil: string;
  active?: boolean;
  sortOrder?: number;
};

export type NormalizedRegistrationBenefit = Required<RegistrationBenefitInput>;

export class RegistrationBenefitsPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistrationBenefitsPolicyError';
  }
}

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/u;
const KINDS = new Set<RegistrationBenefitKind>(['COUPON', 'INVITATION', 'COURTESY']);

function fail(message: string): never {
  throw new RegistrationBenefitsPolicyError(message);
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail(`O ${label} é inválido.`);
  }
  return value as number;
}

function instant(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/u.test(value) || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) {
    fail(`A ${label} deve incluir data, hora e fuso horário.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail(`A ${label} é inválida.`);
  return date.toISOString();
}

function name(value: unknown): string {
  if (typeof value !== 'string') fail('O nome do benefício é inválido.');
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (normalized.length < 2 || normalized.length > 120 || /[<>]/u.test(normalized)) {
    fail('O nome do benefício é inválido.');
  }
  return normalized;
}

function normalizedDiscount(kind: RegistrationBenefitKind, value: unknown): number {
  if (kind === 'INVITATION') {
    if (value !== undefined && value !== 0) fail('Convites não aplicam desconto automático.');
    return 0;
  }
  if (kind === 'COURTESY') {
    if (value !== undefined && value !== 100) fail('Cortesias devem conceder 100% de desconto.');
    return 100;
  }
  return integer(value, 'percentual de desconto', 1, 100);
}

export function normalizeRegistrationBenefits(
  input: unknown,
  registrationMode: RegistrationMode,
): NormalizedRegistrationBenefit[] {
  if (!Array.isArray(input) || input.length > 500) {
    fail('Informe no máximo 500 cupons, convites ou cortesias.');
  }

  const codes = new Set<string>();
  return input.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Benefício de inscrição inválido.');
    const benefit = raw as RegistrationBenefitInput;
    if (!KINDS.has(benefit.kind)) fail('O tipo de benefício é inválido.');
    if (registrationMode !== 'PAID' && benefit.kind !== 'INVITATION') {
      fail('Cupons e cortesias só podem ser configurados em eventos com inscrição paga.');
    }

    const code = typeof benefit.code === 'string' ? benefit.code.trim().toUpperCase() : '';
    if (!CODE_PATTERN.test(code)) fail('O código deve ter de 3 a 32 caracteres, usando letras, números, hífen ou sublinhado.');
    if (codes.has(code)) fail('Cada cupom, convite ou cortesia deve possuir um código único.');
    codes.add(code);

    const validFrom = instant(benefit.validFrom, 'abertura do benefício');
    const validUntil = instant(benefit.validUntil, 'expiração do benefício');
    if (Date.parse(validFrom) >= Date.parse(validUntil)) fail('O benefício deve expirar depois da abertura.');

    return {
      code,
      name: name(benefit.name),
      kind: benefit.kind,
      discountPercent: normalizedDiscount(benefit.kind, benefit.discountPercent),
      maxUses: integer(benefit.maxUses, 'limite de usos', 1, 1_000_000),
      validFrom,
      validUntil,
      active: benefit.active !== false,
      sortOrder: integer(benefit.sortOrder ?? index, 'ordem do benefício', 0, 10_000),
    };
  });
}
