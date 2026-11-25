/**
 * Medição tipográfica da etiqueta alinhada às fontes reais do CredentialLabel
 * (Arial / Helvetica / Georgia / Courier New). Não usa largura média por caractere:
 * cada glifo contribui com seu avanço (em) e a quebra segue overflow-wrap:anywhere.
 */

export type LabelFontFamily = 'sans' | 'serif' | 'mono';

export type MeasureOpts = {
  fontFamily?: LabelFontFamily;
  bold?: boolean;
  uppercase?: boolean;
  letterSpacingEm?: number;
};

/** Avanços em unidades em (UPEM=1000) — Arial do render térmico/prévia Evolvia. */
const ARIAL: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556,
  '8': 556, '9': 556, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556,
  '@': 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278,
  J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667,
  T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, '[': 278, '\\': 278,
  ']': 278, '^': 469, _: 556, '`': 333, a: 556, b: 556, c: 500, d: 556, e: 556,
  f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556,
  p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500,
  z: 500, '{': 334, '|': 260, '}': 334, '~': 584,
  Á: 667, À: 667, Â: 667, Ã: 667, Ä: 667, É: 667, Ê: 667, Í: 278, Ó: 778, Ô: 778,
  Õ: 778, Ö: 778, Ú: 722, Ü: 722, Ç: 722, á: 556, à: 556, â: 556, ã: 556, ä: 556,
  é: 556, ê: 556, í: 222, ó: 556, ô: 556, õ: 556, ö: 556, ú: 556, ü: 556, ç: 500,
  'º': 365, 'ª': 370, '–': 500, '—': 1000, '’': 191, '‘': 191,
};

const ARIAL_BOLD_SCALE = 1.06;
const GEORGIA_SCALE = 1.02;
const COURIER_EM = 600;

function glyphAdvanceEm(char: string, fontFamily: LabelFontFamily, bold: boolean): number {
  if (fontFamily === 'mono') return COURIER_EM / 1000;
  const base = ARIAL[char] ?? (
    /\p{L}/u.test(char) ? 620
      : /\p{N}/u.test(char) ? 556
        : /\p{M}/u.test(char) ? 0
          : 500
  );
  const familyScale = fontFamily === 'serif' ? GEORGIA_SCALE : 1;
  const weightScale = bold ? ARIAL_BOLD_SCALE : 1;
  return (base / 1000) * familyScale * weightScale;
}

/** Largura efetiva de um trecho contínuo (mm), somando glifos + letter-spacing. */
export function measureRunWidthMm(text: string, fontSizeMm: number, opts: MeasureOpts = {}): number {
  if (typeof text !== 'string' || !text || fontSizeMm <= 0) return 0;
  const fontFamily = opts.fontFamily ?? 'sans';
  const bold = Boolean(opts.bold);
  const value = opts.uppercase ? text.toLocaleUpperCase('pt-BR') : text;
  let units = 0;
  const chars = [...value];
  for (const char of chars) units += glyphAdvanceEm(char, fontFamily, bold);
  const spacing = Math.max(0, chars.length - 1) * (opts.letterSpacingEm ?? 0);
  return (units + spacing) * fontSizeMm;
}

/**
 * Quebra como o CSS da etiqueta: palavras primeiro; se a palavra não cabe,
 * overflow-wrap:anywhere parte por glifo.
 */
export function wrapTextToWidth(text: string, maxWidthMm: number, fontSizeMm: number, opts: MeasureOpts = {}): string[] {
  if (typeof text !== 'string') return [];
  const raw = text.replace(/\s+/gu, ' ').trim();
  if (!raw) return [];
  if (maxWidthMm <= 0 || fontSizeMm <= 0) return [raw];

  const lines: string[] = [];
  let current = '';
  const fits = (candidate: string) => measureRunWidthMm(candidate, fontSizeMm, opts) <= maxWidthMm + 1e-6;

  const pushGlyphs = (word: string) => {
    for (const char of [...word]) {
      const next = current + char;
      if (current && !fits(next)) {
        lines.push(current);
        current = char;
      } else {
        current = next;
      }
    }
  };

  for (const word of raw.split(' ')) {
    if (!current) {
      if (fits(word)) current = word;
      else pushGlyphs(word);
      continue;
    }
    const withSpace = `${current} ${word}`;
    if (fits(withSpace)) {
      current = withSpace;
      continue;
    }
    lines.push(current);
    current = '';
    if (fits(word)) current = word;
    else pushGlyphs(word);
  }
  if (current) lines.push(current);
  return lines.length ? lines : [raw];
}

export function measureTextBlockHeightMm(input: {
  text: string;
  maxWidthMm: number;
  fontSizeMm: number;
  lineHeight: number;
  scale: number;
  padYMm?: number;
  opts?: MeasureOpts;
}): { lines: string[]; heightMm: number; widthMm: number } {
  const fontMm = input.fontSizeMm * input.scale;
  const padY = (input.padYMm ?? 0) * input.scale;
  const lines = wrapTextToWidth(input.text, Math.max(0, input.maxWidthMm), fontMm, input.opts);
  const lineBox = fontMm * input.lineHeight;
  return {
    lines,
    heightMm: lines.length * lineBox + padY * 2,
    widthMm: Math.max(0, ...lines.map((line) => measureRunWidthMm(line, fontMm, input.opts))),
  };
}
