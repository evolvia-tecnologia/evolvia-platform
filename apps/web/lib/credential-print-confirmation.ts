export type PrintIssue = {
  reservationId: string;
  sequence: number;
};

/** Sequência gravada como tentativa de emissão. Ausência não vira confirmação. */
export function emissionSequence(result: unknown): number | null {
  if (!result || typeof result !== 'object') return null;
  const emissao = (result as { emissao?: unknown }).emissao;
  if (!emissao || typeof emissao !== 'object') return null;
  const sequence = (emissao as { sequence?: unknown }).sequence;
  if (typeof sequence !== 'number' || !Number.isInteger(sequence) || sequence < 1 || sequence > 1_000_000) return null;
  return sequence;
}

export function labelWithoutEmission<T extends Record<string, unknown>>(result: T): Omit<T, 'emissao'> {
  const { emissao: _ignored, ...label } = result;
  return label;
}
