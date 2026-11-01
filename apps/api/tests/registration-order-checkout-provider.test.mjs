import assert from 'node:assert/strict';
import test from 'node:test';
import { RegistrationOrderCheckoutService } from '../dist/registration-order-checkout.service.js';

test('G2.10: grouped checkout claims one provider call and rejects a concurrent second charge', async () => {
  const expiresAt = new Date(Date.now() + 20 * 60_000);
  const checkout = {
    id: 'checkout_1', orderId: 'order_1', eventId: 'event_1', organizationId: 'tenant_1',
    status: 'CREATING', failureCode: 'provider_not_started', amountCents: 6000,
    expiresAt, paidAt: null, checkoutUrl: null,
    order: { entries: [
      { reservation: { finalPriceCents: 3000, registrationData: { country: 'BR' } } },
      { reservation: { finalPriceCents: 3000, registrationData: { country: 'BR' } } },
    ] },
  };
  let gatewayCalls = 0;
  let claims = 0;
  const audits = [];
  const prisma = {
    event: { findUnique: async () => ({ id: 'event_1', organizationId: 'tenant_1', name: 'Congresso', status: 'PUBLISHED' }) },
    eventRegistrationOrder: { findFirst: async ({ where }) => {
      assert.equal(where.organizationId, 'tenant_1');
      assert.equal(where.eventId, 'event_1');
      return { id: 'order_1' };
    } },
    eventRegistrationOrderCheckout: {
      findUnique: async ({ where }) => {
        assert.deepEqual(where, { id: checkout.id });
        return checkout;
      },
      updateMany: async ({ where, data }) => {
        if (checkout.status !== where.status || checkout.failureCode !== where.failureCode) return { count: 0 };
        claims += 1;
        Object.assign(checkout, data);
        return { count: 1 };
      },
      findUniqueOrThrow: async () => checkout,
    },
    eventFinancialResponsibility: { findUnique: async () => ({
      organizationId: 'tenant_1', sellerLegalProfileRevision: 1, feeBearer: 'ORGANIZER',
    }) },
    organizationLegalProfile: { findUnique: async () => ({
      revision: 1, asaasWalletId: '11111111-1111-1111-1111-111111111111',
    }) },
    $transaction: async (callback) => callback({
      eventRegistrationOrderCheckout: prisma.eventRegistrationOrderCheckout,
      auditLog: { create: async ({ data }) => audits.push(data) },
    }),
    asaasCheckoutWebhookEvent: { findMany: async () => [] },
  };
  let resolveGateway;
  const pending = new Promise((resolve) => { resolveGateway = resolve; });
  const gateway = {
    isConfigured: () => true, isStubMode: () => false,
    createCheckout: async (input) => {
      gatewayCalls += 1;
      assert.equal(input.amountCents, 6000);
      assert.equal(input.orderId, 'order_1');
      assert.equal(input.split.fixedValue, 54);
      await pending;
      return { providerCheckoutId: 'checkout_external_1', checkoutUrl: 'https://sandbox.asaas.com/checkoutSession/show?id=checkout_external_1' };
    },
  };
  const intent = { prepare: async () => ({
    checkoutId: 'checkout_1', orderId: 'order_1', amountCents: 6000,
  }) };
  const service = new RegistrationOrderCheckoutService(prisma, intent, gateway, {});
  const first = service.create('congresso', 'order_1', 'group-checkout-key-0001');
  // The provider call yields at the awaited test barrier.
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(
    () => service.create('congresso', 'order_1', 'group-checkout-key-0001'),
    (error) => [409, 503].includes(error.getStatus?.()),
  );
  assert.equal(gatewayCalls, 1);
  assert.equal(claims, 1);
  resolveGateway();
  const result = await first;
  assert.equal(result.status, 'ACTIVE');
  assert.equal(result.amountCents, 6000);
  assert.equal(audits.length, 1);
});


