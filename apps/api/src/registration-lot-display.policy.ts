export const LOT_DISPLAY_CAPABILITY = 'registration_lot_display';
export const LOT_DISPLAY_MODES = ['CURRENT', 'LADDER'] as const;
export type LotDisplayMode = (typeof LOT_DISPLAY_MODES)[number];

export class LotDisplayPolicyError extends Error {}

export function readLotDisplayMode(config: unknown): LotDisplayMode {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return 'LADDER';
  return (config as { mode?: unknown }).mode === 'CURRENT' ? 'CURRENT' : 'LADDER';
}

export function normalizeLotDisplayMode(input: unknown): LotDisplayMode {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new LotDisplayPolicyError('Escolha como a página mostra os lotes.');
  }
  const raw = input as Record<string, unknown>;
  const keys = Object.keys(raw);
  if (keys.length !== 1 || keys[0] !== 'mode') throw new LotDisplayPolicyError('Escolha como a página mostra os lotes.');
  if (raw.mode !== 'CURRENT' && raw.mode !== 'LADDER') throw new LotDisplayPolicyError('Escolha o lote atual ou a escada de preços.');
  return raw.mode;
}

export function lotDisplayName(value: string): string {
  const text = value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim();
  if (text.length < 1 || text.length > 80 || /[<>]/u.test(text)) return 'Lote';
  return text;
}

export function selectDisplayedLots<T extends { startsAt: Date; endsAt: Date }>(
  mode: LotDisplayMode,
  lots: readonly T[],
  now: Date,
): { open: T[]; upcoming: T[] } {
  const open = lots.filter((lot) => lot.startsAt <= now && lot.endsAt > now);
  const upcoming = lots.filter((lot) => lot.startsAt > now && lot.endsAt > now);
  return {
    open: mode === 'CURRENT' ? open.slice(0, 1) : open,
    upcoming: mode === 'CURRENT' ? [] : upcoming,
  };
}

export function earliestLotClose(lots: readonly { endsAt: Date }[]): string | null {
  if (lots.length === 0) return null;
  let earliest = lots[0].endsAt.getTime();
  for (const lot of lots) {
    const time = lot.endsAt.getTime();
    if (time < earliest) earliest = time;
  }
  return new Date(earliest).toISOString();
}
