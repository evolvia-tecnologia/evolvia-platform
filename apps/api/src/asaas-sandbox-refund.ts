import { ConflictException, ServiceUnavailableException } from '@nestjs/common';

export type SandboxRefund = {
  requestId: string; paymentId: string; checkoutId: string; amountCents: number; checkoutCents: number;
};

function hasAmount(value: unknown, expectedCents: number): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return false;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) && cents === expectedCents && cents / 100 === value;
}

async function callAsaas(paymentId: string, token: string, body?: object) {
  if (!/^pay_[a-zA-Z0-9_-]{1,196}$/.test(paymentId)) throw new ConflictException('Referência de cobrança inválida.');
  const url = new URL('/v3/payments/' + paymentId + (body ? '/refund' : ''), 'https://api-sandbox.asaas.com');
  return fetch(url, {
    method: body ? 'POST' : 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
    headers: { access_token: token, 'User-Agent': 'Evolvia', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function readSandboxPayment(paymentId: string, token: string) {
  try {
    const response = await callAsaas(paymentId, token);
    if (!response.ok) { await response.body?.cancel(); throw new Error(); }
    return await response.json() as { id?: unknown; checkoutSession?: unknown; billingType?: unknown; value?: unknown;
      split?: unknown; refunds?: unknown; status?: unknown } | null;
  } catch { throw new ServiceUnavailableException('Consulta ao sandbox indisponível.'); }
}

export function inspectSandboxPayment(op: SandboxRefund, payment: Awaited<ReturnType<typeof readSandboxPayment>>) {
  if (payment?.id !== op.paymentId || payment.checkoutSession !== op.checkoutId ||
      payment.billingType !== 'PIX' || !hasAmount(payment.value, op.checkoutCents) ||
      (payment.split != null && !(Array.isArray(payment.split) && payment.split.length === 0))) {
    throw new ConflictException('A cobrança não corresponde a um Pix sem split deste checkout.');
  }
  const refunds: unknown = payment.refunds ?? [];
  if (!Array.isArray(refunds)) throw new ConflictException('Histórico de estornos inválido.');
  const matches = refunds.filter(item => item?.description === 'Evolvia/' + op.requestId);
  if (matches.length > 1 || (matches.length && !hasAmount(matches[0].value, op.amountCents))) {
    throw new ConflictException('Histórico ambíguo para este pedido.');
  }
  const state = matches[0]?.status;
  return { eligible: payment.status === 'RECEIVED', matched: matches.length === 1,
    status: state === 'DONE' ? 'RECONCILED' : state === 'CANCELLED' ? 'FAILED' : 'PROCESSING' };
}

// An ambiguous POST can have reached Asaas. Only the first durable claimant sends it.
export async function submitSandboxRefund(op: SandboxRefund, token: string) {
  try {
    const response = await callAsaas(op.paymentId, token, { value: op.amountCents / 100, description: 'Evolvia/' + op.requestId });
    await response.body?.cancel();
    return response.status === 400 || response.status === 401 || response.status === 403 ? 'FAILED' : 'PROCESSING';
  } catch { return 'PROCESSING'; }
}
