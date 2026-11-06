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
  capacity?: number | null;
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
    if (typeof row.kind !== 'string' || !['RUN', 'WALK', 'TRAIL'].includes(row.kind)) {
      errors.push(`Modalidade ${index + 1}: tipo inválido.`);
    }
    if (typeof row.distanceKm !== 'number' || !Number.isFinite(row.distanceKm) || row.distanceKm <= 0 || row.distanceKm > 500) {
      errors.push(`Modalidade ${index + 1}: distância inválida.`);
    }
    if (row.capacity != null && (!Number.isSafeInteger(row.capacity) || (row.capacity as number) < 1)) {
      errors.push(`Modalidade ${index + 1}: capacidade inválida.`);
    }
  }
  return errors;
}

/** Lista vazia significa não publicar modalidades. Linhas preenchidas seguem a validação já usada na página pública. */
export function modalityDraftErrors(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  const errors = validateSportsModalities(value);
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
    const name = (entry as { name?: unknown }).name;
    if (typeof name === 'string' && (/[<>]/u.test(name) || /http:\/\//iu.test(name))) {
      errors.push(`Modalidade ${index + 1}: use texto simples, sem HTML.`);
    }
  });
  return errors;
}

export function sportsModalityId(name: string, used: Iterable<string>): string {
  const taken = new Set(used);
  const base = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 48) || 'modalidade';
  let id = base;
  let suffix = 2;
  while (taken.has(id) || !/^[a-z0-9-]{1,60}$/u.test(id)) {
    id = `${base}-${suffix}`.replace(/-+$/u, '').slice(0, 60);
    suffix += 1;
    if (suffix > 80) return `modalidade-${taken.size + 1}`.slice(0, 60);
  }
  return id;
}

export function chooseModalitySection<T extends { id: string; title: string | null; kind: string; content: unknown }>(sections: T[]): T | null {
  const hosting = sections.find((section) => {
    const content = section.content;
    return Boolean(content && typeof content === 'object' && !Array.isArray(content) && Array.isArray((content as { modalities?: unknown }).modalities));
  });
  if (hosting) return hosting;
  return sections.find((section) => section.kind !== 'CANONICAL_REFERENCE' && (section.title ?? '').toLocaleLowerCase('pt-BR').includes('modalidade')) ?? null;
}

export function modalitySectionContent(content: unknown, modalities: SportsModality[]): Record<string, unknown> {
  const base = content && typeof content === 'object' && !Array.isArray(content) ? { ...content as Record<string, unknown> } : {};
  if (modalities.length === 0) {
    delete base.modalities;
    return base;
  }
  return { ...base, modalities };
}
