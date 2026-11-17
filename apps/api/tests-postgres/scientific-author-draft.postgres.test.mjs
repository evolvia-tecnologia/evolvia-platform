// Executa contra um PostgreSQL descartável com as migrations aplicadas (DATABASE_URL).
// No CI roda dentro do contêiner da API, depois do smoke; localmente, após `npm run build`.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { ScientificAuthorService } from '../dist/scientific-author.service.js';

const run = randomBytes(5).toString('hex');
const token = `Rascunhopg${run}`;
const prisma = new PrismaClient();
const service = (scope) => new ScientificAuthorService(prisma, { requireConfirmedScope: async () => scope }, {
  write: async () => {}, read: async () => Buffer.alloc(0), remove: async () => {},
});
const ctx = {};

async function scientificEvent(organizationId, ownerId, maxSubmissionsPerAuthor) {
  const event = await prisma.event.create({ data: {
    ownerId, organizationId, name: `${token} evento`, slug: `${token.toLowerCase()}-${randomBytes(4).toString('hex')}`,
    eventType: 'Congresso', format: 'IN_PERSON', registrationMode: 'FREE', status: 'PUBLISHED', profileCode: 'SCIENTIFIC_EVENT',
  } });
  const scope = { organizationId, eventId: event.id };
  const catalog = await prisma.eventRegistrationCatalog.create({ data: scope });
  const category = await prisma.eventRegistrationCategory.create({ data: { ...scope, catalogId: catalog.id, code: 'GERAL', name: 'Geral' } });
  const lot = await prisma.eventRegistrationLot.create({ data: {
    ...scope, categoryId: category.id, code: 'LOTE1', name: 'Lote 1', quantity: 10, priceCents: 0,
    startsAt: new Date(Date.now() - 3_600_000), endsAt: new Date(Date.now() + 86_400_000),
  } });
  const modality = await prisma.scientificSubmissionModality.create({ data: { ...scope, code: 'ORAL', name: 'Oral', active: true } });
  await prisma.scientificSubmissionConfig.create({ data: {
    ...scope, requireFile: false, maxSubmissionsPerAuthor, requireCorrespondingAuthor: false, minKeywords: 1, maxKeywords: 5, abstractMin: 10,
  } });
  return { event, category, lot, modality, organizationId };
}

async function author(place, key) {
  const reservation = await prisma.eventRegistrationReservation.create({ data: {
    organizationId: place.organizationId, eventId: place.event.id, categoryId: place.category.id, lotId: place.lot.id,
    protocol: `EVO-${randomBytes(8).toString('hex').toUpperCase()}`, idempotencyKeyHash: randomBytes(32).toString('hex'),
    payloadHash: 'b'.repeat(64), identityHash: randomBytes(32).toString('hex'), emailHash: randomBytes(32).toString('hex'),
    registrationData: { full_name: `Pessoa ${key}`, email: `${key}-${run}@evolvia-ci.local` },
    basePriceCents: 0, finalPriceCents: 0, status: 'CONFIRMED', confirmedAt: new Date(),
  } });
  return { eventId: place.event.id, organizationId: place.organizationId, reservationId: reservation.id };
}

const draft = (place, extra = {}) => ({ modalityId: place.modality.id, title: 'Rascunho fictício', abstractText: '', keywords: [], institution: 'Instituto Fictício', ...extra });
const ready = (place, extra = {}) => ({
  modalityId: place.modality.id, title: 'Trabalho fictício pronto', abstractText: 'Resumo fictício suficiente para a regra.', keywords: ['alfa'],
  institution: 'Instituto Fictício', coauthors: [], submitterPresenter: true, ...extra,
});

before(async () => {
  const owner = await prisma.user.create({ data: { name: 'PG dono', email: `owner-${run}@evolvia-ci.local`, passwordHash: 'x' } });
  const organization = await prisma.organization.create({ data: { name: `Org ${token}`, slug: `org-${token.toLowerCase()}`, createdById: owner.id } });
  ctx.single = await scientificEvent(organization.id, owner.id, 1);
  ctx.multi = await scientificEvent(organization.id, owner.id, 3);
  ctx.ana = await author(ctx.single, 'ana');
  ctx.bia = await author(ctx.single, 'bia');
  ctx.caio = await author(ctx.multi, 'caio');
});

after(async () => {
  await prisma.event.updateMany({ where: { name: { startsWith: token } }, data: { status: 'CANCELLED' } });
  await prisma.$disconnect();
});

