// Executa contra um PostgreSQL descartável com as migrations aplicadas (DATABASE_URL).
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test, { after, before } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { AuthorizationService } from '../dist/authorization.service.js';
import { ActivityWaitlistService } from '../dist/activity-waitlist.service.js';
import { ParticipantAgendaService } from '../dist/participant-agenda.service.js';
import { ParticipantAreaService } from '../dist/participant-area.service.js';

const run = randomBytes(5).toString('hex');
const token = `Atividadefila${run}`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const prisma = new PrismaClient();
const participants = new ParticipantAreaService(prisma, {}, {});
const waitlist = new ActivityWaitlistService(prisma, participants, new AuthorizationService(prisma));
const queuedAt = new Date('2026-11-01T12:00:00Z');
const LONG_QUEUE = 501;

let ownerId;
let home;
let longActivity;
let otherActivity;
let seatActivity;
let requestedActivity;
let capActivity;
let heldActivity;
let courtesyActivity;
let foreign;
let confirmedA;
let confirmedB;
let cancelledId;
let requestedReservation;
let cappedReservation;

function reservation(scope, index, status) {
  return {
    id: `res${run}${index}`,
    organizationId: scope.organizationId,
    eventId: scope.eventId,
    categoryId: scope.categoryId,
    lotId: scope.lotId,
    protocol: `P${run}${index}`.slice(0, 32),
    idempotencyKeyHash: hash(`idem-${scope.eventId}-${index}`),
    payloadHash: hash(`payload-${scope.eventId}-${index}`),
    identityHash: hash(`identity-${scope.eventId}-${index}`),
    emailHash: hash(`email-${scope.eventId}-${index}@evolvia-ci.local`),
    registrationData: { full_name: `Pessoa ${index}` },
    basePriceCents: 0,
    finalPriceCents: 0,
    status,
    confirmedAt: status === 'CONFIRMED' ? new Date('2026-10-12T12:00:00Z') : null,
  };
}

function queueRow(scope, id, reservationId, activityId, status = 'WAITING', at = queuedAt) {
  return {
    id,
    organizationId: scope.organizationId,
    eventId: scope.eventId,
    reservationId,
    activityId,
    status,
    queuedAt: at,
    leftAt: status === 'LEFT' ? at : null,
  };
}

function namedClient(name) {
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set('application_name', name);
  return new PrismaClient({ datasources: { db: { url: url.toString() } } });
}

async function waitForTransactions(names) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw`
      SELECT pid, application_name
      FROM pg_stat_activity
      WHERE application_name IN (${names[0]}, ${names[1]})
        AND datname = current_database()
        AND xact_start IS NOT NULL
        AND wait_event_type = 'Lock'
    `;
    const seen = new Set(rows.map((row) => row.application_name));
    if (names.every((name) => seen.has(name))) return rows;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('As duas sessões não ficaram bloqueadas dentro da transação.');
}

async function eventGraph(owner, label) {
  const organization = await prisma.organization.create({
    data: { name: `${label} ${token}`, slug: `${label}-${token}`.toLowerCase(), createdById: owner },
  });
  const event = await prisma.event.create({
    data: {
      ownerId: owner,
      organizationId: organization.id,
      name: `${label} ${token}`,
      slug: `${label}-event-${token}`.toLowerCase(),
      eventType: 'Outro tipo de evento',
      format: 'IN_PERSON',
      registrationMode: 'FREE',
      status: 'PUBLISHED',
      timeZone: 'America/Sao_Paulo',
    },
  });
  const catalog = await prisma.eventRegistrationCatalog.create({
    data: { organizationId: organization.id, eventId: event.id },
  });
  const category = await prisma.eventRegistrationCategory.create({
    data: { organizationId: organization.id, eventId: event.id, catalogId: catalog.id, code: 'GERAL', name: 'Geral' },
  });
  const lot = await prisma.eventRegistrationLot.create({
    data: {
      organizationId: organization.id,
      eventId: event.id,
      categoryId: category.id,
      code: 'LOTE1',
      name: 'Lote 1',
      startsAt: new Date('2026-10-01T00:00:00Z'),
      endsAt: new Date('2026-12-01T00:00:00Z'),
      priceCents: 0,
    },
  });
  const space = await prisma.scientificProgramSpace.create({
    data: { organizationId: organization.id, eventId: event.id, name: `Sala ${label}`, capacity: 1, kind: 'ROOM' },
  });
  return { organizationId: organization.id, eventId: event.id, slug: event.slug, categoryId: category.id, lotId: lot.id, spaceId: space.id };
}

