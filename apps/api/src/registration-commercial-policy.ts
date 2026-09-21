export type RegistrationMode = 'FREE' | 'PAID' | 'INVITATION';
export type ProofRequirement = 'NONE' | 'REQUIRED_BEFORE_PAYMENT';

export type RegistrationLotInput = {
  code: string;
  name: string;
  startsAt: string;
  endsAt: string;
  quantity?: number | null;
  priceCents: number;
  active?: boolean;
  sortOrder?: number;
};

export type RegistrationCategoryInput = {
  code: string;
  name: string;
  description?: string | null;
  capacity?: number | null;
  proofRequirement?: ProofRequirement;
  active?: boolean;
  sortOrder?: number;
  lots: RegistrationLotInput[];
};

export type NormalizedRegistrationLot = Required<
  Omit<RegistrationLotInput, 'quantity'>
> & { quantity: number | null };

export type NormalizedRegistrationCategory = Required<
  Omit<RegistrationCategoryInput, 'description' | 'capacity' | 'lots'>
> & {
  description: string | null;
  capacity: number | null;
  lots: NormalizedRegistrationLot[];
};

export class RegistrationCommercialPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistrationCommercialPolicyError';
  }
}

const CODE_PATTERN = /^[a-z][a-z0-9_]{1,59}$/u;
const PROOF_REQUIREMENTS = new Set<ProofRequirement>([
  'NONE',
  'REQUIRED_BEFORE_PAYMENT',
]);

function fail(message: string): never {
  throw new RegistrationCommercialPolicyError(message);
}

function text(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== 'string') fail(`O ${label} é inválido.`);
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (
    normalized.length < min ||
    normalized.length > max ||
    /[<>]/u.test(normalized)
  ) {
    fail(`O ${label} é inválido.`);
  }
  return normalized;
}

function optionalText(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return text(value, label, 1, max);
}

function code(value: unknown, label: string): string {
  if (typeof value !== 'string' || !CODE_PATTERN.test(value)) {
    fail(`O ${label} é inválido.`);
  }
  return value;
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  nullable = false,
): number | null {
  if (nullable && (value === undefined || value === null)) return null;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail(`O ${label} é inválido.`);
  }
  return value as number;
}

function instant(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/u.test(value) ||
    !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
  ) {
    fail(`A ${label} deve incluir data, hora e fuso horário.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail(`A ${label} é inválida.`);
  return date.toISOString();
}

export function normalizeRegistrationCatalog(
  input: unknown,
  registrationMode: RegistrationMode,
): NormalizedRegistrationCategory[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) {
    fail('Informe entre 1 e 100 categorias de inscrição.');
  }

  const categoryCodes = new Set<string>();
  return input.map((rawCategory, categoryIndex) => {
    if (!rawCategory || typeof rawCategory !== 'object' || Array.isArray(rawCategory)) {
      fail('Categoria de inscrição inválida.');
    }
    const category = rawCategory as RegistrationCategoryInput;
    const normalizedCode = code(category.code, 'código da categoria');
    if (categoryCodes.has(normalizedCode)) fail('Cada categoria deve possuir um código único.');
    categoryCodes.add(normalizedCode);

    const capacity = integer(category.capacity, 'limite da categoria', 1, 10_000_000, true);
    const lots = Array.isArray(category.lots) ? category.lots : fail('Os lotes da categoria são inválidos.');
    if (lots.length < 1 || lots.length > 100) fail('Cada categoria deve possuir entre 1 e 100 lotes.');

    const lotCodes = new Set<string>();
    const normalizedLots = lots.map((rawLot, lotIndex) => {
      if (!rawLot || typeof rawLot !== 'object' || Array.isArray(rawLot)) fail('Lote de inscrição inválido.');
      const normalizedLotCode = code(rawLot.code, 'código do lote');
      if (lotCodes.has(normalizedLotCode)) fail('Cada lote da categoria deve possuir um código único.');
      lotCodes.add(normalizedLotCode);

      const startsAt = instant(rawLot.startsAt, 'abertura do lote');
      const endsAt = instant(rawLot.endsAt, 'encerramento do lote');
      if (Date.parse(startsAt) >= Date.parse(endsAt)) fail('O lote deve encerrar depois da abertura.');

      const quantity = integer(rawLot.quantity, 'quantidade do lote', 1, 10_000_000, true);
      if (capacity !== null && quantity !== null && quantity > capacity) {
        fail('A quantidade do lote não pode superar o limite da categoria.');
      }
      const priceCents = integer(rawLot.priceCents, 'preço do lote', 0, 1_000_000_000) as number;
      if (registrationMode === 'FREE' && priceCents !== 0) {
        fail('Eventos gratuitos só podem possuir lotes com preço zero.');
      }

      return {
        code: normalizedLotCode,
        name: text(rawLot.name, 'nome do lote', 2, 120),
        startsAt,
        endsAt,
        quantity,
        priceCents,
        active: rawLot.active !== false,
        sortOrder: (integer(rawLot.sortOrder ?? lotIndex, 'ordem do lote', 0, 10_000) as number),
      };
    });

    const chronological = [...normalizedLots].sort((left, right) =>
      left.startsAt.localeCompare(right.startsAt),
    );
    for (let index = 1; index < chronological.length; index += 1) {
      if (chronological[index].startsAt < chronological[index - 1].endsAt) {
        fail('Os períodos dos lotes não podem se sobrepor na mesma categoria.');
      }
    }

    const proofRequirement = category.proofRequirement ?? 'NONE';
    if (!PROOF_REQUIREMENTS.has(proofRequirement)) fail('A política de comprovante é inválida.');
    if (registrationMode !== 'PAID' && proofRequirement === 'REQUIRED_BEFORE_PAYMENT') {
      fail('A aprovação de comprovante antes do pagamento exige inscrição paga.');
    }

    return {
      code: normalizedCode,
      name: text(category.name, 'nome da categoria', 2, 120),
      description: optionalText(category.description, 'descrição da categoria', 500),
      capacity,
      proofRequirement,
      active: category.active !== false,
      sortOrder: integer(category.sortOrder ?? categoryIndex, 'ordem da categoria', 0, 10_000) as number,
      lots: normalizedLots,
    };
  });
}
