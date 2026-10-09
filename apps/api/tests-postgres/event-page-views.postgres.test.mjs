// Concorrência real no PostgreSQL descartável, depois das migrations (DATABASE_URL).
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test, { after, before } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { recordPublicPageView } from '../dist/event-page-view.js';

const run = randomBytes(5).toString('hex');
const token = `Visitapg${run}`;
const when = new Date('2026-10-10T02:30:00.000Z');
const prisma = new PrismaClient();
let ownerId;
let organizationA;
let organizationB;

async function insertEvent(organizationId, data) {
  return prisma.event.create({
    data: {
      ownerId,
      organizationId,
      name: `${token} evento`,
      slug: `${token.toLowerCase()}-${randomBytes(4).toString('hex')}`,
      eventType: 'Outro tipo de evento',
      format: 'IN_PERSON',
      registrationMode: 'FREE',
      status: 'PUBLISHED',
      timeZone: 'America/Sao_Paulo',
      ...data,
    },
  });
}

before(async () => {
  const owner = await prisma.user.create({
    data: { name: `PG ${token}`, email: `owner-${run}@evolvia-ci.local`, passwordHash: 'x' },
  });
  ownerId = owner.id;
  organizationA = await prisma.organization.create({
    data: { name: `Org A ${token}`, slug: `org-a-${token.toLowerCase()}`, createdById: ownerId },
  });
  organizationB = await prisma.organization.create({
    data: { name: `Org B ${token}`, slug: `org-b-${token.toLowerCase()}`, createdById: ownerId },
  });
});

after(async () => {
  await prisma.event.updateMany({
    where: { name: { startsWith: token }, status: 'PUBLISHED' },
    data: { status: 'CANCELLED' },
  });
  await prisma.$disconnect();
});

test('aberturas concorrentes somam no dia do fuso e não cruzam organização nem evento', async () => {
  const eventA = await insertEvent(organizationA.id, {});
  const eventB = await insertEvent(organizationB.id, { timeZone: 'UTC' });
  const draft = await insertEvent(organizationA.id, { status: 'DRAFT' });

  const columns = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'EventPublicPageView'
  `;
  const names = columns.map((column) => column.column_name).sort();
  assert.deepEqual(names, ['count', 'createdAt', 'day', 'eventId', 'id', 'organizationId', 'updatedAt']);

  const wave = (slug, times) => Promise.all(Array.from({ length: times }, () => recordPublicPageView(prisma, slug, when)));
  await wave(eventA.slug, 25);
  await wave(eventA.slug, 15);
  const rowsA = await prisma.eventPublicPageView.findMany({ where: { eventId: eventA.id } });
  assert.equal(rowsA.length, 1);
  assert.equal(rowsA[0].day, '2026-10-09');
  assert.equal(rowsA[0].count, 40);
  assert.equal(rowsA[0].organizationId, organizationA.id);

  assert.equal(await prisma.eventPublicPageView.count({ where: { eventId: eventB.id } }), 0);
  assert.equal(await prisma.eventPublicPageView.count({ where: { organizationId: organizationB.id, eventId: eventA.id } }), 0);
  await recordPublicPageView(prisma, eventB.slug, when);
  const rowsB = await prisma.eventPublicPageView.findMany({ where: { organizationId: organizationB.id } });
  assert.equal(rowsB.length, 1);
  assert.equal(rowsB[0].eventId, eventB.id);
  assert.equal(rowsB[0].day, '2026-10-10');
  assert.equal(rowsB[0].count, 1);
  assert.equal(await prisma.eventPublicPageView.findUnique({ where: { eventId_day: { eventId: eventA.id, day: '2026-10-09' } } }).then((row) => row.count), 40);

  await assert.rejects(() => recordPublicPageView(prisma, draft.slug, when), (error) => error instanceof NotFoundException);
  await assert.rejects(() => recordPublicPageView(prisma, 'ab', when), (error) => error instanceof NotFoundException);
  assert.equal(await prisma.eventPublicPageView.count({ where: { eventId: draft.id } }), 0);
});
