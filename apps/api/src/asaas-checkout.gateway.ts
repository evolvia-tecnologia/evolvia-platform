import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  ASAAS_STUB_ORGANIZER_WALLET,
  asaasStubCreatedCheckout,
  asaasWebhookTokenIsValid,
  isAsaasLocalCheckoutSession,
  isAsaasStubMode,
  resolveAsaasWebhookToken,
} from './asaas-checkout-policy';
import { PaidEventCommissionError, asaasCheckoutPayload } from './paid-event-commission.policy';

export type CreateAsaasCheckoutInput = {
  reservationId: string;
  protocol: string;
  eventName: string;
  slug: string;
  amountCents: number;
  minutesToExpire: number;
  billingTypes: Array<'PIX' | 'CREDIT_CARD'>;
  chargeTypes: Array<'DETACHED' | 'INSTALLMENT'>;
  maxInstallmentCount: number | null;
  split: { walletId: string; fixedValue: number };
};

export type CreatedAsaasCheckout = {
  providerCheckoutId: string;
  checkoutUrl: string;
};

export class AsaasGatewayError extends Error {
  constructor(
    public readonly code: string,
    public readonly retrySafety: 'SAFE' | 'UNKNOWN',
    message = 'O provedor de pagamento não pôde iniciar o checkout.',
  ) {
    super(message);
  }
}

const MAX_RESPONSE_BYTES = 64 * 1024;

function publicBaseUrl(): URL | null {
  try {
    const url = new URL(process.env.EVOLVIA_PUBLIC_BASE_URL ?? '');
    const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) return null;
    return url;
  } catch {
    return null;
  }
}

async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_RESPONSE_BYTES) throw new AsaasGatewayError('provider_response_too_large', 'UNKNOWN');
  if (!response.body) return {};
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new AsaasGatewayError('provider_response_too_large', 'UNKNOWN');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    throw new AsaasGatewayError('provider_invalid_response', 'UNKNOWN');
  }
}

@Injectable()
export class AsaasCheckoutGateway {
  isStubMode(): boolean {
    return isAsaasStubMode(process.env);
  }

  isLocalCheckoutSession(): boolean {
    return isAsaasLocalCheckoutSession(process.env);
  }

  isConfigured(): boolean {
    if (this.isLocalCheckoutSession()) return true;
    const apiKey = process.env.ASAAS_API_KEY ?? '';
    return apiKey.length >= 20 && apiKey.length <= 512 && !/\s/u.test(apiKey) && Boolean(publicBaseUrl()) && asaasWebhookTokenIsValid(this.webhookToken());
  }

  stubOrganizerWalletId(): string {
    return ASAAS_STUB_ORGANIZER_WALLET;
  }

  webhookToken(): string | undefined {
    return resolveAsaasWebhookToken(process.env);
  }

  private environment(): 'sandbox' | 'production' {
    if (process.env.ASAAS_ENVIRONMENT === 'production') {
      if (process.env.ASAAS_ALLOW_PRODUCTION !== 'true' || process.env.NODE_ENV !== 'production') {
        throw new AsaasGatewayError('production_not_authorized', 'SAFE', 'A cobrança de produção não está autorizada.');
      }
      return 'production';
    }
    return 'sandbox';
  }

  async createCheckout(input: CreateAsaasCheckoutInput): Promise<CreatedAsaasCheckout> {
    if (!this.isConfigured()) throw new AsaasGatewayError('provider_not_configured', 'SAFE', 'O pagamento está temporariamente indisponível.');
    const callbackBase = publicBaseUrl() ?? (this.isLocalCheckoutSession() ? new URL('http://127.0.0.1:3000') : null);
    if (!callbackBase) throw new AsaasGatewayError('invalid_public_base_url', 'SAFE');

    const callback = (outcome: string) => {
      const url = new URL(`/evento/${encodeURIComponent(input.slug)}/inscricao`, callbackBase);
      url.searchParams.set('protocolo', input.protocol);
      url.searchParams.set('pagamento', outcome);
      return url.toString();
    };
    let payload: ReturnType<typeof asaasCheckoutPayload>;
    try {
      payload = asaasCheckoutPayload(input, {
        successUrl: callback('retorno'),
        cancelUrl: callback('cancelado'),
        expiredUrl: callback('expirado'),
      });
    } catch (error) {
      if (error instanceof PaidEventCommissionError) throw new AsaasGatewayError('invalid_checkout_split', 'SAFE', error.message);
      throw error;
    }
    if (this.isLocalCheckoutSession()) {
      const id = `ci_${createHash('sha256').update(input.reservationId).digest('hex').slice(0, 32)}`;
      return asaasStubCreatedCheckout(id);
    }

    const environment = this.environment();
    const apiBase = environment === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';

    let response: Response;
    try {
      response = await fetch(`${apiBase}/checkouts`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          access_token: process.env.ASAAS_API_KEY ?? '',
          'user-agent': 'Evolvia/0.2 checkout',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8_000),
        redirect: 'error',
      });
    } catch {
      throw new AsaasGatewayError('provider_network_ambiguous', 'UNKNOWN');
    }
    const body = await boundedJson(response);
    if (!response.ok) {
      const safe = response.status >= 400 && response.status < 500 ? 'SAFE' : 'UNKNOWN';
      throw new AsaasGatewayError(`provider_http_${response.status}`, safe);
    }
    const id = body.id;
    const link = body.link;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,200}$/u.test(id) || typeof link !== 'string') {
      throw new AsaasGatewayError('provider_invalid_checkout', 'UNKNOWN');
    }
    let checkoutUrl: URL;
    try { checkoutUrl = new URL(link); } catch { throw new AsaasGatewayError('provider_invalid_link', 'UNKNOWN'); }
    const allowedHost = environment === 'production' ? 'asaas.com' : 'sandbox.asaas.com';
    const trustedHost = checkoutUrl.hostname === allowedHost || checkoutUrl.hostname.endsWith(`.${allowedHost}`);
    if (checkoutUrl.protocol !== 'https:' || !trustedHost || checkoutUrl.username || checkoutUrl.password) {
      throw new AsaasGatewayError('provider_untrusted_link', 'UNKNOWN');
    }
    return { providerCheckoutId: id, checkoutUrl: checkoutUrl.toString() };
  }
}
