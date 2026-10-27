import assert from 'node:assert/strict';
import test from 'node:test';
import { AsaasCheckoutGateway } from '../dist/asaas-checkout.gateway.js';

const id = 'c7b1c696-b27b-4d3d-80b9-d1c018e387f8';
const input = {
  reservationId: 'reservation-test', protocol: 'TEST', eventName: 'Evento teste', slug: 'evento-teste',
  amountCents: 1000, minutesToExpire: 30, billingTypes: ['PIX'], chargeTypes: ['DETACHED'],
  maxInstallmentCount: null, split: { walletId: '12345678-1234-1234-1234-123456789012', fixedValue: 9 },
};

async function run(body, action, environment = 'sandbox') {
  const before = { ...process.env };
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    process.env.ASAAS_ENVIRONMENT = environment;
    if (environment === 'production') {
      process.env.NODE_ENV = 'production';
      process.env.ASAAS_ALLOW_PRODUCTION = 'true';
    }
    process.env.EVOLVIA_PUBLIC_BASE_URL = 'https://evento.example';
    const gateway = new AsaasCheckoutGateway();
    gateway.isConfigured = () => true;
    gateway.isLocalCheckoutSession = () => false;
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify(body), { status: 200 });
    };
    await action(gateway, calls);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
  }
}

test('checkout com resposta documentada somente id ou link nulo gera URL no mesmo ambiente sem segunda cobrança', async () => {
  for (const body of [{ id }, { id, link: null }]) {
    await run(body, async (gateway, calls) => {
      const result = await gateway.createCheckout(input);
      assert.equal(result.providerCheckoutId, id);
      assert.equal(result.checkoutUrl, 'https://sandbox.asaas.com/checkoutSession/show?id=' + id);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://api-sandbox.asaas.com/v3/checkouts');
      assert.equal(calls[0].options.redirect, 'error');
      assert.equal(JSON.parse(calls[0].options.body).externalReference, 'registration:reservation-test');
    });
  }
});

test('checkout de produção recusa link sandbox, subdomínio e porta alternativa sem repetir POST', async () => {
  for (const link of [
    'https://sandbox.asaas.com/checkoutSession/show?id=' + id,
    'https://api-sandbox.asaas.com/checkoutSession/show?id=' + id,
    'https://asaas.com:444/checkoutSession/show?id=' + id,
    'https://www.asaas.com:444/checkoutSession/show?id=' + id,
    'https://arbitrary.asaas.com/checkoutSession/show?id=' + id,
    'https://www.sandbox.asaas.com/checkoutSession/show?id=' + id,
    'https://www.asaas.com.evil.example/checkoutSession/show?id=' + id,
    'http://www.asaas.com/checkoutSession/show?id=' + id,
    'https://user:password@www.asaas.com/checkoutSession/show?id=' + id,
  ]) {
    await run({ id, link }, async (gateway, calls) => {
      await assert.rejects(gateway.createCheckout(input), error => error.code === 'provider_untrusted_link' && error.retrySafety === 'UNKNOWN');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://api.asaas.com/v3/checkouts');
    }, 'production');
  }
});

test('resposta controlada de produção aceita origem documentada e fallback sem contato externo', async () => {
  const link = 'https://asaas.com/checkoutSession/show?id=' + id;
  for (const body of [{ id }, { id, link: null }, { id, link }]) {
    await run(body, async (gateway, calls) => {
      assert.equal((await gateway.createCheckout(input)).checkoutUrl, link);
      assert.equal(calls.length, 1);
    }, 'production');
  }
});

test('link explícito válido do provedor permanece compatível', async () => {
  const link = 'https://sandbox.asaas.com/checkoutSession/show?id=' + id;
  await run({ id, link }, async gateway => assert.equal((await gateway.createCheckout(input)).checkoutUrl, link));
});

test('produção aceita www explícito sem alterar caminho ou query retornados e sem repetir POST', async () => {
  const link = 'https://www.asaas.com/000/checkoutSession/show?id=' + id + '&source=provider';
  await run({ id, link }, async (gateway, calls) => {
    assert.equal((await gateway.createCheckout(input)).checkoutUrl, link);
    assert.equal(calls.length, 1);
  }, 'production');
});

test('ID inválido ou link explícito inseguro não usa fallback nem repete POST', async () => {
  for (const body of [{ id: '../invalid' }, { id, link: '' },
    { id, link: 'https://evil.example/checkout' }, { id, link: 'https://asaas.com/checkoutSession/show?id=' + id },
    { id, link: 'https://sandbox.asaas.com.evil.example/' }, { id, link: 'https://www.asaas.com/000/checkoutSession/show?id=' + id }]) {
    await run(body, async (gateway, calls) => {
      await assert.rejects(gateway.createCheckout(input), error => error.retrySafety === 'UNKNOWN');
      assert.equal(calls.length, 1);
    });
  }
});

