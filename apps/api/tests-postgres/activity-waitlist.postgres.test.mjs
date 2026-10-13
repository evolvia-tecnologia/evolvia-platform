// Executa contra um PostgreSQL descartável com as migrations aplicadas (DATABASE_URL).
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test, { after, before } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { AuthorizationService } from '../dist/authorization.service.js';
import { ActivityWaitlistService } from '../dist/activity-waitlist.service.js';

const run = randomBytes(5).toString('hex');
const token = `Atividadefila${run}`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const prisma = new PrismaClient();
const waitlist = new ActivityWaitlistService(prisma, {}, new AuthorizationService(prisma));
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

function queueRow(scope, id, reservationId, activityId, status = 'WAITING') {
  return {
    id,
    organizationId: scope.organizationId,
    eventId: scope.eventId,
    reservationId,
    activityId,
    status,
    queuedAt,
    leftAt: status === 'LEFT' ? queuedAt : null,
  };
}

function barrier(parties) {
  let arrived = 0;
  let open;
  const opened = new Promise((resolve) => { open = resolve; });
  return async () => {
    arrived += 1;
    if (arrived >= parties) open();
    await opened;
  };
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
  return { organizationId: organization.id, eventId: event.id, categoryId: category.id, lotId: lot.id, spaceId: space.id };
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
  const other = await eventGraph(ownerId, 'other');
  await prisma.organizationMembership.create({
    data: { organizationId: home.organizationId, userId: ownerId, role: 'OWNER' },
  });
  longActivity = await activity(home, 'Fila longa', new Date('2026-11-01T12:00:00Z'));
  otherActivity = await activity(home, 'Outra atividade', new Date('2026-11-01T14:00:00Z'));
  seatActivity = await activity(home, 'Última vaga', new Date('2026-11-01T16:00:00Z'));
  requestedActivity = await activity(home, 'Preferência', new Date('2026-11-01T18:00:00Z'));
  heldActivity = await activity(home, 'Vaga já ocupada', new Date('2026-11-02T12:00:00Z'));
  capActivity = await activity(home, 'Teto individual', new Date('2026-11-02T14:00:00Z'));
  courtesyActivity = await activity(home, 'Cortesia', new Date('2026-11-02T16:00:00Z'));
  const foreignActivity = await activity(other, 'Outra organização', new Date('2026-11-01T12:00:00Z'));

  const longReservations = Array.from({ length: LONG_QUEUE }, (_, index) => reservation(home, index, 'CONFIRMED'));
  const second = reservation(home, 2000, 'CONFIRMED');
  const leftReservation = reservation(home, 3000, 'CONFIRMED');
  const seatA = reservation(home, 4000, 'CONFIRMED');
  const seatB = reservation(home, 4001, 'CONFIRMED');
  const cancelled = reservation(home, 4002, 'CANCELLED');
  const requested = reservation(home, 5000, 'CONFIRMED');
  const capped = reservation(home, 6000, 'CONFIRMED');
  const courtesyReservation = reservation(home, 7000, 'CONFIRMED');
  const foreign = reservation(other, 9000, 'CONFIRMED');
  await prisma.eventRegistrationReservation.createMany({
    data: [longReservations, second, leftReservation, seatA, seatB, cancelled, requested, capped, courtesyReservation, foreign].flat(),
  });
  confirmedA = seatA.id;
  confirmedB = seatB.id;
  cancelledId = cancelled.id;
  requestedReservation = requested.id;
  cappedReservation = capped.id;

  const queue = longReservations.map((row, index) => queueRow(
    home,
    `q${run}w${String(index).padStart(4, '0')}`,
    row.id,
    longActivity.id,
  ));
  queue.push(
    queueRow(home, `q${run}left01`, leftReservation.id, longActivity.id, 'LEFT'),
    queueRow(home, `q${run}other1`, second.id, otherActivity.id),
    queueRow(home, `q${run}seatA1`, seatA.id, seatActivity.id),
    queueRow(home, `q${run}seatB1`, seatB.id, seatActivity.id),
    queueRow(home, `q${run}seatC1`, cancelled.id, seatActivity.id),
    queueRow(home, `q${run}req001`, requested.id, requestedActivity.id),
    queueRow(home, `q${run}cap001`, capped.id, capActivity.id),
    queueRow(home, `q${run}cort01`, courtesyReservation.id, courtesyActivity.id),
    queueRow(other, `q${run}fore01`, foreign.id, foreignActivity.id),
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
  assert.deepEqual(long.people.slice(0, 2).map((row) => [row.id, row.position]), [[`q${run}w0000`, 1], [`q${run}w0001`, 2]]);
  assert.equal(long.people.some((row) => row.id === `q${run}w0500`), false);
  assert.equal(second.people.length, 1);
  assert.equal(second.people[0].participantName, 'Pessoa 2000');
  assert.equal(second.hiddenCount, 0);
  assert.equal(view.truncated, true);
  const serialized = JSON.stringify(view);
  assert.equal(serialized.includes(`q${run}fore01`), false);
  assert.equal(serialized.includes(`q${run}left01`), false);
  assert.equal(serialized.includes('@'), false);
});

