import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';

export const EVENT_MEDIA_USAGES = ['LOGO', 'COVER', 'SOCIAL_SHARE'] as const;
export type EventMediaUsageValue = (typeof EVENT_MEDIA_USAGES)[number];

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 8_192;
const MAX_PIXELS = 24_000_000;

export type ValidatedEventMedia = {
  bytes: Buffer;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  extension: 'png' | 'jpg' | 'webp';
  width: number;
  height: number;
  checksumSha256: string;
  altText: string | null;
  decorative: boolean;
};

function invalid(message: string): never {
  throw new BadRequestException({ code: 'INVALID_EVENT_MEDIA', message });
}

function pngDimensions(bytes: Buffer): { width: number; height: number } | null {
  const signature = '89504e470d0a1a0a';
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== signature) return null;
  if (bytes.subarray(12, 16).toString('ascii') !== 'IHDR') invalid('O arquivo PNG não possui cabeçalho de imagem válido.');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) invalid('O arquivo JPEG está corrompido.');
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) invalid('O arquivo JPEG está corrompido.');
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) invalid('O arquivo JPEG não possui dimensões válidas.');
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  invalid('Não foi possível determinar as dimensões do JPEG.');
}

function webpDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 30 || bytes.subarray(0, 4).toString('ascii') !== 'RIFF' || bytes.subarray(8, 12).toString('ascii') !== 'WEBP') return null;
  const kind = bytes.subarray(12, 16).toString('ascii');
  if (kind === 'VP8X') {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  if (kind === 'VP8L') {
    if (bytes[20] !== 0x2f) invalid('O arquivo WebP lossless está corrompido.');
    const packed = bytes.readUInt32LE(21);
    return { width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8 ') {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) invalid('O arquivo WebP está corrompido.');
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  invalid('O tipo interno do arquivo WebP não é aceito.');
}

function decodeBase64(contentBase64: string): Buffer {
  const normalized = contentBase64.trim();
  if (!normalized || normalized.length > Math.ceil(MAX_BYTES / 3) * 4 + 8 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(normalized)) {
    invalid('O conteúdo da imagem é inválido ou excede 5 MB.');
  }
  const bytes = Buffer.from(normalized, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_BYTES) invalid('A imagem deve ter no máximo 5 MB.');
  if (bytes.toString('base64').replace(/=+$/u, '') !== normalized.replace(/=+$/u, '')) invalid('O conteúdo da imagem é inválido.');
  return bytes;
}

export function validateEventMedia(input: {
  usage: EventMediaUsageValue;
  contentBase64: string;
  altText?: string | null;
  decorative: boolean;
}): ValidatedEventMedia {
  const bytes = decodeBase64(input.contentBase64);
  const png = pngDimensions(bytes);
  const jpeg = png ? null : jpegDimensions(bytes);
  const webp = png || jpeg ? null : webpDimensions(bytes);
  const dimensions = png ?? jpeg ?? webp;
  if (!dimensions) invalid('Use uma imagem PNG, JPEG ou WebP válida. SVG não é aceito.');

  const { width, height } = dimensions;
  if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
    invalid('A imagem excede o limite de 8.192 px por lado ou 24 megapixels.');
  }

  const decorative = input.decorative === true;
  if (decorative && input.usage !== 'COVER') invalid('Somente a capa pode ser marcada como decorativa.');
  const altText = input.altText?.trim() || null;
  if (!decorative && !altText) invalid('Informe um texto alternativo objetivo para a imagem.');
  if (altText && altText.length > 300) invalid('O texto alternativo deve ter no máximo 300 caracteres.');

  return {
    bytes,
    mimeType: png ? 'image/png' : jpeg ? 'image/jpeg' : 'image/webp',
    extension: png ? 'png' : jpeg ? 'jpg' : 'webp',
    width,
    height,
    checksumSha256: createHash('sha256').update(bytes).digest('hex'),
    altText,
    decorative,
  };
}
