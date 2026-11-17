export type StationLanguage = 'pt' | 'es' | 'en';

const LABELS = {
  pt: {
    book: 'Livro de resumo eletrônico',
    station: 'Estação científica',
    listTitle: 'Lista completa — ordem de título',
    listHelp: 'Informe abaixo o texto da sua pesquisa. Pode ser parte do título, nome do autor, área, subárea, instituição ou id do resumo.',
    search: 'Buscar',
    clear: 'Limpar seleção',
    fieldTitle: 'Título',
    fieldAuthor: 'Autor',
    fieldCode: 'Id do resumo',
    fieldQuery: 'Texto da busca',
    item: 'Resumo',
    eposter: 'E-poster',
    area: 'Área',
    subarea: 'Subárea',
    authors: 'Autores',
    authorLine: 'Autor(es)',
    institutions: 'Instituições',
    institution: 'Instituição',
    abstract: 'Resumo',
    keywords: 'Palavras-chave',
    back: 'Voltar',
    download: 'Download E-pôster',
    qr: 'QR Code para download do e-pôster',
    missingAuthors: 'Não informado',
    missingInstitutions: 'Não informada',
    missingAbstract: 'Este trabalho não tem resumo digitado.',
    missingKeywords: 'Não informadas',
    code: 'Resumo',
    publishedOne: 'trabalho publicado',
    publishedMany: 'trabalhos publicados',
    refine: 'Refine a busca para ver o restante.',
    noResults: 'Nenhum trabalho publicado corresponde a esta busca.',
    unavailable: 'Estação científica indisponível.',
  },
  es: {
    book: 'Libro de resúmenes electrónicos',
    station: 'Estación científica',
    listTitle: 'Lista completa — orden del título',
    listHelp: 'Indique el texto de la búsqueda. Puede ser parte del título, del autor, del área, de la subárea, de la institución o del id del resumen.',
    search: 'Buscar',
    clear: 'Limpiar selección',
    fieldTitle: 'Título',
    fieldAuthor: 'Autor',
    fieldCode: 'Id del resumen',
    fieldQuery: 'Texto de la búsqueda',
    item: 'Resumen',
    eposter: 'E-póster',
    area: 'Área',
    subarea: 'Subárea',
    authors: 'Autores',
    authorLine: 'Autor(es)',
    institutions: 'Instituciones',
    institution: 'Institución',
    abstract: 'Resumen',
    keywords: 'Palabras clave',
    back: 'Volver',
    download: 'Descargar e-póster',
    qr: 'Código QR para descargar el e-póster',
    missingAuthors: 'No informado',
    missingInstitutions: 'No informada',
    missingAbstract: 'Este trabajo no tiene resumen escrito.',
    missingKeywords: 'No informadas',
    code: 'Resumen',
    publishedOne: 'trabajo publicado',
    publishedMany: 'trabajos publicados',
    refine: 'Refine la búsqueda para ver el resto.',
    noResults: 'Ningún trabajo publicado coincide con esta búsqueda.',
    unavailable: 'Estación científica no disponible.',
  },
  en: {
    book: 'Electronic abstract book',
    station: 'Scientific station',
    listTitle: 'Complete list — title order',
    listHelp: 'Enter the search text. It can be part of the title, author, area, subarea, institution, or abstract id.',
    search: 'Search',
    clear: 'Clear selection',
    fieldTitle: 'Title',
    fieldAuthor: 'Author',
    fieldCode: 'Abstract id',
    fieldQuery: 'Search text',
    item: 'Abstract',
    eposter: 'E-poster',
    area: 'Area',
    subarea: 'Subarea',
    authors: 'Authors',
    authorLine: 'Author(s)',
    institutions: 'Institutions',
    institution: 'Institution',
    abstract: 'Abstract',
    keywords: 'Keywords',
    back: 'Back',
    download: 'Download e-poster',
    qr: 'QR code to download the e-poster',
    missingAuthors: 'Not informed',
    missingInstitutions: 'Not informed',
    missingAbstract: 'This work has no written abstract.',
    missingKeywords: 'Not informed',
    code: 'Abstract',
    publishedOne: 'published work',
    publishedMany: 'published works',
    refine: 'Refine the search to see the remaining results.',
    noResults: 'No published work matches this search.',
    unavailable: 'Scientific station unavailable.',
  },
} as const;

export function stationLanguage(value: string | null | undefined): StationLanguage {
  return value === 'es' || value === 'en' ? value : 'pt';
}

export function stationLabels(language: StationLanguage) {
  return LABELS[language];
}

export function formatStationTitle(title: string): string {
  const trimmed = title.trim().replace(/\s+/gu, ' ');
  const letters = trimmed.replace(/[^\p{L}]/gu, '');
  if (!letters) return trimmed;
  const upper = letters.toLocaleUpperCase('pt-BR');
  const lower = letters.toLocaleLowerCase('pt-BR');
  const uniform = letters === upper || letters === lower;
  if (!uniform || letters === lower && letters === upper) return trimmed;
  const sentence = trimmed.toLocaleLowerCase('pt-BR');
  return sentence.charAt(0).toLocaleUpperCase('pt-BR') + sentence.slice(1);
}

const FORMAT_MARK: Record<string, string> = {
  ORAL: 'AO',
  TEMA_LIVRE: 'TL',
  POSTER: 'PO',
  EPOSTER: 'PD',
};

export function stationCodeLabel(code: number): string {
  return String(code).padStart(3, '0');
}

export function stationFormatMark(code: string | null | undefined): string {
  if (!code || !/^[A-Z0-9_]{2,40}$/u.test(code)) return '';
  return FORMAT_MARK[code] ?? (/^[A-Z]{2,4}$/u.test(code) ? code : '');
}

export function stationCodeMark(code: number, formatCode: string | null | undefined): string {
  const mark = stationFormatMark(formatCode);
  const label = stationCodeLabel(code);
  return mark ? `${label}-${mark}` : label;
}

export function stationWorkHeading(code: number, formatCode: string | null | undefined, title: string): string {
  return `${stationCodeMark(code, formatCode)}-${formatStationTitle(title)}`;
}

export function abstractParagraphs(text: string): string[] {
  const blocks = text.split(/\n{2,}/u).map((item) => item.trim()).filter(Boolean);
  return blocks.length > 0 ? blocks : [text.trim()];
}
