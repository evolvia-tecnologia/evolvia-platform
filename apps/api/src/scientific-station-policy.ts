export const STATION_SEARCH_FIELDS = ['TITLE', 'AUTHOR', 'AREA', 'SUBAREA', 'INSTITUTION', 'CODE'] as const;
export type StationSearchField = (typeof STATION_SEARCH_FIELDS)[number];

const UNSAFE_TEXT = /\u0000|javascript\s*:|data\s*:\s*text\/html|<\s*(?:\/?\s*[a-z][^>]*>|!|\?)/iu;

export class ScientificStationPolicyError extends Error {}

export function normalizeStationSearch(field: unknown, text: unknown): { field: StationSearchField | null; text: string } {
  const rawField = typeof field === 'string' ? field.trim().toUpperCase() : '';
  const selected = (STATION_SEARCH_FIELDS as readonly string[]).includes(rawField) ? rawField as StationSearchField : null;
  if (field != null && field !== '' && !selected) throw new ScientificStationPolicyError('Escolha título, autor, área, subárea, instituição ou id do resumo.');
  const query = typeof text === 'string' ? text.trim().replace(/\s+/gu, ' ') : '';
  if (text != null && typeof text !== 'string') throw new ScientificStationPolicyError('Texto de busca inválido.');
  if (query.length > 80) throw new ScientificStationPolicyError('O texto da busca passa de 80 caracteres.');
  if (UNSAFE_TEXT.test(query)) throw new ScientificStationPolicyError('O texto da busca contém conteúdo não permitido.');
  if (selected === 'CODE') {
    if (query && !/^\d{1,6}$/u.test(query)) throw new ScientificStationPolicyError('O id do resumo precisa ser numérico.');
    return { field: selected, text: query };
  }
  if (query && query.length < 2) throw new ScientificStationPolicyError('Informe pelo menos 2 caracteres para buscar.');
  return { field: query ? selected ?? 'TITLE' : null, text: query };
}

export function stationFileName(code: number): string {
  return `eposter-${code}.pdf`;
}

export function stationAvailable(event: { status: string; profileCode: string | null; slug: string }): boolean {
  return event.status === 'PUBLISHED' && event.profileCode === 'SCIENTIFIC_EVENT' && event.slug.trim().length > 0;
}
