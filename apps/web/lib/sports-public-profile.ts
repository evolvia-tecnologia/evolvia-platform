/** Conteúdo inicial do perfil Corrida. Não confunde configuração de página com disponibilidade de inscrições. */
export type SportsPublicSection =
  | 'modalidades' | 'percurso' | 'kits' | 'retirada' | 'regulamento'
  | 'premiacao' | 'perguntas' | 'patrocinadores';

export type SportsModality = {
  id: string;
  name: string;
  distanceKm: number;
  kind: 'RUN' | 'WALK' | 'TRAIL';
  startAt?: string;
  capacity?: number;
};

export const SPORTS_PUBLIC_SECTIONS: readonly { id: SportsPublicSection; label: string }[] = [
  { id: 'modalidades', label: 'Modalidades' },
  { id: 'percurso', label: 'Percurso' },
  { id: 'kits', label: 'Kits e camisetas' },
  { id: 'retirada', label: 'Retirada dos kits' },
  { id: 'regulamento', label: 'Regulamento' },
  { id: 'premiacao', label: 'Premiação' },
  { id: 'perguntas', label: 'Perguntas frequentes' },
  { id: 'patrocinadores', label: 'Patrocinadores' },
] as const;

export function isRunningProfile(eventType: unknown): boolean {
  return eventType === 'Corrida';
}

/** Defaults ilustrativos: só usados durante criação e nunca publicados sem revisão do organizador. */
export function sportsStarterModalities(): SportsModality[] {
  return [
    { id: 'walk-4k', name: 'Caminhada 4 km', distanceKm: 4, kind: 'WALK' },
    { id: 'run-4k', name: 'Corrida 4 km', distanceKm: 4, kind: 'RUN' },
    { id: 'run-8k', name: 'Corrida 8 km', distanceKm: 8, kind: 'RUN' },
  ];
}

export function validateSportsModalities(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) return ['Informe ao menos uma modalidade.'];
  if (value.length > 50) return ['O limite é de 50 modalidades por evento.'];
  const errors: string[] = [];
  const identifiers = new Set<string>();
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      errors.push(`Modalidade ${index + 1}: dados inválidos.`);
      continue;
    }
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || !/^[a-z0-9-]{1,60}$/.test(row.id) || identifiers.has(row.id)) {
      errors.push(`Modalidade ${index + 1}: identificador inválido ou repetido.`);
    } else identifiers.add(row.id);
    if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 120) {
      errors.push(`Modalidade ${index + 1}: nome obrigatório (até 120 caracteres).`);
    }
    if (!['RUN', 'WALK', 'TRAIL'].includes(String(row.kind))) {
      errors.push(`Modalidade ${index + 1}: tipo inválido.`);
    }
    if (typeof row.distanceKm !== 'number' || !Number.isFinite(row.distanceKm) || row.distanceKm <= 0 || row.distanceKm > 500) {
      errors.push(`Modalidade ${index + 1}: distância inválida.`);
    }
    if (row.capacity !== undefined && (!Number.isSafeInteger(row.capacity) || (row.capacity as number) < 1)) {
      errors.push(`Modalidade ${index + 1}: capacidade inválida.`);
    }
  }
  return errors;
}
