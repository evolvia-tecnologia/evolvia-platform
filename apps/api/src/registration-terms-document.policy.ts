import { createHash } from 'node:crypto';
import { inflateRawSync, inflateSync } from 'node:zlib';
import { BadRequestException } from '@nestjs/common';

const MAX_BYTES = 5 * 1024 * 1024;
const BLOCKED_PDF_FEATURES = /\/(?:JavaScript|JS|Launch|SubmitForm|ImportData|EmbeddedFile|RichMedia|AA|OpenAction|GoToR|GoToE|XFA|Rendition)\b/u;
const BROKEN_PDF_NAME_ESCAPE = /\/[^ \t\r\n\x00()<>[\]{}/%]*#(?![0-9A-Fa-f]{2})/u;
const OPAQUE_PDF_FILTER = /\/(?:LZWDecode|ASCIIHexDecode|JBIG2Decode|JPXDecode|Crypt|RunLengthDecode|CCITTFaxDecode|LZW|AHx|RL|CCF)\b/u;

function pdfWithNamesDecoded(ascii: string): string {
  return ascii.replace(/#([0-9A-Fa-f]{2})/gu, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

/** Keep token offsets while excluding literal strings, hex strings and comments. */
function pdfSyntax(text: string): string {
  const output = text.split('');
  let nesting = 0;
  let comment = false;
  let hex = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (comment) {
      if (character === '\n' || character === '\r') comment = false;
      else output[index] = ' ';
    } else if (nesting) {
      output[index] = ' ';
      if (character === '\\') { index += 1; if (index < text.length) output[index] = ' '; }
      else if (character === '(') nesting += 1;
      else if (character === ')') nesting -= 1;
    } else if (hex) {
      output[index] = ' ';
      if (character === '>') hex = false;
    } else if (character === '%') { comment = true; output[index] = ' '; }
    else if (character === '(') { nesting = 1; output[index] = ' '; }
    else if (character === '<' && text[index + 1] !== '<') { hex = true; output[index] = ' '; }
    else if (character === '<' && text[index + 1] === '<') index += 1;
  }
  if (nesting || hex) invalid('O PDF tem sintaxe inválida.');
  return output.join('');
}

export type ValidatedRegistrationTermsPdf = {
  bytes: Buffer;
  fileName: string;
  checksumSha256: string;
};

function invalid(message: string): never {
  throw new BadRequestException(message);
}

/** Decode the supported transport before inspecting it; never whitelist opaque bytes. */
function decodeAscii85(bytes: Buffer, limit: number): Buffer {
  const text = bytes.toString('latin1').replace(/[\x00\t\n\f\r ]/gu, '');
  const source = text.startsWith('<~') ? text.slice(2) : text;
  if (!source.endsWith('~>')) invalid('O PDF tem codificação ASCII85 inválida.');
  const input = source.slice(0, -2);
  const output = Buffer.alloc(Math.min(limit, input.length * 4));
  let written = 0;
  let tuple: number[] = [];
  function emit(values: number[], count: number) {
    const total = values.reduce((sum, digit) => sum * 85 + digit, 0);
    if (total > 0xffffffff || written + count > output.length) invalid('O PDF é inválido ou excede 5 MB.');
    for (let index = 0; index < count; index += 1) output[written++] = Math.floor(total / 256 ** (3 - index)) % 256;
  }
  for (const character of input) {
    if (character === 'z') {
      if (tuple.length) invalid('O PDF tem codificação ASCII85 inválida.');
      emit([0, 0, 0, 0, 0], 4);
      continue;
    }
    const digit = character.charCodeAt(0) - 33;
    if (digit < 0 || digit > 84) invalid('O PDF tem codificação ASCII85 inválida.');
    tuple.push(digit);
    if (tuple.length === 5) { emit(tuple, 4); tuple = []; }
  }
  if (tuple.length === 1) invalid('O PDF tem codificação ASCII85 inválida.');
  if (tuple.length) {
    const count = tuple.length - 1;
    while (tuple.length < 5) tuple.push(84);
    emit(tuple, count);
  }
  return output.subarray(0, written);
}

function assertPassivePdf(bytes: Buffer, depth: number, budget: { remaining: number }): void {
  if (depth > 3 || bytes.length > MAX_BYTES) {
    invalid('O PDF não pode ter senha, script ou arquivo embutido. Exporte um PDF simples.');
  }
  const syntax: Buffer[] = [];
  let inspectedThrough = 0;
  let searchFrom = 0;
  while (searchFrom < bytes.length) {
    const marker = bytes.indexOf('stream', searchFrom);
    if (marker < 0) break;
    const previous = marker > 0 ? String.fromCharCode(bytes[marker - 1] ?? 0) : '';
    if (previous === '/' || /[A-Za-z]/u.test(previous)) {
      searchFrom = marker + 6;
      continue;
    }
    let bodyStart = marker + 6;
    if (bytes[bodyStart] === 0x0d && bytes[bodyStart + 1] === 0x0a) bodyStart += 2;
    else if (bytes[bodyStart] === 0x0a) bodyStart += 1;
    else {
      searchFrom = marker + 6;
      continue;
    }
    const end = bytes.indexOf('endstream', bodyStart);
    if (end < 0) invalid('O PDF é inválido.');
    const prefix = pdfSyntax(bytes.subarray(inspectedThrough, marker).toString('latin1'));
    const boundaries = [...prefix.matchAll(/(?:^|\s)endobj(?=\s|$)/gu)];
    const boundary = boundaries.at(-1);
    const dictionary = pdfWithNamesDecoded(prefix.slice(boundary ? boundary.index + boundary[0].length : 0));
    const lengthMatch = /\/Length\s+(\d+)(?!\d)/u.exec(dictionary);
    if (/\/Length\s+\d+\s+\d+\s+R\b/u.test(dictionary)) invalid('Exporte um PDF simples, sem comprimento indireto.');
    const declared = lengthMatch ? Number(lengthMatch[1]) : end - bodyStart;
    if (!Number.isInteger(declared) || declared < 0 || bodyStart + declared > end || bodyStart + declared > bytes.length) invalid('O PDF é inválido.');
    if (!/^[\x00\t\n\f\r ]*$/u.test(bytes.subarray(bodyStart + declared, end).toString('latin1'))) invalid('O PDF tem comprimento de stream inválido.');
    const filterMatch = /\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/u.exec(dictionary);
    if (filterMatch && !/^(?:\/\w+|\[\s*(?:\/\w+\s*)*\])$/u.test(filterMatch[1])) invalid('Exporte um PDF simples, sem filtros indiretos.');
    if ((dictionary.match(/\/Filter\b/gu) ?? []).length > 1) invalid('O PDF tem filtros ambíguos.');
    const filters = filterMatch ? (filterMatch[1].match(/\/[A-Za-z0-9]+/gu) ?? []) : [];
    if (filters.length > 3 || filters.some((filter) => !['/ASCII85Decode', '/A85', '/FlateDecode', '/Fl'].includes(filter))) {
      invalid('Exporte um PDF simples, com codificação Flate ou ASCII85.');
    }
    let body = bytes.subarray(bodyStart, bodyStart + declared);
    for (const filter of filters) {
      if (budget.remaining < 1) invalid('O conteúdo descomprimido do PDF excede 5 MB.');
      if (filter === '/ASCII85Decode' || filter === '/A85') body = decodeAscii85(body, budget.remaining);
      else {
        try { body = inflateSync(body, { maxOutputLength: budget.remaining }); }
        catch {
          try { body = inflateRawSync(body, { maxOutputLength: budget.remaining }); }
          catch { invalid('O PDF é inválido ou excede o limite de descompressão.'); }
        }
      }
      budget.remaining -= body.length;
    }
    syntax.push(bytes.subarray(inspectedThrough, bodyStart));
    inspectedThrough = end + 'endstream'.length;
    assertPassivePdf(body, depth + 1, budget);
    searchFrom = end + 'endstream'.length;
  }
  syntax.push(bytes.subarray(inspectedThrough));
  const ascii = Buffer.concat(syntax).toString('latin1');
  const decoded = pdfWithNamesDecoded(ascii);
  // Object streams need a full structural parser; this upload accepts simple PDFs only.
  if (/\/ObjStm\b/u.test(decoded)) invalid('Exporte um PDF simples, sem objetos comprimidos.');
  if (/\/Filter\s+\d+\s+\d+\s+R\b/u.test(decoded)) invalid('Exporte um PDF simples, sem filtros indiretos.');
  if (
    BROKEN_PDF_NAME_ESCAPE.test(ascii)
    || BLOCKED_PDF_FEATURES.test(ascii)
    || BLOCKED_PDF_FEATURES.test(decoded)
    || OPAQUE_PDF_FILTER.test(ascii)
    || OPAQUE_PDF_FILTER.test(decoded)
    || /\/Encrypt\b/u.test(ascii)
    || /\/Encrypt\b/u.test(decoded)
  ) {
    invalid('O PDF não pode ter senha, script ou arquivo embutido. Exporte um PDF simples.');
  }
}

function decodeBase64(contentBase64: string): Buffer {
  const normalized = contentBase64.trim();
  if (!normalized || normalized.length > Math.ceil(MAX_BYTES / 3) * 4 + 8 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(normalized)) {
    invalid('O PDF é inválido ou excede 5 MB.');
  }
  const bytes = Buffer.from(normalized, 'base64');
  if (bytes.length < 5 || bytes.length > MAX_BYTES) invalid('O PDF deve ter no máximo 5 MB.');
  if (bytes.toString('base64').replace(/=+$/u, '') !== normalized.replace(/=+$/u, '')) invalid('O PDF é inválido.');
  return bytes;
}

export function registrationTermsFileName(value: string): string {
  const base = value.split(/[\\/]/u).pop()?.normalize('NFKC').trim() ?? '';
  const cleaned = base.replace(/[^\p{L}\p{N} ._()-]/gu, '');
  // Keep the original extension and a safe, bounded display name. Browsers
  // may supply filenames longer than the persisted display-name limit.
  if (!/\.pdf$/iu.test(cleaned) || cleaned.length < 5) {
    invalid('Envie um arquivo PDF com um nome simples, terminado em .pdf.');
  }
  const stem = Array.from(cleaned.slice(0, -4)).reduce((prefix, character) =>
    prefix.length + character.length <= 71 ? prefix + character : prefix, '').trimEnd();
  const normalized = `${stem}.pdf`;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._()-]{0,70}\.pdf$/iu.test(normalized)) {
    invalid('Envie um arquivo PDF com um nome simples, terminado em .pdf.');
  }
  return normalized;
}

