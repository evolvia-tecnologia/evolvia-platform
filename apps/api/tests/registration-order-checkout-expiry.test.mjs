import assert from 'node:assert/strict';
import test from 'node:test';
import { RegistrationOrderCheckoutService } from '../dist/registration-order-checkout.service.js';

const service = new RegistrationOrderCheckoutService({}, {}, {}, {});
const now = Date.now();
const checkout = (status, expiresAt) => ({
  status, checkoutUrl: 'https://checkout.example.test/payment',
  amountCents: 5400, expiresAt, paidAt: status === 'PAID' ? new Date(now - 1000) : null,
});

test('CD02: checkout ativo vencido projeta EXPIRED sem link de pagamento', () => {
  const result = service.publicState(checkout('ACTIVE', new Date(now - 60_000)), 'order-qa');
  assert.equal(result.status, 'EXPIRED');
  assert.equal(result.checkoutUrl, null);
});

test('CD02: reserva vencida invalida retomada mesmo com checkout ainda ativo', () => {
  const result = service.publicState(
    checkout('ACTIVE', new Date(now + 600_000)), 'order-qa', new Date(now - 60_000),
  );
  assert.equal(result.status, 'EXPIRED');
  assert.equal(result.checkoutUrl, null);
});

test('CD02: checkout ativo válido mantém URL e pagamento confirmado não retrocede', () => {
  const active = service.publicState(
    checkout('ACTIVE', new Date(now + 600_000)), 'order-qa', new Date(now + 300_000),
  );
  assert.equal(active.status, 'ACTIVE');
  assert.equal(active.checkoutUrl, 'https://checkout.example.test/payment');
  const paid = service.publicState(
    checkout('PAID', new Date(now - 600_000)), 'order-qa', new Date(now - 300_000),
  );
  assert.equal(paid.status, 'PAID');
  assert.equal(paid.checkoutUrl, null);
});
