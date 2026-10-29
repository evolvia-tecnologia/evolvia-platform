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
  return { entries: [
    entry('52998224725', 'pessoa1@example.com'),
    entry('16899535009', 'pessoa2@example.com'),
  ] };
}

function fixture({ capacity = 2, occupied = 0, replay = null } = {}) {
  const writes = { orders: [], reservations: [], entries: [], audits: [] };
  const tx = {
    event: { findUnique: async () => ({
      id: eventId, organizationId, status: 'PUBLISHED',
      registrationMode: 'PAID', registrationForm: null,
    }) },
    eventRegistrationOrder: {
      findUnique: async () => replay,
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
      count: async () => occupied,
      create: async ({ data }) => {
        writes.reservations.push(data);
        return { id: 'reservation_' + writes.reservations.length, ...data };
      },
    },
    eventRegistrationCategory: {
      findFirst: async () => ({ capacity, proofRequirement: 'NONE' }),
    },
    eventRegistrationLot: {
      findFirst: async () => ({ quantity: capacity, priceCents: 2700, waitlistEnabled: false }),
    },
    eventRegistrationWaitlistEntry: { count: async () => 0 },
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
  return { service, writes, getIsolation: () => isolation };
}

test('G2.10 reserves two identities atomically with one persisted order, tenant-scoped entries and no external checkout', async () => {
  const { service, writes, getIsolation } = fixture();
  const result = await service.reserveOrder('congresso-teste', payload(), key);
  assert.equal(getIsolation(), 'Serializable');
  assert.equal(result.entryCount, 2);
  assert.equal(result.subtotalCents, 5400);
  assert.equal(result.status, 'PENDING_PAYMENT');
  assert.equal(writes.orders.length, 1);
  assert.equal(writes.reservations.length, 2);
  assert.equal(writes.entries.length, 2);
  assert.equal(writes.audits.length, 1);
  assert.equal(writes.orders[0].organizationId, organizationId);
  assert.equal(writes.entries[0].organizationId, organizationId);
  assert.equal(writes.entries[1].eventId, eventId);
  assert.notEqual(writes.reservations[0].identityHash, writes.reservations[1].identityHash);
  assert.doesNotMatch(JSON.stringify(result), /52998224725|pessoa1@/u);
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
