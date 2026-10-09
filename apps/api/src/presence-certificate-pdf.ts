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

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 50;
const RIGHT = 40;
const USABLE = (PAGE_WIDTH - LEFT - RIGHT) * 1000;
const FIRST_BASELINE = 780;
const BOTTOM = 48;
const WIDEST = 1015;

const WIN: Record<string, number> = {
  á: 0xe1, à: 0xe0, â: 0xe2, ã: 0xe3, ä: 0xe4,
  é: 0xe9, è: 0xe8, ê: 0xea, ë: 0xeb,
  í: 0xed, ì: 0xec, î: 0xee, ï: 0xef,
  ó: 0xf3, ò: 0xf2, ô: 0xf4, õ: 0xf5, ö: 0xf6,
  ú: 0xfa, ù: 0xf9, û: 0xfb, ü: 0xfc,
  ç: 0xe7, ñ: 0xf1,
  Á: 0xc1, À: 0xc0, Â: 0xc2, Ã: 0xc3, Ä: 0xc4,
  É: 0xc9, È: 0xc8, Ê: 0xca, Ë: 0xcb,
  Í: 0xcd, Ì: 0xcc, Î: 0xce, Ï: 0xcf,
  Ó: 0xd3, Ò: 0xd2, Ô: 0xd4, Õ: 0xd5, Ö: 0xd6,
  Ú: 0xda, Ù: 0xd9, Û: 0xdb, Ü: 0xdc,
  Ç: 0xc7, Ñ: 0xd1,
  º: 0xba, ª: 0xaa,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94,
  '–': 0x96, '—': 0x97, '…': 0x85,
  '°': 0xb0, '§': 0xa7,
};

const HELVETICA_WIDTH: Record<string, number> = {
  " ": 278,
  "!": 278,
  "\"": 355,
  "#": 556,
  "$": 556,
  "%": 889,
  "&": 667,
  "'": 222,
  "(": 333,
  ")": 333,
  "*": 389,
  "+": 584,
  ",": 278,
  "-": 333,
  ".": 278,
  "/": 278,
  "0": 556,
  "1": 556,
  "2": 556,
  "3": 556,
  "4": 556,
  "5": 556,
  "6": 556,
  "7": 556,
  "8": 556,
  "9": 556,
  ":": 278,
  ";": 278,
  "<": 584,
  "=": 584,
  ">": 584,
  "?": 556,
  "@": 1015,
  "A": 667,
  "B": 667,
  "C": 722,
  "D": 722,
  "E": 667,
  "F": 611,
  "G": 778,
  "H": 722,
  "I": 278,
  "J": 500,
  "K": 667,
  "L": 556,
  "M": 833,
  "N": 722,
  "O": 778,
  "P": 667,
  "Q": 778,
  "R": 722,
  "S": 667,
  "T": 611,
  "U": 722,
  "V": 667,
  "W": 944,
  "X": 667,
  "Y": 667,
  "Z": 611,
  "[": 278,
  "\\": 278,
  "]": 278,
  "^": 469,
  "_": 556,
  "`": 222,
  "a": 556,
  "b": 556,
  "c": 500,
  "d": 556,
  "e": 556,
  "f": 278,
  "g": 556,
  "h": 556,
  "i": 222,
  "j": 222,
  "k": 500,
  "l": 222,
  "m": 833,
  "n": 556,
  "o": 556,
  "p": 556,
  "q": 556,
  "r": 333,
  "s": 500,
  "t": 278,
  "u": 556,
  "v": 500,
  "w": 722,
  "x": 500,
  "y": 500,
  "z": 500,
  "{": 334,
  "|": 260,
  "}": 334,
  "~": 584,
  "ª": 370,
  "º": 365,
  "À": 667,
  "Á": 667,
  "Â": 667,
  "Ã": 667,
  "Ä": 667,
  "Ç": 722,
  "È": 667,
  "É": 667,
  "Ê": 667,
  "Ë": 667,
  "Ì": 278,
  "Í": 278,
  "Î": 278,
  "Ï": 278,
  "Ñ": 722,
  "Ò": 778,
  "Ó": 778,
  "Ô": 778,
  "Õ": 778,
  "Ö": 778,
  "Ù": 722,
  "Ú": 722,
  "Û": 722,
  "Ü": 722,
  "à": 556,
  "á": 556,
  "â": 556,
  "ã": 556,
  "ä": 556,
  "ç": 500,
  "è": 556,
  "é": 556,
  "ê": 556,
  "ë": 556,
  "ì": 278,
  "í": 278,
  "î": 278,
  "ï": 278,
  "ñ": 556,
  "ò": 556,
  "ó": 556,
  "ô": 556,
  "õ": 556,
  "ö": 556,
  "ù": 556,
  "ú": 556,
  "û": 556,
  "ü": 556,
  "‘": 222,
  "’": 222,
  "“": 333,
  "”": 333,
  "–": 556,
  "—": 1000,
  "…": 1000,
  "°": 400,
  "§": 556,
};

type DrawLine = { text: string; size: 12 | 16 };

