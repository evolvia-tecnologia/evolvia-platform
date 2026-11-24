import { ExternalProviderJsonError, readExternalProviderJson } from './external-provider-json.ts';

/** Read-only adapter. The caller supplies a checkout loaded from the authorized
 * tenant/event and a reader bound to that tenant's Asaas account. */
type Checkout = Readonly<{
  organizationId: string;
  eventId: string;
  providerCheckoutId: string;
}>;

type PaymentList = (scope: Checkout, query: URLSearchParams) => Promise<unknown>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function lookupRefundPayment(checkout: Checkout, list: PaymentList): Promise<string> {
  if (!record(checkout)) throw new Error('Escopo do checkout inválido.');
  for (const field of [checkout.organizationId, checkout.eventId, checkout.providerCheckoutId]) {
    if (typeof field !== 'string' || !field.trim() || field.trim() !== field || field.length > 200) {
      throw new Error('Escopo do checkout inválido.');
    }
  }
  const checkoutId = checkout.providerCheckoutId;
  const query = new URLSearchParams({ checkoutSession: checkoutId, limit: '2', offset: '0' });
  const page = await list(checkout, query);
  if (!record(page) || page.totalCount !== 1 || page.hasMore !== false ||
      !Array.isArray(page.data) || page.data.length !== 1) {
    throw new Error('Consulta sem cobrança única para conciliação.');
  }
  const payment: unknown = page.data[0];
  if (!record(payment) || ('checkoutSession' in payment && payment.checkoutSession !== checkoutId) ||
      typeof payment.id !== 'string' || !/^pay_[A-Za-z0-9_-]+$/u.test(payment.id) ||
      payment.id.length > 200 || payment.id === checkoutId) {
    throw new Error('Cobrança sem vínculo verificável com o checkout.');
  }
  return payment.id;
}

type SandboxAccount = Readonly<{ organizationId: string; token: string }>;

/** Read-only. Bind credentials at the server boundary, after authorizing the event. */
export function lookupSandboxRefundPayment(
  checkout: Checkout, account: SandboxAccount, transport: typeof fetch = fetch,
): Promise<string> {
  return lookupRefundPayment(checkout, async (scope, query) => {
    if (!record(account) || scope.organizationId !== account.organizationId ||
        typeof account.token !== 'string' || !account.token.trim()) {
      throw new Error('Conta de homologação indisponível para esta organização.');
    }
    const url = new URL('https://api-sandbox.asaas.com/v3/payments');
    url.search = query.toString();
    let failure = 'TRANSPORT';
    try {
      const response = await transport(url, {
        method: 'GET',
        headers: { accept: 'application/json', access_token: account.token, 'User-Agent': 'Evolvia' },
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        failure = 'HTTP_' + response.status;
        await response.body?.cancel?.();
        throw new Error();
      }
      failure = 'INVALID_JSON';
      return await readExternalProviderJson(response);
    } catch (error) {
      if (error instanceof ExternalProviderJsonError && error.code === 'provider_response_too_large') failure = 'RESPONSE_TOO_LARGE';
      throw new Error('Não foi possível consultar a cobrança na homologação.', { cause: failure });
    }
  });
}