test('rascunhos simultâneos com chaves diferentes respeitam o limite de um trabalho', async () => {
  const results = await Promise.allSettled([
    service(ctx.ana).saveDraft(ctx.single.event.slug, 'Bearer ficticio', draft(ctx.single, { title: 'Primeiro' }), randomUUID()),
    service(ctx.ana).saveDraft(ctx.single.event.slug, 'Bearer ficticio', draft(ctx.single, { title: 'Segundo' }), randomUUID()),
  ]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(await prisma.scientificSubmission.count({ where: { ownerReservationId: ctx.ana.reservationId } }), 1);
});

test('rascunho guarda coautores no banco e outro autor ou outro evento não o retomam', async () => {
  const row = await prisma.scientificSubmission.findFirstOrThrow({ where: { ownerReservationId: ctx.ana.reservationId } });
  const coauthors = [{ name: 'Duda Coautora', email: `duda-${run}@evolvia-ci.local`, institution: 'USP', presenter: false }];
  await service(ctx.ana).saveDraft(ctx.single.event.slug, 'Bearer ficticio', draft(ctx.single, { draftId: row.id, coauthors }), randomUUID());
  const authors = await prisma.scientificSubmissionAuthor.findMany({ where: { submissionId: row.id }, orderBy: { sortOrder: 'asc' }, include: { person: true } });
  assert.deepEqual(authors.map((item) => item.person.email), [`ana-${run}@evolvia-ci.local`, `duda-${run}@evolvia-ci.local`]);

  await assert.rejects(service(ctx.bia).saveDraft(ctx.single.event.slug, 'Bearer ficticio', draft(ctx.single, { draftId: row.id }), randomUUID()), (error) => error.getStatus?.() === 404);
  await assert.rejects(service(ctx.bia).submit(ctx.single.event.slug, 'Bearer ficticio', ready(ctx.single, { draftId: row.id }), randomUUID()), (error) => error.getStatus?.() === 404 || error.getStatus?.() === 409);
  await assert.rejects(service(ctx.caio).saveDraft(ctx.multi.event.slug, 'Bearer ficticio', draft(ctx.multi, { draftId: row.id }), randomUUID()), (error) => error.getStatus?.() === 404);
  const unchanged = await prisma.scientificSubmission.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(unchanged.status, 'DRAFT');
  assert.equal(unchanged.ownerReservationId, ctx.ana.reservationId);
  assert.equal(await prisma.scientificSubmission.count({ where: { ownerReservationId: ctx.bia.reservationId } }), 0);
});

test('duas promoções simultâneas do mesmo rascunho geram uma única versão 1', async () => {
  const row = await prisma.scientificSubmission.findFirstOrThrow({ where: { ownerReservationId: ctx.ana.reservationId } });
  const results = await Promise.allSettled([
    service(ctx.ana).submit(ctx.single.event.slug, 'Bearer ficticio', ready(ctx.single, { draftId: row.id }), randomUUID()),
    service(ctx.ana).submit(ctx.single.event.slug, 'Bearer ficticio', ready(ctx.single, { draftId: row.id, title: 'Trabalho fictício outra aba' }), randomUUID()),
  ]);
  assert.equal(results.filter((item) => item.status === 'fulfilled' && item.value.duplicate === false).length, 1);
  const versions = await prisma.scientificSubmissionVersion.findMany({ where: { submissionId: row.id } });
  assert.deepEqual(versions.map((version) => version.versionNumber), [1]);
  const promoted = await prisma.scientificSubmission.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(promoted.status, 'SUBMITTED');
  assert.equal(promoted.currentVersion, 1);
  assert.equal(await prisma.auditLog.count({ where: { entityId: row.id, action: 'scientific.author_submitted' } }), 1);
  await assert.rejects(
    service(ctx.ana).saveDraft(ctx.single.event.slug, 'Bearer ficticio', draft(ctx.single, { draftId: row.id }), randomUUID()),
    /A versão submetida permanece/u,
  );
});


test('editar identidade no rascunho não altera autoria de outro trabalho que usa a mesma pessoa', async () => {
  const place = ctx.multi;
  const scope = await author(place, 'snapshot');
  const app = service(scope);
  const email = `snapshot-coauthor-${run}@evolvia-ci.local`;
  const original = { name: 'Bia Lima', email, institution: 'USP', presenter: false };
  const a = await app.saveDraft(place.event.slug, 'Bearer ficticio', draft(place, { coauthors: [original] }), randomUUID());
  const b = await app.saveDraft(place.event.slug, 'Bearer ficticio', draft(place, { title: 'Outro rascunho', coauthors: [original] }), randomUUID());
  const person = await prisma.scientificPerson.findFirstOrThrow({ where: { eventId: place.event.id, organizationId: scope.organizationId, email } });
  await app.saveDraft(place.event.slug, 'Bearer ficticio', draft(place, { draftId: a.id, coauthors: [{ ...original, name: 'Beatriz Lima', institution: 'Unicamp' }] }), randomUUID());
  let view = await app.get(place.event.slug, 'Bearer ficticio');
  assert.equal(view.submissions.find((item) => item.id === a.id).authors.find((item) => item.email === email).name, 'Beatriz Lima');
  assert.equal(view.submissions.find((item) => item.id === a.id).authors.find((item) => item.email === email).institution, 'Unicamp');
  assert.equal(view.submissions.find((item) => item.id === b.id).authors.find((item) => item.email === email).name, 'Bia Lima');
  assert.equal(view.submissions.find((item) => item.id === b.id).authors.find((item) => item.email === email).institution, 'USP');
  assert.deepEqual(await prisma.scientificPerson.findUniqueOrThrow({ where: { id: person.id } }), person);
  await app.saveDraft(place.event.slug, 'Bearer ficticio', draft(place, { draftId: a.id, coauthors: [{ ...original, institution: '' }] }), randomUUID());
  view = await app.get(place.event.slug, 'Bearer ficticio');
  assert.equal(view.submissions.find((item) => item.id === a.id).authors.find((item) => item.email === email).institution, '');
});