async function activity(scope, title, startAt) {
  return prisma.scientificProgramActivity.create({
    data: {
      organizationId: scope.organizationId,
      eventId: scope.eventId,
      title,
      activityType: 'LECTURE',
      spaceId: scope.spaceId,
      startAt,
      endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
      status: 'PUBLISHED',
    },
  });
}

before(async () => {
  const owner = await prisma.user.create({
    data: { name: `PG ${token}`, email: `owner-${run}@evolvia-ci.local`, passwordHash: 'x' },
  });
  ownerId = owner.id;
  home = await eventGraph(ownerId, 'home');
  foreign = await eventGraph(ownerId, 'other');
  await prisma.organizationMembership.createMany({
    data: [
      { organizationId: home.organizationId, userId: ownerId, role: 'OWNER' },
      { organizationId: foreign.organizationId, userId: ownerId, role: 'OWNER' },
    ],
  });
  longActivity = await activity(home, 'Fila longa', new Date('2026-11-01T12:00:00Z'));
  otherActivity = await activity(home, 'Outra atividade', new Date('2026-11-01T14:00:00Z'));
  seatActivity = await activity(home, 'Última vaga', new Date('2026-11-01T16:00:00Z'));
  requestedActivity = await activity(home, 'Preferência', new Date('2026-11-01T18:00:00Z'));
  heldActivity = await activity(home, 'Vaga já ocupada', new Date('2026-11-02T12:00:00Z'));
  capActivity = await activity(home, 'Teto individual', new Date('2026-11-02T14:00:00Z'));
  courtesyActivity = await activity(home, 'Cortesia', new Date('2026-11-02T16:00:00Z'));
  const foreignActivity = await activity(foreign, 'Outra organização', new Date('2026-11-01T12:00:00Z'));

  const longReservations = Array.from({ length: LONG_QUEUE }, (_, index) => reservation(home, index, 'CONFIRMED'));
  const second = reservation(home, 2000, 'CONFIRMED');
  const leftReservation = reservation(home, 3000, 'CONFIRMED');
  const seatA = reservation(home, 4000, 'CONFIRMED');
  const seatB = reservation(home, 4001, 'CONFIRMED');
  const cancelled = reservation(home, 4002, 'CONFIRMED');
  const requested = reservation(home, 5000, 'CONFIRMED');
  const capped = reservation(home, 6000, 'CONFIRMED');
  const courtesyReservation = reservation(home, 7000, 'CONFIRMED');
  const foreignReservation = reservation(foreign, 9000, 'CONFIRMED');
  await prisma.eventRegistrationReservation.createMany({
    data: [longReservations, second, leftReservation, seatA, seatB, cancelled, requested, capped, courtesyReservation, foreignReservation].flat(),
  });
  confirmedA = seatA.id;
  confirmedB = seatB.id;
  cancelledId = cancelled.id;
  requestedReservation = requested.id;
  cappedReservation = capped.id;

  const queueStart = new Date('2026-11-01T12:00:00.000Z');
  const queue = longReservations.map((row, index) => queueRow(
    home,
    `q${run}w${String(LONG_QUEUE - 1 - index).padStart(4, '0')}`,
    row.id,
    longActivity.id,
    'WAITING',
    new Date(queueStart.getTime() + index * 1000),
  ));
  queue.push(
    queueRow(home, `q${run}left01`, leftReservation.id, longActivity.id, 'LEFT', queueStart),
    queueRow(home, `q${run}a0000`, second.id, otherActivity.id, 'WAITING', new Date(queueStart.getTime() + LONG_QUEUE * 1000)),
    queueRow(home, `q${run}seatA1`, seatA.id, seatActivity.id),
    queueRow(home, `q${run}seatB1`, seatB.id, seatActivity.id),
    queueRow(home, `q${run}seatC1`, cancelled.id, seatActivity.id),
    queueRow(home, `q${run}req001`, requested.id, requestedActivity.id),
    queueRow(home, `q${run}cap001`, capped.id, capActivity.id),
    queueRow(home, `q${run}cort01`, courtesyReservation.id, courtesyActivity.id),
    queueRow(foreign, `q${run}fore01`, foreignReservation.id, foreignActivity.id),
  );
  await prisma.eventActivityWaitlistEntry.createMany({ data: queue });
  await prisma.eventActivityEnrollment.create({
    data: {
      organizationId: home.organizationId,
      eventId: home.eventId,
      reservationId: requested.id,
      activityId: requestedActivity.id,
      status: 'REQUESTED',
      courtesy: false,
    },
  });
  await prisma.eventActivityEnrollment.create({
    data: {
      organizationId: home.organizationId,
      eventId: home.eventId,
      reservationId: capped.id,
      activityId: heldActivity.id,
      status: 'ENROLLED',
      courtesy: false,
    },
  });
  await prisma.eventCapability.create({
    data: {
      eventId: home.eventId,
      code: 'activity_enrollment_limit',
      status: 'ACTIVE',
      config: { max: 1 },
    },
  });
  await prisma.eventCapability.create({
    data: {
      eventId: home.eventId,
      code: 'activity_courtesy',
      status: 'ACTIVE',
      config: { quotas: [{ activityId: courtesyActivity.id, count: 1 }] },
    },
  });
});

