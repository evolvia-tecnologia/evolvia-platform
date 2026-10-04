export type StationLanguage = 'pt' | 'es' | 'en';

const LABELS = {
  pt: {
    book: 'Livro de resumo eletrônico',
    item: 'Resumo',
    area: 'Área',
    authors: 'Autores',
    institutions: 'Instituições',
    abstract: 'Resumo',
    keywords: 'Palavras-chave',
    back: 'Voltar à estação científica',
    download: 'Download do e-pôster',
    qr: 'QR Code para download do e-pôster',
    missingAuthors: 'Não informado',
    missingInstitutions: 'Não informada',
    missingAbstract: 'Este trabalho não tem resumo digitado.',
    missingKeywords: 'Não informadas',
    code: 'Resumo',
  },
  es: {
    book: 'Libro de resúmenes electrónicos',
    item: 'Resumen',
    area: 'Área',
    authors: 'Autores',
    institutions: 'Instituciones',
    abstract: 'Resumen',
    keywords: 'Palabras clave',
    back: 'Volver a la estación científica',
    download: 'Descargar el e-póster',
    qr: 'Código QR para descargar el e-póster',
    missingAuthors: 'No informado',
    missingInstitutions: 'No informada',
    missingAbstract: 'Este trabajo no tiene resumen escrito.',
    missingKeywords: 'No informadas',
    code: 'Resumen',
  },
  en: {
    book: 'Electronic abstract book',
    item: 'Abstract',
    area: 'Area',
    authors: 'Authors',
    institutions: 'Institutions',
    abstract: 'Abstract',
    keywords: 'Keywords',
    back: 'Back to the scientific station',
    download: 'Download e-poster',
    qr: 'QR code to download the e-poster',
    missingAuthors: 'Not informed',
    missingInstitutions: 'Not informed',
    missingAbstract: 'This work has no written abstract.',
    missingKeywords: 'Not informed',
    code: 'Abstract',
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

export function stationCodeLabel(code: number): string {
  return String(code).padStart(3, '0');
}

export function abstractParagraphs(text: string): string[] {
  const blocks = text.split(/\n{2,}/u).map((item) => item.trim()).filter(Boolean);
  return blocks.length > 0 ? blocks : [text.trim()];
}