test('G2.10: safe provider rejection compensates both reservations atomically, ambiguous failure does not', async () => {
  const { AsaasGatewayError } = await import('../dist/asaas-checkout.gateway.js');
  for (const retrySafety of ['SAFE', 'UNKNOWN']) {
    const checkout = {
      id: 'checkout_1', orderId: 'order_1', eventId: 'event_1', organizationId: 'tenant_1',
      status: 'CREATING', failureCode: 'provider_not_started', amountCents: 6000,
      expiresAt: new Date(Date.now() + 20 * 60_000), paidAt: null, checkoutUrl: null,
      order: { entries: [1, 2].map(() => ({
        reservation: { finalPriceCents: 3000, registrationData: { country: 'BR' } },
      })) },
    };
    const released = [];
    let compensationBatchCalls = 0;
    let orderStatus = 'PENDING_PAYMENT';
    const tx = {
      eventRegistrationOrderCheckout: {
        updateMany: async ({ where, data }) => {
          if (where.failureCode && checkout.failureCode !== where.failureCode) return { count: 0 };
          Object.assign(checkout, data);
          return { count: 1 };
        },
      },
      eventRegistrationOrderEntry: { findMany: async () => [
        { reservationId: 'r_1' }, { reservationId: 'r_2' },
      ] },
      eventRegistrationReservation: { updateMany: async ({ where }) => {
        assert.equal(where.organizationId, 'tenant_1');
        assert.equal(where.eventId, 'event_1');
        assert.equal(where.status, 'PENDING_PAYMENT');
        assert.deepEqual(where.id, { in: ['r_1', 'r_2'] });
        compensationBatchCalls += 1;
        released.push(...where.id.in);
        return { count: 2 };
      } },
      eventRegistrationOrder: { updateMany: async ({ data }) => {
        orderStatus = data.status;
        return { count: 1 };
      } },
      auditLog: { create: async () => {} },
    };
    const prisma = {
      event: { findUnique: async () => ({
        id: 'event_1', organizationId: 'tenant_1', name: 'Congresso', status: 'PUBLISHED',
      }) },
      eventRegistrationOrder: { findFirst: async ({ where }) => {
      assert.equal(where.organizationId, 'tenant_1');
      assert.equal(where.eventId, 'event_1');
      return { id: 'order_1' };
    } },
    eventRegistrationOrderCheckout: {
        findUnique: async ({ where }) => {
          assert.deepEqual(where, { id: checkout.id });
          return checkout;
        },
        updateMany: tx.eventRegistrationOrderCheckout.updateMany,
      },
      eventFinancialResponsibility: { findUnique: async () => ({
        organizationId: 'tenant_1', sellerLegalProfileRevision: 1, feeBearer: 'ORGANIZER',
      }) },
      organizationLegalProfile: { findUnique: async () => ({
        revision: 1, asaasWalletId: '11111111-1111-1111-1111-111111111111',
      }) },
      $transaction: async (callback, options) => {
        assert.equal(options.isolationLevel, 'Serializable');
        return callback(tx);
      },
    };
    const gateway = {
      isConfigured: () => true, isStubMode: () => false,
      createCheckout: async () => { throw new AsaasGatewayError('provider_http_400', retrySafety); },
    };
    const service = new RegistrationOrderCheckoutService(prisma, {
      prepare: async () => ({ checkoutId: 'checkout_1' }),
    }, gateway, {});
    await assert.rejects(
      () => service.create('congresso', 'order_1', 'group-checkout-key-0001'),
      (error) => error.getStatus?.() === (retrySafety === 'SAFE' ? 422 : 503),
    );
    assert.equal(checkout.status, retrySafety === 'SAFE' ? 'FAILED' : 'UNKNOWN');
    assert.deepEqual(released, retrySafety === 'SAFE' ? ['r_1', 'r_2'] : []);
    assert.equal(compensationBatchCalls, retrySafety === 'SAFE' ? 1 : 0);
    assert.equal(orderStatus, retrySafety === 'SAFE' ? 'CANCELLED' : 'PENDING_PAYMENT');
  }
});


