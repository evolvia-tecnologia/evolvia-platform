import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ASAAS_STUB_WEBHOOK_TOKEN,
  AsaasCheckoutPolicyError,
  asaasDuplicateWebhookDecision,
  asaasStubCreatedCheckout,
  asaasStubPaidWebhook,
  asaasWebhookTokenIsValid,
  authorizeAsaasCheckoutWebhook,
  isAsaasLocalCheckoutSession,
  isAsaasStubMode,
  isAsaasStubWebhookToken,
  normalizeAsaasCheckoutWebhook,
  publicCheckoutNextStep,
  resolveAsaasWebhookToken,
  shouldAutoConfirmAsaasCheckout,
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
  const composeCi = {
    NODE_ENV: 'production',
    ASAAS_MODE: 'ci_stub',
    EVOLVIA_CI_MODE: '1',
    ASAAS_ENVIRONMENT: 'sandbox',
  };
  assert.equal(isAsaasLocalCheckoutSession(composeCi), true);
  assert.equal(isAsaasStubMode(composeCi), false);
  assert.equal(shouldAutoConfirmAsaasCheckout(composeCi), false);
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
  assert.equal(isAsaasLocalCheckoutSession({ NODE_ENV: 'test', ASAAS_MODE: 'ci_stub' }), false);
  assert.equal(isAsaasLocalCheckoutSession({}), false);
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

test('duplicata idêntica é idempotente e divergência de valor entra em conflito', () => {
  const first = asaasStubPaidWebhook('ci_dup_000000000000000000000000000001', 15_000);
  const again = asaasStubPaidWebhook('ci_dup_000000000000000000000000000001', 15_000);
  const mismatch = asaasStubPaidWebhook('ci_dup_000000000000000000000000000001', 16_500);
  const left = normalizeAsaasCheckoutWebhook(first);
  const right = normalizeAsaasCheckoutWebhook(again);
  const other = normalizeAsaasCheckoutWebhook(mismatch);
  const same = webhookFingerprint(left);
  const diverged = webhookFingerprint(other);
  assert.equal(same, webhookFingerprint(right));
  assert.equal(asaasDuplicateWebhookDecision({
    storedHash: same,
    incomingHash: webhookFingerprint(right),
    processedAt: '2026-10-21T12:00:00.000Z',
  }), 'already_processed');
  assert.equal(asaasDuplicateWebhookDecision({
    storedHash: same,
    incomingHash: webhookFingerprint(right),
    processedAt: null,
  }), 'retry_unprocessed');
  assert.equal(asaasDuplicateWebhookDecision({
    storedHash: same,
    incomingHash: diverged,
    processedAt: null,
  }), 'conflict');
  assert.notEqual(same, diverged);
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

const REAL_TOKEN = 'webhook-token-sandbox-com-mais-de-32-caracteres';

test('sandbox real não auto-confirma e recusa token de stub', () => {
  const sandbox = {
    NODE_ENV: 'development',
    ASAAS_ENVIRONMENT: 'sandbox',
    ASAAS_MODE: undefined,
    EVOLVIA_CI_MODE: undefined,
    ASAAS_WEBHOOK_TOKEN: REAL_TOKEN,
  };
  assert.equal(isAsaasStubMode(sandbox), false);
  assert.equal(shouldAutoConfirmAsaasCheckout(sandbox), false);
  assert.equal(resolveAsaasWebhookToken(sandbox), REAL_TOKEN);
  assert.notEqual(resolveAsaasWebhookToken(sandbox), ASAAS_STUB_WEBHOOK_TOKEN);
  assert.equal(resolveAsaasWebhookToken({
    NODE_ENV: 'development',
    ASAAS_ENVIRONMENT: 'sandbox',
    ASAAS_MODE: undefined,
  }), undefined);
  assert.equal(resolveAsaasWebhookToken({
    NODE_ENV: 'production',
    ASAAS_MODE: 'ci_stub',
    EVOLVIA_CI_MODE: '1',
    ASAAS_WEBHOOK_TOKEN: undefined,
  }), undefined);
  assert.equal(resolveAsaasWebhookToken({
    ...allowed,
    ASAAS_WEBHOOK_TOKEN: undefined,
  }), ASAAS_STUB_WEBHOOK_TOKEN);
  assert.equal(shouldAutoConfirmAsaasCheckout(allowed), true);
});

test('sentinel de stub não autoriza webhook fora do modo stub', () => {
  assert.equal(asaasWebhookTokenIsValid(ASAAS_STUB_WEBHOOK_TOKEN), true);
  assert.equal(isAsaasStubWebhookToken(ASAAS_STUB_WEBHOOK_TOKEN), true);
  for (const env of [
    { NODE_ENV: 'production', ASAAS_MODE: 'sandbox', ASAAS_WEBHOOK_TOKEN: ASAAS_STUB_WEBHOOK_TOKEN },
    { NODE_ENV: 'staging', ASAAS_MODE: 'sandbox', ASAAS_WEBHOOK_TOKEN: ASAAS_STUB_WEBHOOK_TOKEN },
    { NODE_ENV: 'development', ASAAS_MODE: 'sandbox', ASAAS_WEBHOOK_TOKEN: ASAAS_STUB_WEBHOOK_TOKEN },
    { NODE_ENV: 'production', ASAAS_MODE: 'ci_stub', EVOLVIA_CI_MODE: '1', ASAAS_WEBHOOK_TOKEN: ASAAS_STUB_WEBHOOK_TOKEN },
  ]) {
    assert.equal(resolveAsaasWebhookToken(env), undefined, JSON.stringify(env));
    assert.equal(authorizeAsaasCheckoutWebhook(ASAAS_STUB_WEBHOOK_TOKEN, env), false, JSON.stringify(env));
    assert.equal(authorizeAsaasCheckoutWebhook(REAL_TOKEN, env), false, JSON.stringify(env));
  }
  const sandbox = {
    NODE_ENV: 'development',
    ASAAS_ENVIRONMENT: 'sandbox',
    ASAAS_MODE: undefined,
    ASAAS_WEBHOOK_TOKEN: REAL_TOKEN,
  };
  assert.equal(authorizeAsaasCheckoutWebhook(REAL_TOKEN, sandbox), true);
  assert.equal(authorizeAsaasCheckoutWebhook(ASAAS_STUB_WEBHOOK_TOKEN, sandbox), false);
  assert.equal(authorizeAsaasCheckoutWebhook(ASAAS_STUB_WEBHOOK_TOKEN, allowed), true);
  const composeCi = {
    NODE_ENV: 'production',
    ASAAS_MODE: 'ci_stub',
    EVOLVIA_CI_MODE: '1',
    ASAAS_WEBHOOK_TOKEN: REAL_TOKEN,
  };
  assert.equal(isAsaasLocalCheckoutSession(composeCi), true);
  assert.equal(shouldAutoConfirmAsaasCheckout(composeCi), false);
  assert.equal(authorizeAsaasCheckoutWebhook(REAL_TOKEN, composeCi), true);
  assert.equal(authorizeAsaasCheckoutWebhook(ASAAS_STUB_WEBHOOK_TOKEN, composeCi), false);
});
