import { certificateFont, type CertificateFont } from './presence-certificate-font';

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
const USABLE = (PAGE_WIDTH - LEFT - RIGHT) * 1000;
const FIRST_BASELINE = 780;
const BOTTOM = 48;
const INVISIBLE = /[\p{Cf}\p{Cc}]/gu;
const RICH_INLINE = /\[([^\]\n]{1,180})\]\((https:\/\/[^)\s]{1,500})\)|\*\*([^*\n]{1,400})\*\*|\*([^*\n]{1,400})\*/gu;

type DrawLine = { text: string; size: 12 | 16 };

function flat(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').replace(INVISIBLE, '').trim();
}

// Mirrors the public rich text on the web page: markers disappear, words and link targets stay.
function richFlat(value: string): string {
  const lines = value.replace(/\r\n/gu, '\n').split('\n').map((line) => line.trim()
    .replace(/^#{1,3} (?=\S)/u, '')
    .replace(/^[-*] /u, '• ')
    .replace(RICH_INLINE, (_match, label?: string, href?: string, strong?: string, em?: string) => (
      label && href ? `${label} (${href})` : strong ?? em ?? ''
    )));
  return flat(lines.join(' '));
}

function unitsOf(font: CertificateFont, text: string): number {
  let total = 0;
  for (const char of text) total += font.advance(font.glyphOf(char.codePointAt(0)!));
  return total;
}

function fits(font: CertificateFont, text: string, size: number): boolean {
  return unitsOf(font, text) * size <= USABLE;
}

function wrap(font: CertificateFont, value: string, size: DrawLine['size']): string[] {
  const words = value.split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  const take = (word: string) => {
    if (fits(font, word, size)) {
      const next = current ? `${current} ${word}` : word;
      if (fits(font, next, size)) {
        current = next;
        return;
      }
      if (current) lines.push(current);
      current = word;
      return;
    }
    if (current) {
      lines.push(current);
      current = '';
    }
    let chunk = '';
    for (const char of word) {
      const next = chunk + char;
      if (chunk && !fits(font, next, size)) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk = next;
      }
    }
    current = chunk;
  };
  for (const word of words) take(word);
  if (current) lines.push(current);
  return lines;
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

function leading(size: DrawLine['size']): number {
  return size === 16 ? 20 : 16;
}

function lineGap(previous: DrawLine['size'] | null, current: DrawLine['size']): number {
  if (previous == null) return 0;
  return Math.max(leading(previous), leading(current));
}

function certificateLines(font: CertificateFont, page: CertificatePdfPage): DrawLine[] {
  const hours = page.hours == null ? 'Não informada' : `${page.hours} h`;
  const linesOf = (text: string, size: DrawLine['size']) => wrap(font, text, size).map((line) => ({ text: line, size }));
  return [
    ...linesOf('EVOLVIA', 12),
    ...linesOf(richFlat(page.title), 16),
    ...linesOf(richFlat(page.body), 12),
    ...linesOf(`Nome: ${flat(page.displayName)}`, 12),
    ...linesOf(`Evento: ${flat(page.eventName)}`, 12),
    ...linesOf(`Carga horária: ${hours}`, 12),
    ...linesOf(`Emitido em: ${issuedLabel(page.issuedAt)}`, 12),
    ...linesOf(`Código: ${flat(page.code)}`, 12),
    ...linesOf('Segunda via. O download não é cobrado.', 12),
    ...(page.note ? linesOf(flat(page.note), 12) : []),
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

function contentStream(font: CertificateFont, lines: DrawLine[], used: Map<number, number>): Buffer {
  const commands = ['BT', `${LEFT} ${FIRST_BASELINE} Td`];
  lines.forEach((line, index) => {
    if (index > 0) commands.push(`${lineGap(lines[index - 1]!.size, line.size)} TL`, 'T*');
    let glyphs = '';
    for (const char of line.text) {
      const codePoint = char.codePointAt(0)!;
      const glyph = font.glyphOf(codePoint);
      if (!used.has(glyph)) used.set(glyph, codePoint);
      glyphs += hex(glyph);
    }
    commands.push(`/F1 ${line.size} Tf`, `<${glyphs}> Tj`);
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

function assertDrawable(font: CertificateFont, pages: CertificatePdfPage[]) {
  const missing = new Set<string>();
  for (const page of pages) {
    const texts = [richFlat(page.title), richFlat(page.body), flat(page.displayName), flat(page.eventName), flat(page.code), flat(page.note ?? '')];
    for (const text of texts) {
      for (const char of text) {
        if (char !== ' ' && font.glyphOf(char.codePointAt(0)!) === 0) missing.add(char);
      }
    }
  }
  if (missing.size) throw new CertificateTextUnsupportedError([...missing].slice(0, 20));
}

export function certificatePdf(pages: CertificatePdfPage[]): Buffer {
  if (!pages.length) throw new Error('O PDF do certificado precisa de ao menos uma página.');
  const font = certificateFont();
  assertDrawable(font, pages);
  const used = new Map<number, number>();
  const streams = pages.flatMap((page) => paginate(certificateLines(font, page)).map((lines) => contentStream(font, lines, used)));
  const objects = new Map<number, Buffer>();
  const pageIds: number[] = [];
  let nextId = 4;
  for (const content of streams) {
    const pageId = nextId;
    const contentId = nextId + 1;
    nextId += 2;
    pageIds.push(pageId);
    objects.set(pageId, Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
      'latin1',
    ));
    objects.set(contentId, stream('', content));
  }
  const cidId = nextId;
  const descriptorId = nextId + 1;
  const fileId = nextId + 2;
  const unicodeId = nextId + 3;
  const widths = [...used.keys()].sort((left, right) => left - right).map((glyph) => `${glyph} [${font.advance(glyph)}]`).join(' ');
  objects.set(1, Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'));
  objects.set(2, Buffer.from(`<< /Type /Pages /Count ${streams.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`, 'latin1'));
  objects.set(3, Buffer.from(
    `<< /Type /Font /Subtype /Type0 /BaseFont /${font.name} /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] /ToUnicode ${unicodeId} 0 R >>`,
    'latin1',
  ));
  objects.set(cidId, Buffer.from(
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${font.name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptorId} 0 R /CIDToGIDMap /Identity /DW 1000 /W [${widths}] >>`,
    'latin1',
  ));
  objects.set(descriptorId, Buffer.from(
    `<< /Type /FontDescriptor /FontName /${font.name} /Flags 32 /FontBBox [${font.bbox.join(' ')}] /ItalicAngle 0 /Ascent ${font.ascent} /Descent ${font.descent} /CapHeight ${font.capHeight} /StemV 80 /FontFile2 ${fileId} 0 R >>`,
    'latin1',
  ));
  objects.set(fileId, stream(`/Filter /FlateDecode /Length1 ${font.length}`, font.compressed));
  objects.set(unicodeId, stream('', toUnicode(used)));
  const size = unicodeId + 1;
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
