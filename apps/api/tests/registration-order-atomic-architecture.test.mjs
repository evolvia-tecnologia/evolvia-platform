import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/registration-reservations.service.ts', import.meta.url), 'utf8');
const method = source.slice(source.indexOf('  async reserveOrder('), source.indexOf('  async getWaitlistOfferOptions('));

test('G2.10 reserva 2–10 inscrições em uma transação Serializable e com retry P2034', () => {
  assert.ok(method.includes('normalizeRegistrationOrder(rawInput)'));
  assert.ok(method.includes('prepareRegistrationOrderReservation(order, rawIdempotencyKey)'));
  assert.ok(method.includes('this.prisma.$transaction(async (tx) => {'));
  assert.ok(method.includes('Prisma.TransactionIsolationLevel.Serializable'));
  assert.ok(method.includes("error.code === 'P2034'"));
  assert.ok(method.includes('tx.eventRegistrationOrder.create('));
  assert.ok(method.includes('tx.eventRegistrationReservation.create('));
  assert.ok(method.includes('tx.eventRegistrationOrderEntry.create('));
});

test('G2.10 revalida estoque por categoria e lote com tenant e sem acionar Asaas', () => {
  assert.ok(method.includes('occupied + demand.quantity > category.capacity'));
  assert.ok(method.includes('occupied + demand.quantity > lot.quantity'));
  assert.ok(method.includes('organizationId: event.organizationId'));
  assert.ok(method.includes('plan.payloadHash'));
  assert.ok(method.includes('plan.idempotencyKeyHash'));
  assert.ok(!method.includes('this.asaas.create'));
  assert.ok(!method.includes('notifyRegistrationConfirmed'));
});
