import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { RegistrationReservationsService } from '../dist/registration-reservations.service.js';
import orderPolicy from '../dist/registration-order-policy.js';

const eventId = 'event_multi_001';
const organizationId = 'org_multi_001';
const categoryId = 'category_0001';
const lotId = 'lot_0001';
const key = 'order-idempotency-20261029-01';

function payload() {
  const entry = (document, email) => ({
    categoryId, lotId,
    answers: {
      full_name: 'Participante Exemplo', preferred_name: 'Participante',
      identity_document: document, email, phone: '11999999999',
      terms_acceptance: true,
    },
  });
  const entries = [
    entry('52998224725', 'pessoa1@example.com'),
    entry('16899535009', 'pessoa2@example.com'),
  ];
  const first = entries[0].answers;
  const party = { kind: 'PERSON', name: first.full_name, document: first.identity_document, email: first.email };
  return { entries, billing: { payer: party, recipient: party } };
}

function fixture({ capacity = 2, occupied = 0, replay = null } = {}) {
  const writes = { orders: [], reservations: [], entries: [], audits: [] };
  const reads = { categories: 0, lots: 0, reservationGroups: [], waitlistGroups: [] };
  const tx = {
    event: { findUnique: async () => ({
      id: eventId, organizationId, status: 'PUBLISHED',
      registrationMode: 'PAID', registrationForm: null,
    }) },
    eventRegistrationOrder: {
      findUnique: async () => replay,
      updateMany: async ({ where, data }) => {
        assert.equal(where.eventId, eventId);
        assert.equal(where.organizationId, organizationId);
        assert.equal(where.status, 'PENDING_PAYMENT');
        assert.equal(data.status, 'EXPIRED');
        return { count: 0 };
      },
      create: async ({ data }) => {
        writes.orders.push(data);
        return { id: 'order_001', ...data };
      },
    },
    eventRegistrationTermsDocument: {
      findFirst: async () => ({ id: 'terms_001', version: 1, checksumSha256: 'a'.repeat(64) }),
    },
    eventRegistrationReservation: {
      findMany: async () => [],
      count: async () => { throw new Error('N+1 reservation count is forbidden'); },
      groupBy: async ({ by, where }) => {
        assert.equal(where.organizationId, organizationId);
        assert.equal(where.eventId, eventId);
        reads.reservationGroups.push(by[0]);
        return [{ [by[0]]: by[0] === 'categoryId' ? categoryId : lotId, _count: { _all: occupied } }];
      },
      create: async ({ data }) => {
        writes.reservations.push(data);
        return { id: 'reservation_' + writes.reservations.length, ...data };
      },
    },
    eventRegistrationCategory: {
      findMany: async ({ where }) => {
        assert.equal(where.organizationId, organizationId);
        assert.equal(where.eventId, eventId);
        reads.categories += 1;
        return [{ id: categoryId, capacity, proofRequirement: 'NONE' }];
      },
    },
    eventRegistrationLot: {
      findMany: async ({ where }) => {
        assert.equal(where.organizationId, organizationId);
        assert.equal(where.eventId, eventId);
        reads.lots += 1;
        return [{ id: lotId, categoryId, quantity: capacity, priceCents: 2700, waitlistEnabled: false }];
      },
    },
    eventRegistrationWaitlistEntry: {
      count: async () => { throw new Error('N+1 waitlist count is forbidden'); },
      groupBy: async ({ by, where }) => {
        assert.equal(where.organizationId, organizationId);
        assert.equal(where.eventId, eventId);
        reads.waitlistGroups.push(by[0]);
        return [];
      },
    },
    eventRegistrationOrderEntry: {
      create: async ({ data }) => { writes.entries.push(data); return data; },
    },
    auditLog: { create: async ({ data }) => { writes.audits.push(data); return data; } },
  };
  let isolation = null;
  const prisma = {
    $transaction: async (callback, options) => {
      isolation = options.isolationLevel;
      return callback(tx);
    },
  };
  const service = new RegistrationReservationsService(prisma, { isConfigured: () => false }, {});
  return { service, writes, reads, getIsolation: () => isolation };
}

