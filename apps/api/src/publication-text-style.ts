export class PublicationRichTextPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicationRichTextPolicyError';
  }
}

const FONTS = new Set(['sans', 'serif']);
const SIZES = new Set([12, 14, 16, 18, 20, 24]);
const COLORS = new Set(['navy', 'navy-soft', 'blue', 'blue-soft', 'text', 'muted', 'success', 'warning', 'danger']);
const FMT_OPEN = /^\[\[fmt ([a-z-]+) (12|14|16|18|20|24) ([a-z-]+)\]\]/u;
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
  // Consume every delimiter in order; stray closes and nested spans are invalid.
  const markers = /\[\[fmt\b[^\n]*?\]\]|\[\[fmt\b|\[\[\/fmt\]\]/gu;
  let opened = false;
  for (const marker of text.matchAll(markers)) {
    if (marker[0] === FMT_CLOSE) {
      if (!opened) {
        throw new PublicationRichTextPolicyError('Remova [[/fmt]] sem abertura correspondente.');
      }
      opened = false;
      continue;
    }
    if (opened) {
      throw new PublicationRichTextPolicyError('Não é permitido aninhar formatações.');
    }
    if (!parseFmtOpen(marker[0])) {
      throw new PublicationRichTextPolicyError('Use fonte, tamanho e cor permitidos na formatação.');
    }
    opened = true;
  }
  if (opened) {
    throw new PublicationRichTextPolicyError('Feche a formatação com [[/fmt]].');
  }
}

export function normalizePublicationRichText(text: string, label = 'texto'): string {
  assertPublicationRichTextSafe(text, label);
  return text.replace(/\r\n/g, '\n');
}