after(async () => {
  await prisma.$disconnect();
});

test('fila acima de 500 limita os nomes dentro da atividade e preserva a outra', async () => {
  const view = await waitlist.organizer(ownerId, home.eventId);
  const long = view.activities.find((row) => row.activityId === longActivity.id);
  const second = view.activities.find((row) => row.activityId === otherActivity.id);
  assert.equal(long.people.length, 100);
  assert.equal(long.hiddenCount, LONG_QUEUE - 100);
  assert.ok(long.hiddenCount > 400);
  assert.deepEqual(long.people.slice(0, 2).map((row) => [row.id, row.position]), [[`q${run}w0500`, 1], [`q${run}w0499`, 2]]);
  assert.deepEqual(long.people.at(-1) && [long.people.at(-1).id, long.people.at(-1).position], [`q${run}w0401`, 100]);
  assert.equal(long.people.some((row) => row.id === `q${run}w0000`), false);
  assert.equal(second.people[0].id, `q${run}a0000`);
  assert.equal(second.people.length, 1);
  assert.equal(second.people[0].participantName, 'Pessoa 2000');
  assert.equal(second.hiddenCount, 0);
  assert.ok(second.people[0].queuedAt > long.people[0].queuedAt);
  const globalCut = await prisma.$queryRaw`
    SELECT id
    FROM "EventActivityWaitlistEntry"
    WHERE "eventId" = ${home.eventId}
      AND "organizationId" = ${home.organizationId}
      AND "status" = 'WAITING'
    ORDER BY "queuedAt" ASC, "id" ASC
    LIMIT 500
  `;
  assert.equal(globalCut.length, 500);
  assert.equal(globalCut.some((row) => row.id === `q${run}w0500`), true);
  assert.equal(globalCut.some((row) => row.id === `q${run}a0000`), false);
  assert.equal(globalCut.some((row) => row.id === `q${run}w0000`), false);
  assert.equal(view.truncated, true);
  const serialized = JSON.stringify(view);
  assert.equal(serialized.includes(`q${run}fore01`), false);
  assert.equal(serialized.includes(`q${run}left01`), false);
  assert.equal(serialized.includes('@'), false);
  const abroad = await waitlist.organizer(ownerId, foreign.eventId);
  const abroadSerialized = JSON.stringify(abroad);
  assert.equal(abroad.activities.length, 1);
  assert.equal(abroadSerialized.includes(`q${run}fore01`), true);
  assert.equal(abroadSerialized.includes(`q${run}w0500`), false);
  assert.equal(abroadSerialized.includes(`q${run}a0000`), false);
  assert.equal(abroadSerialized.includes('@'), false);

  const lastSession = await participants.createSessionForReservation(home.eventId, home.organizationId, `res${run}${LONG_QUEUE - 1}`);
  const mine = await waitlist.view(home.slug, `Bearer ${lastSession.accessToken}`);
  assert.equal(mine.waiting.find((row) => row.activityId === longActivity.id)?.position, LONG_QUEUE);
  assert.equal(mine.waiting.length, 1);
  const firstSession = await participants.createSessionForReservation(home.eventId, home.organizationId, `res${run}0`);
  const first = await waitlist.view(home.slug, `Bearer ${firstSession.accessToken}`);
  assert.equal(first.waiting.find((row) => row.activityId === longActivity.id)?.position, 1);
  const outsider = await participants.createSessionForReservation(foreign.eventId, foreign.organizationId, `res${run}9000`);
  const foreignMine = await waitlist.view(foreign.slug, `Bearer ${outsider.accessToken}`);
  assert.equal(foreignMine.waiting.length, 1);
  assert.equal(foreignMine.waiting[0].position, 1);
  assert.equal(foreignMine.waiting[0].activityId === longActivity.id, false);
  for (const payload of [mine, first, foreignMine]) {
    const serializedPayload = JSON.stringify(payload);
    assert.equal(serializedPayload.includes(`q${run}`), false);
    assert.equal(serializedPayload.includes('@'), false);
    assert.equal(serializedPayload.includes(payload === foreignMine ? home.eventId : foreign.eventId), false);
    assert.equal(serializedPayload.includes(payload === foreignMine ? home.organizationId : foreign.organizationId), false);
  }
  await assert.rejects(
    () => waitlist.view(foreign.slug, `Bearer ${lastSession.accessToken}`),
    (error) => error.getStatus?.() === 401,
  );
  await assert.rejects(
    () => waitlist.view(home.slug, `Bearer ${outsider.accessToken}`),
    (error) => error.getStatus?.() === 401,
  );
});

