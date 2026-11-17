import assert from 'node:assert/strict';
import test from 'node:test';
import { RegistrationReservationStatus as Status } from '@prisma/client';

test('relatório de presença aceita validadas, não validadas e todas', () => {
  assert.equal(normalizeRegistrationPresence(undefined), 'ALL');
  assert.equal(normalizeRegistrationPresence(''), 'ALL');
  assert.equal(normalizeRegistrationPresence('ALL'), 'ALL');
  assert.equal(normalizeRegistrationPresence('VALIDATED'), 'VALIDATED');
  assert.equal(normalizeRegistrationPresence('PENDING'), 'PENDING');
  assert.throws(() => normalizeRegistrationPresence('pago'));
});

import { createHash } from 'node:crypto';
import { categoryChangePatch, decidePaidCategoryChange, effectiveRegistrationStatus, normalizeCategoryChangeTarget, normalizeRegistrationPresence, registrationDocumentHash, registrationEmailHash } from '../src/registration-operations-policy.ts';

test('busca operacional aceita e-mail e documento normalizados e recusa texto solto', () => {
  const email = registrationEmailHash('  Pessoa@Example.com ');
  assert.equal(email, createHash('sha256').update('pessoa@example.com').digest('hex'));
  assert.equal(registrationDocumentHash('529.982.247-25'), createHash('sha256').update('52998224725').digest('hex'));
  assert.equal(registrationEmailHash('sem-arroba'), null);
  assert.equal(registrationDocumentHash('12'), null);
});

const paid = {
  status: 'CONFIRMED', checkoutStatus: 'PAID', paidCents: 10000, finalPriceCents: 10000, basePriceCents: 10000, discountPercent: 0,
  currentCategoryId: 'category-a', currentLotId: 'lot-a-aaaa', targetCategoryId: 'category-b', targetLotId: 'lot-b-bbbb',
  targetLotPriceCents: 10000, targetActive: true, sameEvent: true, categoryCapacity: null, categoryOccupied: 0, lotQuantity: null, lotOccupied: 0,
};

test('troca paga aceita o mesmo preço e recusa diferença, cortesia e vaga cheia', () => {
  assert.deepEqual(decidePaidCategoryChange(paid), { ok: true, unchanged: false });
  assert.equal(decidePaidCategoryChange({ ...paid, targetLotPriceCents: 15000 }).ok, false);
  assert.match(decidePaidCategoryChange({ ...paid, targetLotPriceCents: 15000 }).message, /Não há ajuste nem reembolso/);
  assert.equal(decidePaidCategoryChange({ ...paid, discountPercent: 50, targetLotPriceCents: 20000, paidCents: 10000 }).code, 'price');
  assert.equal(decidePaidCategoryChange({ ...paid, discountPercent: 50, paidCents: 10000, finalPriceCents: 10000 }).code, 'price');
  assert.deepEqual(decidePaidCategoryChange({ ...paid, discountPercent: 50, paidCents: 5000, finalPriceCents: 5000 }), { ok: true, unchanged: false });
  assert.equal(decidePaidCategoryChange({ ...paid, status: 'PENDING_PAYMENT', checkoutStatus: 'ACTIVE' }).code, 'unpaid');
  assert.equal(decidePaidCategoryChange({ ...paid, checkoutStatus: null, paidCents: null, finalPriceCents: 0 }).code, 'unpaid');
  assert.equal(decidePaidCategoryChange({ ...paid, targetCategoryId: 'category-a', targetLotId: 'lot-a-aaaa' }).unchanged, true);
  assert.equal(decidePaidCategoryChange({ ...paid, categoryCapacity: 1, categoryOccupied: 1 }).code, 'capacity');
  assert.equal(normalizeCategoryChangeTarget({ categoryId: 'category-b', lotId: 'lot-b-bbbb' }).lotId, 'lot-b-bbbb');
  assert.throws(() => normalizeCategoryChangeTarget({ categoryId: 'curta', lotId: 'lot-b-bbbb' }));
});

test('o patch da troca não reescreve o valor e só atualiza o tipo da ficha', () => {
  const patch = categoryChangePatch({ registration_type: 'category-a', email: 'ana@example.com' }, 'category-b', 'lot-b-bbbb');
  assert.deepEqual(Object.keys(patch).sort(), ['categoryId', 'lotId', 'registrationData']);
  assert.equal(patch.registrationData.registration_type, 'category-b');
  assert.equal(patch.registrationData.email, 'ana@example.com');
  assert.equal('finalPriceCents' in patch, false);
  assert.deepEqual(Object.keys(categoryChangePatch({ full_name: 'Ana' }, 'category-b', 'lot-b-bbbb')).sort(), ['categoryId', 'lotId']);
});

test('prazo encerrado no instante de leitura expira apenas reserva pendente', () => {
  const now = new Date('2026-09-24T12:00:00.000Z');
  assert.equal(effectiveRegistrationStatus(Status.PENDING_PAYMENT, new Date(now.getTime() + 1), now), Status.PENDING_PAYMENT);
  assert.equal(effectiveRegistrationStatus(Status.PENDING_PAYMENT, now, now), Status.EXPIRED);
  assert.equal(effectiveRegistrationStatus(Status.PENDING_PAYMENT, new Date(now.getTime() - 1), now), Status.EXPIRED);
  assert.equal(effectiveRegistrationStatus(Status.CONFIRMED, new Date(now.getTime() - 1), now), Status.CONFIRMED);
});

