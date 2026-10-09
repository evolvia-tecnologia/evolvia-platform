// Executa contra um PostgreSQL descartável com as migrations aplicadas (DATABASE_URL).
// No CI roda dentro do contêiner da API, depois do smoke; localmente, após `npm run build`.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { AuthorizationService } from '../dist/authorization.service.js';
import { EventMutationPolicy } from '../dist/event-mutation-policy.service.js';
import { ScientificAuthorService } from '../dist/scientific-author.service.js';
import { ScientificSubmissionsService } from '../dist/scientific-submissions.service.js';

const run = randomBytes(5).toString('hex');
const token = `Janelapg${run}`;
const prisma = new PrismaClient();
const submissions = new ScientificSubmissionsService(prisma, new AuthorizationService(prisma), new EventMutationPolicy());
let current = null;
const authors = new ScientificAuthorService(prisma, { requireConfirmedScope: async () => current }, {
  write: async () => {}, read: async () => Buffer.alloc(0), remove: async () => {},
});
const people = {};
const ctx = {};

async function rejects(promise, status, pattern) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.getStatus?.(), status, `esperado ${status}, recebido ${error.getStatus?.()}: ${error.message}`);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

const blocks = [{ label: 'Introdução', min: 3, max: 200 }, { label: 'Método', min: 3, max: 200 }];
const authorBody = (texts) => ({
  modalityId: ctx.modality.id, title: 'Trabalho fictício por blocos', abstractText: '', keywords: ['alfa'],
  institution: 'Instituto Fictício', coauthors: [], submitterPresenter: true, submitterCorresponding: true,
  abstractBlocks: [{ code: 'introducao', text: texts[0] }, { code: 'metodo', text: texts[1] }],
});

before(async () => {
  people.owner = await prisma.user.create({ data: { name: 'PG dono', email: `owner-${run}@evolvia-ci.local`, passwordHash: 'x' } });
  people.external = await prisma.user.create({ data: { name: 'PG externo', email: `external-${run}@evolvia-ci.local`, passwordHash: 'x' } });
  const organization = await prisma.organization.create({ data: { name: `Org ${token}`, slug: `org-${token.toLowerCase()}`, createdById: people.owner.id } });
  const external = await prisma.organization.create({ data: { name: `Ext ${token}`, slug: `ext-${token.toLowerCase()}`, createdById: people.external.id } });
  await prisma.organizationMembership.createMany({ data: [
    { organizationId: organization.id, userId: people.owner.id, role: 'OWNER' },
    { organizationId: external.id, userId: people.external.id, role: 'OWNER' },
  ] });
  ctx.organizationId = organization.id;
  ctx.event = await prisma.event.create({ data: {
    ownerId: people.owner.id, organizationId: organization.id, name: `${token} evento`, slug: `${token.toLowerCase()}-${randomBytes(4).toString('hex')}`,
    eventType: 'Congresso', format: 'IN_PERSON', registrationMode: 'FREE', status: 'SETUP', profileCode: 'SCIENTIFIC_EVENT',
  } });
  const scope = { organizationId: organization.id, eventId: ctx.event.id };
  const catalog = await prisma.eventRegistrationCatalog.create({ data: scope });
  const category = await prisma.eventRegistrationCategory.create({ data: { ...scope, catalogId: catalog.id, code: 'GERAL', name: 'Geral' } });
  const lot = await prisma.eventRegistrationLot.create({ data: {
    ...scope, categoryId: category.id, code: 'LOTE1', name: 'Lote 1', quantity: 10, priceCents: 0,
    startsAt: new Date(Date.now() - 3_600_000), endsAt: new Date(Date.now() + 86_400_000),
  } });
  ctx.modality = await prisma.scientificSubmissionModality.create({ data: { ...scope, code: 'ORAL', name: 'Oral', active: true, rules: { legado: 'preservar' } } });
  await prisma.scientificSubmissionConfig.create({ data: {
    ...scope, requireFile: false, maxSubmissionsPerAuthor: 5, requireCorrespondingAuthor: false, minKeywords: 1, maxKeywords: 5,
    collectTypedAbstract: true, abstractMin: 1, abstractMax: 2000,
  } });
  const reservation = await prisma.eventRegistrationReservation.create({ data: {
    ...scope, categoryId: category.id, lotId: lot.id, protocol: `EVO-${randomBytes(8).toString('hex').toUpperCase()}`,
    idempotencyKeyHash: randomBytes(32).toString('hex'), payloadHash: 'b'.repeat(64), identityHash: randomBytes(32).toString('hex'),
    emailHash: randomBytes(32).toString('hex'), registrationData: { full_name: 'Pessoa Autora', email: `autora-${run}@evolvia-ci.local` },
    basePriceCents: 0, finalPriceCents: 0, status: 'CONFIRMED', confirmedAt: new Date(),
  } });
  ctx.scope = { ...scope, reservationId: reservation.id };
});