test('duas sessões disputam a última vaga e o cancelamento ocorre durante a corrida', async (t) => {
  // Cada rodada usa inscrições e atividade distintas. Não reaproveita estado
  // cancelado/promovido e não aceita uma execução favorável como prova.
  for (let iteration = 0; iteration < 20; iteration += 1) {
    await t.test(`disputa ${iteration + 1}/20`, async () => {
      let activityId = seatActivity.id;
      let entryA = `q${run}seatA1`;
      let entryB = `q${run}seatB1`;
      let entryC = `q${run}seatC1`;
      let cancelledReservationId = cancelledId;
      if (iteration > 0) {
        const raceActivity = await activity(home, `Última vaga ${iteration + 1}`, new Date('2026-11-01T16:00:00Z'));
        activityId = raceActivity.id;
        const a = reservation(home, 10000 + iteration * 3, 'CONFIRMED');
        const b = reservation(home, 10001 + iteration * 3, 'CONFIRMED');
        const c = reservation(home, 10002 + iteration * 3, 'CONFIRMED');
        await prisma.eventRegistrationReservation.createMany({ data: [a, b, c] });
        entryA = `q${run}race${iteration}a`;
        entryB = `q${run}race${iteration}b`;
        entryC = `q${run}race${iteration}c`;
        cancelledReservationId = c.id;
        await prisma.eventActivityWaitlistEntry.createMany({ data: [
          queueRow(home, entryA, a.id, activityId),
          queueRow(home, entryB, b.id, activityId),
          queueRow(home, entryC, c.id, activityId),
        ] });
      }
      const holder = namedClient(`fila-hold-${run}-${iteration}`);
      const clientA = namedClient(`fila-a-${run}-${iteration}`);
      const clientB = namedClient(`fila-b-${run}-${iteration}`);
      let release;
      const seen = new Promise((resolve) => { release = resolve; });
      let markHeld;
      const held = new Promise((resolve) => { markHeld = resolve; });
      const holding = holder.$transaction(async (tx) => {
        const locked = await tx.$queryRaw`
          SELECT id FROM "EventActivityWaitlistEntry"
          WHERE id IN (${entryA}, ${entryB})
          FOR UPDATE
        `;
        assert.equal(locked.length, 2);
        markHeld();
        await seen;
      }, { maxWait: 5000, timeout: 20000 });
      try {
        await held;
        const pending = Promise.all([
          new ActivityWaitlistService(clientA, {}, new AuthorizationService(clientA))
            .promote(ownerId, home.eventId, entryA).then(() => 'ok', (error) => error.message),
          new ActivityWaitlistService(clientB, {}, new AuthorizationService(clientB))
            .promote(ownerId, home.eventId, entryB).then(() => 'ok', (error) => error.message),
        ]);
        const inside = await waitForTransactions([`fila-a-${run}-${iteration}`, `fila-b-${run}-${iteration}`]);
        assert.equal(new Set(inside.map((row) => Number(row.pid))).size, 2);
        await prisma.eventRegistrationReservation.update({
          where: { id: cancelledReservationId },
          data: { status: 'CANCELLED', confirmedAt: null },
        });
        const cancelledResult = await waitlist.promote(ownerId, home.eventId, entryC)
          .then(() => 'ok', (error) => error.message);
        release();
        const raced = [...await pending, cancelledResult];
        await holding;
        const enrolled = await prisma.eventActivityEnrollment.findMany({
          where: { activityId: activityId, organizationId: home.organizationId },
          select: { reservationId: true, status: true },
        });
        const promoted = await prisma.eventActivityWaitlistEntry.findMany({
          where: { activityId: activityId, status: 'PROMOTED' },
          select: { id: true },
        });
        const cancelledEntry = await prisma.eventActivityWaitlistEntry.findUnique({ where: { id: entryC } });
        const audits = await prisma.auditLog.findMany({
          where: {
            eventId: home.eventId,
            action: 'activity.waitlist_promoted',
            entityId: { in: [entryA, entryB, entryC] },
          },
          select: { entityId: true, actorUserId: true, metadata: true },
        });
        assert.equal(enrolled.length, 1);
        assert.equal(enrolled[0].status, 'ENROLLED');
        assert.notEqual(enrolled[0].reservationId, cancelledReservationId);
        assert.equal(promoted.length, 1);
        assert.equal(cancelledEntry.status, 'WAITING');
        assert.equal(raced.filter((item) => item === 'ok').length, 1);
        assert.match(raced[2], /não está confirmada/u);
        assert.match(raced.find((item) => item !== 'ok' && !item.includes('confirmada')) ?? '', /Não há vaga restante/u);
        assert.equal(audits.length, 1);
        assert.equal(audits[0].entityId, promoted[0].id);
        assert.equal(audits[0].actorUserId, ownerId);
        assert.equal(JSON.stringify(audits).includes('@'), false);
        assert.equal(await prisma.eventActivityEnrollment.count({ where: { reservationId: cancelledReservationId } }), 0);
      } finally {
        release?.();
        await holding.catch(() => undefined);
        await Promise.all([holder, clientA, clientB].map((client) => client.$disconnect()));
      }
    });
  }
});

