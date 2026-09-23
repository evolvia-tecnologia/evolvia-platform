import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AsaasCheckoutPolicyError,
  normalizeAsaasCheckoutWebhook,
  normalizeReservationProtocol,
  secureTokenMatches,
  webhookFingerprint,
} from '../src/asaas-checkout-policy.ts';

const valid = {
  id: 'evt_37260be8159d4472b4458d3de13efc2d&15370',
  event: 'CHECKOUT_PAID',
  dateCreated: '2026-09-23 00:00:00',
  checkout: {
    id: 'checkout-safe-0001',
    status: 'PAID',
    items: [
      { name: 'Inscrição', quantity: 1, value: 80 },
      { name: 'Adicional', quantity: 2, value: 10.25 },
    ],
    futureField: { ignored: true },
  },
  futureTopLevelField: true,
};

test('normaliza somente o envelope mínimo e calcula centavos exatamente', () => {
  const result = normalizeAsaasCheckoutWebhook(valid);
  assert.deepEqual(result, {
    providerEventId: valid.id,
    eventType: 'CHECKOUT_PAID',
    externalCheckoutId: 'checkout-safe-0001',
    checkoutStatus: 'PAID',
    amountCents: 10_050,
  });
  assert.match(webhookFingerprint(result), /^[a-f0-9]{64}$/u);
});

test('tolera eventos futuros autenticados sem executar regra financeira', () => {
  const result = normalizeAsaasCheckoutWebhook({
    id: 'evt_future_0001',
    event: 'CHECKOUT_NEW_EVENT',
    checkout: { id: 'checkout-safe-0001', status: 'ACTIVE' },
  });
  assert.equal(result.eventType, 'CHECKOUT_NEW_EVENT');
  assert.equal(result.amountCents, null);
});

test('pagamento exige itens e precisão monetária segura', () => {
  for (const checkout of [
    { id: 'checkout-safe-0001', status: 'PAID' },
    { id: 'checkout-safe-0001', status: 'PAID', items: [{ quantity: 1, value: 1.001 }] },
    { id: 'checkout-safe-0001', status: 'PAID', items: [{ quantity: 0, value: 1 }] },
  ]) {
    assert.throws(
      () => normalizeAsaasCheckoutWebhook({ id: 'evt_invalid_0001', event: 'CHECKOUT_PAID', checkout }),
      AsaasCheckoutPolicyError,
    );
  }
});

test('protocolo público tem entropia e formato canônicos', () => {
  assert.equal(normalizeReservationProtocol('EVO-0123456789ABCDEF'), 'EVO-0123456789ABCDEF');
  for (const value of ['evo-0123456789abcdef', 'EVO-123', '../EVO-0123456789ABCDEF']) {
    assert.throws(() => normalizeReservationProtocol(value), AsaasCheckoutPolicyError);
  }
});

test('token usa contrato de 32 a 255 caracteres e comparação constante por hash', () => {
  const token = 'webhook-token-seguro-com-mais-de-32-caracteres';
  assert.equal(secureTokenMatches(token, token), true);
  assert.equal(secureTokenMatches('outro-token-seguro-com-mais-de-32-caracteres', token), false);
  assert.equal(secureTokenMatches('curto', 'curto'), false);
  assert.equal(secureTokenMatches(undefined, token), false);
});
