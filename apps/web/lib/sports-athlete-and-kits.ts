/** Contratos do perfil Corrida. Validações do cliente; a API deve repetir as regras dentro da transação. */
export type SportsAthleteField =
  | 'fullName' | 'preferredName' | 'birthDate' | 'document' | 'email'
  | 'phone' | 'country' | 'city' | 'state' | 'team' | 'estimatedPace'
  | 'emergencyContact' | 'shirtSize' | 'guardian';

export type SportsKitVariant = {
  id: string;
  label: string;
  stock: number;
  reserved: number;
  delivered: number;
};

export const SPORTS_ATHLETE_FIELDS: ReadonlyArray<{
  field: SportsAthleteField; label: string; mandatoryDefault: boolean; sensitive: boolean;
}> = [
  { field: 'fullName', label: 'Nome completo', mandatoryDefault: true, sensitive: false },
  { field: 'preferredName', label: 'Como deseja ser chamado', mandatoryDefault: false, sensitive: false },
  { field: 'birthDate', label: 'Data de nascimento', mandatoryDefault: true, sensitive: false },
  { field: 'document', label: 'Documento ou passaporte', mandatoryDefault: true, sensitive: false },
  { field: 'email', label: 'E-mail', mandatoryDefault: true, sensitive: false },
  { field: 'phone', label: 'Celular com DDI', mandatoryDefault: true, sensitive: false },
  { field: 'country', label: 'País', mandatoryDefault: true, sensitive: false },
  { field: 'city', label: 'Cidade', mandatoryDefault: false, sensitive: false },
  { field: 'state', label: 'Estado ou região', mandatoryDefault: false, sensitive: false },
  { field: 'team', label: 'Equipe ou assessoria esportiva', mandatoryDefault: false, sensitive: false },
  { field: 'estimatedPace', label: 'Ritmo estimado', mandatoryDefault: false, sensitive: false },
  { field: 'emergencyContact', label: 'Contato de emergência', mandatoryDefault: false, sensitive: true },
  { field: 'shirtSize', label: 'Tamanho da camiseta', mandatoryDefault: false, sensitive: false },
  { field: 'guardian', label: 'Responsável legal quando necessário', mandatoryDefault: false, sensitive: true },
] as const;

export type PublishedShirtSize = { id: string; label: string };
export type PublishedAthletePrompt = { code: string; label: string; required: boolean };

const ATHLETE_FORM_CODES = new Set([
  'full_name', 'preferred_name', 'birth_date', 'identity_document', 'email', 'phone',
  'country', 'city', 'state', 'shirt_size',
]);
const PROMPT_LABEL = /^[\p{L}\p{N}][\p{L}\p{N} .,'’/()+&:;!?%#@_=°ºª–—-]{0,119}$/u;

/** Campos de atleta que a ficha publicada realmente pede. Não cria campo nem lê resposta. */
export function readPublishedAthletePrompts(payload: unknown): PublishedAthletePrompt[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const fields = (payload as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return [];
  const prompts: PublishedAthletePrompt[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    if (!field || typeof field !== 'object' || Array.isArray(field)) continue;
    const row = field as { code?: unknown; label?: unknown; enabled?: unknown; required?: unknown };
    if (row.enabled === false || typeof row.code !== 'string' || !ATHLETE_FORM_CODES.has(row.code) || seen.has(row.code)) continue;
    if (typeof row.label !== 'string') continue;
    const label = row.label.trim().replace(/\s+/gu, ' ');
    if (!PROMPT_LABEL.test(label)) continue;
    seen.add(row.code);
    prompts.push({ code: row.code, label, required: row.required === true });
    if (prompts.length === 12) break;
  }
  return prompts;
}

const PUBLISHED_SIZE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,79}$/u;
const PUBLISHED_SIZE_LABEL = /^[\p{L}\p{N}][\p{L}\p{N} .\/-]{0,39}$/u;

/** Tamanhos já publicados na ficha (`shirt_size`). Não lê saldo nem reserva estoque. */
export function readPublishedShirtSizes(payload: unknown): PublishedShirtSize[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const fields = (payload as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return [];
  const shirt = fields.find((field) => {
    if (!field || typeof field !== 'object' || Array.isArray(field)) return false;
    const row = field as { code?: unknown; type?: unknown; enabled?: unknown };
    return row.code === 'shirt_size' && row.type === 'SELECT' && row.enabled !== false;
  }) as { options?: unknown } | undefined;
  if (!shirt || !Array.isArray(shirt.options)) return [];
  const sizes: PublishedShirtSize[] = [];
  const seen = new Set<string>();
  for (const option of shirt.options) {
    if (!option || typeof option !== 'object' || Array.isArray(option)) continue;
    const id = (option as { id?: unknown }).id;
    const label = (option as { label?: unknown }).label;
    if (typeof id !== 'string' || !PUBLISHED_SIZE_ID.test(id) || seen.has(id)) continue;
    if (typeof label !== 'string' || !PUBLISHED_SIZE_LABEL.test(label.trim().replace(/\s+/gu, ' '))) continue;
    seen.add(id);
    sizes.push({ id, label: label.trim().replace(/\s+/gu, ' ') });
    if (sizes.length === 12) break;
  }
  return sizes;
}

/** Texto do saldo publicado. Não reserva peça nem confirma retirada. */
export function publishedKitAvailabilityLabel(available: number): string {
  if (!Number.isSafeInteger(available) || available < 0) {
    return 'Saldo não informado nesta lista. A inscrição não reserva estoque.';
  }
  if (available === 0) return 'O organizador informou que não há saldo nesta lista. Isso não reserva estoque.';
  if (available === 1) return 'O organizador informou 1 unidade nesta lista. Isso não reserva estoque.';
  return `O organizador informou ${available} unidades nesta lista. Isso não reserva estoque.`;
}

/** Estoque disponível (não autoriza compra); reserva real exige concorrência no servidor. */
export function sportsKitAvailability(variant: SportsKitVariant): number {
  if (![variant.stock, variant.reserved, variant.delivered].every(Number.isSafeInteger)
    || variant.stock < 0 || variant.reserved < 0 || variant.delivered < 0
    || variant.reserved + variant.delivered > variant.stock) {
    throw new Error('Estoque do kit inconsistente.');
  }
  return variant.stock - variant.reserved - variant.delivered;
}

export function validateSportsKitVariants(value: unknown): string[] {
  if (!Array.isArray(value)) return ['Informe as variantes de kit.'];
  if (value.length > 500) return ['Limite de 500 variantes por evento.'];
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const [index, candidate] of value.entries()) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      errors.push(`Kit ${index + 1}: variante inválida.`);
      continue;
    }
    const kit = candidate as Partial<SportsKitVariant>;
    if (typeof kit.id !== 'string' || !/^[a-z0-9-]{1,60}$/.test(kit.id) || ids.has(kit.id)) {
      errors.push(`Kit ${index + 1}: identificador inválido ou repetido.`);
    } else ids.add(kit.id);
    if (typeof kit.label !== 'string' || !kit.label.trim() || kit.label.length > 100) {
      errors.push(`Kit ${index + 1}: identificação obrigatória.`);
    }
    try {
      sportsKitAvailability(kit as SportsKitVariant);
    } catch {
      errors.push(`Kit ${index + 1}: estoque inconsistente.`);
    }
  }
  return errors;
}
