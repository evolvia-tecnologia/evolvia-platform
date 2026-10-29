import assert from 'node:assert/strict';
import test from 'node:test';
import { RegistrationOrderCheckoutIntentService } from '../dist/registration-order-checkout-intent.service.js';

function fixture({ tenantMismatch = false, shortExpiry = false, mismatchedAmount = false } = {}) {
  const eventId = 'event_multi_001';
  const organizationId = 'org_multi_001';
  const expiresAt = new Date(Date.now() + (shortExpiry ? 5 : 20) * 60_000);
  const writes = { checkouts: [], audits: [] };
  let existing = null;
  let isolation = null;
  const reservation = (id) => ({
    id, status: 'PENDING_PAYMENT', finalPriceCents: 3000,
    registrationData: { country: 'BR' }, expiresAt,
    category: { proofRequirement: 'NONE' }, categoryProof: null,
  });
  const tx = {
    event: { findUnique: async () => ({
      id: eventId, organizationId, status: 'PUBLISHED',
    }) },
    eventRegistrationOrder: { findFirst: async ({ where }) => {
      assert.equal(where.eventId, eventId);
      assert.equal(where.organizationId, organizationId);
      if (tenantMismatch) return null;
      return {
        id: 'order_001', organizationId, eventId, status: 'PENDING_PAYMENT',
        subtotalCents: mismatchedAmount ? 5900 : 6000, expiresAt,
        entries: [
          { position: 0, finalPriceCents: 3000, reservation: reservation('reservation_001') },
          { position: 1, finalPriceCents: 3000, reservation: reservation('reservation_002') },
        ],
      };
    } },
    eventFinancialResponsibility: { findUnique: async () => ({
      organizationId, sellerLegalProfileRevision: 1, feeBearer: 'ORGANIZER',
    }) },
    organizationLegalProfile: { findUnique: async () => ({
      revision: 1, asaasWalletId: '11111111-1111-1111-1111-111111111111',
    }) },
    eventRegistrationOrderCheckout: {
      findFirst: async ({ where }) => {
        assert.deepEqual(where, { orderId: 'order_001', eventId, organizationId });
        return existing;
      },
      create: async ({ data }) => {
        writes.checkouts.push(data);
        existing = { id: 'checkout_001', ...data };
        return existing;
      },
    },
    auditLog: { create: async ({ data }) => { writes.audits.push(data); } },
  };
  const prisma = {
    $transaction: async (callback, options) => {
      isolation = options.isolationLevel;
      return callback(tx);
    },
  };
  return {
    service: new RegistrationOrderCheckoutIntentService(prisma),
    writes, getIsolation: () => isolation,
  };
}

test('G2.10 persists one grouped checkout intent for two reservations without calling Asaas', async () => {
  const { service, writes, getIsolation } = fixture();
  const first = await service.prepare('congresso', 'order_001', 'group-checkout-key-001');
  assert.equal(getIsolation(), 'Serializable');
  assert.equal(first.checkoutId, 'checkout_001');
  assert.equal(first.providerInitiated, false);
  assert.equal(first.amountCents, 6000);
  assert.equal(writes.checkouts.length, 1);
  assert.equal(writes.checkouts[0].organizationId, 'org_multi_001');
  assert.equal(writes.checkouts[0].eventId, 'event_multi_001');
  assert.equal(writes.checkouts[0].failureCode, 'provider_not_started');
  assert.equal(writes.audits.length, 1);
  const replay = await service.prepare('congresso', 'order_001', 'group-checkout-key-001');
  assert.deepEqual(replay, first);
  assert.equal(writes.checkouts.length, 1);
  await assert.rejects(
    () => service.prepare('congresso', 'order_001', 'different-checkout-key-002'),
    (error) => error.getStatus?.() === 409,
  );
});

test('G2.10 refuses cross-tenant order, expired checkout window and inconsistent total', async () => {
  for (const options of [
    { tenantMismatch: true }, { shortExpiry: true }, { mismatchedAmount: true },
  ]) {
    const { service, writes } = fixture(options);
    await assert.rejects(
      () => service.prepare('congresso', 'order_001', 'group-checkout-key-001'),
      (error) => [404, 409].includes(error.getStatus?.()),
    );
    assert.equal(writes.checkouts.length, 0);
    assert.equal(writes.audits.length, 0);
  }
});

// The public contract rejects short or missing idempotency keys before any DB write.
test('G2.10 rejects invalid grouped checkout idempotency keys before a transaction', async () => {
  const { service, writes, getIsolation } = fixture();
  for (const key of [undefined, '', 'too-short']) {
    await assert.rejects(
      () => service.prepare('congresso', 'order_001', key),
      (error) => error.getStatus?.() === 400,
    );
  }
  assert.equal(getIsolation(), null);
  assert.equal(writes.checkouts.length, 0);
  assert.equal(writes.audits.length, 0);
});