function plain(value: string): string {
  return value
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[*`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function glyph(char: string): string {
  const code = char.codePointAt(0) ?? 32;
  if ((code >= 32 && code <= 126) || WIN[char]) return char;
  return ' ';
}

function unitsOf(text: string): number {
  let total = 0;
  for (const char of text) total += HELVETICA_WIDTH[glyph(char)] ?? WIDEST;
  return total;
}

function fits(text: string, size: number): boolean {
  return unitsOf(text) * size <= USABLE;
}

function wrap(value: string, size: DrawLine['size']): string[] {
  const words = plain(value).split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  const take = (word: string) => {
    if (fits(word, size)) {
      const next = current ? `${current} ${word}` : word;
      if (fits(next, size)) {
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
      if (chunk && !fits(next, size)) {
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

function pdfLiteral(value: string): string {
  let out = '';
  for (const char of value) {
    const drawn = glyph(char);
    if (drawn === '\\' || drawn === '(' || drawn === ')') {
      out += `\\${drawn}`;
      continue;
    }
    const code = drawn.codePointAt(0) ?? 32;
    if (code >= 32 && code <= 126) {
      out += drawn;
      continue;
    }
    const mapped = WIN[drawn];
    out += mapped ? `\\${mapped.toString(8).padStart(3, '0')}` : ' ';
  }
  return out;
}

function leading(size: DrawLine['size']): number {
  return size === 16 ? 20 : 16;
}

function linesOf(text: string, size: DrawLine['size']): DrawLine[] {
  return wrap(text, size).map((line) => ({ text: line, size }));
}

function certificateLines(page: CertificatePdfPage): DrawLine[] {
  const hours = page.hours == null ? 'Não informada' : `${page.hours} h`;
  return [
    ...linesOf('EVOLVIA', 12),
    ...linesOf(page.title, 16),
    ...linesOf(page.body, 12),
    ...linesOf(`Nome: ${page.displayName}`, 12),
    ...linesOf(`Evento: ${page.eventName}`, 12),
    ...linesOf(`Carga horária: ${hours}`, 12),
    ...linesOf(`Emitido em: ${issuedLabel(page.issuedAt)}`, 12),
    ...linesOf(`Código: ${page.code}`, 12),
    ...linesOf('Segunda via. O download não é cobrado.', 12),
    ...(page.note ? linesOf(page.note, 12) : []),
  ];
}

function paginate(lines: DrawLine[]): DrawLine[][] {
  const pages: DrawLine[][] = [];
  let current: DrawLine[] = [];
  let baseline = FIRST_BASELINE;
  for (const line of lines) {
    if (current.length > 0 && baseline < BOTTOM) {
      pages.push(current);
      current = [];
      baseline = FIRST_BASELINE;
    }
    current.push(line);
    baseline -= leading(line.size);
  }
  if (current.length) pages.push(current);
  return pages;
}

function contentStream(lines: DrawLine[]): Buffer {
  const commands = ['BT', `${LEFT} ${FIRST_BASELINE} Td`];
  lines.forEach((line, index) => {
    if (index > 0) commands.push(`${leading(lines[index - 1].size)} TL`, 'T*');
    commands.push(`/F1 ${line.size} Tf`, `(${pdfLiteral(line.text)}) Tj`);
  });
  commands.push('ET');
  return Buffer.from(commands.join('\n'));
}

export function certificatePdf(pages: CertificatePdfPage[]): Buffer {
  if (!pages.length) throw new Error('O PDF do certificado precisa de ao menos uma página.');
  const streams = pages.flatMap((page) => paginate(certificateLines(page)).map((lines) => contentStream(lines)));
  const objects: Buffer[] = [];
  const pageIds: number[] = [];
  let nextId = 4;
  for (const stream of streams) {
    const pageId = nextId;
    const contentId = nextId + 1;
    nextId += 2;
    pageIds.push(pageId);
    objects.push(Buffer.from(
      `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >> >> >> endobj\n`,
    ));
    objects.push(Buffer.from(
      `${contentId} 0 obj << /Length ${stream.length} >> stream\n`,
    ));
    objects.push(stream);
    objects.push(Buffer.from('\nendstream endobj\n'));
  }
  const kids = pageIds.map((id) => `${id} 0 R`).join(' ');
  const head = Buffer.concat([
    Buffer.from('%PDF-1.4\n'),
    Buffer.from('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n'),
    Buffer.from(`2 0 obj << /Type /Pages /Count ${streams.length} /Kids [${kids}] >> endobj\n`),
    Buffer.from('3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj\n'),
  ]);
  const body = Buffer.concat(objects);
  const fileWithoutXref = Buffer.concat([head, body]);
  const offsets = [0, 9];
  let cursor = Buffer.from('%PDF-1.4\n').length;
  const catalog = '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n';
  offsets[1] = cursor;
  cursor += Buffer.byteLength(catalog);
  const pagesObj = `2 0 obj << /Type /Pages /Count ${streams.length} /Kids [${kids}] >> endobj\n`;
  offsets[2] = cursor;
  cursor += Buffer.byteLength(pagesObj);
  const font = '3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj\n';
  offsets[3] = cursor;
  cursor += Buffer.byteLength(font);
  for (const object of objects) {
    const header = object.toString('latin1', 0, Math.min(object.length, 24));
    const id = Number(header.match(/^(\d+) 0 obj/)?.[1]);
    if (id) offsets[id] = cursor;
    cursor += object.length;
  }
  let xref = `xref\n0 ${nextId}\n0000000000 65535 f \n`;
  for (let id = 1; id < nextId; id += 1) {
    xref += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer << /Size ${nextId} /Root 1 0 R >>\nstartxref\n${fileWithoutXref.length}\n%%EOF\n`;
  return Buffer.concat([fileWithoutXref, Buffer.from(xref), Buffer.from(trailer)]);
}