test('preferência solicitada vira vaga, teto e cortesia recusam sem auditoria', async () => {
  await waitlist.promote(ownerId, home.eventId, `q${run}req001`);
  assert.equal(
    await prisma.eventActivityWaitlistEntry.findUnique({ where: { id: `q${run}req001` } }).then((row) => row.status),
    'PROMOTED',
  );
  const enrollment = await prisma.eventActivityEnrollment.findUnique({
    where: { reservationId_activityId: { reservationId: requestedReservation, activityId: requestedActivity.id } },
  });
  assert.equal(enrollment.status, 'ENROLLED');
  assert.equal(enrollment.courtesy, false);
  const requestedAudit = await prisma.auditLog.findFirst({
    where: { eventId: home.eventId, entityId: `q${run}req001`, action: 'activity.waitlist_promoted' },
  });
  assert.ok(requestedAudit);

  const beforeCap = await prisma.auditLog.count({ where: { entityId: `q${run}cap001` } });
  await assert.rejects(
    () => waitlist.promote(ownerId, home.eventId, `q${run}cap001`),
    (error) => {
      assert.equal(error.getStatus?.(), 409);
      assert.match(error.message, /limite de atividades/u);
      return true;
    },
  );
  assert.equal(await prisma.eventActivityWaitlistEntry.findUnique({ where: { id: `q${run}cap001` } }).then((row) => row.status), 'WAITING');
  assert.equal(await prisma.eventActivityEnrollment.count({ where: { reservationId: cappedReservation, activityId: capActivity.id } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { entityId: `q${run}cap001` } }), beforeCap);

  const beforeCourtesy = await prisma.auditLog.count({ where: { entityId: `q${run}cort01` } });
  await assert.rejects(
    () => waitlist.promote(ownerId, home.eventId, `q${run}cort01`),
    (error) => {
      assert.equal(error.getStatus?.(), 409);
      assert.match(error.message, /Não há vaga restante/u);
      return true;
    },
  );
  assert.equal(await prisma.eventActivityWaitlistEntry.findUnique({ where: { id: `q${run}cort01` } }).then((row) => row.status), 'WAITING');
  assert.equal(await prisma.eventActivityEnrollment.count({ where: { activityId: courtesyActivity.id } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { entityId: `q${run}cort01` } }), beforeCourtesy);
});

