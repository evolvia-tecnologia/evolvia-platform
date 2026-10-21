import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AsaasCheckoutPolicyError,
  asaasStubCreatedCheckout,
  asaasStubPaidWebhook,
  isAsaasStubMode,
  normalizeAsaasCheckoutWebhook,
  publicCheckoutNextStep,
  webhookFingerprint,
} from '../src/asaas-checkout-policy.ts';
import { quotePlatformCommission } from '../src/paid-event-commission.policy.ts';

const allowed = { NODE_ENV: 'test', ASAAS_MODE: 'ci_stub', EVOLVIA_CI_MODE: '1' };

test('simulação exige opt-in explícito e runtime local/teste conhecido', () => {
  assert.equal(isAsaasStubMode(allowed), true);
  assert.equal(isAsaasStubMode({ ...allowed, NODE_ENV: 'development' }), true);
  assert.equal(isAsaasStubMode({}), false);
  assert.equal(isAsaasStubMode({ ASAAS_MODE: 'ci_stub', EVOLVIA_CI_MODE: '1' }), false);
  assert.equal(isAsaasStubMode({ ...allowed, NODE_ENV: 'staging' }), false);
  assert.equal(isAsaasStubMode({ ...allowed, NODE_ENV: 'production' }), false);
  assert.equal(isAsaasStubMode({
    NODE_ENV: 'production',
    ASAAS_MODE: 'ci_stub',
    EVOLVIA_CI_MODE: '1',
    ASAAS_ENVIRONMENT: 'sandbox',
  }), false);
  assert.equal(isAsaasStubMode({ ...allowed, ASAAS_MODE: 'sandbox' }), false);
  assert.equal(isAsaasStubMode({ ...allowed, ASAAS_MODE: undefined }), false);
  assert.equal(isAsaasStubMode({ ...allowed, EVOLVIA_CI_MODE: '0' }), false);
  assert.equal(isAsaasStubMode({ NODE_ENV: 'test', ASAAS_MODE: 'ci_stub' }), false);
  assert.equal(isAsaasStubMode({ NODE_ENV: 'development', EVOLVIA_CI_MODE: '1' }), false);
});

test('webhook simulado cobra o valor com comissão e não usa URL do sandbox', () => {
  const quote = quotePlatformCommission({
    surface: 'registration',
    ticketCents: 12_000,
    percent: 10,
    bearer: 'PARTICIPANT',
    country: 'BR',
  });
  assert.equal(quote.buyerCents, 13_200);
  const payload = asaasStubPaidWebhook('ci_abcdef0123456789abcdef0123456789', quote.buyerCents);
  const normalized = normalizeAsaasCheckoutWebhook(payload);
  assert.equal(normalized.eventType, 'CHECKOUT_PAID');
  assert.equal(normalized.amountCents, quote.buyerCents);
  assert.equal(normalized.externalCheckoutId, 'ci_abcdef0123456789abcdef0123456789');
  const created = asaasStubCreatedCheckout('ci_abcdef0123456789abcdef0123456789');
  assert.match(created.checkoutUrl, /^http:\/\/127\.0\.0\.1\/evolvia-asaas-stub\//u);
  assert.doesNotMatch(created.checkoutUrl, /asaas\.com/u);
});

test('duplicata idêntica compartilha fingerprint e divergência de valor não confirma', () => {
  const first = asaasStubPaidWebhook('ci_dup_000000000000000000000000000001', 15_000);
  const again = asaasStubPaidWebhook('ci_dup_000000000000000000000000000001', 15_000);
  const mismatch = asaasStubPaidWebhook('ci_dup_000000000000000000000000000001', 16_500);
  const left = normalizeAsaasCheckoutWebhook(first);
  const right = normalizeAsaasCheckoutWebhook(again);
  const other = normalizeAsaasCheckoutWebhook(mismatch);
  assert.equal(webhookFingerprint(left), webhookFingerprint(right));
  assert.notEqual(webhookFingerprint(left), webhookFingerprint(other));
  assert.equal(left.amountCents === 16_500, false);
  assert.equal(other.amountCents === 15_000, false);
});

test('sandbox real não recebe texto de confirmação simulada e valor inválido falha', () => {
  assert.equal(
    publicCheckoutNextStep({
      reservationStatus: 'CONFIRMED',
      checkoutStatus: 'PAID',
      proofBlock: null,
      simulated: false,
    }),
    'Pagamento confirmado pelo Asaas. Sua inscrição está confirmada.',
  );
  assert.equal(
    publicCheckoutNextStep({
      reservationStatus: 'CONFIRMED',
      checkoutStatus: 'PAID',
      proofBlock: null,
      simulated: true,
    }),
    'Pagamento simulado localmente. Esta confirmação não veio do Asaas.',
  );
  assert.equal(
    publicCheckoutNextStep({
      reservationStatus: 'PENDING_PAYMENT',
      checkoutStatus: 'ACTIVE',
      proofBlock: null,
      simulated: false,
    }),
    'Conclua o pagamento no ambiente seguro do Asaas. No Brasil, Pix ou cartão; em outro país, cartão. Aguarde a confirmação automática.',
  );
  assert.equal(
    publicCheckoutNextStep({
      reservationStatus: 'PENDING_PAYMENT',
      checkoutStatus: 'ACTIVE',
      proofBlock: null,
      simulated: true,
    }),
    'Pagamento local em simulação. Sem cobrança no Asaas.',
  );
  assert.throws(() => asaasStubPaidWebhook('ci_bad', 0), AsaasCheckoutPolicyError);
  assert.throws(() => asaasStubPaidWebhook('../checkout', 1500), AsaasCheckoutPolicyError);
});
