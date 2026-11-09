import assert from 'node:assert/strict';
import test from 'node:test';
import { RegistrationReservationsController } from '../dist/registration-reservations.controller.js';
import { resetAccessShieldForTests } from '../dist/access-shield.js';

test('G2.10 prévia pública limita abuso antes de consultar oferta e não consome cota de checkout', async () => {
  resetAccessShieldForTests();
  const calls = { preview: 0, reserve: 0 };
  const reservations = {
    previewOrder: async (slug) => {
      assert.equal(slug, 'evento-ficticio');
      calls.preview += 1;
      return { stockReserved: false };
    },
    reserveOrder: async (slug) => {
      assert.equal(slug, 'evento-ficticio');
      calls.reserve += 1;
      return { orderId: 'order-qa' };
    },
  };
  const controller = new RegistrationReservationsController(reservations, {}, {});
  const request = { socket: { remoteAddress: '203.0.113.77' } };
  try {
    for (let i = 0; i < 20; i += 1) {
      assert.deepEqual(await controller.previewOrder(request, 'evento-ficticio', {}), { stockReserved: false });
    }
    assert.throws(
      () => controller.previewOrder(request, 'evento-ficticio', {}),
      (error) => error.getStatus?.() === 429 && error.getResponse?.().code === 'RATE_LIMITED',
    );
    assert.equal(calls.preview, 20, 'requisição excedente não pode consultar o serviço');
    assert.deepEqual(await controller.reserveOrder(request, 'evento-ficticio', 'idempotency-qa', {}), { orderId: 'order-qa' });
    assert.equal(calls.reserve, 1, 'prévia não deve bloquear a reserva legítima');
  } finally {
    resetAccessShieldForTests();
  }
});