export function validateRegistrationTermsPdf(input: { contentBase64?: string; fileName?: string }): ValidatedRegistrationTermsPdf {
  if (!input || typeof input.contentBase64 !== 'string' || typeof input.fileName !== 'string') {
    invalid('Anexe o PDF dos termos de inscrição e da Política de Privacidade.');
  }
  const fileName = registrationTermsFileName(input.fileName);
  const bytes = decodeBase64(input.contentBase64);
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') invalid('O arquivo precisa ser um PDF.');
  const ascii = bytes.toString('latin1');
  if (/^\s*</u.test(ascii) || /<!doctype|<html|<script/iu.test(ascii.slice(0, 512))) {
    invalid('O arquivo precisa ser um PDF.');
  }
  assertPassivePdf(bytes, 0, { remaining: MAX_BYTES });
  return {
    bytes,
    fileName,
    checksumSha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export function validateScientificPdf(input: { contentBase64?: string; fileName?: string }): ValidatedRegistrationTermsPdf {
  if (!input || typeof input.contentBase64 !== 'string' || typeof input.fileName !== 'string') {
    invalid('Anexe o PDF do ePoster.');
  }
  const fileName = registrationTermsFileName(input.fileName);
  const bytes = decodeBase64(input.contentBase64);
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') invalid('O arquivo precisa ser um PDF.');
  const ascii = bytes.toString('latin1');
  if (/^\s*</u.test(ascii) || /<!doctype|<html|<script/iu.test(ascii.slice(0, 512))) {
    invalid('O arquivo precisa ser um PDF.');
  }
  assertPassivePdf(bytes, 0, { remaining: MAX_BYTES });
  return {
    bytes,
    fileName,
    checksumSha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