for (const [action, index] of [['join', 8000], ['enroll', 8001]]) {
  test(action + ' recusa cancelamento concluído entre escopo e transação', { timeout: 15000 }, async () => {
    const reader = namedClient('cancel-scope-' + action);
    const writer = namedClient('cancel-write-' + action);
    const row = reservation(home, index, 'CONFIRMED');
    await prisma.eventRegistrationReservation.create({ data: row });
    const realParticipants = new ParticipantAreaService(reader, {}, {});
    const session = await realParticipants.createSessionForReservation(home.eventId, home.organizationId, row.id);
    const reached = Promise.withResolvers();
    const resume = Promise.withResolvers();
    // Barreira após a autenticação real, antes do início da transação de escrita.
    const gatedParticipants = {
      async requireConfirmedScope(...args) {
        const scope = await realParticipants.requireConfirmedScope(...args);
        assert.equal(scope.reservationId, row.id);
        reached.resolve();
        await resume.promise;
        return scope;
      },
    };
    const service = action === 'join'
      ? new ActivityWaitlistService(reader, gatedParticipants, new AuthorizationService(reader))
      : new ParticipantAgendaService(reader, gatedParticipants);
    const target = action === 'join' ? courtesyActivity.id : otherActivity.id;
    const pending = service[action](home.slug, 'Bearer ' + session.accessToken, target)
      .then(value => ({ value }), error => ({ error }));
    try {
      await Promise.race([
        reached.promise,
        pending.then(() => { throw new Error('Serviço terminou antes de alcançar a barreira.'); }),
      ]);
      // Sessão separada confirma o cancelamento antes de liberar o escopo antigo.
      await writer.$transaction(async tx => {
        const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
        const [{ pid: readerPid }] = await reader.$queryRaw`SELECT pg_backend_pid() AS pid`;
        assert.notEqual(pid, readerPid);
        await tx.eventRegistrationReservation.update({
          where: { id: row.id }, data: { status: 'CANCELLED', confirmedAt: null },
        });
      });
      resume.resolve();
      const result = await pending;
      assert.equal(result.error?.getStatus?.(), 409);
      assert.match(result.error.message, /não está confirmada/u);
      assert.equal(await prisma.eventRegistrationReservation.findUnique({
        where: { id: row.id },
      }).then(item => item.status), 'CANCELLED');
      assert.equal(await prisma.eventActivityEnrollment.count({
        where: { reservationId: row.id },
      }), 0);
      assert.equal(await prisma.eventActivityWaitlistEntry.count({
        where: { reservationId: row.id },
      }), 0);
      assert.equal(await prisma.auditLog.count({
        where: { eventId: home.eventId, entityId: row.id },
      }), 0);
    } finally {
      resume.resolve();
      await pending;
      await Promise.all([reader, writer].map(client => client.$disconnect()));
    }
  });
}
