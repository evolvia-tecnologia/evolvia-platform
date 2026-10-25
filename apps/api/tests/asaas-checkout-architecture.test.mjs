import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

async function readIfPresent(path) {
  const url = new URL(path, import.meta.url);
  try {
    await access(url);
  } catch {
    return null;
  }
  return readFile(url, 'utf8');
}

test('migration é aditiva, tenant-scoped e preserva eventos idempotentes', async () => {
  const [schema, migration] = await Promise.all([
    read('../prisma/schema.prisma'),
    read('../prisma/migrations/20260923010000_asaas_checkout_webhooks/migration.sql'),
  ]);
  assert.match(schema, /model EventRegistrationCheckout/u);
  assert.match(schema, /model AsaasCheckoutWebhookEvent/u);
  assert.match(schema, /@@unique\(\[id, eventId, organizationId\]\)/u);
  assert.match(migration, /providerEventId_key/u);
  assert.match(migration, /FOREIGN KEY \("reservationId", "eventId", "organizationId"\)/u);
  assert.match(migration, /FOREIGN KEY \("checkoutId", "eventId", "organizationId"\)/u);
  assert.match(migration, /amountCents" > 0/u);
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN|TYPE)|DELETE\s+FROM/iu);
});

test('checkout usa origem fixa, timeout, redirect fechado e segredo somente por ambiente', async () => {
  const gateway = await read('../src/asaas-checkout.gateway.ts');
  assert.match(gateway, /https:\/\/api-sandbox\.asaas\.com\/v3/u);
  assert.match(gateway, /https:\/\/api\.asaas\.com\/v3/u);
  assert.match(gateway, /AbortSignal\.timeout\(8_000\)/u);
  assert.match(gateway, /redirect: 'error'/u);
  assert.match(gateway, /process\.env\.ASAAS_API_KEY/u);
  assert.doesNotMatch(gateway, /access_token:\s*['"][^'"]+['"]/u);
  assert.match(gateway, /sandbox\.asaas\.com/u);
  assert.match(gateway, /trustedOrigins\.includes\(checkoutUrl\.origin\)/u);
  assert.doesNotMatch(gateway, /checkoutUrl\.hostname\.endsWith/u);
  assert.match(gateway, /production_not_authorized/u);
});

test('webhook valida token, deduplica evento e confirma somente por CHECKOUT_PAID', async () => {
  const [controller, service] = await Promise.all([
    read('../src/asaas-checkout.controller.ts'),
    read('../src/asaas-checkout.service.ts'),
  ]);
  assert.match(controller, /@Headers\('asaas-access-token'\)/u);
  assert.match(service, /authorizeAsaasCheckoutWebhook\(rawToken\)/u);
  assert.match(service, /providerEventId/u);
  assert.equal([...service.matchAll(/asaasDuplicateWebhookDecision\(/gu)].length, 2);
  assert.match(service, /decision === 'conflict'/u);
  assert.match(service, /raced === 'conflict'/u);
  assert.match(service, /TransactionIsolationLevel\.Serializable/u);
  assert.match(service, /event\.eventType === 'CHECKOUT_PAID'/u);
  assert.match(service, /event\.amountCents === checkout\.amountCents/u);
  assert.match(service, /checkout\.status !== RegistrationCheckoutStatus\.PAID/u);
  assert.match(service, /checkout\.status !== RegistrationCheckoutStatus\.PAID_REVIEW/u);
  assert.match(service, /source: 'authenticated_webhook'/u);
  assert.equal([...service.matchAll(/registrationData/gu)].length, 2);
  assert.doesNotMatch(service, /metadata:[^;]{0,500}registrationData/u);
});

test('checkout local em ci_stub confirma sozinho e falha configurável vira 422', async () => {
  const [gateway, service, policy] = await Promise.all([
    read('../src/asaas-checkout.gateway.ts'),
    read('../src/asaas-checkout.service.ts'),
    read('../src/asaas-checkout-policy.ts'),
  ]);
  assert.match(gateway, /isAsaasStubMode\(process\.env\)/u);
  assert.match(gateway, /isAsaasLocalCheckoutSession\(process\.env\)/u);
  assert.match(gateway, /isAsaasCheckoutReady\(process\.env\)/u);
  assert.match(gateway, /if \(this\.isLocalCheckoutSession\(\)\) return isAsaasCheckoutReady/u);
  assert.match(gateway, /asaasStubCreatedCheckout/u);
  assert.match(gateway, /resolveAsaasWebhookToken\(process\.env\)/u);
  assert.match(gateway, /stubOrganizerWalletId/u);
  assert.match(policy, /ASAAS_STUB_WEBHOOK_TOKEN/u);
  assert.match(policy, /NODE_ENV === 'production'\) return false/u);
  assert.match(policy, /KNOWN_STUB_RUNTIMES/u);
  assert.doesNotMatch(policy, /NODE_ENV !== 'production'/u);
  assert.doesNotMatch(policy, /EVOLVIA_CI_MODE === '1' \|\|/u);
  assert.match(service, /stubOrganizerWalletId\(\)/u);
  assert.match(service, /UnprocessableEntityException/u);
  assert.match(service, /O pagamento está temporariamente indisponível/u);
  assert.match(service, /shouldAutoConfirmAsaasCheckout\(\) && this\.gateway\.isStubMode\(\)/u);
  assert.match(service, /asaasStubPaidWebhook\(created\.providerCheckoutId, active\.amountCents\)/u);
  assert.match(service, /asaasDuplicateWebhookDecision/u);
  assert.match(service, /publicCheckoutNextStep/u);
  assert.match(gateway, /resolveAsaasWebhookToken\(process\.env\)/u);
  assert.doesNotMatch(gateway, /sandbox\.asaas\.com\/checkoutSession/u);
  const smoke = await readIfPresent('../../../scripts/ci-smoke-v02.mjs');
  if (smoke) {
    assert.match(smoke, /evolvia-asaas-stub/u);
    assert.doesNotMatch(smoke, /sandbox\.asaas\.com\/checkoutSession/u);
    assert.match(smoke, /asaas-access-token/u);
  }
});

test('falha ambígua não repete cobrança cegamente e divergência vai para conciliação', async () => {
  const service = await read('../src/asaas-checkout.service.ts');
  assert.match(service, /RegistrationCheckoutStatus\.UNKNOWN/u);
  assert.match(service, /creation_interrupted/u);
  assert.match(service, /updatedAt: \{ lte: staleBefore \}/u);
  assert.match(service, /RegistrationCheckoutStatus\.PAID_REVIEW/u);
  assert.match(service, /amount_mismatch/u);
  assert.match(service, /late_payment/u);
  assert.match(service, /payment_requires_reconciliation/u);
});

