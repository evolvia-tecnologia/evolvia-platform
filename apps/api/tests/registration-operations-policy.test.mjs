import assert from 'node:assert/strict';
import test from 'node:test';
import { RegistrationReservationStatus as Status } from '@prisma/client';
import { effectiveRegistrationStatus, normalizeRegistrationPresence } from '../src/registration-operations-policy.ts';

test('relatório de presença aceita validadas, não validadas e todas', () => {
  assert.equal(normalizeRegistrationPresence(undefined), 'ALL');
  assert.equal(normalizeRegistrationPresence(''), 'ALL');
  assert.equal(normalizeRegistrationPresence('ALL'), 'ALL');
  assert.equal(normalizeRegistrationPresence('VALIDATED'), 'VALIDATED');
  assert.equal(normalizeRegistrationPresence('PENDING'), 'PENDING');
  assert.throws(() => normalizeRegistrationPresence('pago'));
});

test('prazo encerrado no instante de leitura expira apenas reserva pendente', () => {
  const now = new Date('2026-09-24T12:00:00.000Z');
  assert.equal(effectiveRegistrationStatus(Status.PENDING_PAYMENT, new Date(now.getTime() + 1), now), Status.PENDING_PAYMENT);
  assert.equal(effectiveRegistrationStatus(Status.PENDING_PAYMENT, now, now), Status.EXPIRED);
  assert.equal(effectiveRegistrationStatus(Status.PENDING_PAYMENT, new Date(now.getTime() - 1), now), Status.EXPIRED);
  assert.equal(effectiveRegistrationStatus(Status.CONFIRMED, new Date(now.getTime() - 1), now), Status.CONFIRMED);
});
