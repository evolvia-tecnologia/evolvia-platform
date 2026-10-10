export const REGISTRATION_NOTICE_LIMIT = 40;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;
const ID = /^[a-z0-9]{20,32}$/u;
const IDEMPOTENCY = /^[A-Za-z0-9_-]{16,80}$/u;
const PROTOCOL = /^EVO-[A-F0-9]{16}$/u;

export class RegistrationNoticePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistrationNoticePolicyError';
  }
}

export const NOTICE_PRESENCE = ['PRESENT', 'ABSENT'] as const;
export const NOTICE_SCIENTIFIC_RESULTS = ['ACCEPTED', 'ACCEPTED_WITH_CHANGES', 'REJECTED'] as const;

export type NoticePresence = (typeof NOTICE_PRESENCE)[number];
export type NoticeScientificResult = (typeof NOTICE_SCIENTIFIC_RESULTS)[number];

export type DirectNoticeInput = {
  subject: string;
  body: string;
  protocol: string;
};

export type RegistrationNoticeInput = {
  subject: string;
  body: string;
  categoryId: string | null;
  continuationCursor: string | null;
  presence: NoticePresence | null;
  scientificResult: NoticeScientificResult | null;
};

export type DeliveryConfig = {
  endpoint: string;
  token: string;
  sender: string;
};

export function normalizeIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !IDEMPOTENCY.test(value.trim())) {
    throw new RegistrationNoticePolicyError('Informe uma chave de idempotência com 16 a 80 caracteres.');
  }
  return value.trim();
}

function requiredId(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new RegistrationNoticePolicyError(`${label} não é válido.`);
  }
  return value;
}

function optionalCode<T extends string>(value: unknown, allowed: readonly T[], label: string): T | null {
  if (value === null) return null;
  if (typeof value === 'string' && allowed.includes(value as T)) return value as T;
  throw new RegistrationNoticePolicyError(`${label} não é válido.`);
}

function boundedText(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new RegistrationNoticePolicyError(`Informe ${label}.`);
  if (/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) {
    throw new RegistrationNoticePolicyError(`${label} não pode levar HTML nem controle.`);
  }
  const text = value.replace(/\r\n/gu, '\n').replace(/\r/gu, '\n').trim();
  if (text.length < min || text.length > max) {
    throw new RegistrationNoticePolicyError(`${label} precisa ter entre ${min} e ${max} caracteres.`);
  }
  return text;
}

export function normalizeNotice(input: unknown): RegistrationNoticeInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RegistrationNoticePolicyError('Informe o aviso.');
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(',') !== 'body,categoryId,continuationCursor,presence,scientificResult,subject') {
    throw new RegistrationNoticePolicyError('Informe somente o texto, a categoria, a presença, o resultado e a continuação.');
  }
  return {
    subject: boundedText(record.subject, 'O assunto', 5, 120),
    body: boundedText(record.body, 'A mensagem', 10, 800),
    categoryId: requiredId(record.categoryId, 'A categoria'),
    continuationCursor: requiredId(record.continuationCursor, 'A continuação'),
    presence: optionalCode(record.presence, NOTICE_PRESENCE, 'A presença'),
    scientificResult: optionalCode(record.scientificResult, NOTICE_SCIENTIFIC_RESULTS, 'O resultado científico'),
  };
}

export function normalizeDirectNotice(input: unknown): DirectNoticeInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RegistrationNoticePolicyError('Informe o recado.');
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(',') !== 'body,protocol,subject') {
    throw new RegistrationNoticePolicyError('Informe somente o protocolo e o texto.');
  }
  if (typeof record.protocol !== 'string' || !PROTOCOL.test(record.protocol.trim())) {
    throw new RegistrationNoticePolicyError('O protocolo não é válido.');
  }
  return {
    subject: boundedText(record.subject, 'O assunto', 5, 120),
    body: boundedText(record.body, 'A mensagem', 10, 800),
    protocol: record.protocol.trim(),
  };
}

export function readRegistrationEmail(registrationData: unknown): string | null {
  if (!registrationData || typeof registrationData !== 'object' || Array.isArray(registrationData)) return null;
  const value = (registrationData as { email?: unknown }).email;
  if (typeof value !== 'string' || /[\r\n]/u.test(value)) return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return null;
  return email;
}

export function readDeliveryConfig(env: NodeJS.ProcessEnv): DeliveryConfig | null {
  const endpoint = env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT?.trim() ?? '';
  const token = env.EVOLVIA_EMAIL_DELIVERY_TOKEN?.trim() ?? '';
  const sender = env.EVOLVIA_EMAIL_FROM?.trim() ?? '';
  if (!endpoint || !token || !sender || !EMAIL.test(sender) || /[\r\n]/u.test(sender)) return null;
  let deliveryUrl: URL;
  try { deliveryUrl = new URL(endpoint); }
  catch { return null; }
  if (deliveryUrl.protocol !== 'https:' || deliveryUrl.username || deliveryUrl.password) return null;
  return { endpoint: deliveryUrl.toString(), token, sender };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] ?? char));
}

function plain(value: string): string {
  return value.replace(/[\r\n]+/gu, ' ').trim().slice(0, 180);
}

export function noticeMessage(input: {
  subject: string;
  body: string;
  sender: string;
  recipient: string;
  eventName: string;
}) {
  const eventName = plain(input.eventName) || 'seu evento';
  return {
    schema: 'evolvia.transactional-email.v1',
    message: {
      from: input.sender,
      to: [input.recipient],
      subject: input.subject,
      text: [`Aviso de ${eventName}`, '', input.body].join('\n'),
      html: [
        `<p>Aviso de ${escapeHtml(eventName)}</p>`,
        ...input.body.split('\n').map((line) => `<p>${escapeHtml(line)}</p>`),
      ].join(''),
    },
    metadata: { purpose: 'registration-notice' },
  };
}
