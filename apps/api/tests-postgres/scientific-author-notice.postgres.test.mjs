// Executa contra um PostgreSQL descartável com as migrations aplicadas (DATABASE_URL).
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { ScientificAuthorService } from '../dist/scientific-author.service.js';

const run = randomBytes(5).toString('hex');
const token = `Avisoa${run}`;
const prisma = new PrismaClient();
const files = { write: async () => { throw new Error('arquivo não pedido'); }, read: async () => Buffer.from(''), remove: async () => {} };
let current = null;
const authors = new ScientificAuthorService(prisma, { requireConfirmedScope: async () => {
  if (!current) throw new Error('sem escopo');
  return current;
} }, files);

const body = (title) => ({
  modalityId: '', title, abstractText: 'Resumo fictício com tamanho suficiente para a regra.',
  keywords: ['alfa', 'beta', 'gama'], institution: 'Instituto Fictício', coauthors: [],
  submitterPresenter: true, submitterCorresponding: true,
});

async function eventFor(organizationId, ownerId) {
  const suffix = randomBytes(4).toString('hex');
  const event = await prisma.event.create({
    data: {
      ownerId, organizationId, name: `${token} evento`, slug: `${token.toLowerCase()}-${suffix}`,
      eventType: 'Congresso', format: 'IN_PERSON', registrationMode: 'FREE', status: 'PUBLISHED',
      profileCode: 'SCIENTIFIC_EVENT',
    },
  });
  const catalog = await prisma.eventRegistrationCatalog.create({ data: { organizationId, eventId: event.id } });
  const category = await prisma.eventRegistrationCategory.create({
    data: { organizationId, eventId: event.id, catalogId: catalog.id, code: 'GERAL', name: 'Geral' },
  });
  const lot = await prisma.eventRegistrationLot.create({
    data: {
      organizationId, eventId: event.id, categoryId: category.id, code: 'LOTE1', name: 'Lote 1',
      startsAt: new Date(Date.now() - 3_600_000), endsAt: new Date(Date.now() + 86_400_000), quantity: 10, priceCents: 0,
    },
  });
  const modality = await prisma.scientificSubmissionModality.create({
    data: { organizationId, eventId: event.id, code: 'ORAL', name: 'Oral', active: true },
  });
  await prisma.scientificSubmissionConfig.create({
    data: {
      organizationId, eventId: event.id, requireFile: false, allowCorrections: true, maxSubmissionsPerAuthor: 3,
      requireCorrespondingAuthor: false, minKeywords: 1, maxKeywords: 5, abstractMin: 10,
    },
  });
  return { event, category, lot, modality, organizationId };
}

async function reservation(ctx, key) {
  const row = await prisma.eventRegistrationReservation.create({
    data: {
      organizationId: ctx.organizationId, eventId: ctx.event.id, categoryId: ctx.category.id, lotId: ctx.lot.id,
      protocol: `EVO-${randomBytes(8).toString('hex').toUpperCase()}`, idempotencyKeyHash: randomBytes(32).toString('hex'),
      payloadHash: 'b'.repeat(64), identityHash: randomBytes(32).toString('hex'), emailHash: randomBytes(32).toString('hex'),
      registrationData: { full_name: `Pessoa ${key}`, email: `${key}-${run}@evolvia-ci.local` },
      basePriceCents: 0, finalPriceCents: 0, status: 'CONFIRMED', confirmedAt: new Date(),
    },
  });
  return { eventId: ctx.event.id, organizationId: ctx.organizationId, reservationId: row.id };
}

const ctx = {};

before(async () => {
  const owner = await prisma.user.create({ data: { name: 'PG dono', email: `owner-${run}@evolvia-ci.local`, passwordHash: 'x' } });
  const organization = await prisma.organization.create({
    data: { name: `Org ${token}`, slug: `org-${token.toLowerCase()}`, createdById: owner.id },
  });
  ctx.main = await eventFor(organization.id, owner.id);
  ctx.owner = await reservation(ctx.main, 'ana');
  ctx.peer = await reservation(ctx.main, 'bia');
});

after(async () => {
  await prisma.event.updateMany({ where: { name: { startsWith: token } }, data: { status: 'CANCELLED' } });
  await prisma.$disconnect();
});

test('cada versão gera um aviso e a repetição devolve o mesmo registro', async () => {
  current = ctx.owner;
  const key = randomUUID();
  const created = await authors.submit(ctx.main.event.slug, 'Bearer ficticio', { ...body('Trabalho com aviso'), modalityId: ctx.main.modality.id }, key);
  assert.equal(created.duplicate, false);
  assert.equal(created.notice.kind, 'SUBMITTED');
  assert.equal(created.notice.versionNumber, 1);
  const repeated = await authors.submit(ctx.main.event.slug, 'Bearer ficticio', { ...body('Trabalho com aviso'), modalityId: ctx.main.modality.id }, key);
  assert.equal(repeated.duplicate, true);
  assert.deepEqual(repeated.notice, created.notice);

  const revised = await authors.revise(ctx.main.event.slug, 'Bearer ficticio', created.id, { ...body('Trabalho corrigido no aviso'), modalityId: ctx.main.modality.id });
  assert.equal(revised.duplicate, false);
  assert.equal(revised.notice.kind, 'CORRECTED');
  assert.equal(revised.notice.versionNumber, 2);
  const same = await authors.revise(ctx.main.event.slug, 'Bearer ficticio', created.id, { ...body('Trabalho corrigido no aviso'), modalityId: ctx.main.modality.id });
  assert.equal(same.duplicate, true);
  assert.deepEqual(same.notice, revised.notice);

  const rows = await prisma.scientificAuthorNotice.findMany({
    where: { eventId: ctx.owner.eventId, organizationId: ctx.owner.organizationId, submissionId: created.id },
    orderBy: { versionNumber: 'asc' },
  });
  assert.deepEqual(rows.map((row) => row.kind), ['SUBMITTED', 'CORRECTED']);
  assert.deepEqual(rows.map((row) => row.versionNumber), [1, 2]);
  assert.equal(rows.every((row) => row.ownerReservationId === ctx.owner.reservationId), true);
  await assert.rejects(prisma.scientificAuthorNotice.create({
    data: {
      organizationId: ctx.owner.organizationId, eventId: ctx.owner.eventId, submissionId: created.id,
      ownerReservationId: ctx.owner.reservationId, versionNumber: 1, kind: 'SUBMITTED',
    },
  }));

  const listing = await authors.get(ctx.main.event.slug, 'Bearer ficticio');
  const item = listing.submissions.find((submission) => submission.id === created.id);
  assert.deepEqual(item.notices.map((notice) => notice.versionNumber), [1, 2]);
  assert.equal(JSON.stringify(item.notices).includes('@'), false);
  const audits = await prisma.auditLog.findMany({
    where: { eventId: ctx.owner.eventId, organizationId: ctx.owner.organizationId, action: 'scientific.author_notice_recorded' },
  });
  assert.equal(audits.length, 2);
  assert.equal(JSON.stringify(audits).includes('@'), false);

  current = ctx.peer;
  const peer = await authors.get(ctx.main.event.slug, 'Bearer ficticio');
  assert.equal(peer.submissions.some((submission) => submission.id === created.id), false);
  assert.equal(JSON.stringify(peer).includes(created.id), false);
});
