import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RegistrationOperationsService } from '../dist/registration-operations.service.js';

const protocol = 'EVO-ABCDEF0123456789';

function reservation(overrides = {}) {
  return {
    id: 'reservation-1',
    protocol,
    status: 'CONFIRMED',
    categoryId: 'category-a',
    lotId: 'lot-a-aaaa',
    basePriceCents: 10000,
    discountPercent: 0,
    finalPriceCents: 10000,
    registrationData: { registration_type: 'category-a', email: 'ana@example.com' },
    category: { name: 'Associado' },
    lot: { name: 'Lote 1' },
    checkout: { status: 'PAID', amountCents: 10000 },
    ...overrides,
  };
}

function serviceFor(row, lot, counts = { category: 0, lot: 0 }, { failFirst = 0 } = {}) {
  const updates = [];
  const audits = [];
  const tx = {
    eventRegistrationReservation: {
      findFirst: async () => row,
      count: async ({ where }) => where.categoryId ? counts.category : counts.lot,
      update: async ({ data }) => { updates.push(data); return data; },
    },
    eventRegistrationLot: { findFirst: async () => lot },
    eventRegistrationWaitlistEntry: { count: async () => 0 },
    auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
  };
  const isolations = [];
  let remaining = failFirst;
  const prisma = {
    event: { findUnique: async () => ({ id: 'evt-1', organizationId: 'org-1', name: 'Congresso' }) },
    $transaction: async (fn, options) => {
      isolations.push(options?.isolationLevel);
      if (remaining > 0) {
        remaining -= 1;
        throw new Prisma.PrismaClientKnownRequestError('serialization', { code: 'P2034', clientVersion: 'test' });
      }
      return fn(tx);
    },
  };
  const authorization = { requireRole: async () => ({ role: 'OWNER' }) };
  return { service: new RegistrationOperationsService(prisma, authorization), updates, audits, isolations };
}

const samePriceLot = {
  id: 'lot-b-bbbb', name: 'Lote 2', priceCents: 10000, quantity: null,
  category: { id: 'category-b', name: 'Residente', capacity: null },
};

test('troca confirmada grava só categoria e lote, preserva o valor e audita sem dados pessoais', async () => {
  const { service, updates, audits, isolations } = serviceFor(reservation(), samePriceLot);
  const result = await service.changeCategory('user-1', 'evt-1', protocol, { categoryId: 'category-b', lotId: 'lot-b-bbbb' });
  assert.equal(result.changed, true);
  assert.equal(result.finalPriceCents, 10000);
  assert.equal(result.paidCents, 10000);
  assert.equal(result.category, 'Residente');
  assert.deepEqual(Object.keys(updates[0]).sort(), ['categoryId', 'lotId', 'registrationData']);
  assert.equal(updates[0].registrationData.registration_type, 'category-b');
  assert.equal('finalPriceCents' in updates[0], false);
  assert.equal('discountPercent' in updates[0], false);
  assert.equal('basePriceCents' in updates[0], false);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'registration.category_changed');
  assert.equal(audits[0].metadata.paidCents, 10000);
  assert.equal(JSON.stringify(audits[0].metadata).includes('ana@example.com'), false);
  assert.equal(JSON.stringify(audits[0].metadata).includes('Associado'), false);
  assert.deepEqual(isolations, [Prisma.TransactionIsolationLevel.Serializable]);
});

test('preço diferente não altera a inscrição nem cria auditoria', async () => {
  const { service, updates, audits } = serviceFor(reservation(), { ...samePriceLot, priceCents: 15000 });
  await assert.rejects(
    () => service.changeCategory('user-1', 'evt-1', protocol, { categoryId: 'category-b', lotId: 'lot-b-bbbb' }),
    (error) => error instanceof BadRequestException && /Não há ajuste nem reembolso/.test(error.message),
  );
  assert.equal(updates.length, 0);
  assert.equal(audits.length, 0);
});

test('serialização P2034 retenta e conclui a troca', async () => {
  const { service, updates, isolations } = serviceFor(reservation(), samePriceLot, undefined, { failFirst: 1 });
  const result = await service.changeCategory('user-1', 'evt-1', protocol, { categoryId: 'category-b', lotId: 'lot-b-bbbb' });
  assert.equal(result.changed, true);
  assert.equal(updates.length, 1);
  assert.deepEqual(isolations, [
    Prisma.TransactionIsolationLevel.Serializable,
    Prisma.TransactionIsolationLevel.Serializable,
  ]);
});

test('repetir a categoria atual não grava de novo', async () => {
  const { service, updates, audits } = serviceFor(reservation(), null);
  const result = await service.changeCategory('user-1', 'evt-1', protocol, { categoryId: 'category-a', lotId: 'lot-a-aaaa' });
  assert.equal(result.changed, false);
  assert.equal(updates.length, 0);
  assert.equal(audits.length, 0);
});
