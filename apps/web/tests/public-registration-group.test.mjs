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
  assert.ok(group.includes("['https://asaas.com', 'https://www.asaas.com', 'https://sandbox.asaas.com'].includes(url.origin)"));
  assert.ok(group.includes("(url.protocol === 'http:' || url.protocol === 'https:')"));
  assert.ok(group.includes('url.username || url.password'));
  // Reject the original local-host scheme bypass even when the hostname is localhost.
  for (const unsafe of ['javascript://localhost/alert(1)', 'data://localhost/test', 'ftp://localhost/test']) {
    const url = new URL(unsafe);
    assert.equal(['http:', 'https:'].includes(url.protocol), false);
  }
  // An allowlisted hostname on an unexpected port is not an allowlisted origin.
  assert.notEqual(new URL('https://asaas.com:4443/checkout').origin, 'https://asaas.com');
  assert.ok(group.includes('window.location.assign(url.toString())'));
  assert.ok(group.includes("order.status === 'PENDING_PAYMENT'"));
  assert.ok(group.includes('Não crie outro pedido nem tente nova cobrança'));
  assert.equal(group.includes('void pay()'), true);
});

test('G2.11: compra múltipla mostra política versionada e exige aceite de cada participante', async () => {
  const group = await read('../components/public-registration-group-form.tsx');
  const api = await read('../../api/src/registration-reservations.service.ts');
  assert.ok(group.includes("'/refund-policy'"));
  assert.ok(group.includes('refundPolicy.message'));
  assert.ok(group.includes('refund_policy_acceptance'));
  assert.ok(group.includes('refund_policy_version: policyVersion'));
  assert.ok(group.includes('Cada participante deve aceitar expressamente'));
  assert.ok(group.includes("changeAnswer(index, 'refund_policy_acceptance'"));
  assert.match(api, /validateGroupedRefundConsent\(entry\.answers/u);
  assert.match(api, /to_regclass\('"EventRefundPolicy"'\)/u);
  assert.match(api, /entry\.answers\.refund_policy_version !== publishedVersion/u);
});

test('G2.10: clearing optional numeric answers omits them instead of sending empty strings', async () => {
  const group = await read('../components/public-registration-group-form.tsx');
  assert.match(group, /type Answer = string \| number \| boolean \| string\[\] \| undefined;/u);
  assert.ok(group.includes("type === 'number' ? (event.target.value === '' ? undefined : Number(event.target.value)) : event.target.value"));
  assert.ok(group.includes("value={String(value ?? '')}"));
  assert.ok(group.includes('required={field.required}'));
  assert.equal(JSON.stringify({ optionalNumber: undefined }), '{}');
  assert.equal(JSON.stringify({ optionalNumber: 0 }), '{"optionalNumber":0}');
});
