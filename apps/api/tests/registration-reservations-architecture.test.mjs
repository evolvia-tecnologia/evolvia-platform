import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('migration é aditiva, tenant-scoped e protege integridade financeira', async () => {
  const [schema, migration] = await Promise.all([
    read('../prisma/schema.prisma'),
    read('../prisma/migrations/20260922195000_public_registration_reservations/migration.sql'),
  ]);
  assert.match(schema, /model EventRegistrationReservation/u);
  assert.match(schema, /@@unique\(\[eventId, idempotencyKeyHash\]\)/u);
  assert.match(schema, /@@unique\(\[eventId, identityHash\]\)/u);
  assert.match(migration, /FOREIGN KEY \("eventId", "organizationId"\)/u);
  assert.match(migration, /FOREIGN KEY \("lotId", "eventId", "organizationId"\)/u);
  assert.match(migration, /"finalPriceCents" <= "basePriceCents"/u);
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN|TYPE)|DELETE\s+FROM/iu);
});

test('API pública aplica idempotência, serialização, estoque e expiração', async () => {
  const [controller, service] = await Promise.all([
    read('../src/registration-reservations.controller.ts'),
    read('../src/registration-reservations.service.ts'),
  ]);
  assert.match(controller, /@Headers\('idempotency-key'\)/u);
  assert.doesNotMatch(controller, /AuthGuard/u);
  assert.match(service, /TransactionIsolationLevel\.Serializable/u);
  assert.match(service, /eventId_idempotencyKeyHash/u);
  assert.match(service, /lot\.quantity/u);
  assert.match(service, /category\.capacity/u);
  assert.match(service, /expireStaleReservations/u);
  assert.match(service, /usedCount: \{ decrement: count \}/u);
  assert.match(service, /P2034/u);
});

test('LGPD e auditoria mantêm PII fora de logs e resposta pública', async () => {
  const service = await read('../src/registration-reservations.service.ts');
  assert.match(service, /identityHash/u);
  assert.match(service, /emailHash/u);
  assert.match(service, /registration\.reservation_created/u);
  const metadata = service.match(/metadata: \{[\s\S]*?\} as Prisma\.InputJsonObject/u)?.[0] ?? '';
  assert.doesNotMatch(metadata, /identity|email|phone|full_name|registrationData/u);
  const response = service.slice(service.indexOf('private toPublicReservation'));
  assert.doesNotMatch(response, /registrationData|identityHash|emailHash|organizationId|eventId/u);
});

test('reserva publica disponibilidade financeira sem confirmar por retorno do navegador', async () => {
  const service = await read('../src/registration-reservations.service.ts');
  assert.match(service, /paymentEnabled: this\.asaas\.isConfigured\(\)/u);
  assert.match(service, /profileCode: event\.profileCode/u);
  assert.match(service, /eventType: event\.eventType/u);
  assert.match(service, /publicOfferCategories\(available/u);
  assert.doesNotMatch(service, /checkoutUrl|pixKey/iu);
});
