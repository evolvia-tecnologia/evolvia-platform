import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

const MAX_BYTES = 5 * 1024 * 1024;
const BLOCKED_PDF_FEATURES = /\/(?:JavaScript|JS|Launch|SubmitForm|ImportData|EmbeddedFile|RichMedia|AA)\b/u;
const BROKEN_PDF_NAME_ESCAPE = /\/[^ \t\r\n\x00()<>[\]{}/%]*#(?![0-9A-Fa-f]{2})/u;

function pdfWithNamesDecoded(ascii: string): string {
  return ascii.replace(/#([0-9A-Fa-f]{2})/gu, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

export type ValidatedRegistrationTermsPdf = {
  bytes: Buffer;
  fileName: string;
  checksumSha256: string;
};

function invalid(message: string): never {
  throw new BadRequestException(message);
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
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._()-]{0,70}\.pdf$/iu.test(cleaned)) {
    invalid('Envie um arquivo PDF com um nome simples, terminado em .pdf.');
  }
  return cleaned;
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
  const decoded = pdfWithNamesDecoded(ascii);
  if (BROKEN_PDF_NAME_ESCAPE.test(ascii) || BLOCKED_PDF_FEATURES.test(ascii) || BLOCKED_PDF_FEATURES.test(decoded) || /\/Encrypt\b/u.test(ascii) || /\/Encrypt\b/u.test(decoded)) {
    invalid('O PDF não pode ter senha, script ou arquivo embutido. Exporte um PDF simples.');
  }
  return {
    bytes,
    fileName,
    checksumSha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
