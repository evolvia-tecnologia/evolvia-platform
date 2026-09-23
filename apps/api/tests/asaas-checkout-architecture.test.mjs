import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

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
  assert.match(gateway, /checkoutUrl\.hostname\.endsWith\(`\.\$\{allowedHost\}`\)/u);
  assert.match(gateway, /production_not_authorized/u);
});

test('webhook valida token, deduplica evento e confirma somente por CHECKOUT_PAID', async () => {
  const [controller, service] = await Promise.all([
    read('../src/asaas-checkout.controller.ts'),
    read('../src/asaas-checkout.service.ts'),
  ]);
  assert.match(controller, /@Headers\('asaas-access-token'\)/u);
  assert.match(service, /secureTokenMatches/u);
  assert.match(service, /providerEventId/u);
  assert.equal([...service.matchAll(/duplicate\.payloadHash !== fingerprint/gu)].length, 2);
  assert.match(service, /TransactionIsolationLevel\.Serializable/u);
  assert.match(service, /event\.eventType === 'CHECKOUT_PAID'/u);
  assert.match(service, /event\.amountCents === checkout\.amountCents/u);
  assert.match(service, /checkout\.status !== RegistrationCheckoutStatus\.PAID/u);
  assert.match(service, /checkout\.status !== RegistrationCheckoutStatus\.PAID_REVIEW/u);
  assert.match(service, /source: 'authenticated_webhook'/u);
  assert.doesNotMatch(service, /registrationData/u);
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
