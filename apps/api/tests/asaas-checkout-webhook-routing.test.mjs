import assert from 'node:assert/strict';
import test from 'node:test';
import { AsaasCheckoutWebhookController } from '../dist/asaas-checkout.controller.js';
import { asaasStubPaidWebhook } from '../dist/asaas-checkout-policy.js';
import { resetAccessShieldForTests } from '../dist/access-shield.js';

const token = 'g2-10-webhook-routing-token-long-enough-123456789';
const request = { socket: { remoteAddress: '127.0.0.1' } };

test('G2.10: authenticated webhook is normalized once and routed to the owning checkout service', async () => {
  process.env.ASAAS_MODE = 'ci_stub';
  process.env.EVOLVIA_CI_MODE = '1';
  process.env.NODE_ENV = 'test';
  process.env.ASAAS_WEBHOOK_TOKEN = token;
  resetAccessShieldForTests();

  const body = asaasStubPaidWebhook('chk_grouped_20261101_01', 6000);
  const calls = [];
  let isGrouped = true;
  const legacy = {
    receiveNormalizedWebhook: async (event) => {
      calls.push({ destination: 'legacy', event });
      return { accepted: true, destination: 'legacy' };
    },
  };
  const grouped = {
    ownsProviderCheckout: async (id) => {
      assert.equal(id, body.checkout.id);
      return isGrouped;
    },
    receiveNormalizedWebhook: async (event) => {
      calls.push({ destination: 'grouped', event });
      return { accepted: true, destination: 'grouped' };
    },
  };
  const controller = new AsaasCheckoutWebhookController(legacy, grouped);

  assert.deepEqual(await controller.receive(request, token, body), { accepted: true, destination: 'grouped' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].event.externalCheckoutId, body.checkout.id);
  assert.equal(calls[0].event.amountCents, 6000);
  assert.equal(calls[0].event.eventType, 'CHECKOUT_PAID');
  assert.equal(calls[0].event.checkout, undefined, 'service receives normalized event, not raw payload');

  isGrouped = false;
  assert.deepEqual(await controller.receive(request, token, body), { accepted: true, destination: 'legacy' });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].event.externalCheckoutId, body.checkout.id);

  await assert.rejects(() => controller.receive(request, 'invalid', body),
    (error) => error.getStatus?.() === 401);
  await assert.rejects(() => controller.receive(request, token, { event: 'CHECKOUT_PAID' }),
    (error) => error.getStatus?.() === 400);
  assert.equal(calls.length, 2, 'invalid requests must not reach either checkout service');
});
