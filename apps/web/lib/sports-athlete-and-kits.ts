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