test('G2.10 reserves two identities atomically with one persisted order, tenant-scoped entries and no external checkout', async () => {
  const { service, writes, reads, getIsolation } = fixture();
  const result = await service.reserveOrder('congresso-teste', payload(), key);
  assert.equal(getIsolation(), 'Serializable');
  assert.equal(reads.categories, 1);
  assert.equal(reads.lots, 1);
  assert.deepEqual(reads.reservationGroups, ['categoryId', 'lotId']);
  assert.deepEqual(reads.waitlistGroups, ['categoryId', 'lotId', 'lotId']);
  assert.equal(result.entryCount, 2);
  assert.equal(result.subtotalCents, 5400);
  assert.equal(result.status, 'PENDING_PAYMENT');
  assert.equal(writes.orders.length, 1);
  assert.equal(writes.reservations.length, 2);
  assert.equal(writes.entries.length, 2);
  assert.equal(writes.audits.length, 1);
  assert.equal(writes.orders[0].organizationId, organizationId);
  assert.deepEqual(writes.orders[0].billingSnapshot, payload().billing, 'pagador persistido uma vez no pedido');
  assert.ok(writes.reservations.every((row) => !Object.hasOwn(row, 'billingSnapshot')),
    'não replicar dados do pagador em fichas de participantes distintos');
  assert.equal(writes.entries[0].organizationId, organizationId);
  assert.equal(writes.entries[1].eventId, eventId);
  assert.notEqual(writes.reservations[0].identityHash, writes.reservations[1].identityHash);
  assert.doesNotMatch(JSON.stringify(result), /52998224725|pessoa1@/u);
});

test('G2.10 paid order missing billing cannot reserve seats', async () => {
  const { service, writes } = fixture();
  const input = payload();
  delete input.billing;
  await assert.rejects(() => service.reserveOrder('congresso-teste', input, key), /Dados de cobrança são obrigatórios/u);
  assert.equal(writes.orders.length, 0);
  assert.equal(writes.reservations.length, 0);
  assert.equal(writes.entries.length, 0);
});

test('G2.10 refuses over-capacity before writing an order or reservation', async () => {
  const { service, writes } = fixture({ capacity: 2, occupied: 1 });
  await assert.rejects(() => service.reserveOrder('congresso-teste', payload(), key), /vagas suficientes/u);
  assert.equal(writes.orders.length, 0);
  assert.equal(writes.reservations.length, 0);
  assert.equal(writes.entries.length, 0);
});

test('G2.10 same-key replay returns original order without creating another reservation', async () => {
  const replay = {
    id: 'order_existing', payloadHash: null, status: 'PENDING_PAYMENT',
    subtotalCents: 5400, expiresAt: new Date('2026-10-29T19:30:00Z'),
    entries: [{ position: 0, categoryId, lotId, reservation: { protocol: 'EVO-EXISTING', status: 'PENDING_PAYMENT' } }],
  };
  const { service, writes } = fixture({ replay });
  // Replay hash is calculated from normalized input, never from raw JSON order.
  replay.payloadHash = orderPolicy.registrationOrderPayloadHash(orderPolicy.normalizeRegistrationOrder(payload()));
  const result = await service.reserveOrder('congresso-teste', payload(), key);
  assert.equal(result.orderId, 'order_existing');
  assert.equal(result.entries[0].protocol, 'EVO-EXISTING');
  assert.equal(writes.orders.length, 0);
  assert.equal(writes.reservations.length, 0);
});

function racingReservation(winner, owner = organizationId) {
  const { service } = fixture();
  const race = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
    code: 'P2002', clientVersion: '6.0.0',
  });
  service.prisma = {
    $transaction: async () => { throw race; },
    event: { findUnique: async () => ({
      id: eventId, organizationId, status: 'PUBLISHED',
    }) },
    eventRegistrationOrder: { findFirst: async ({ where }) => {
      assert.equal(where.eventId, eventId);
      assert.equal(where.organizationId, organizationId);
      assert.equal(where.idempotencyKeyHash.length, 64);
      return owner === organizationId ? winner : null;
    } },
  };
  return service;
}

test('G2.10 concurrent identical idempotency key replays committed winner after P2002', async () => {
  const normalized = orderPolicy.normalizeRegistrationOrder(payload());
  const winner = {
    id: 'order_winner', status: 'PENDING_PAYMENT',
    payloadHash: orderPolicy.registrationOrderPayloadHash(normalized),
    subtotalCents: 5400, expiresAt: new Date('2026-10-29T19:30:00Z'),
    entries: [
      { position: 0, categoryId, lotId, reservation: { protocol: 'EVO-FIRST', status: 'PENDING_PAYMENT' } },
      { position: 1, categoryId, lotId, reservation: { protocol: 'EVO-SECOND', status: 'PENDING_PAYMENT' } },
    ],
  };
  const result = await racingReservation(winner).reserveOrder('congresso-teste', payload(), key);
  assert.equal(result.orderId, 'order_winner');
  assert.equal(result.entryCount, 2);
  assert.deepEqual(result.entries.map((entry) => entry.protocol), ['EVO-FIRST', 'EVO-SECOND']);
  assert.doesNotMatch(JSON.stringify(result), /52998224725|pessoa1@/u);
});

