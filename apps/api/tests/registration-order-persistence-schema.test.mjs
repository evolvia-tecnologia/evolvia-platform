import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../prisma/migrations/20261029161000_registration_multi_order_foundation/migration.sql', import.meta.url), 'utf8');

test('G2.10 persists order, entries and one grouped checkout without changing legacy checkout', () => {
  for (const model of ['EventRegistrationOrder', 'EventRegistrationOrderEntry', 'EventRegistrationOrderCheckout']) {
    assert.ok(schema.includes('model ' + model + ' {'), model);
    assert.ok(migration.includes('CREATE TABLE "' + model + '"'), model);
  }
  assert.ok(schema.includes('model EventRegistrationCheckout {'));
  assert.ok(schema.includes('@@unique([eventId, idempotencyKeyHash])'));
  assert.ok(migration.includes('UNIQUE INDEX "EventRegistrationOrderCheckout_orderId_key"'));
});

test('G2.10 composite foreign keys cannot cross organization or event', () => {
  for (const parent of ['Event', 'EventRegistrationOrder', 'EventRegistrationCategory', 'EventRegistrationLot', 'EventRegistrationReservation']) {
    assert.ok(migration.includes('REFERENCES "' + parent + '"'), parent);
  }
  assert.equal(migration.split('FOREIGN KEY (').length - 1, 6);
  assert.ok(migration.includes('CHECK ("subtotalCents" >= 0)'));
  assert.ok(migration.includes('CHECK ("amountCents" >= 0)'));
});


test('G2.10 grouped webhooks have a separate tenant-scoped FK from legacy checkouts', () => {
  const extension = readFileSync(new URL('../prisma/migrations/20261030111500_grouped_webhook_scope/migration.sql', import.meta.url), 'utf8');
  assert.match(schema, /orderCheckoutId\s+String\?/);
  assert.match(schema, /@relation\("GroupedCheckoutWebhook", fields: \[orderCheckoutId, eventId, organizationId\]/);
  assert.match(extension, /REFERENCES "EventRegistrationOrderCheckout"\("id", "eventId", "organizationId"\)/);
  assert.match(extension, /"checkoutId" IS NOT NULL AND "orderCheckoutId" IS NULL/);
  assert.match(extension, /"checkoutId" IS NULL AND "orderCheckoutId" IS NOT NULL/);
});
