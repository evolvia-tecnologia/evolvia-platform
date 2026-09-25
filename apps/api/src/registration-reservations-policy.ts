export type PublicRegistrationAnswer = string | number | boolean | string[];
export type PublicRegistrationInput = {
  categoryId: string;
  lotId: string;
  benefitCode?: string;
  answers: Record<string, PublicRegistrationAnswer>;
  billing?: BillingDeclaration;
};

export type BillingParty = { kind: 'PERSON' | 'COMPANY'; name: string; document: string; email: string };
export type BillingDeclaration = { payer: BillingParty; recipient: BillingParty };

export class RegistrationReservationPolicyError extends Error {}

const REQUIRED_CODES = ['full_name', 'preferred_name', 'identity_document', 'email', 'phone'] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/u;
const SAFE_BENEFIT = /^[A-Z0-9][A-Z0-9_-]{2,31}$/u;
const SAFE_KEY = /^[A-Za-z0-9._:-]{16,128}$/u;

function requiredString(answers: Record<string, PublicRegistrationAnswer>, code: string, max: number): string {
  const value = answers[code];
  if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > max) {
    throw new RegistrationReservationPolicyError(`Preencha corretamente o campo obrigatório: ${code}.`);
  }
  return value.trim();
}

export function normalizeIdempotencyKey(value: string | undefined): string {
  const normalized = value?.trim() ?? '';
  if (!SAFE_KEY.test(normalized)) {
    throw new RegistrationReservationPolicyError('Envie uma chave Idempotency-Key válida com 16 a 128 caracteres.');
  }
  return normalized;
}

function normalizeBillingParty(value: BillingParty, label: string): BillingParty {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !['PERSON', 'COMPANY'].includes(value.kind)) {
    throw new RegistrationReservationPolicyError(`Informe o tipo do ${label}.`);
  }
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const document = typeof value.document === 'string' ? value.document.replace(/[^A-Za-z0-9]/gu, '').toUpperCase() : '';
  const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
  if (name.length < 2 || name.length > 180 || document.length < 5 || document.length > 40 || !EMAIL.test(email) || email.length > 254) {
    throw new RegistrationReservationPolicyError(`Preencha nome, documento e e-mail válidos do ${label}.`);
  }
  if (value.kind === 'COMPANY' && !/^\d{14}$/u.test(document)) {
    throw new RegistrationReservationPolicyError(`Informe o CNPJ de 14 dígitos do ${label}.`);
  }
  return { kind: value.kind, name, document, email };
}

export function normalizePublicRegistration(input: PublicRegistrationInput): PublicRegistrationInput {
  if (!input || typeof input !== 'object' || !SAFE_ID.test(input.categoryId ?? '') || !SAFE_ID.test(input.lotId ?? '')) {
    throw new RegistrationReservationPolicyError('Selecione uma categoria e um lote válidos.');
  }
  if (!input.answers || typeof input.answers !== 'object' || Array.isArray(input.answers)) {
    throw new RegistrationReservationPolicyError('A ficha de inscrição é obrigatória.');
  }
  const answers: Record<string, PublicRegistrationAnswer> = {};
  const entries = Object.entries(input.answers);
  if (entries.length > 80) throw new RegistrationReservationPolicyError('A ficha excede o limite de campos.');
  for (const [code, value] of entries) {
    if (!/^[a-z][a-z0-9_]{1,63}$/u.test(code)) throw new RegistrationReservationPolicyError('A ficha contém um campo inválido.');
    if (typeof value === 'string') {
      if (value.length > 2_000) throw new RegistrationReservationPolicyError('Um campo da ficha excede o limite permitido.');
      answers[code] = value.trim();
    } else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      answers[code] = value;
    } else if (Array.isArray(value) && value.length <= 50 && value.every((item) => typeof item === 'string' && item.length <= 200)) {
      answers[code] = value.map((item) => item.trim());
    } else {
      throw new RegistrationReservationPolicyError('A ficha contém um valor inválido.');
    }
  }
  for (const code of REQUIRED_CODES) requiredString(answers, code, code === 'email' ? 254 : 180);
  const email = String(answers.email).toLowerCase();
  if (!EMAIL.test(email)) throw new RegistrationReservationPolicyError('Informe um e-mail válido.');
  answers.email = email;
  const identity = String(answers.identity_document).replace(/[^A-Za-z0-9]/gu, '').toUpperCase();
  if (identity.length < 5 || identity.length > 40) throw new RegistrationReservationPolicyError('Informe um CPF ou documento estrangeiro válido.');
  answers.identity_document = identity;
  if (answers.terms_acceptance !== true) throw new RegistrationReservationPolicyError('Aceite os termos e a Política de Privacidade para continuar.');
  const benefitCode = input.benefitCode?.trim().toUpperCase() || undefined;
  if (benefitCode && !SAFE_BENEFIT.test(benefitCode)) throw new RegistrationReservationPolicyError('Informe um código de benefício válido.');
  if (input.billing !== undefined && (!input.billing || typeof input.billing !== 'object' || Array.isArray(input.billing))) {
    throw new RegistrationReservationPolicyError('Informe os dados de cobrança válidos.');
  }
  const billing = input.billing === undefined ? undefined : {
    payer: normalizeBillingParty(input.billing.payer, 'pagador'),
    recipient: normalizeBillingParty(input.billing.recipient, 'tomador'),
  };
  return { categoryId: input.categoryId, lotId: input.lotId, benefitCode, answers, billing };
}

export function calculateRegistrationPrice(basePriceCents: number, discountPercent: number): number {
  if (!Number.isInteger(basePriceCents) || basePriceCents < 0 || !Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new RegistrationReservationPolicyError('Preço ou desconto inválido.');
  }
  return Math.round(basePriceCents * (100 - discountPercent) / 100);
}
