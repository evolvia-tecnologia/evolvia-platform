import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

export type CertificateFont = {
  name: string;
  compressed: Buffer;
  length: number;
  bbox: [number, number, number, number];
  ascent: number;
  descent: number;
  capHeight: number;
  glyphOf(codePoint: number): number;
  advance(glyph: number): number;
};

const FONT_NAMES = {
  sans: 'DejaVuSans',
  'sans-bold': 'DejaVuSans-Bold',
  'sans-italic': 'DejaVuSans-Oblique',
  'sans-bold-italic': 'DejaVuSans-BoldOblique',
  serif: 'DejaVuSerif',
  'serif-bold': 'DejaVuSerif-Bold',
  'serif-italic': 'DejaVuSerif-Italic',
  'serif-bold-italic': 'DejaVuSerif-BoldItalic',
} as const;
export type CertificateFontVariant = keyof typeof FONT_NAMES;
const cached = new Map<CertificateFontVariant, CertificateFont>();

function fontPath(variant: CertificateFontVariant): string {
  // Tests load the TypeScript source as ESM, where __filename does not exist.
  const anchor = typeof __filename === 'string' ? __filename : join(process.cwd(), 'package.json');
  return createRequire(anchor).resolve(`dejavu-fonts-ttf/ttf/${FONT_NAMES[variant]}.ttf`);
}

function tables(bytes: Buffer): Map<string, { offset: number; length: number }> {
  const count = bytes.readUInt16BE(4);
  const result = new Map<string, { offset: number; length: number }>();
  for (let index = 0; index < count; index += 1) {
    const record = 12 + index * 16;
    result.set(bytes.toString('latin1', record, record + 4), {
      offset: bytes.readUInt32BE(record + 8),
      length: bytes.readUInt32BE(record + 12),
    });
  }
  return result;
}

function cmapLookup(bytes: Buffer, cmapOffset: number): (codePoint: number) => number {
  const count = bytes.readUInt16BE(cmapOffset + 2);
  let format12 = -1;
  let format4 = -1;
  for (let index = 0; index < count; index += 1) {
    const record = cmapOffset + 4 + index * 8;
    const platform = bytes.readUInt16BE(record);
    const encoding = bytes.readUInt16BE(record + 2);
    const subtable = cmapOffset + bytes.readUInt32BE(record + 4);
    const format = bytes.readUInt16BE(subtable);
    if (format === 12 && (platform === 3 || platform === 0)) format12 = subtable;
    if (format === 4 && ((platform === 3 && encoding === 1) || platform === 0) && format4 < 0) format4 = subtable;
  }
  if (format12 >= 0) {
    const groups = bytes.readUInt32BE(format12 + 12);
    return (codePoint) => {
      let low = 0;
      let high = groups - 1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        const group = format12 + 16 + middle * 12;
        const start = bytes.readUInt32BE(group);
        const end = bytes.readUInt32BE(group + 4);
        if (codePoint < start) high = middle - 1;
        else if (codePoint > end) low = middle + 1;
        else return bytes.readUInt32BE(group + 8) + codePoint - start;
      }
      return 0;
    };
  }
  if (format4 < 0) throw new Error('A fonte do certificado não tem mapa Unicode.');
  const segments = bytes.readUInt16BE(format4 + 6) / 2;
  const ends = format4 + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const ranges = deltas + segments * 2;
  return (codePoint) => {
    if (codePoint > 0xffff) return 0;
    for (let index = 0; index < segments; index += 1) {
      if (codePoint > bytes.readUInt16BE(ends + index * 2)) continue;
      const start = bytes.readUInt16BE(starts + index * 2);
      if (codePoint < start) return 0;
      const delta = bytes.readInt16BE(deltas + index * 2);
      const rangeAt = ranges + index * 2;
      const range = bytes.readUInt16BE(rangeAt);
      if (range === 0) return (codePoint + delta) & 0xffff;
      const glyph = bytes.readUInt16BE(rangeAt + range + (codePoint - start) * 2);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
}

export function certificateFont(variant: CertificateFontVariant = 'sans'): CertificateFont {
  const existing = cached.get(variant);
  if (existing) return existing;
  const bytes = readFileSync(fontPath(variant));
  const table = tables(bytes);
  const need = (tag: string) => {
    const found = table.get(tag);
    if (!found) throw new Error(`A fonte do certificado não tem a tabela ${tag}.`);
    return found.offset;
  };
  const head = need('head');
  const hhea = need('hhea');
  const hmtx = need('hmtx');
  const unitsPerEm = bytes.readUInt16BE(head + 18);
  const scale = (value: number) => Math.round((value * 1000) / unitsPerEm);
  const metrics = bytes.readUInt16BE(hhea + 34);
  const os2 = table.get('OS/2');
  const ascent = scale(bytes.readInt16BE(hhea + 4));
  const lookup = cmapLookup(bytes, need('cmap'));
  const glyphs = new Map<number, number>();
  const font: CertificateFont = {
    name: FONT_NAMES[variant],
    compressed: deflateSync(bytes, { level: 9 }),
    length: bytes.length,
    bbox: [
      scale(bytes.readInt16BE(head + 36)), scale(bytes.readInt16BE(head + 38)),
      scale(bytes.readInt16BE(head + 40)), scale(bytes.readInt16BE(head + 42)),
    ],
    ascent,
    descent: scale(bytes.readInt16BE(hhea + 6)),
    capHeight: os2 && bytes.readUInt16BE(os2.offset) >= 2 ? scale(bytes.readInt16BE(os2.offset + 88)) : Math.round(ascent * 0.7),
    glyphOf(codePoint) {
      let glyph = glyphs.get(codePoint);
      if (glyph === undefined) {
        glyph = lookup(codePoint);
        glyphs.set(codePoint, glyph);
      }
      return glyph;
    },
    advance(glyph) {
      const index = Math.min(glyph, metrics - 1);
      return scale(bytes.readUInt16BE(hmtx + index * 4));
    },
  };
  cached.set(variant, font);
  return font;
}