test('duas sessões disputam a última vaga enquanto a inscrição cancelada entra na mesma corrida', async () => {
  const clients = [new PrismaClient(), new PrismaClient(), new PrismaClient()];
  try {
    const pids = await Promise.all(clients.map((client) => client.$queryRaw`SELECT pg_backend_pid() AS pid`));
    const pidSet = new Set(pids.map((row) => Number(row[0].pid)));
    assert.equal(pidSet.size, 3);
    const ready = barrier(3);
    const entries = [`q${run}seatA1`, `q${run}seatB1`, `q${run}seatC1`];
    const raced = await Promise.all(clients.map(async (client, index) => {
      await ready();
      const service = new ActivityWaitlistService(client, {}, new AuthorizationService(client));
      return service.promote(ownerId, home.eventId, entries[index]).then(() => 'ok', (error) => error.message);
    }));
    const enrolled = await prisma.eventActivityEnrollment.findMany({
      where: { activityId: seatActivity.id, organizationId: home.organizationId },
      select: { reservationId: true, status: true },
    });
    const promoted = await prisma.eventActivityWaitlistEntry.findMany({
      where: { activityId: seatActivity.id, status: 'PROMOTED' },
      select: { id: true },
    });
    const cancelledEntry = await prisma.eventActivityWaitlistEntry.findUnique({ where: { id: `q${run}seatC1` } });
    const audits = await prisma.auditLog.findMany({
      where: {
        eventId: home.eventId,
        action: 'activity.waitlist_promoted',
        entityId: { in: [`q${run}seatA1`, `q${run}seatB1`, `q${run}seatC1`] },
      },
      select: { entityId: true, actorUserId: true, metadata: true },
    });
    assert.equal(enrolled.length, 1);
    assert.equal(enrolled[0].status, 'ENROLLED');
    assert.notEqual(enrolled[0].reservationId, cancelledId);
    assert.equal(promoted.length, 1);
    assert.equal(cancelledEntry.status, 'WAITING');
    assert.equal(raced.filter((item) => item === 'ok').length, 1);
    assert.match(raced[2], /não está confirmada/u);
    assert.match(raced.find((item) => item !== 'ok' && !item.includes('confirmada')) ?? '', /Não há vaga restante/u);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].entityId, promoted[0].id);
    assert.equal(audits[0].actorUserId, ownerId);
    assert.equal(JSON.stringify(audits).includes('@'), false);
    assert.equal(await prisma.eventActivityEnrollment.count({ where: { reservationId: cancelledId } }), 0);
  } finally {
    await Promise.all(clients.map((client) => client.$disconnect()));
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
