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

const BODY_LINE = 64;

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
};

function plain(value: string): string {
  return value
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[*`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrap(value: string, width: number): string[] {
  const words = plain(value).split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  const take = (word: string) => {
    if (word.length <= width) {
      const next = current ? `${current} ${word}` : word;
      if (next.length <= width) {
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
    for (let index = 0; index < word.length; index += width) {
      const chunk = word.slice(index, index + width);
      if (index + width < word.length) lines.push(chunk);
      else current = chunk;
    }
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
    if (char === '\\' || char === '(' || char === ')') {
      out += `\\${char}`;
      continue;
    }
    const code = char.codePointAt(0) ?? 32;
    if (code >= 32 && code <= 126) {
      out += char;
      continue;
    }
    const mapped = WIN[char];
    out += mapped ? `\\${mapped.toString(8).padStart(3, '0')}` : ' ';
  }
  return out;
}

function pageLines(page: CertificatePdfPage): string[] {
  const hours = page.hours == null ? 'Não informada' : `${page.hours} h`;
  return [
    'EVOLVIA',
    ...wrap(page.title, 52).slice(0, 3),
    ...wrap(page.body, BODY_LINE).slice(0, 12),
    `Nome: ${plain(page.displayName)}`,
    `Evento: ${plain(page.eventName)}`,
    `Carga horária: ${hours}`,
    `Emitido em: ${issuedLabel(page.issuedAt)}`,
    `Código: ${page.code}`,
    'Segunda via. O download não é cobrado.',
    ...(page.note ? wrap(page.note, BODY_LINE).slice(0, 2) : []),
  ];
}

function contentStream(lines: string[]): Buffer {
  const commands = ['BT', '/F1 12 Tf', '50 780 Td', '16 TL'];
  lines.forEach((line, index) => {
    if (index === 1) commands.push('/F1 16 Tf', '20 TL');
    if (index === 2) commands.push('/F1 12 Tf', '16 TL');
    commands.push(`(${pdfLiteral(line)}) Tj`, 'T*');
  });
  commands.push('ET');
  return Buffer.from(commands.join('\n'));
}

export function certificatePdf(pages: CertificatePdfPage[]): Buffer {
  if (!pages.length) throw new Error('O PDF do certificado precisa de ao menos uma página.');
  const streams = pages.map((page) => contentStream(pageLines(page)));
  const objects: Buffer[] = [];
  const pageIds: number[] = [];
  let nextId = 4;
  for (const stream of streams) {
    const pageId = nextId;
    const contentId = nextId + 1;
    nextId += 2;
    pageIds.push(pageId);
    objects.push(Buffer.from(
      `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >> >> >> endobj\n`,
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
    Buffer.from(`2 0 obj << /Type /Pages /Count ${pages.length} /Kids [${kids}] >> endobj\n`),
    Buffer.from('3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj\n'),
  ]);
  const body = Buffer.concat(objects);
  const fileWithoutXref = Buffer.concat([head, body]);
  const offsets = [0, 9];
  let cursor = Buffer.from('%PDF-1.4\n').length;
  const catalog = '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n';
  offsets[1] = cursor;
  cursor += Buffer.byteLength(catalog);
  const pagesObj = `2 0 obj << /Type /Pages /Count ${pages.length} /Kids [${kids}] >> endobj\n`;
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
