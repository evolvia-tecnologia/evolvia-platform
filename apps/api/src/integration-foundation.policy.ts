import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export class IntegrationFoundationPolicyError extends Error {}

const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal', 'metadata.internal']);

export type ConfirmedRegistrationNotice = {
  organizationId: string;
  eventId: string;
  reservationId: string;
  protocol: string;
  slug: string;
};

export type RegistrationConfirmedPayload = {
  id: string;
  type: 'registration.confirmed';
  occurredAt: string;
  event: { id: string; slug: string };
  registration: { protocol: string };
};

function invalid(message: string): never {
  throw new IntegrationFoundationPolicyError(message);
}

export function normalizeWebhookUrl(value: unknown): string {
  if (typeof value !== 'string') invalid('Informe uma URL HTTPS válida.');
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { invalid('Informe uma URL HTTPS válida.'); }
  if (url.protocol !== 'https:') invalid('O webhook só aceita HTTPS.');
  if (url.username || url.password) invalid('A URL do webhook não pode levar usuário ou senha.');
  if (url.port && url.port !== '443') invalid('O webhook só aceita a porta 443.');
  const host = url.hostname.toLowerCase().replace(/\.$/u, '').replace(/^\[|\]$/gu, '');
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
    invalid('Esse endereço não pode receber webhooks.');
  }
  if (isIP(host)) invalid('Informe um domínio HTTPS, não um endereço IP.');
  // O transporte valida o DNS e conecta somente ao resultado público validado.
  if (url.pathname.length > 200 || url.href.length > 300) invalid('A URL do webhook excede o limite.');
  url.hash = '';
  return url.toString();
}

export function registrationConfirmedPayload(
  deliveryId: string,
  notice: ConfirmedRegistrationNotice,
  occurredAt: string,
): RegistrationConfirmedPayload {
  return {
    id: deliveryId,
    type: 'registration.confirmed',
    occurredAt,
    event: { id: notice.eventId, slug: notice.slug },
    registration: { protocol: notice.protocol },
  };
}

export function signWebhookBody(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function webhookSignatureHeader(secret: string, timestamp: number, body: string): string {
  return `v1=${signWebhookBody(secret, timestamp, body)}`;
}

export function verifyWebhookSignature(secret: string, timestamp: number, body: string, header: string): boolean {
  const expected = webhookSignatureHeader(secret, timestamp, body);
  const left = Buffer.from(expected);
  const right = Buffer.from(header);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function issueEventApiKey(): { token: string; prefix: string; keyHash: string } {
  const token = `evo_${randomBytes(32).toString('base64url')}`;
  return { token, prefix: token.slice(0, 12), keyHash: hashEventApiKey(token) };
}

export function hashEventApiKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function normalizeApiKeyLabel(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Chave de leitura';
  if (typeof value !== 'string') invalid('O nome da chave é inválido.');
  const label = value.trim().replace(/\s+/gu, ' ');
  if (label.length < 2 || label.length > 80 || /[<>]/u.test(label)) invalid('O nome da chave é inválido.');
  return label;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] ?? char));
}

export function publicEventUrl(slug: string): string | null {
  const raw = process.env.EVOLVIA_PUBLIC_BASE_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw); }
  catch { return null; }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return null;
  const base = url.origin;
  return `${base}/${encodeURIComponent(slug)}`;
}

export function websitePresenceSnippet(name: string, publicUrl: string): string {
  return `<p><a href="${escapeHtml(publicUrl)}">${escapeHtml(name)}</a></p>`;
}

