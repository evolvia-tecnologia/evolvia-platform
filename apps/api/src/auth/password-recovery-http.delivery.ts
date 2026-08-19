import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PasswordRecoveryDelivery } from './password-recovery-request.service';

const DEFAULT_TIMEOUT_MS = 10_000;
const PASSWORD_RECOVERY_SUBJECT = 'Redefina sua senha na Evolvia';
const DELIVERY_UNAVAILABLE_MESSAGE =
  'O transporte transacional de e-mail está indisponível.';

export type PasswordRecoveryHttpDeliveryConfig = Readonly<{
  endpoint: string;
  bearerToken: string;
  sender: string;
  publicBaseUrl: string;
  timeoutMs?: number;
}>;

export type PasswordRecoveryHttpClient = (
  input: string,
  init: RequestInit,
) => Promise<Readonly<{ ok: boolean; status: number }>>;

export class PasswordRecoveryDeliveryConfigurationError extends Error {
  constructor() {
    super('A configuração do transporte transacional de e-mail é inválida.');
    this.name = 'PasswordRecoveryDeliveryConfigurationError';
  }
}

export class PasswordRecoveryDeliveryUnavailableError extends Error {
  constructor() {
    super(DELIVERY_UNAVAILABLE_MESSAGE);
    this.name = 'PasswordRecoveryDeliveryUnavailableError';
  }
}

export function passwordRecoveryDeliveryConfigFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): PasswordRecoveryHttpDeliveryConfig | null {
  const raw = {
    endpoint: environment.EVOLVIA_EMAIL_DELIVERY_ENDPOINT?.trim(),
    bearerToken: environment.EVOLVIA_EMAIL_DELIVERY_TOKEN?.trim(),
    sender: environment.EVOLVIA_EMAIL_FROM?.trim(),
    publicBaseUrl: environment.EVOLVIA_PUBLIC_BASE_URL?.trim(),
  };
  const configuredValues = Object.values(raw).filter(Boolean).length;

  if (configuredValues === 0) return null;
  if (configuredValues !== Object.keys(raw).length) {
    throw new PasswordRecoveryDeliveryConfigurationError();
  }

  if (!isSafeSender(raw.sender!)) {
    throw new PasswordRecoveryDeliveryConfigurationError();
  }

  return {
    endpoint: normalizeHttpsUrl(raw.endpoint!),
    bearerToken: raw.bearerToken!,
    sender: raw.sender!,
    publicBaseUrl: normalizeHttpsUrl(raw.publicBaseUrl!),
  };
}

export async function deliverPasswordRecoveryEmail(
  config: PasswordRecoveryHttpDeliveryConfig | null,
  input: Parameters<PasswordRecoveryDelivery['send']>[0],
  httpClient: PasswordRecoveryHttpClient = async (url, init) => {
    const response = await fetch(url, init);
    return { ok: response.ok, status: response.status };
  },
): Promise<void> {
  if (!config) throw new PasswordRecoveryDeliveryUnavailableError();

  const endpoint = normalizeHttpsUrl(config.endpoint);
  const publicBaseUrl = normalizeHttpsUrl(config.publicBaseUrl);
  if (!isSafeSender(config.sender) || !config.bearerToken.trim()) {
    throw new PasswordRecoveryDeliveryConfigurationError();
  }

  const actionUrl = new URL('/redefinir-senha', publicBaseUrl);
  actionUrl.hash = new URLSearchParams({ token: input.token }).toString();
  const idempotencyKey = createHash('sha256')
    .update('password-recovery:', 'utf8')
    .update(input.token, 'utf8')
    .digest('hex');
  const timeoutMs = normalizeTimeout(config.timeoutMs);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await httpClient(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.bearerToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        schema: 'evolvia.transactional-email.v1',
        message: {
          from: config.sender,
          to: [input.recipient],
          subject: PASSWORD_RECOVERY_SUBJECT,
          text: buildTextMessage(actionUrl.toString(), input.expiresAt),
          html: buildHtmlMessage(actionUrl.toString(), input.expiresAt),
        },
        metadata: {
          purpose: 'password-recovery',
          expiresAt: input.expiresAt.toISOString(),
        },
      }),
      signal: abortController.signal,
    });

    if (!response.ok) throw new PasswordRecoveryDeliveryUnavailableError();
  } catch (reason) {
    if (reason instanceof PasswordRecoveryDeliveryUnavailableError) throw reason;
    throw new PasswordRecoveryDeliveryUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}

@Injectable()
export class HttpPasswordRecoveryDelivery implements PasswordRecoveryDelivery {
  private readonly config = passwordRecoveryDeliveryConfigFromEnvironment();

  async send(input: Parameters<PasswordRecoveryDelivery['send']>[0]): Promise<void> {
    await deliverPasswordRecoveryEmail(this.config, input);
  }
}

function normalizeHttpsUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new PasswordRecoveryDeliveryConfigurationError();
    }
    return url.toString();
  } catch (reason) {
    if (reason instanceof PasswordRecoveryDeliveryConfigurationError) throw reason;
    throw new PasswordRecoveryDeliveryConfigurationError();
  }
}

function isSafeSender(value: string): boolean {
  return (
    !/[\r\n]/u.test(value) &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(value)
  );
}

function normalizeTimeout(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(value) || value < 1_000 || value > 30_000) {
    throw new PasswordRecoveryDeliveryConfigurationError();
  }
  return value;
}

function buildTextMessage(actionUrl: string, expiresAt: Date): string {
  return [
    'Recebemos uma solicitação para redefinir sua senha na Evolvia.',
    '',
    `Acesse o link seguro: ${actionUrl}`,
    `O link expira em ${expiresAt.toISOString()}.`,
    '',
    'Se você não fez essa solicitação, ignore esta mensagem.',
  ].join('\n');
}

function buildHtmlMessage(actionUrl: string, expiresAt: Date): string {
  const safeUrl = escapeHtml(actionUrl);
  const safeExpiration = escapeHtml(expiresAt.toISOString());
  return [
    '<p>Recebemos uma solicitação para redefinir sua senha na Evolvia.</p>',
    `<p><a href="${safeUrl}">Redefinir minha senha</a></p>`,
    `<p>O link expira em ${safeExpiration}.</p>`,
    '<p>Se você não fez essa solicitação, ignore esta mensagem.</p>',
  ].join('');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
