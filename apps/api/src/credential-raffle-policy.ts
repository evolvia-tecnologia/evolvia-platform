export type RaffleScope = 'ALL' | 'CATEGORY' | 'ACTIVITY';

export type RaffleRequest = {
  scope: RaffleScope;
  categoryId: string | null;
  activityId: string | null;
  allowRepeat: boolean;
};

export class CredentialRafflePolicyError extends Error {}

const ID = /^[a-z0-9]{10,40}$/u;

export function normalizeRaffle(input: unknown): RaffleRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CredentialRafflePolicyError('Sorteio inválido.');
  }
  const raw = input as Record<string, unknown>;
  const keys = Object.keys(raw);
  if (keys.some((key) => !['scope', 'categoryId', 'activityId', 'allowRepeat'].includes(key))) {
    throw new CredentialRafflePolicyError('Sorteio inválido.');
  }
  if (raw.scope !== 'ALL' && raw.scope !== 'CATEGORY' && raw.scope !== 'ACTIVITY') {
    throw new CredentialRafflePolicyError('Escolha todos os confirmados, uma categoria ou uma atividade.');
  }
  if (typeof raw.allowRepeat !== 'boolean') throw new CredentialRafflePolicyError('Sorteio inválido.');
  const categoryId = optionalId(raw.categoryId);
  const activityId = optionalId(raw.activityId);
  if (raw.scope === 'CATEGORY' && !categoryId) throw new CredentialRafflePolicyError('Escolha a categoria deste evento.');
  if (raw.scope === 'ACTIVITY' && !activityId) throw new CredentialRafflePolicyError('Escolha a atividade deste evento.');
  if (raw.scope !== 'CATEGORY' && categoryId) throw new CredentialRafflePolicyError('Sorteio inválido.');
  if (raw.scope !== 'ACTIVITY' && activityId) throw new CredentialRafflePolicyError('Sorteio inválido.');
  return { scope: raw.scope, categoryId, activityId, allowRepeat: raw.allowRepeat };
}

export function rafflePool(ids: readonly string[], alreadyDrawn: ReadonlySet<string>, allowRepeat: boolean): string[] {
  if (allowRepeat) return [...ids];
  return ids.filter((id) => !alreadyDrawn.has(id));
}

export function chooseRaffleId(ids: readonly string[], randomIndex: (length: number) => number): string {
  if (ids.length === 0) throw new CredentialRafflePolicyError('Não há inscrição confirmada neste grupo.');
  const index = randomIndex(ids.length);
  if (!Number.isInteger(index) || index < 0 || index >= ids.length) {
    throw new CredentialRafflePolicyError('Não foi possível sortear.');
  }
  return ids[index]!;
}

function optionalId(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !ID.test(value)) throw new CredentialRafflePolicyError('Sorteio inválido.');
  return value;
}
