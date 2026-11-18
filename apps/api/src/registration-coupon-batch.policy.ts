export class CouponBatchPolicyError extends Error {}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const KEYS = ['discountPercent', 'maxUses', 'quantity', 'sponsor', 'validUntil'];

export type CouponBatchInput = {
  sponsor: string;
  quantity: number;
  discountPercent: number;
  maxUses: number;
  validUntil: Date;
};

function integer(value: unknown, minimum: number, maximum: number): number | null {
  if (!Number.isSafeInteger(value)) return null;
  const number = value as number;
  if (number < minimum || number > maximum) return null;
  return number;
}

export function normalizeCouponBatch(input: unknown, now: Date): CouponBatchInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CouponBatchPolicyError('Informe o patrocinador, a quantidade, o desconto, os usos e a validade.');
  }
  const raw = input as Record<string, unknown>;
  const keys = Object.keys(raw).sort();
  if (keys.length !== KEYS.length || keys.some((key, index) => key !== KEYS[index])) {
    throw new CouponBatchPolicyError('Informe o patrocinador, a quantidade, o desconto, os usos e a validade.');
  }
  const sponsor = typeof raw.sponsor === 'string'
    ? raw.sponsor.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim()
    : '';
  if (sponsor.length < 2 || sponsor.length > 60 || /[<>]/u.test(sponsor)) {
    throw new CouponBatchPolicyError('O nome do patrocinador precisa ter de 2 a 60 caracteres, sem sinais de marcação.');
  }
  const quantity = integer(raw.quantity, 2, 40);
  const discountPercent = integer(raw.discountPercent, 1, 100);
  const maxUses = integer(raw.maxUses, 1, 20);
  if (quantity === null || discountPercent === null || maxUses === null) {
    throw new CouponBatchPolicyError('A quantidade fica entre 2 e 40, o desconto entre 1% e 100% e cada código entre 1 e 20 usos.');
  }
  if (typeof raw.validUntil !== 'string' || Number.isNaN(Date.parse(raw.validUntil))) {
    throw new CouponBatchPolicyError('Informe até quando os cupons valem, com data e hora.');
  }
  const validUntil = new Date(raw.validUntil);
  const latest = now.getTime() + 730 * 24 * 60 * 60 * 1000;
  if (validUntil.getTime() <= now.getTime() || validUntil.getTime() > latest) {
    throw new CouponBatchPolicyError('A validade precisa ser futura e de no máximo dois anos.');
  }
  return { sponsor, quantity, discountPercent, maxUses, validUntil };
}

export function newCouponCode(byteAt: (index: number) => number): string {
  let code = 'C';
  for (let index = 0; index < 9; index += 1) code += ALPHABET[byteAt(index) % ALPHABET.length];
  return code;
}

export function couponBatchCodes(quantity: number, taken: ReadonlySet<string>, nextCode: () => string): string[] {
  const codes: string[] = [];
  const seen = new Set(taken);
  let guard = 0;
  while (codes.length < quantity) {
    guard += 1;
    if (guard > quantity * 20) throw new CouponBatchPolicyError('Não foi possível reservar códigos únicos. Tente de novo.');
    const code = nextCode();
    if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/u.test(code) || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }
  return codes;
}
