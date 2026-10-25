export const RICH_TEXT_FONTS = ['sans', 'serif'] as const;
export type RichTextFont = (typeof RICH_TEXT_FONTS)[number];

export const RICH_TEXT_SIZES = [12, 14, 16, 18, 20, 24] as const;
export type RichTextSize = (typeof RICH_TEXT_SIZES)[number];

export const RICH_TEXT_COLORS = [
  'navy',
  'navy-soft',
  'blue',
  'blue-soft',
  'text',
  'muted',
  'success',
  'warning',
  'danger',
] as const;
export type RichTextColor = (typeof RICH_TEXT_COLORS)[number];

export const RICH_TEXT_ALIGNS = ['left', 'center', 'right'] as const;
export type RichTextAlign = (typeof RICH_TEXT_ALIGNS)[number];

export const RICH_TEXT_COLOR_CSS: Record<RichTextColor, string> = {
  navy: 'var(--color-brand-navy-950)',
  'navy-soft': 'var(--color-brand-navy-800)',
  blue: 'var(--color-brand-blue-600)',
  'blue-soft': 'var(--color-brand-blue-700)',
  text: 'var(--color-text)',
  muted: 'var(--color-text-muted)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
};

export const RICH_TEXT_FONT_FAMILY: Record<RichTextFont, string> = {
  sans: 'var(--font-family-sans)',
  serif: 'Georgia, "Times New Roman", Times, serif',
};

const FONT_SET = new Set<string>(RICH_TEXT_FONTS);
const SIZE_SET = new Set<number>(RICH_TEXT_SIZES);
const COLOR_SET = new Set<string>(RICH_TEXT_COLORS);
const ALIGN_SET = new Set<string>(RICH_TEXT_ALIGNS);

const ALIGN_PREFIX = /^@(left|center|right) /u;
const FMT_OPEN = /^\[\[fmt ([a-z-]+) (\d+) ([a-z-]+)\]\]/u;
const FMT_CLOSE = '[[/fmt]]';

export class PublicationRichTextPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicationRichTextPolicyError';
  }
}

export function parseRichTextAlign(line: string): { align: RichTextAlign; content: string } {
  const match = ALIGN_PREFIX.exec(line);
  if (!match) return { align: 'left', content: line };
  return { align: match[1] as RichTextAlign, content: line.slice(match[0].length) };
}

export function applyRichTextAlign(line: string, align: RichTextAlign): string {
  const { content } = parseRichTextAlign(line);
  if (align === 'left') return content;
  return `@${align} ${content}`;
}

export function richTextFmtOpen(font: RichTextFont, size: RichTextSize, color: RichTextColor): string {
  return `[[fmt ${font} ${size} ${color}]]`;
}

export function wrapRichTextFmt(
  value: string,
  start: number,
  end: number,
  font: RichTextFont,
  size: RichTextSize,
  color: RichTextColor,
): { next: string; from: number; to: number } {
  const selected = value.slice(start, end) || 'texto';
  const open = richTextFmtOpen(font, size, color);
  const wrapped = `${open}${selected}${FMT_CLOSE}`;
  return {
    next: value.slice(0, start) + wrapped + value.slice(end),
    from: start + open.length,
    to: start + open.length + selected.length,
  };
}

function parseFmtOpen(raw: string): { font: RichTextFont; size: RichTextSize; color: RichTextColor } | null {
  const match = FMT_OPEN.exec(raw);
  if (!match) return null;
  const font = match[1];
  const size = Number(match[2]);
  const color = match[3];
  if (!FONT_SET.has(font) || !SIZE_SET.has(size) || !COLOR_SET.has(color)) return null;
  return { font: font as RichTextFont, size: size as RichTextSize, color: color as RichTextColor };
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


