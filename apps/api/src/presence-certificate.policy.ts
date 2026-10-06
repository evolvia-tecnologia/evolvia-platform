export class PresenceCertificatePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PresenceCertificatePolicyError';
  }
}

export const CERTIFICATE_ROLE = 'participation' as const;
export const CERTIFICATE_FEE_CENTS = 0;
export const CERTIFICATE_TAGS = ['NOME', 'EVENTO', 'CARGA_HORARIA', 'DATA', 'CODIGO'] as const;
export const DEFAULT_CERTIFICATE_TITLE = 'Certificado de participação';
export const DEFAULT_CERTIFICATE_BODY = 'Certificamos que **{NOME}** participou de **{EVENTO}**.';
export const CERTIFICATE_TITLE_MAX = 240;
export const CERTIFICATE_BODY_MAX = 4000;

const CODE = /^[a-f0-9]{32}$/;
const UNSAFE_NAME = /[<>\u0000-\u001f\u007f]/;
const TAG = /\{([A-Za-z0-9_]+)\}/g;
const ALLOWED_TAGS = new Set<string>(CERTIFICATE_TAGS);
const ART_MAX_BYTES = 5 * 1024 * 1024;
const ART_MAX_DIMENSION = 8_192;
const ART_MAX_PIXELS = 24_000_000;
const ART_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export type CertificateArtFile = {
  bytes: Buffer;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  extension: 'png' | 'jpg' | 'webp';
  altText: string;
  expectedRevision: number;
};

export function certificateFeeCents(): 0 {
  return CERTIFICATE_FEE_CENTS;
}

export function normalizeCertificateHours(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 999) {
    throw new PresenceCertificatePolicyError('A carga horária precisa ser um número inteiro de 1 a 999, ou ficar em branco.');
  }
  return value;
}

export function normalizeCertificateEnabled(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new PresenceCertificatePolicyError('Informe se o certificado de participação está liberado.');
  }
  return value;
}

export function normalizeCertificateText(value: unknown, label: string, max: number, fallback: string): string {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return fallback;
  if (typeof value !== 'string') {
    throw new PresenceCertificatePolicyError(`Informe o ${label} do certificado.`);
  }
  const text = value.replace(/\r\n/g, '\n');
  if (text.length > max) {
    throw new PresenceCertificatePolicyError(`O ${label} do certificado passa de ${max} caracteres.`);
  }
  if (/[<>]/.test(text) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    throw new PresenceCertificatePolicyError('Use a formatação do editor. HTML não entra no certificado.');
  }
  const unknown = [...text.matchAll(TAG)].map((match) => match[1]).find((tag) => !ALLOWED_TAGS.has(tag));
  if (unknown) {
    throw new PresenceCertificatePolicyError(`A tag {${unknown}} não existe. Use {NOME}, {EVENTO}, {CARGA_HORARIA}, {DATA} ou {CODIGO}.`);
  }
  return text;
}

export function normalizeCertificateSetting(input: unknown): {
  enabled: boolean;
  hours: number | null;
  title: string;
  body: string;
  expectedRevision: number;
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PresenceCertificatePolicyError('Informe a liberação do certificado.');
  }
  const record = input as Record<string, unknown>;
  return {
    enabled: normalizeCertificateEnabled(record.enabled),
    hours: normalizeCertificateHours(record.hours),
    title: normalizeCertificateText(record.title, 'título', CERTIFICATE_TITLE_MAX, DEFAULT_CERTIFICATE_TITLE),
    body: normalizeCertificateText(record.body, 'texto', CERTIFICATE_BODY_MAX, DEFAULT_CERTIFICATE_BODY),
    expectedRevision: expectedRevision(record.expectedRevision),
  };
}