test('G2.10 P2002 does not replay a different payload or another tenant order', async () => {
  const normalized = orderPolicy.normalizeRegistrationOrder(payload());
  const winner = {
    id: 'order_winner', status: 'PENDING_PAYMENT',
    payloadHash: orderPolicy.registrationOrderPayloadHash(normalized),
    subtotalCents: 5400, expiresAt: null, entries: [],
  };
  const changed = payload();
  changed.entries[0].answers.full_name = 'Outro participante';
  await assert.rejects(
    () => racingReservation(winner).reserveOrder('congresso-teste', changed, key),
    /chave de idempotência/u,
  );
  await assert.rejects(
    () => racingReservation(winner, 'org_other').reserveOrder('congresso-teste', payload(), key),
    /identidade já possui inscrição/u,
  );
});


test('G2.10 persists expired grouped orders and reservations in the same scoped transaction', async () => {
  const now = Date.now();
  const writes = { orders: [], reservations: [], benefits: [] };
  const tx = {
    eventRegistrationOrder: { updateMany: async ({ where, data }) => {
      writes.orders.push({ where, data });
      return { count: 1 };
    } },
    eventRegistrationReservation: {
      findMany: async ({ where }) => {
        assert.equal(where.eventId, eventId);
        assert.equal(where.organizationId, organizationId);
        assert.equal(where.status, 'PENDING_PAYMENT');
        assert.ok(where.expiresAt.lte instanceof Date);
        return [{ id: 'expired_1', benefitId: 'benefit_1' }, { id: 'expired_2', benefitId: null }];
      },
      updateMany: async (args) => { writes.reservations.push(args); return { count: 2 }; },
    },
    eventRegistrationBenefit: { updateMany: async (args) => {
      writes.benefits.push(args);
      return { count: 1 };
    } },
  };
  const { service } = fixture();
  await service.expireStaleReservations(tx, eventId, organizationId);
  assert.equal(writes.orders.length, 1);
  assert.deepEqual(writes.orders[0].where.eventId, eventId);
  assert.deepEqual(writes.orders[0].where.organizationId, organizationId);
  assert.equal(writes.orders[0].where.status, 'PENDING_PAYMENT');
  assert.ok(writes.orders[0].where.expiresAt.lte.getTime() >= now);
  assert.equal(writes.orders[0].data.status, 'EXPIRED');
  assert.equal(writes.reservations.length, 1);
  assert.deepEqual(writes.reservations[0].where.id.in, ['expired_1', 'expired_2']);
  assert.equal(writes.reservations[0].where.status, 'PENDING_PAYMENT');
  assert.equal(writes.reservations[0].data.status, 'EXPIRED');
  assert.equal(writes.benefits.length, 1);
  assert.equal(writes.benefits[0].where.organizationId, organizationId);
  assert.equal(writes.benefits[0].where.eventId, eventId);
  assert.equal(writes.benefits[0].data.usedCount.decrement, 1);
});

test('G2.10 reconciles an expired parent order even when individual reservations were already expired', async () => {
  let orderUpdates = 0;
  const tx = {
    eventRegistrationOrder: { updateMany: async ({ where, data }) => {
      assert.equal(where.status, 'PENDING_PAYMENT');
      assert.equal(where.organizationId, organizationId);
      assert.equal(where.eventId, eventId);
      assert.equal(data.status, 'EXPIRED');
      orderUpdates += 1;
      return { count: 0 };
    } },
    eventRegistrationReservation: {
      findMany: async () => [],
      updateMany: async () => { throw new Error('no expired reservation should be rewritten'); },
    },
    eventRegistrationBenefit: { updateMany: async () => { throw new Error('no benefit should be decremented'); } },
  };
  const { service } = fixture();
  await service.expireStaleReservations(tx, eventId, organizationId);
  assert.equal(orderUpdates, 1);
});