after(async () => {
  await prisma.event.updateMany({ where: { name: { startsWith: token } }, data: { status: 'CANCELLED' } });
  await prisma.$disconnect();
});

test('outra organização não grava prazo nem blocos; o dono grava e preserva as outras regras', async () => {
  const window = { opensAt: new Date(Date.now() - 60_000).toISOString(), closesAt: new Date(Date.now() + 3_600_000).toISOString(), blocks };
  await assert.rejects(submissions.setModalityWindow(people.external.id, ctx.event.id, ctx.modality.id, window), (error) => [403, 404].includes(error.getStatus?.()));
  assert.deepEqual((await prisma.scientificSubmissionModality.findUniqueOrThrow({ where: { id: ctx.modality.id } })).rules, { legado: 'preservar' });

  const management = await submissions.setModalityWindow(people.owner.id, ctx.event.id, ctx.modality.id, window);
  const saved = management.modalities.find((item) => item.id === ctx.modality.id).window;
  assert.deepEqual(saved.blocks.map((block) => block.code), ['introducao', 'metodo']);
  const stored = (await prisma.scientificSubmissionModality.findUniqueOrThrow({ where: { id: ctx.modality.id } })).rules;
  assert.equal(stored.legado, 'preservar');
  assert.equal(await prisma.auditLog.count({ where: { eventId: ctx.event.id, action: 'scientific.modality_window_updated' } }), 1);
});

test('dentro do prazo o resumo é composto pelos blocos; publicado, o prazo não muda pela API e o trabalho enviado fica intacto', async () => {
  await prisma.event.update({ where: { id: ctx.event.id }, data: { status: 'PUBLISHED' } });
  current = ctx.scope;
  const created = await authors.submit(ctx.event.slug, 'Bearer ficticio', authorBody(['Contexto fictício.', 'Coorte fictícia.']), randomUUID());
  const before = await prisma.scientificSubmission.findUniqueOrThrow({ where: { id: created.id }, select: { abstractText: true, submissionPayloadHash: true, updatedAt: true } });
  assert.equal(before.abstractText, 'Introdução\nContexto fictício.\n\nMétodo\nCoorte fictícia.');

  await rejects(submissions.setModalityWindow(people.owner.id, ctx.event.id, ctx.modality.id, { opensAt: null, closesAt: null, blocks: [] }), 409);
  const after = await prisma.scientificSubmission.findUniqueOrThrow({ where: { id: created.id }, select: { abstractText: true, submissionPayloadHash: true, updatedAt: true } });
  assert.deepEqual(after, before);
});

test('antes da abertura e depois do encerramento o envio é recusado sem gravar trabalho', async () => {
  current = ctx.scope;
  const count = await prisma.scientificSubmission.count({ where: { eventId: ctx.event.id } });
  const rules = (await prisma.scientificSubmissionModality.findUniqueOrThrow({ where: { id: ctx.modality.id } })).rules;
  try {
    await prisma.scientificSubmissionModality.update({ where: { id: ctx.modality.id }, data: { rules: { ...rules, opensAt: new Date(Date.now() + 3_600_000).toISOString() } } });
    await rejects(authors.submit(ctx.event.slug, 'Bearer ficticio', authorBody(['Texto cedo.', 'Texto cedo.']), randomUUID()), 400, /ainda não abriu/u);
    await prisma.scientificSubmissionModality.update({ where: { id: ctx.modality.id }, data: { rules: { ...rules, closesAt: new Date(Date.now() - 1_000).toISOString() } } });
    await rejects(authors.submit(ctx.event.slug, 'Bearer ficticio', authorBody(['Texto tarde.', 'Texto tarde.']), randomUUID()), 400, /encerrou/u);
  } finally {
    await prisma.scientificSubmissionModality.update({ where: { id: ctx.modality.id }, data: { rules } });
  }
  assert.equal(await prisma.scientificSubmission.count({ where: { eventId: ctx.event.id } }), count);
});