export function normalizeCertificateArtUpload(input: unknown): CertificateArtFile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PresenceCertificatePolicyError('Envie a arte do certificado.');
  }
  const record = input as Record<string, unknown>;
  if (typeof record.contentBase64 !== 'string') {
    throw new PresenceCertificatePolicyError('Envie a arte do certificado.');
  }
  const bytes = decodeArt(record.contentBase64);
  const kind = artKind(bytes);
  if (!kind) {
    throw new PresenceCertificatePolicyError('Use uma imagem PNG, JPEG ou WebP válida. SVG não é aceito.');
  }
  return {
    bytes,
    mimeType: kind.mimeType,
    extension: kind.extension,
    altText: normalizeCertificateAlt(record.altText),
    expectedRevision: expectedRevision(record.expectedRevision),
  };
}

export function normalizeCertificateArtRemoval(input: unknown): { expectedRevision: number } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PresenceCertificatePolicyError('Recarregue a tela antes de remover a arte.');
  }
  const record = input as Record<string, unknown>;
  return { expectedRevision: expectedRevision(record.expectedRevision) };
}

export function certificateDisplayName(data: unknown): string {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new PresenceCertificatePolicyError('O nome da inscrição não pode ir para o certificado.');
  }
  const record = data as Record<string, unknown>;
  const preferred = typeof record.preferred_name === 'string' ? record.preferred_name : '';
  const full = typeof record.full_name === 'string' ? record.full_name : '';
  const raw = preferred.trim() || full.trim();
  const name = raw.replace(/[ \t]+/g, ' ');
  if (name.length < 2 || name.length > 180 || UNSAFE_NAME.test(raw)) {
    throw new PresenceCertificatePolicyError('O nome da inscrição não pode ir para o certificado.');
  }
  return name;
}

export function normalizeCertificateCode(value: unknown): string {
  if (typeof value !== 'string') throw new PresenceCertificatePolicyError('Código de certificado inválido.');
  const code = value.trim().toLowerCase();
  if (!CODE.test(code)) throw new PresenceCertificatePolicyError('Código de certificado inválido.');
  return code;
}

export function canIssuePresenceCertificate(input: { enabled: boolean; status: string; checkedIn: boolean }): boolean {
  return input.enabled === true && input.status === 'CONFIRMED' && input.checkedIn === true;
}

export function renderCertificateTemplate(template: string, values: {
  displayName: string;
  eventName: string;
  hours: number | null;
  issuedAt: string;
  code: string;
}): string {
  const issued = new Date(values.issuedAt);
  const date = Number.isNaN(issued.getTime())
    ? ''
    : new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(issued);
  const map: Record<(typeof CERTIFICATE_TAGS)[number], string> = {
    NOME: values.displayName,
    EVENTO: values.eventName,
    CARGA_HORARIA: values.hours == null ? 'não informada' : String(values.hours),
    DATA: date,
    CODIGO: values.code,
  };
  return template.replace(/\{(NOME|EVENTO|CARGA_HORARIA|DATA|CODIGO)\}/gu, (_full, tag: (typeof CERTIFICATE_TAGS)[number]) => map[tag]);
}

export function publicCertificateView(input: {
  eventName: string;
  displayName: string;
  hours: number | null;
  issuedAt: string;
  code: string;
  title: string;
  body: string;
  artAlt: string | null;
  hasArt: boolean;
}) {
  const facts = {
    displayName: input.displayName,
    eventName: input.eventName,
    hours: input.hours,
    issuedAt: input.issuedAt,
    code: input.code,
  };
  return {
    authentic: true as const,
    role: CERTIFICATE_ROLE,
    eventName: input.eventName,
    displayName: input.displayName,
    hours: input.hours,
    issuedAt: input.issuedAt,
    feeCents: certificateFeeCents(),
    title: renderCertificateTemplate(input.title, facts),
    body: renderCertificateTemplate(input.body, facts),
    artAlt: input.hasArt ? input.artAlt : null,
    hasArt: input.hasArt === true,
  };
}

function expectedRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new PresenceCertificatePolicyError('Recarregue a tela antes de salvar o certificado.');
  }
  return value;
}