test('G2.10: unknown tenant/order capability cannot create a provider checkout or intent', async () => {
  let touched = false;
  const prisma = {
    event: { findUnique: async () => ({
      id: 'event_1', organizationId: 'tenant_1', name: 'Congresso', status: 'PUBLISHED',
    }) },
    eventRegistrationOrder: { findFirst: async ({ where }) => {
      assert.equal(where.organizationId, 'tenant_1');
      assert.equal(where.eventId, 'event_1');
      assert.match(where.idempotencyKeyHash, /^[0-9a-f]{64}$/u);
      return null;
    } },
  };
  const service = new RegistrationOrderCheckoutService(
    prisma,
    { prepare: async () => { touched = true; } },
    { isConfigured: () => true, createCheckout: async () => { touched = true; } },
    {},
  );
  await assert.rejects(
    () => service.create('congresso', 'order_elsewhere', 'group-checkout-key-0001'),
    (error) => error.getStatus?.() === 404,
  );
  assert.equal(touched, false);
});


test('G2.10 replays active and paid grouped checkouts without preparing a new intent or charging again', async () => {
  for (const [status, configured] of [['ACTIVE', true], ['PAID', true], ['PAID', false]]) {
    const checkout = {
      id: 'checkout_1', orderId: 'order_1', eventId: 'event_1',
      organizationId: 'tenant_1', providerCheckoutId: 'provider_1',
      status, amountCents: 6000, checkoutUrl: 'https://sandbox.asaas.com/checkoutSession/show?id=provider_1',
      expiresAt: new Date(Date.now() + 10 * 60_000), paidAt: status === 'PAID' ? new Date() : null,
    };
    let providerCalls = 0;
    let intentCalls = 0;
    let replayQueries = 0;
    const prisma = {
      event: { findUnique: async () => ({
        id: 'event_1', organizationId: 'tenant_1', name: 'Congresso', status: 'PUBLISHED',
      }) },
      eventRegistrationOrder: { findFirst: async ({ where }) => {
        assert.equal(where.id, 'order_1');
        assert.equal(where.eventId, 'event_1');
        assert.equal(where.organizationId, 'tenant_1');
        assert.match(where.idempotencyKeyHash, /^[a-f0-9]{64}$/u);
        return { id: 'order_1' };
      } },
      eventRegistrationOrderCheckout: {
        findFirst: async ({ where }) => {
          replayQueries += 1;
          assert.equal(where.orderId, 'order_1');
          assert.equal(where.eventId, 'event_1');
          assert.equal(where.organizationId, 'tenant_1');
          assert.match(where.idempotencyKeyHash, /^[a-f0-9]{64}$/u);
          assert.ok(where.status.in.includes('ACTIVE'));
          assert.ok(where.status.in.includes('PAID'));
          return checkout;
        },
        findUniqueOrThrow: async ({ where }) => {
          assert.equal(where.id, checkout.id);
          return checkout;
        },
      },
      asaasCheckoutWebhookEvent: { findMany: async ({ where }) => {
        assert.equal(where.externalCheckoutId, 'provider_1');
        return [];
      } },
    };
    const service = new RegistrationOrderCheckoutService(
      prisma,
      { prepare: async () => { intentCalls += 1; throw new Error('Intent must not restart after checkout creation'); } },
      { isConfigured: () => configured, createCheckout: async () => { providerCalls += 1; throw new Error('Duplicate charge'); } },
      {},
    );
    const response = await service.create('congresso', 'order_1', 'group-checkout-key-0001');
    assert.equal(response.status, status);
    assert.equal(response.amountCents, 6000);
    assert.equal(response.checkoutUrl, status === 'ACTIVE' ? checkout.checkoutUrl : null);
    assert.equal(replayQueries, 1);
    assert.equal(intentCalls, 0);
    assert.equal(providerCalls, 0);
  }
});
