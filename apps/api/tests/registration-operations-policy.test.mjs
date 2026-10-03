import assert from 'node:assert/strict';
import test from 'node:test';
import { RegistrationReservationStatus as Status } from '@prisma/client';
import { createHash } from 'node:crypto';
import { effectiveRegistrationStatus, registrationDocumentHash, registrationEmailHash } from '../src/registration-operations-policy.ts';

test('busca operacional aceita e-mail e documento normalizados e recusa texto solto', () => {
  const email = registrationEmailHash('  Pessoa@Example.com ');
  assert.equal(email, createHash('sha256').update('pessoa@example.com').digest('hex'));
  assert.equal(registrationDocumentHash('529.982.247-25'), createHash('sha256').update('52998224725').digest('hex'));
  assert.equal(registrationEmailHash('sem-arroba'), null);
  assert.equal(registrationDocumentHash('12'), null);
});

test('prazo encerrado no instante de leitura expira apenas reserva pendente', () => {
  const now = new Date('2026-09-24T12:00:00.000Z');
  assert.equal(effectiveRegistrationStatus(Status.PENDING_PAYMENT, new Date(now.getTime() + 1), now), Status.PENDING_PAYMENT);
  assert.equal(effectiveRegistrationStatus(Status.PENDING_PAYMENT, now, now), Status.EXPIRED);
  assert.equal(effectiveRegistrationStatus(Status.PENDING_PAYMENT, new Date(now.getTime() - 1), now), Status.EXPIRED);
  assert.equal(effectiveRegistrationStatus(Status.CONFIRMED, new Date(now.getTime() - 1), now), Status.CONFIRMED);
});
