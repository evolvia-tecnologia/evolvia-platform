import assert from 'node:assert/strict';
import test from 'node:test';
import { RegistrationOrderCheckoutService } from '../dist/registration-order-checkout.service.js';
import { asaasStubPaidWebhook } from '../dist/asaas-checkout-policy.js';

const token = 'g2-10-webhook-test-token-long-enough-123456789';
const providerCheckoutId = 'chk_grouped_20261029_01';

function fixture({ amount = 6000, eventType = 'CHECKOUT_PAID', secondExpired = false, checkoutInitiallyMissing = false } = {}) {
  const now = Date.now();
  const notices = [];
  const audit = [];
  const rows = [
    { id: 'r_1', protocol: 'EVO-0000000000000001', status: 'PENDING_PAYMENT', expiresAt: new Date(now + 600_000), benefitId: null },
    { id: 'r_2', protocol: 'EVO-0000000000000002', status: 'PENDING_PAYMENT', expiresAt: new Date(now + (secondExpired ? -60_000 : 600_000)), benefitId: null },
  ];
  const checkout = {
    id: 'checkout_grouped', provider: 'ASAAS', providerCheckoutId,
    eventId: 'event_1', organizationId: 'tenant_1', orderId: 'order_1',
    amountCents: 6000, status: 'ACTIVE', paidAt: null,
    order: { status: 'PENDING_PAYMENT', entries: rows.map((reservation) => ({ reservation })) },
  };
  const events = new Map();
  let isolation;
  let checkoutVisible = !checkoutInitiallyMissing;
  const tx = {
    eventRegistrationOrderCheckout: {
      findFirst: async ({ where }) => {
        assert.equal(where.providerCheckoutId, providerCheckoutId);
        return checkoutVisible ? checkout : null;
      },
      update: async ({ data }) => Object.assign(checkout, data),
    },
    asaasCheckoutWebhookEvent: {
      findUnique: async ({ where }) => events.get(where.providerEventId) ?? null,
      create: async ({ data }) => {
        const stored = { ...data, id: 'webhook_1', processedAt: null };
        events.set(data.providerEventId, stored);
        return stored;
      },
      update: async ({ where, data }) => {
        const stored = [...events.values()].find((item) => item.id === where.id);
        Object.assign(stored, data);
      },
    },
    eventRegistrationReservation: {
      updateMany: async ({ where, data }) => {
        assert.equal(where.eventId, 'event_1');
        assert.equal(where.organizationId, 'tenant_1');
        const row = rows.find((item) => item.id === where.id);
        if (row.status !== where.status) return { count: 0 };
        if (where.expiresAt && row.expiresAt <= where.expiresAt.gt) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    eventRegistrationOrder: {
      update: async ({ data }) => Object.assign(checkout.order, data),
    },
    event: { findFirst: async ({ where }) => {
      assert.equal(where.organizationId, 'tenant_1');
      return { slug: 'congresso' };
    } },
    auditLog: { create: async ({ data }) => audit.push(data) },
  };
  const prisma = {
    $transaction: async (fn, options) => {
      isolation = options.isolationLevel;
      return fn(tx);
    },
  };
  const service = new RegistrationOrderCheckoutService(
    prisma, {}, {}, { notifyRegistrationConfirmed: async (notice) => notices.push(notice) },
  );
  const payload = asaasStubPaidWebhook(providerCheckoutId, amount);
  payload.event = eventType;
  return { service, payload, rows, checkout, notices, audit, events,
    revealCheckout: () => { checkoutVisible = true; }, isolation: () => isolation };
}

test('G2.10: one authenticated paid webhook confirms all entries in Serializable transaction', async () => {
  process.env.ASAAS_MODE = 'ci_stub';
  process.env.EVOLVIA_CI_MODE = '1';
  process.env.NODE_ENV = 'test';
  process.env.ASAAS_WEBHOOK_TOKEN = token;
  const f = fixture();
  const result = await f.service.receiveWebhook(token, f.payload);
  assert.equal(result.accepted, true);
  assert.equal(f.isolation(), 'Serializable');
  assert.deepEqual(f.rows.map((row) => row.status), ['CONFIRMED', 'CONFIRMED']);
  assert.equal(f.checkout.order.status, 'CONFIRMED');
  assert.equal(f.checkout.status, 'PAID');
  assert.equal(f.notices.length, 2);
  assert.equal(f.audit.length, 1);
  const inbox = [...f.events.values()][0];
  assert.equal(inbox.orderCheckoutId, f.checkout.id);
  assert.equal(inbox.checkoutId, undefined, 'legacy checkout relation must remain untouched');
  assert.deepEqual(await f.service.receiveWebhook(token, f.payload), { accepted: true, queued: false, duplicate: true });
  assert.equal(f.notices.length, 2);
  assert.equal(f.audit.length, 1);
});

test('G2.10: amount mismatch and late participant never partially confirm', async () => {
  process.env.ASAAS_MODE = 'ci_stub';
  process.env.EVOLVIA_CI_MODE = '1';
  process.env.NODE_ENV = 'test';
  process.env.ASAAS_WEBHOOK_TOKEN = token;
  for (const opts of [{ amount: 6100 }, { secondExpired: true }]) {
    const f = fixture(opts);
    await f.service.receiveWebhook(token, f.payload);
    assert.deepEqual(f.rows.map((row) => row.status), ['PENDING_PAYMENT', 'PENDING_PAYMENT']);
    assert.equal(f.checkout.status, 'PAID_REVIEW');
    assert.equal(f.notices.length, 0);
    assert.equal(f.audit.length, 1);
  }
});

test('G2.10: canceled grouped checkout releases all pending reservations, no notification', async () => {
  process.env.ASAAS_MODE = 'ci_stub';
  process.env.EVOLVIA_CI_MODE = '1';
  process.env.NODE_ENV = 'test';
  process.env.ASAAS_WEBHOOK_TOKEN = token;
  const f = fixture({ eventType: 'CHECKOUT_CANCELED' });
  await f.service.receiveWebhook(token, f.payload);
  assert.deepEqual(f.rows.map((row) => row.status), ['CANCELLED', 'CANCELLED']);
  assert.equal(f.checkout.order.status, 'CANCELLED');
  assert.equal(f.checkout.status, 'CANCELED');
  assert.equal(f.notices.length, 0);
});

test('G2.10: invalid token rejected before transaction and changed webhook payload rejected', async () => {
  process.env.ASAAS_MODE = 'ci_stub';
  process.env.EVOLVIA_CI_MODE = '1';
  process.env.NODE_ENV = 'test';
  process.env.ASAAS_WEBHOOK_TOKEN = token;
  const f = fixture();
  await assert.rejects(() => f.service.receiveWebhook('invalid', f.payload), (error) => error.getStatus?.() === 401);
  assert.equal(f.isolation(), undefined);
  await f.service.receiveWebhook(token, f.payload);
  const tampered = structuredClone(f.payload);
  tampered.checkout.items[0].value = 61;
  await assert.rejects(() => f.service.receiveWebhook(token, tampered), (error) => error.getStatus?.() === 409);
});


test('G2.10: early webhook is durably queued and reconciled once checkout is visible', async () => {
  process.env.ASAAS_MODE = 'ci_stub';
  process.env.EVOLVIA_CI_MODE = '1';
  process.env.NODE_ENV = 'test';
  process.env.ASAAS_WEBHOOK_TOKEN = token;
  const f = fixture({ checkoutInitiallyMissing: true });
  assert.deepEqual(await f.service.receiveWebhook(token, f.payload), {
    accepted: true, queued: true, duplicate: false,
  });
  assert.equal(f.events.size, 1, 'early callback must be persisted, not dropped');
  assert.deepEqual(await f.service.receiveWebhook(token, f.payload), {
    accepted: true, queued: true, duplicate: true,
  });
  f.revealCheckout();
  assert.deepEqual(await f.service.receiveWebhook(token, f.payload), {
    accepted: true, queued: false, duplicate: true,
  });
  assert.deepEqual(f.rows.map((row) => row.status), ['CONFIRMED', 'CONFIRMED']);
  assert.equal(f.notices.length, 2);
  const inbox = [...f.events.values()][0];
  assert.equal(inbox.orderCheckoutId, f.checkout.id);
  assert.equal(inbox.processedAt instanceof Date, true);
});
