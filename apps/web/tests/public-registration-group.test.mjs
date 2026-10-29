import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('G2.10: paid registration links a separate 2-10 participant route', async () => {
  const [single, page, group] = await Promise.all([
    read('../components/public-registration-form.tsx'),
    read('../app/evento/[slug]/inscricao/grupo/page.tsx'),
    read('../components/public-registration-group-form.tsx'),
  ]);
  assert.ok(single.includes('/inscricao/grupo'));
  assert.ok(page.includes('<PublicRegistrationGroupForm'));
  assert.ok(group.includes('entries.length >= 10'));
  assert.ok(group.includes('entries.length <= 2'));
  assert.ok(group.includes('Participante {index + 1}'));
  assert.ok(group.includes('terms_acceptance'));
  assert.ok(group.includes("proofRequirement === 'REQUIRED_BEFORE_PAYMENT'"));
  assert.ok(group.includes('role="alert"'));
});

test('G2.10: preview does not reserve and callback keeps capability private', async () => {
  const [group, page] = await Promise.all([
    read('../components/public-registration-group-form.tsx'),
    read('../app/evento/[slug]/inscricao/page.tsx'),
  ]);
  assert.ok(group.includes("post(base + '/preview'"));
  assert.ok(group.includes('post(base, requestBody(), key)'));
  assert.ok(group.includes('crypto.randomUUID()'));
  assert.ok(group.includes('sessionStorage.setItem(storageKey(created.orderId), key)'));
  assert.ok(group.includes("headers: { 'idempotency-key': key }"));
  assert.ok(group.includes("encodeURIComponent(order.orderId) + '/checkout'"));
  assert.ok(group.includes('Atualizar confirmação'));
  assert.ok(group.includes('if (initialOrderId && !order)'));
  assert.ok(group.includes('Não faça uma segunda compra antes de confirmar'));
  assert.ok(page.includes("redirect('/evento/'"));
  assert.equal(group.includes('localStorage.setItem'), false);
});

test('G2.10: manual payment only redirects to allowlisted Asaas origins', async () => {
  const group = await read('../components/public-registration-group-form.tsx');
  assert.ok(group.includes("['asaas.com', 'www.asaas.com', 'sandbox.asaas.com']"));
  assert.ok(group.includes('window.location.assign(url.toString())'));
  assert.ok(group.includes("order.status === 'PENDING_PAYMENT'"));
  assert.ok(group.includes('Não crie outro pedido nem tente nova cobrança'));
  assert.equal(group.includes('void pay()'), true);
});
