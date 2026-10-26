import { certificateFont, type CertificateFont, type CertificateFontVariant } from './presence-certificate-font';

export const CERTIFICATE_BATCH_MAX = 40;

export type CertificatePdfPage = {
  title: string;
  body: string;
  displayName: string;
  eventName: string;
  hours: number | null;
  issuedAt: string;
  code: string;
  note?: string | null;
  back?: string | null;
};

export class CertificateTextUnsupportedError extends Error {
  readonly characters: string[];

  constructor(characters: string[]) {
    super(`O PDF não consegue desenhar: ${characters.join(' ')}`);
    this.characters = characters;
  }
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 50;
const RIGHT = 40;
const USABLE = PAGE_WIDTH - LEFT - RIGHT;
const FIRST_BASELINE = 780;
const BOTTOM = 48;
const INVISIBLE = /[\p{Cf}\p{Cc}]/gu;
// CSS pixels map to PDF points at 96/72 dpi; colors mirror design-tokens.css.
const COLORS: Record<string, string> = {
  navy: '#111a2f', 'navy-soft': '#22365e', blue: '#0b64e5', 'blue-soft': '#0748a4',
  text: '#10233d', muted: '#5d6f87', success: '#147449', warning: '#875600', danger: '#a52b2b',
};
const FMT = '(sans|serif) (12|14|16|18|20|24) (navy|navy-soft|blue|blue-soft|text|muted|success|warning|danger)';
type Align = 'left' | 'center' | 'right';
type Run = { text: string; size: number; font: CertificateFontVariant; color: string };
type DrawLine = { runs: Run[]; size: number; align: Align };
type Glyph = { char: string; run: Run; width: number };
type UsedFont = { font: CertificateFont; label: string; used: Map<number, number> };

function flat(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').replace(INVISIBLE, '').trim();
}

function width(run: Run, text = run.text): number {
  const font = certificateFont(run.font);
  let total = 0;
  for (const char of text) total += font.advance(font.glyphOf(char.codePointAt(0)!)) * run.size / 1000;
  return total;
}

function styledLines(value: string, defaultSize: number): DrawLine[] {
  const normalized = value.normalize('NFC').replace(/\r\n/gu, '\n').replace(
    new RegExp(`(\\[\\[fmt ${FMT}\\]\\])([\\s\\S]*?)\\[\\[\\/fmt\\]\\]`, 'gu'),
    (_span, open: string, _family: string, _size: string, _color: string, content: string) => content.split('\n').map((line) => {
      if (!line) return '';
      const prefix = /^(?:@(?:left|center|right) )?(?:#{1,3} |[-*] |\d{1,3}\. )?/u.exec(line)![0];
      return `${prefix}${open}${line.slice(prefix.length)}[[/fmt]]`;
    }).join('\n'),
  );
  return normalized.split('\n').flatMap((raw) => {
    let content = raw.trim();
    const alignment = /^@(left|center|right) /u.exec(content);
    const align = (alignment?.[1] ?? 'left') as Align;
    if (alignment) content = content.slice(alignment[0].length);
    content = content.replace(/^#{1,3} (?=\S)/u, '').replace(/^[-*] /u, '• ');
    const tokens = new RegExp(`\\[\\[fmt ${FMT}\\]\\]|\\[\\[\\/fmt\\]\\]|\\[([^\\]\\n]{1,180})\\]\\((https:\\/\\/[^)\\s]{1,500})\\)|\\*\\*([^*\\n]{1,400})\\*\\*|\\*([^*\\n]{1,400})\\*`, 'gu');
    const defaults: Run = { text: '', size: defaultSize, font: 'sans', color: COLORS.text! };
    let style = defaults;
    let cursor = 0;
    const runs: Run[] = [];
    const append = (text: string, font = style.font) => {
      if (text) runs.push({ ...style, font, text: text.replace(INVISIBLE, '') });
    };
    for (const match of content.matchAll(tokens)) {
      append(content.slice(cursor, match.index));
      if (match[1]) {
        style = { text: '', font: match[1] as CertificateFontVariant, size: Number(match[2]) * 0.75, color: COLORS[match[3]!]! };
      } else if (match[0] === '[[/fmt]]') style = defaults;
      else if (match[4] && match[5]) append(`${match[4]} (${match[5]})`);
      else if (match[6]) append(match[6], `${style.font}-bold` as CertificateFontVariant);
      else if (match[7]) append(match[7], `${style.font}-italic` as CertificateFontVariant);
      cursor = match.index! + match[0].length;
    }
    append(content.slice(cursor));
    return wrapRuns(runs, align, defaultSize);
  });
}

function wrapRuns(runs: Run[], align: Align, defaultSize: number): DrawLine[] {
  const glyphs: Glyph[] = [];
  for (const run of runs) for (const original of run.text) {
    const char = /\s/u.test(original) ? ' ' : original;
    if (char === ' ' && (!glyphs.length || glyphs.at(-1)!.char === ' ')) continue;
    glyphs.push({ char, run, width: width(run, char) });
  }
  if (glyphs.at(-1)?.char === ' ') glyphs.pop();
  const result: DrawLine[] = [];
  let current: Glyph[] = [];
  let currentWidth = 0;
  const flush = () => {
    while (current.at(-1)?.char === ' ') current.pop();
    const output: Run[] = [];
    for (const glyph of current) {
      const last = output.at(-1);
      if (last && last.font === glyph.run.font && last.size === glyph.run.size && last.color === glyph.run.color) last.text += glyph.char;
      else output.push({ ...glyph.run, text: glyph.char });
    }
    result.push({ runs: output, align, size: Math.max(defaultSize, ...output.map((run) => run.size)) });
    current = [];
    currentWidth = 0;
  };
  for (const glyph of glyphs) {
    if (currentWidth + glyph.width > USABLE && current.length) {
      const space = current.map((entry) => entry.char).lastIndexOf(' ');
      if (space >= 0) {
        const tail = current.slice(space + 1);
        current = current.slice(0, space);
        flush();
        current = tail;
        currentWidth = tail.reduce((total, entry) => total + entry.width, 0);
      } else flush();
    }
    if (glyph.char === ' ' && !current.length) continue;
    current.push(glyph);
    currentWidth += glyph.width;
  }
  if (current.length || !result.length) flush();
  return result;
}

function issuedLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function lineGap(previous: number | null, current: number): number {
  if (previous == null) return 0;
  return Math.ceil(Math.max(previous, current) * 1.35);
}

function certificateLines(page: CertificatePdfPage): DrawLine[] {
  const hours = page.hours == null ? 'Não informada' : `${page.hours} h`;
  const plain = (text: string) => wrapRuns([{ text: flat(text), size: 12, font: 'sans', color: COLORS.text! }], 'left', 12);
  return [
    ...plain('EVOLVIA'),
    ...styledLines(page.title, 16),
    ...styledLines(page.body, 12),
    ...plain(`Nome: ${page.displayName}`),
    ...plain(`Evento: ${page.eventName}`),
    ...plain(`Carga horária: ${hours}`),
    ...plain(`Emitido em: ${issuedLabel(page.issuedAt)}`),
    ...plain(`Código: ${page.code}`),
    ...plain('Segunda via. O download não é cobrado.'),
    ...(page.note ? plain(page.note) : []),
  ];
}

function paginate(lines: DrawLine[]): DrawLine[][] {
  const pages: DrawLine[][] = [];
  let current: DrawLine[] = [];
  let baseline = FIRST_BASELINE;
  let previous: DrawLine['size'] | null = null;
  for (const line of lines) {
    const gap = lineGap(previous, line.size);
    if (current.length > 0 && baseline - gap < BOTTOM) {
      pages.push(current);
      current = [];
      baseline = FIRST_BASELINE;
      previous = null;
    }
    current.push(line);
    baseline -= lineGap(previous, line.size);
    previous = line.size;
  }
  if (current.length) pages.push(current);
  return pages;
}

function hex(value: number): string {
  return value.toString(16).toUpperCase().padStart(4, '0');
}

function utf16(codePoint: number): string {
  if (codePoint <= 0xffff) return hex(codePoint);
  const offset = codePoint - 0x10000;
  return hex(0xd800 + (offset >> 10)) + hex(0xdc00 + (offset & 0x3ff));
}

function contentStream(lines: DrawLine[], fonts: Map<CertificateFontVariant, UsedFont>, missing: Set<string>): Buffer {
  const commands = ['BT'];
  let baseline = FIRST_BASELINE;
  lines.forEach((line, index) => {
    if (index > 0) baseline -= lineGap(lines[index - 1]!.size, line.size);
    const lineWidth = line.runs.reduce((total, run) => total + width(run), 0);
    let x = LEFT + (line.align === 'center' ? (USABLE - lineWidth) / 2 : line.align === 'right' ? USABLE - lineWidth : 0);
    for (const run of line.runs) {
      let entry = fonts.get(run.font);
      if (!entry) {
        entry = { font: certificateFont(run.font), label: `F${fonts.size + 1}`, used: new Map() };
        fonts.set(run.font, entry);
      }
      let glyphs = '';
      for (const char of run.text) {
        const codePoint = char.codePointAt(0)!;
        const glyph = entry.font.glyphOf(codePoint);
        if (char !== ' ' && glyph === 0) missing.add(char);
        if (!entry.used.has(glyph)) entry.used.set(glyph, codePoint);
        glyphs += hex(glyph);
      }
      const rgb = [1, 3, 5].map((offset) => (parseInt(run.color.slice(offset, offset + 2), 16) / 255).toFixed(5)).join(' ');
      commands.push(`${rgb} rg`, `/${entry.label} ${run.size} Tf`, `1 0 0 1 ${x.toFixed(3)} ${baseline} Tm`, `<${glyphs}> Tj`);
      x += width(run);
    }
  });
  commands.push('ET');
  return Buffer.from(commands.join('\n'), 'latin1');
}

function toUnicode(used: Map<number, number>): Buffer {
  const entries = [...used.entries()].sort((left, right) => left[0] - right[0]);
  const blocks: string[] = [];
  for (let start = 0; start < entries.length; start += 100) {
    const block = entries.slice(start, start + 100);
    blocks.push(`${block.length} beginbfchar`, ...block.map(([glyph, codePoint]) => `<${hex(glyph)}> <${utf16(codePoint)}>`), 'endbfchar');
  }
  return Buffer.from([
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
    ...blocks,
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n'), 'latin1');
}

function stream(dictionary: string, data: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(`<< ${dictionary} /Length ${data.length} >> stream\n`, 'latin1'),
    data,
    Buffer.from('\nendstream', 'latin1'),
  ]);
}

export function certificatePdf(pages: CertificatePdfPage[]): Buffer {
  if (!pages.length) throw new Error('O PDF do certificado precisa de ao menos uma página.');
  const fonts = new Map<CertificateFontVariant, UsedFont>();
  const missing = new Set<string>();
  const streams = pages.flatMap((page) => {
    const front = paginate(certificateLines(page));
    // A verso always starts on a new sheet, even when the front spans pages.
    const back = page.back ? paginate([
      ...styledLines('Verso', 16),
      ...styledLines(page.back, 12),
      ...styledLines(`Código: ${page.code}`, 12),
    ]) : [];
    return [...front, ...back].map((lines) => contentStream(lines, fonts, missing));
  });
  if (missing.size) throw new CertificateTextUnsupportedError([...missing].slice(0, 20));
  const objects = new Map<number, Buffer>();
  const pageIds: number[] = [];
  let nextId = 3 + streams.length * 2;
  const resources: string[] = [];
  for (const entry of fonts.values()) {
    const { font, used } = entry;
    const fontId = nextId;
    const cidId = nextId + 1;
    const descriptorId = nextId + 2;
    const fileId = nextId + 3;
    const unicodeId = nextId + 4;
    nextId += 5;
    resources.push(`/${entry.label} ${fontId} 0 R`);
    const widths = [...used.keys()].sort((left, right) => left - right).map((glyph) => `${glyph} [${font.advance(glyph)}]`).join(' ');
    objects.set(fontId, Buffer.from(`<< /Type /Font /Subtype /Type0 /BaseFont /${font.name} /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] /ToUnicode ${unicodeId} 0 R >>`, 'latin1'));
    objects.set(cidId, Buffer.from(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${font.name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptorId} 0 R /CIDToGIDMap /Identity /DW 1000 /W [${widths}] >>`, 'latin1'));
    const italic = /Italic|Oblique/u.test(font.name);
    const flags = 32 + (font.name.includes('Serif') ? 2 : 0) + (italic ? 64 : 0);
    objects.set(descriptorId, Buffer.from(`<< /Type /FontDescriptor /FontName /${font.name} /Flags ${flags} /FontBBox [${font.bbox.join(' ')}] /ItalicAngle ${italic ? -11 : 0} /Ascent ${font.ascent} /Descent ${font.descent} /CapHeight ${font.capHeight} /StemV 80 /FontFile2 ${fileId} 0 R >>`, 'latin1'));
    objects.set(fileId, stream(`/Filter /FlateDecode /Length1 ${font.length}`, font.compressed));
    objects.set(unicodeId, stream('', toUnicode(used)));
  }
  streams.forEach((content, index) => {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    objects.set(pageId, Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentId} 0 R /Resources << /Font << ${resources.join(' ')} >> >> >>`, 'latin1'));
    objects.set(contentId, stream('', content));
  });
  objects.set(1, Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'));
  objects.set(2, Buffer.from(`<< /Type /Pages /Count ${streams.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`, 'latin1'));
  const size = nextId;
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const offsets: number[] = [];
  let cursor = parts[0]!.length;
  for (let id = 1; id < size; id += 1) {
    const object = Buffer.concat([Buffer.from(`${id} 0 obj\n`, 'latin1'), objects.get(id)!, Buffer.from('\nendobj\n', 'latin1')]);
    offsets[id] = cursor;
    cursor += object.length;
    parts.push(object);
  }
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let id = 1; id < size; id += 1) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  parts.push(Buffer.from(`${xref}trailer << /Size ${size} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(parts);
}

