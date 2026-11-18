import { crc32 } from 'node:zlib';

export const SCIENTIFIC_FILE_BATCH_MAX = 40;
export const SCIENTIFIC_FILE_BATCH_BYTES = 32 * 1024 * 1024;

export function continuationCursor(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^[a-z0-9]{20,32}$/u.test(value)) return '';
  return value;
}

export function fileFitsBatch(fileLength: number, usedBytes: number): 'take' | 'later' | 'skip' {
  if (!Number.isInteger(fileLength) || fileLength < 1 || fileLength > SCIENTIFIC_FILE_BATCH_BYTES) return 'skip';
  if (usedBytes + fileLength > SCIENTIFIC_FILE_BATCH_BYTES) return 'later';
  return 'take';
}

export function submissionBatchName(index: number, version: number): string {
  if (!Number.isInteger(index) || index < 1 || index > SCIENTIFIC_FILE_BATCH_MAX) {
    throw new Error('Nome de arquivo inválido.');
  }
  if (!Number.isInteger(version) || version < 1 || version > 99) throw new Error('Nome de arquivo inválido.');
  return `trabalho-${index}-v${version}.pdf`;
}

export function batchIndexCsv(rows: Array<{ fileName: string; title: string }>): string {
  const lines = [['arquivo', 'titulo'], ...rows.map((row) => [row.fileName, clip(row.title)])];
  return `\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function storedZip(files: Array<{ name: string; bytes: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = entryName(file.name);
    const crc = crc32(file.bytes) >>> 0;
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.bytes.length, 18);
    local.writeUInt32LE(file.bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    locals.push(local, file.bytes);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.bytes.length, 20);
    central.writeUInt32LE(file.bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + file.bytes.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

export function belongsToEvent(storageKey: string, organizationId: string, eventId: string): boolean {
  if (!/^[a-z0-9]+$/u.test(organizationId) || !/^[a-z0-9]+$/u.test(eventId)) return false;
  const prefix = `${organizationId}/${eventId}/`;
  if (!storageKey.startsWith(prefix)) return false;
  return /^[0-9a-f-]{36}\.pdf$/u.test(storageKey.slice(prefix.length));
}

function entryName(name: string): Buffer {
  if (!/^(indice\.csv|trabalho-[1-9]\d?-v[1-9]\d?\.pdf)$/u.test(name)) throw new Error('Nome de arquivo inválido.');
  return Buffer.from(name, 'utf8');
}

function clip(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, 180);
}

function csvCell(value: string): string {
  let text = clip(value);
  if (/^[\s\uFEFF]*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}
