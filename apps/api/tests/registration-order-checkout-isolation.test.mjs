import assert from 'node:assert/strict';
import test from 'node:test';
import { AsaasCheckoutService } from '../dist/asaas-checkout.service.js';

test('G2.10 rejects individual Asaas checkout for a grouped entry before provider charge', async () => {
  const eventId = 'event_multi_001';
  const organizationId = 'org_multi_001';
  const reservationId = 'reservation_001';
  let providerCalls = 0;
  let scopedQuery = null;
  const prisma = {
    event: { findUnique: async () => ({
      id: eventId, organizationId, name: 'Congresso', status: 'PUBLISHED',
      profileCode: 'SCIENTIFIC_EVENT', eventType: 'Congresso',
    }) },
    eventFinancialResponsibility: { findUnique: async () => ({
      organizationId, sellerLegalProfileRevision: 1,
    }) },
    organizationLegalProfile: { findUnique: async () => ({
      revision: 1, asaasWalletId: '11111111-1111-1111-1111-111111111111',
    }) },
    eventRegistrationReservation: { findFirst: async ({ where, select }) => {
      scopedQuery = { where, select };
      return {
      id: reservationId, protocol: 'EVO-1234567890ABCDEF',
      status: 'PENDING_PAYMENT', finalPriceCents: 3000,
      billingSnapshot: null, registrationData: {}, expiresAt: new Date(Date.now() + 1_200_000),
      category: { proofRequirement: 'NONE' }, categoryProof: null,
      orderEntry: { orderId: 'order_001' },
    }; } },
  };
  const gateway = {
    isConfigured: () => true,
    createCheckout: async () => { providerCalls += 1; throw new Error('Provider must not be called'); },
  };
  const service = new AsaasCheckoutService(prisma, gateway, {});
  await assert.rejects(
    () => service.createCheckout('congresso', 'EVO-1234567890ABCDEF', 'grouped-checkout-key'),
    (error) => error.getStatus?.() === 409 && /compra múltipla/u.test(error.message),
  );
  assert.deepEqual(scopedQuery.where, { protocol: 'EVO-1234567890ABCDEF', eventId, organizationId });
  assert.deepEqual(scopedQuery.select.orderEntry, { select: { orderId: true } });
  assert.equal(providerCalls, 0);
});
