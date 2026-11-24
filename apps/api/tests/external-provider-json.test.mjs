import assert from 'node:assert/strict';
import test from 'node:test';
import { readExternalProviderJson } from '../src/external-provider-json.ts';
import { lookupSandboxRefundPayment } from '../src/asaas-refund-payment-lookup.ts';

const limit = 64 * 1024;

test('leitor aceita JSON de exatamente 64 KiB', async () => {
  const payload = 'x'.repeat(limit - 2);
  assert.equal(await readExternalProviderJson(new Response(JSON.stringify(payload))), payload);
});

test('Content-Length excessivo cancela antes de consumir o corpo', async () => {
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const response = new Response(body, { headers: { 'Content-Length': String(limit + 1) } });
  await assert.rejects(readExternalProviderJson(response), { code: 'provider_response_too_large' });
  assert.equal(cancelled, true);
});

test('consulta Pix cancela resposta fragmentada excessiva mesmo com tamanho declarado menor', async () => {
  const scope = { organizationId: 'org-A', eventId: 'event-A', providerCheckoutId: 'checkout-A' };
  let calls = 0;
  let cancelled = false;
  const transport = async () => {
    calls++;
    const stream = new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(limit / 2)); },
      cancel() { cancelled = true; },
    });
    return new Response(stream, { headers: { 'Content-Length': '16' } });
  };
  await assert.rejects(lookupSandboxRefundPayment(scope, { organizationId: 'org-A', token: 'fixture' }, transport),
    { message: 'Não foi possível consultar a cobrança na homologação.', cause: 'RESPONSE_TOO_LARGE' });
  assert.equal(calls, 1);
  assert.equal(cancelled, true);
});


test('consulta Pix distingue falha durante leitura de JSON inválido', async () => {
  const scope = { organizationId: 'org-A', eventId: 'event-A', providerCheckoutId: 'checkout-A' };
  const account = { organizationId: 'org-A', token: 'fixture' };
  let reads = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (++reads === 1) controller.enqueue(new TextEncoder().encode('{"data":'));
      else controller.error(new Error('fixture transport failure'));
    },
  });
  await assert.rejects(lookupSandboxRefundPayment(scope, account, async () => new Response(body)),
    { message: 'Não foi possível consultar a cobrança na homologação.', cause: 'TRANSPORT' });
  assert.equal(body.locked, false);
  await assert.rejects(lookupSandboxRefundPayment(scope, account, async () => new Response('{invalid')),
    { message: 'Não foi possível consultar a cobrança na homologação.', cause: 'INVALID_JSON' });
});

test('leitor distingue JSON válido de corpo vazio ou malformado sem vazar conteúdo', async () => {
  assert.equal(await readExternalProviderJson(new Response(null)), null);
  for (const payload of ['', '{invalid']) {
    const response = new Response(payload);
    await assert.rejects(readExternalProviderJson(response), { code: 'provider_invalid_response' });
    assert.equal(response.body.locked, false);
  }
  assert.deepEqual(await readExternalProviderJson(new Response('[]')), []);
});
