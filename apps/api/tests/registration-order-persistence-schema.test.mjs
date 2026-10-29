import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../prisma/migrations/20261029161000_registration_multi_order_foundation/migration.sql', import.meta.url), 'utf8');

test('G2.10 persists order, entries and one grouped checkout without changing legacy checkout', () => {
  for (const model of ['EventRegistrationOrder', 'EventRegistrationOrderEntry', 'EventRegistrationOrderCheckout']) {
    assert.match(schema, new RegExp('model ' + model + ' \\{'));
    assert.ok(migration.includes('CREATE TABLE "' + model + '"'));
  }
  assert.match(schema, /model EventRegistrationCheckout \\{/);
  assert.match(schema, /@@unique\\(\\[eventId, idempotencyKeyHash\\]\\)/);
  assert.match(migration, /UNIQUE INDEX "EventRegistrationOrderCheckout_orderId_key"/);
});

test('G2.10 composite foreign keys cannot cross organization or event', () => {
  for (const parent of ['Event', 'EventRegistrationOrder', 'EventRegistrationCategory', 'EventRegistrationLot', 'EventRegistrationReservation']) {
    assert.ok(migration.includes('REFERENCES "' + parent + '"'), parent);
  }
  assert.equal((migration.match(/FOREIGN KEY \\([^)]*"eventId", "organizationId"\\)/g) ?? []).length, 6);
  assert.match(migration, /CHECK \\("subtotalCents" >= 0\\)/);
  assert.match(migration, /CHECK \\("amountCents" >= 0\\)/);
});