function normalizeCertificateAlt(value: unknown): string {
  if (typeof value !== 'string') {
    throw new PresenceCertificatePolicyError('Informe um texto alternativo objetivo para a arte do certificado.');
  }
  const alt = value.trim().replace(/[ \t]+/g, ' ');
  if (alt.length < 2 || alt.length > 180 || UNSAFE_NAME.test(value)) {
    throw new PresenceCertificatePolicyError('Informe um texto alternativo objetivo para a arte do certificado.');
  }
  return alt;
}

function decodeArt(contentBase64: string): Buffer {
  const normalized = contentBase64.trim();
  const maxChars = Math.ceil(ART_MAX_BYTES / 3) * 4;
  if (!normalized || normalized.length > maxChars + 8 || !ART_BASE64.test(normalized)) {
    throw new PresenceCertificatePolicyError('A imagem deve ter no máximo 5 MB.');
  }
  const bytes = Buffer.from(normalized, 'base64');
  if (bytes.length === 0 || bytes.length > ART_MAX_BYTES) {
    throw new PresenceCertificatePolicyError('A imagem deve ter no máximo 5 MB.');
  }
  if (bytes.toString('base64').replace(/=+$/u, '') !== normalized.replace(/=+$/u, '')) {
    throw new PresenceCertificatePolicyError('O conteúdo da imagem é inválido.');
  }
  return bytes;
}

function artKind(bytes: Buffer): Pick<CertificateArtFile, 'mimeType' | 'extension'> | null {
  const head = bytes.subarray(0, 256).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<') || head.includes('<svg')) return null;
  const png = pngSize(bytes);
  if (png) return { mimeType: 'image/png', extension: 'png' };
  const jpeg = jpegSize(bytes);
  if (jpeg) return { mimeType: 'image/jpeg', extension: 'jpg' };
  const webp = webpSize(bytes);
  if (webp) return { mimeType: 'image/webp', extension: 'webp' };
  return null;
}

function assertDimensions(width: number, height: number): void {
  if (width < 1 || height < 1 || width > ART_MAX_DIMENSION || height > ART_MAX_DIMENSION || width * height > ART_MAX_PIXELS) {
    throw new PresenceCertificatePolicyError('A imagem excede o limite de 8.192 px por lado ou 24 megapixels.');
  }
}

function pngSize(bytes: Buffer): boolean {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return false;
  if (bytes.readUInt32BE(8) !== 13 || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new PresenceCertificatePolicyError('O arquivo PNG não possui cabeçalho de imagem válido.');
  }
  assertDimensions(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
  return true;
}

function jpegSize(bytes: Buffer): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw new PresenceCertificatePolicyError('O arquivo JPEG está truncado.');
  }
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) throw new PresenceCertificatePolicyError('O arquivo JPEG está corrompido.');
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) throw new PresenceCertificatePolicyError('O arquivo JPEG está corrompido.');
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) throw new PresenceCertificatePolicyError('O arquivo JPEG não possui dimensões válidas.');
      assertDimensions(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3));
      return true;
    }
    offset += length;
  }
  throw new PresenceCertificatePolicyError('Não foi possível determinar as dimensões do JPEG.');
}

function webpSize(bytes: Buffer): boolean {
  if (bytes.length < 30 || bytes.subarray(0, 4).toString('ascii') !== 'RIFF' || bytes.subarray(8, 12).toString('ascii') !== 'WEBP') return false;
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) {
    throw new PresenceCertificatePolicyError('O arquivo WebP está truncado.');
  }
  const kind = bytes.subarray(12, 16).toString('ascii');
  if (kind === 'VP8X') {
    assertDimensions(1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3));
    return true;
  }
  if (kind === 'VP8L') {
    if (bytes[20] !== 0x2f) throw new PresenceCertificatePolicyError('O arquivo WebP está corrompido.');
    const packed = bytes.readUInt32LE(21);
    assertDimensions((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1);
    return true;
  }
  if (kind === 'VP8 ') {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      throw new PresenceCertificatePolicyError('O arquivo WebP está corrompido.');
    }
    assertDimensions(bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff);
    return true;
  }
  throw new PresenceCertificatePolicyError('O tipo interno do arquivo WebP não é aceito.');
}
