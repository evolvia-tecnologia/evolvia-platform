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

let ownerId;
let home;
let other;
let longActivity;
let otherActivity;
let seatActivity;
let confirmedA;
let confirmedB;
let cancelled;

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
    data: {
      organizationId: organization.id,
      eventId: event.id,
      name: 'Sala',
      capacity: 1,
      kind: 'ROOM',
    },
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
  other = await eventGraph(ownerId, 'other');
  await prisma.organizationMembership.create({
    data: { organizationId: home.organizationId, userId: ownerId, role: 'OWNER' },
  });
  longActivity = await activity(home, 'Fila longa', new Date('2026-11-01T12:00:00Z'));
  otherActivity = await activity(home, 'Outra atividade', new Date('2026-11-01T14:00:00Z'));
  seatActivity = await activity(home, 'Última vaga', new Date('2026-11-01T16:00:00Z'));
  const foreignActivity = await activity(other, 'Outra organização', new Date('2026-11-01T12:00:00Z'));

  const reservations = [];
  for (let index = 0; index < 101; index += 1) reservations.push(reservation(home, index, 'CONFIRMED'));
  reservations.push(reservation(home, 200, 'CONFIRMED'));
  reservations.push(reservation(home, 300, 'CONFIRMED'));
  reservations.push(reservation(home, 400, 'CONFIRMED'));
  reservations.push(reservation(home, 401, 'CONFIRMED'));
  reservations.push(reservation(home, 402, 'CANCELLED'));
  reservations.push(reservation(other, 900, 'CONFIRMED'));
  await prisma.eventRegistrationReservation.createMany({ data: reservations });
  confirmedA = reservations[103].id;
  confirmedB = reservations[104].id;
  cancelled = reservations[105].id;

  const queue = reservations.slice(0, 101).map((row, index) => ({
    id: `q${run}w${String(index).padStart(4, '0')}`,
    organizationId: home.organizationId,
    eventId: home.eventId,
    reservationId: row.id,
    activityId: longActivity.id,
    status: 'WAITING',
    queuedAt,
  }));
  queue.push({
    id: `q${run}left01`,
    organizationId: home.organizationId,
    eventId: home.eventId,
    reservationId: reservations[102].id,
    activityId: longActivity.id,
    status: 'LEFT',
    queuedAt,
    leftAt: queuedAt,
  });
  queue.push({
    id: `q${run}other1`,
    organizationId: home.organizationId,
    eventId: home.eventId,
    reservationId: reservations[101].id,
    activityId: otherActivity.id,
    status: 'WAITING',
    queuedAt: new Date('2026-11-01T13:00:00Z'),
  });
  queue.push(
    { id: `q${run}seatA1`, organizationId: home.organizationId, eventId: home.eventId, reservationId: confirmedA, activityId: seatActivity.id, status: 'WAITING', queuedAt },
    { id: `q${run}seatB1`, organizationId: home.organizationId, eventId: home.eventId, reservationId: confirmedB, activityId: seatActivity.id, status: 'WAITING', queuedAt },
    { id: `q${run}seatC1`, organizationId: home.organizationId, eventId: home.eventId, reservationId: cancelled, activityId: seatActivity.id, status: 'WAITING', queuedAt },
  );
  queue.push({
    id: `q${run}foreign`,
    organizationId: other.organizationId,
    eventId: other.eventId,
    reservationId: reservations[106].id,
    activityId: foreignActivity.id,
    status: 'WAITING',
    queuedAt,
  });
  await prisma.eventActivityWaitlistEntry.createMany({ data: queue });
});

after(async () => {
  await prisma.$disconnect();
});

test('a lista da organização limita cada atividade e ignora outra organização', async () => {
  const view = await waitlist.organizer(ownerId, home.eventId);
  const long = view.activities.find((row) => row.activityId === longActivity.id);
  const second = view.activities.find((row) => row.activityId === otherActivity.id);
  assert.equal(view.activities.some((row) => row.activityId !== longActivity.id && row.activityId !== otherActivity.id && row.activityId !== seatActivity.id), false);
  assert.equal(long.people.length, 100);
  assert.equal(long.hiddenCount, 1);
  assert.deepEqual(long.people.slice(0, 2).map((row) => [row.id, row.position]), [[`q${run}w0000`, 1], [`q${run}w0001`, 2]]);
  assert.equal(second.people.length, 1);
  assert.equal(second.people[0].participantName, 'Pessoa 200');
  assert.equal(second.hiddenCount, 0);
  assert.equal(view.truncated, true);
  assert.equal(JSON.stringify(view).includes(`q${run}foreign`), false);
  assert.equal(JSON.stringify(view).includes(`q${run}left01`), false);
  assert.equal(JSON.stringify(view).includes('@'), false);
});

test('promoção concorrente entrega uma vaga e inscrição cancelada não grava', async () => {
  await assert.rejects(
    () => waitlist.promote(ownerId, home.eventId, `q${run}seatC1`),
    (error) => {
      assert.equal(error.getStatus?.(), 409);
      assert.match(error.message, /não está confirmada/u);
      return true;
    },
  );
  assert.equal(await prisma.eventActivityEnrollment.count({ where: { reservationId: cancelled } }), 0);
  const raced = await Promise.all([
    waitlist.promote(ownerId, home.eventId, `q${run}seatA1`).then(() => 'ok', (error) => error.message),
    waitlist.promote(ownerId, home.eventId, `q${run}seatB1`).then(() => 'ok', (error) => error.message),
  ]);
  const enrolled = await prisma.eventActivityEnrollment.count({
    where: { activityId: seatActivity.id, status: 'ENROLLED', organizationId: home.organizationId },
  });
  const promoted = await prisma.eventActivityWaitlistEntry.count({
    where: { activityId: seatActivity.id, status: 'PROMOTED' },
  });
  assert.equal(enrolled, 1);
  assert.equal(promoted, 1);
  assert.equal(raced.filter((item) => item === 'ok').length, 1);
  assert.equal(raced.some((item) => item.includes('Não há vaga restante')), true);
});
