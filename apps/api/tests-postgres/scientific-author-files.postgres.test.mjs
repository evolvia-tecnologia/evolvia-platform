// Executa contra um PostgreSQL descartável com as migrations aplicadas (DATABASE_URL).
// No CI roda dentro do contêiner da API, depois do smoke; localmente, após `npm run build`.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { ScientificAuthorService } from '../dist/scientific-author.service.js';

const run = randomBytes(5).toString('hex');
const token = `Autorpdf${run}`;
const prisma = new PrismaClient();
const stored = new Map();
const reads = [];
const files = {
  write: async (key, bytes) => { stored.set(key, Buffer.from(bytes)); },
  read: async (key) => {
    reads.push(key);
    const bytes = stored.get(key);
    if (!bytes) throw new Error('arquivo ausente no armazenamento de teste');
    return bytes;
  },
  remove: async (key) => { stored.delete(key); },
};
let current = null;
const participant = { requireConfirmedScope: async () => { if (!current) throw new Error('sem escopo'); return current; } };
const authors = new ScientificAuthorService(prisma, participant, files);
const people = {};

const pdf = (marker) => ({
  fileName: 'trabalho.pdf',
  contentBase64: Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%${marker}\n%%EOF`).toString('base64'),
});
const body = (marker) => ({
  modalityId: '', title: `Trabalho fictício ${marker}`, abstractText: 'Resumo fictício com tamanho suficiente para a regra.',
  keywords: ['alfa', 'beta', 'gama'], institution: 'Instituto Fictício', coauthors: [], submitterPresenter: true,
  submitterCorresponding: true, file: pdf(marker),
});

async function rejects(promise, status) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.getStatus?.(), status, `esperado ${status}, recebido ${error.getStatus?.()}: ${error.message}`);
    return true;
  });
}

async function scientificEvent(organizationId, ownerId) {
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
      organizationId, eventId: event.id, requireFile: true, allowCorrections: true, maxSubmissionsPerAuthor: 3,
      requireCorrespondingAuthor: false, minKeywords: 1, maxKeywords: 5, abstractMin: 10,
    },
  });
  return { event, category, lot, modality, organizationId };
}

async function author(ctx, key) {
  const reservation = await prisma.eventRegistrationReservation.create({
    data: {
      organizationId: ctx.organizationId, eventId: ctx.event.id, categoryId: ctx.category.id, lotId: ctx.lot.id,
      protocol: `EVO-${randomBytes(8).toString('hex').toUpperCase()}`, idempotencyKeyHash: randomBytes(32).toString('hex'),
      payloadHash: 'b'.repeat(64), identityHash: randomBytes(32).toString('hex'), emailHash: randomBytes(32).toString('hex'),
      registrationData: { full_name: `Pessoa ${key}`, email: `${key}-${run}@evolvia-ci.local` },
      basePriceCents: 0, finalPriceCents: 0, status: 'CONFIRMED', confirmedAt: new Date(),
    },
  });
  return { eventId: ctx.event.id, organizationId: ctx.organizationId, reservationId: reservation.id };
}

const ctx = {};

before(async () => {
  people.owner = await prisma.user.create({ data: { name: 'PG dono', email: `owner-${run}@evolvia-ci.local`, passwordHash: 'x' } });
  people.external = await prisma.user.create({ data: { name: 'PG externo', email: `external-${run}@evolvia-ci.local`, passwordHash: 'x' } });
  const organization = await prisma.organization.create({
    data: { name: `Org ${token}`, slug: `org-${token.toLowerCase()}`, createdById: people.owner.id },
  });
  const external = await prisma.organization.create({
    data: { name: `Externa ${token}`, slug: `ext-${token.toLowerCase()}`, createdById: people.external.id },
  });
  ctx.main = await scientificEvent(organization.id, people.owner.id);
  ctx.sibling = await scientificEvent(organization.id, people.owner.id);
  ctx.foreign = await scientificEvent(external.id, people.external.id);
  ctx.owner = await author(ctx.main, 'ana');
  ctx.peer = await author(ctx.main, 'bia');
  ctx.siblingAuthor = await author(ctx.sibling, 'caio');
  ctx.foreignAuthor = await author(ctx.foreign, 'duda');
});

after(async () => {
  await prisma.event.updateMany({ where: { name: { startsWith: token } }, data: { status: 'CANCELLED' } });
  await prisma.$disconnect();
});

test('o autor baixa só o PDF de cada versão própria, sem a chave de armazenamento na lista', async () => {
  current = ctx.owner;
  const created = await authors.submit(ctx.main.event.slug, 'Bearer ficticio', { ...body('v1'), modalityId: ctx.main.modality.id }, randomUUID());
  assert.equal(created.duplicate, false);
  const revised = await authors.revise(ctx.main.event.slug, 'Bearer ficticio', created.id, { ...body('v2'), modalityId: ctx.main.modality.id });
  assert.equal(revised.currentVersion, 2);
  ctx.submissionId = created.id;

  const listing = await authors.get(ctx.main.event.slug, 'Bearer ficticio');
  const item = listing.submissions.find((submission) => submission.id === created.id);
  assert.deepEqual(item.submissionFileVersions, [2, 1]);
  assert.equal(item.hasSubmissionFile, true);
  for (const key of stored.keys()) assert.equal(JSON.stringify(listing).includes(key), false, 'lista não expõe fileKey');

  const first = await authors.submissionVersionFile(ctx.main.event.slug, 'Bearer ficticio', created.id, '1');
  const second = await authors.submissionVersionFile(ctx.main.event.slug, 'Bearer ficticio', created.id, '2');
  assert.equal(first.fileName, 'trabalho-versao-1.pdf');
  assert.match(first.bytes.toString('latin1'), /%v1\n/u);
  assert.match(second.bytes.toString('latin1'), /%v2\n/u);
  const versions = await prisma.scientificSubmissionVersion.findMany({ where: { submissionId: created.id }, orderBy: { versionNumber: 'asc' } });
  assert.deepEqual(reads.slice(-2), versions.map((version) => version.fileKey));
});

test('outro autor, outro evento e outra organização não baixam o PDF', async () => {
  const before = reads.length;
  for (const scope of [ctx.peer, ctx.siblingAuthor, ctx.foreignAuthor]) {
    current = scope;
    await rejects(authors.submissionVersionFile(ctx.main.event.slug, 'Bearer ficticio', ctx.submissionId, '1'), 404);
  }
  current = { ...ctx.owner, eventId: ctx.sibling.event.id };
  await rejects(authors.submissionVersionFile(ctx.main.event.slug, 'Bearer ficticio', ctx.submissionId, '1'), 404);
  current = { ...ctx.owner, organizationId: ctx.foreign.organizationId };
  await rejects(authors.submissionVersionFile(ctx.main.event.slug, 'Bearer ficticio', ctx.submissionId, '1'), 404);
  assert.equal(reads.length, before, 'nenhum arquivo é lido fora do escopo');
});

test('versão inexistente, número malformado e evento despublicado respondem 404 sem ler arquivo', async () => {
  current = ctx.owner;
  const before = reads.length;
  for (const version of ['3', '0', '01', '1.0', '100', '-1', '../1', '']) {
    await rejects(authors.submissionVersionFile(ctx.main.event.slug, 'Bearer ficticio', ctx.submissionId, version), 404);
  }
  await rejects(authors.submissionVersionFile(ctx.main.event.slug, 'Bearer ficticio', 'id-invalido!', '1'), 404);
  await prisma.event.update({ where: { id: ctx.main.event.id }, data: { status: 'SETUP' } });
  try {
    await rejects(authors.submissionVersionFile(ctx.main.event.slug, 'Bearer ficticio', ctx.submissionId, '1'), 404);
  } finally {
    await prisma.event.update({ where: { id: ctx.main.event.id }, data: { status: 'PUBLISHED' } });
  }
  assert.equal(reads.length, before);
});

test('PDF ausente ou com formato incompleto é recusado sem gravar submissão nem arquivo', async () => {
  current = ctx.peer;
  const writes = stored.size;
  for (const file of [undefined, {}, { fileName: 'trabalho.pdf' }, { contentBase64: pdf('x').contentBase64 }, { fileName: 'trabalho.pdf', contentBase64: '  ' }, 'texto']) {
    const input = { ...body('sem'), modalityId: ctx.main.modality.id, file };
    if (file === undefined) delete input.file;
    await assert.rejects(authors.submit(ctx.main.event.slug, 'Bearer ficticio', input, randomUUID()), /Anexe o PDF exigido na submissão/u);
  }
  await assert.rejects(
    authors.submit(ctx.main.event.slug, 'Bearer ficticio', { ...body('sem'), modalityId: ctx.main.modality.id, file: { fileName: 'trabalho.pdf', contentBase64: Buffer.from('<html>').toString('base64') } }, randomUUID()),
    /precisa ser um PDF/u,
  );
  assert.equal(stored.size, writes);
  assert.equal(await prisma.scientificSubmission.count({ where: { ownerReservationId: ctx.peer.reservationId } }), 0);
});
