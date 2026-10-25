export class PublicationRichTextPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicationRichTextPolicyError';
  }
}

const FONTS = new Set(['sans', 'serif']);
const SIZES = new Set([12, 14, 16, 18, 20, 24]);
const COLORS = new Set(['navy', 'navy-soft', 'blue', 'blue-soft', 'text', 'muted', 'success', 'warning', 'danger']);
const FMT_OPEN = /^\[\[fmt ([a-z-]+) (\d+) ([a-z-]+)\]\]/u;
const FMT_CLOSE = '[[/fmt]]';

function parseFmtOpen(raw: string): boolean {
  const match = FMT_OPEN.exec(raw);
  if (!match) return false;
  const size = Number(match[2]);
  return FONTS.has(match[1]) && SIZES.has(size) && COLORS.has(match[3]);
}

export function assertPublicationRichTextSafe(text: string, label = 'texto'): void {
  if (/[<>]/.test(text) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    throw new PublicationRichTextPolicyError(`Use a formatação do editor. HTML não entra no ${label}.`);
  }
  if (/http:\/\//i.test(text)) {
    throw new PublicationRichTextPolicyError('Links externos devem usar HTTPS.');
  }
  let index = 0;
  while (index < text.length) {
    const openAt = text.indexOf('[[fmt ', index);
    if (openAt < 0) break;
    const headerEnd = text.indexOf(']]', openAt);
    if (headerEnd < 0) {
      throw new PublicationRichTextPolicyError('Feche a formatação com [[/fmt]] ou remova o trecho incompleto.');
    }
    const header = text.slice(openAt, headerEnd + 2);
    if (!parseFmtOpen(header)) {
      throw new PublicationRichTextPolicyError('Use fonte, tamanho e cor permitidos na formatação.');
    }
    const contentStart = headerEnd + 2;
    const closeTag = text.indexOf(FMT_CLOSE, contentStart);
    if (closeTag < 0) {
      throw new PublicationRichTextPolicyError('Feche a formatação com [[/fmt]].');
    }
    index = closeTag + FMT_CLOSE.length;
  }
  if (text.includes(FMT_CLOSE) && !text.includes('[[fmt ')) {
    throw new PublicationRichTextPolicyError('Remova [[/fmt]] sem abertura correspondente.');
  }
}

export function normalizePublicationRichText(text: string, label = 'texto'): string {
  assertPublicationRichTextSafe(text, label);
  return text.replace(/\r\n/g, '\n');
}
