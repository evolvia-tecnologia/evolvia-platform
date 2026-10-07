export type KitSizeDraft = { id?: string; label: string; stockQuantity: number };
export type KitConfigDraft = { name: string; shirtsEnabled: boolean; sizes: KitSizeDraft[] };

export class KitStockPolicyError extends Error {}

const NAME = /^[\p{L}\p{N}][\p{L}\p{N} .,'’\/-]{1,79}$/u;
const LABEL = /^[\p{L}\p{N}][\p{L}\p{N} .\/-]{0,39}$/u;
const SIZE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,79}$/u;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : '';
}

export function normalizeKitConfig(input: unknown): KitConfigDraft {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new KitStockPolicyError('Informe o kit do evento.');
  }
  const source = input as Record<string, unknown>;
  const name = text(source.name);
  if (!NAME.test(name)) throw new KitStockPolicyError('Informe um nome de kit com 2 a 80 caracteres.');
  const shirtsEnabled = source.shirtsEnabled === true;
  if (!Array.isArray(source.sizes) || source.sizes.length > 12) {
    throw new KitStockPolicyError('Informe até 12 tamanhos de camisa.');
  }
  if (shirtsEnabled && source.sizes.length < 1) {
    throw new KitStockPolicyError('Inclua ao menos um tamanho de camisa.');
  }
  const seen = new Set<string>();
  const sizes = source.sizes.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new KitStockPolicyError('Tamanho de camisa inválido.');
    }
    const row = item as Record<string, unknown>;
    const label = text(row.label);
    if (!LABEL.test(label)) throw new KitStockPolicyError('Cada tamanho precisa de um nome curto, sem símbolos.');
    const key = label.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) throw new KitStockPolicyError('Os tamanhos de camisa não podem se repetir.');
    seen.add(key);
    if (typeof row.stockQuantity !== 'number' || !Number.isInteger(row.stockQuantity) || row.stockQuantity < 0 || row.stockQuantity > 100_000) {
      throw new KitStockPolicyError('O estoque de cada tamanho é um número inteiro entre 0 e 100000.');
    }
    const id = row.id === undefined || row.id === null || row.id === '' ? undefined : text(row.id);
    if (id !== undefined && !SIZE_ID.test(id)) throw new KitStockPolicyError('Tamanho de camisa inválido.');
    return { ...(id ? { id } : {}), label, stockQuantity: row.stockQuantity };
  });
  return { name, shirtsEnabled, sizes };
}

export const SHIRT_SIZE_FIELD_CODE = 'shirt_size';
export const SHIRT_SIZE_FIELD_ID = 'kit-shirt-size';
