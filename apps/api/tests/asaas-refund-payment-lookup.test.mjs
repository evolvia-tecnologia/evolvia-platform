import assert from 'node:assert/strict';
import test from 'node:test';
import { lookupRefundPayment } from '../src/asaas-refund-payment-lookup.ts';

const scope = { organizationId: 'org_A', eventId: 'event_A', providerCheckoutId: 'checkout_A' };
const payment = { id: 'pay_A', checkoutSession: scope.providerCheckoutId };
const page = { totalCount: 1, hasMore: false, data: [payment] };

test('consulta filtrada preserva escopo e devolve somente a referência de cobrança', async () => {
  const result = await lookupRefundPayment(scope, async (actual, query) => {
    assert.deepEqual(actual, scope);
    assert.deepEqual(Object.fromEntries(query), { checkoutSession: 'checkout_A', limit: '2', offset: '0' });
    return page;
  });
  assert.equal(result, 'pay_A');
});

test('recusa resposta vazia, paginada, ambígua ou malformada', async () => {
  for (const bad of [null, {}, { ...page, totalCount: 0 }, { ...page, hasMore: true },
    { ...page, totalCount: 2 }, { ...page, data: [] }, { ...page, data: [payment, payment] }]) {
    await assert.rejects(lookupRefundPayment(scope, async () => bad), /sem cobrança única/);
  }
});

test('a resposta da consulta filtrada pode omitir o campo de sessão', async () => {
  const result = await lookupRefundPayment(scope, async (_, query) => {
    assert.equal(query.get('checkoutSession'), scope.providerCheckoutId);
    return { ...page, data: [{ id: 'pay_A' }] };
  });
  assert.equal(result, 'pay_A');
});

test('recusa outra sessão, vínculo contraditório e checkout usado como cobrança', async () => {
  for (const item of [null, { ...payment, checkoutSession: 'checkout_B' }, { ...payment, checkoutSession: null },
    { ...payment, id: scope.providerCheckoutId }, { ...payment, id: '' }]) {
    await assert.rejects(lookupRefundPayment(scope, async () => ({ ...page, data: [item] })), /sem vínculo/);
  }
});

test('escopo incompleto impede até a leitura e indisponibilidade não fabrica referência', async () => {
  for (const key of Object.keys(scope)) {
    await assert.rejects(lookupRefundPayment({ ...scope, [key]: '' }, () => assert.fail()), /Escopo/);
  }
  await assert.rejects(lookupRefundPayment(scope, async () => { throw new Error('indisponível'); }), /indisponível/);
});

test('consulta HTTP de homologação usa a conta do evento e o filtro de sessão', async () => {
  const { lookupSandboxRefundPayment } = await import('../src/asaas-refund-payment-lookup.ts');
  const account = { organizationId: scope.organizationId, token: 'simulado' };
  const calls = [];
  const id = await lookupSandboxRefundPayment(scope, account, async (url, init) => {
    calls.push(url.origin + url.pathname);
    assert.equal(url.searchParams.get('checkoutSession'), scope.providerCheckoutId);
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.access_token, account.token);
    return Response.json(page);
  });
  assert.deepEqual(calls, ['https://api-sandbox.asaas.com/v3/payments']);
  assert.equal(id, 'pay_A');
});

test('conta incompatível bloqueia HTTP e falha do provedor não expõe corpo nem credencial', async () => {
  const { lookupSandboxRefundPayment } = await import('../src/asaas-refund-payment-lookup.ts');
  const account = { organizationId: scope.organizationId, token: 'simulado' };
  let calls = 0;
  const failure = async () => { calls++; return new Response('detalhe privado', { status: 401 }); };
  await assert.rejects(lookupSandboxRefundPayment(scope, { ...account, organizationId: 'outra' }, failure), /indisponível/);
  assert.equal(calls, 0);
  await assert.rejects(lookupSandboxRefundPayment(scope, account, failure), { message: 'Não foi possível consultar a cobrança na homologação.' });
  assert.equal(calls, 1);
});

test('entradas ausentes ou inválidas recusam a consulta antes do transporte', async () => {
  const { lookupSandboxRefundPayment } = await import('../src/asaas-refund-payment-lookup.ts');
  const unexpected = () => assert.fail('transporte acionado');
  for (const invalid of [null, undefined, []]) {
    await assert.rejects(lookupRefundPayment(invalid, unexpected), /Escopo do checkout inválido/);
    await assert.rejects(lookupSandboxRefundPayment(scope, invalid, unexpected), /Conta de homologação indisponível/);
  }
  await assert.rejects(lookupSandboxRefundPayment(scope, { organizationId: scope.organizationId, token: 42 }, unexpected), /Conta de homologação indisponível/);
});

test('erros de transporte, resposta HTTP e JSON mantêm somente diagnóstico redigido', async () => {
  const { lookupSandboxRefundPayment } = await import('../src/asaas-refund-payment-lookup.ts');
  const account = { organizationId: scope.organizationId, token: 'simulado' };
  for (const [cause, transport] of [
    ['TRANSPORT', async () => { throw new Error(account.token); }],
    ['HTTP_503', async () => ({ ok: false, status: 503, body: {} })],
    ['INVALID_JSON', async () => new Response('{')],
  ]) {
    await assert.rejects(lookupSandboxRefundPayment(scope, account, transport), {
      message: 'Não foi possível consultar a cobrança na homologação.', cause,
    });
  }
});
