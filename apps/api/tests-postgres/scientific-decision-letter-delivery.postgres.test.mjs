// Executa contra PostgreSQL descartável com migrations (DATABASE_URL).
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test, { after, before } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { ScientificAuthorService } from '../dist/scientific-author.service.js';

const run = randomBytes(5).toString('hex');
const token = `Carta${run}`;
const prisma = new PrismaClient();
const files = {
  write: async () => { throw new Error('arquivo não pedido'); },
  read: async () => Buffer.from(''),
  remove: async () => {},
};

let current = null;
const authors = new ScientificAuthorService(prisma, {
  requireConfirmedScope: async () => {
    if (!current) throw new Error('sem escopo');
    return current;
  },
}, files);

async function seedEvent(organizationId, ownerId, label) {
  const suffix = randomBytes(4).toString('hex');
  const event = await prisma.event.create({
    data: {
      ownerId,
      organizationId,
      name: `${token} ${label}`,
      slug: `${token.toLowerCase()}-${suffix}`,
      eventType: 'Congresso',
      format: 'IN_PERSON',
      registrationMode: 'FREE',
      status: 'PUBLISHED',
      profileCode: 'SCIENTIFIC_EVENT',
    },
  });
  const catalog = await prisma.eventRegistrationCatalog.create({
    data: { organizationId, eventId: event.id },
  });
  const category = await prisma.eventRegistrationCategory.create({
    data: {
      organizationId, eventId: event.id, catalogId: catalog.id, code: 'GERAL', name: 'Geral',
    },
  });
  const lot = await prisma.eventRegistrationLot.create({
    data: {
      organizationId, eventId: event.id, categoryId: category.id, code: 'LOTE1', name: 'Lote 1',
      startsAt: new Date(Date.now() - 3_600_000), endsAt: new Date(Date.now() + 86_400_000),
      quantity: 10, priceCents: 0,
    },
  });
  const modality = await prisma.scientificSubmissionModality.create({
    data: { organizationId, eventId: event.id, code: 'ORAL', name: 'Oral', active: true },
  });
  await prisma.scientificSubmissionConfig.create({
    data: {
      organizationId,
      eventId: event.id,
      requireFile: false,
      allowCorrections: true,
      maxSubmissionsPerAuthor: 3,
      requireCorrespondingAuthor: false,
      minKeywords: 1,
      maxKeywords: 5,
      abstractMin: 10,
      acceptanceLetterBody: 'Aceite {NOME} em {EVENTO}.',
      rejectionLetterBody: 'Recusa {NOME} em {EVENTO}.',
    },
  });
  return { event, category, lot, modality, organizationId };
}

async function reservation(ctx, key) {
  const row = await prisma.eventRegistrationReservation.create({
    data: {
      organizationId: ctx.organizationId,
      eventId: ctx.event.id,
      categoryId: ctx.category.id,
      lotId: ctx.lot.id,
      protocol: `EVO-${randomBytes(8).toString('hex').toUpperCase()}`,
      idempotencyKeyHash: randomBytes(32).toString('hex'),
      payloadHash: 'b'.repeat(64),
      identityHash: randomBytes(32).toString('hex'),
      emailHash: randomBytes(32).toString('hex'),
      registrationData: { full_name: `Pessoa ${key}`, email: `${key}-${run}@evolvia-ci.local` },
      basePriceCents: 0,
      finalPriceCents: 0,
      status: 'CONFIRMED',
      confirmedAt: new Date(),
    },
  });
  return { eventId: ctx.event.id, organizationId: ctx.organizationId, reservationId: row.id };
}

async function createDecidedSubmission(ctx, scope, title, status) {
  const email = `autor-${randomBytes(4).toString('hex')}@evolvia-ci.local`;
  const person = await prisma.scientificPerson.create({
    data: {
      organizationId: ctx.organizationId,
      eventId: ctx.event.id,
      name: `Autor ${title}`,
      email,
    },
  });
  const submission = await prisma.scientificSubmission.create({
    data: {
      organizationId: ctx.organizationId,
      eventId: ctx.event.id,
      modalityId: ctx.modality.id,
      ownerReservationId: scope.reservationId,
      submissionKeyHash: randomBytes(32).toString('hex'),
      title,
      abstractText: 'Resumo fictício com tamanho suficiente para a regra de aceite.',
      keywords: ['alfa', 'beta'],
      status,
      currentVersion: 1,
      submittedAt: new Date(),
      stationPublicCode: Math.floor(Math.random() * 900) + 100,
    },
  });
  await prisma.scientificSubmissionAuthor.create({
    data: {
      organizationId: ctx.organizationId,
      eventId: ctx.event.id,
      submissionId: submission.id,
      personId: person.id,
      sortOrder: 1,
      isCorresponding: true,
      isPresenter: true,
      nameSnapshot: person.name,
    },
  });
  return submission;
}
const ctx = {};

before(async () => {
  const ownerA = await prisma.user.create({
    data: { name: 'PG carta A', email: `owner-a-${run}@evolvia-ci.local`, passwordHash: 'x' },
  });
  const ownerB = await prisma.user.create({
    data: { name: 'PG carta B', email: `owner-b-${run}@evolvia-ci.local`, passwordHash: 'x' },
  });
  const orgA = await prisma.organization.create({
    data: { name: `OrgA ${token}`, slug: `orga-${token.toLowerCase()}`, createdById: ownerA.id },
  });
  const orgB = await prisma.organization.create({
    data: { name: `OrgB ${token}`, slug: `orgb-${token.toLowerCase()}`, createdById: ownerB.id },
  });
  ctx.a = await seedEvent(orgA.id, ownerA.id, 'A');
  ctx.b = await seedEvent(orgB.id, ownerB.id, 'B');
  ctx.authorA = await reservation(ctx.a, 'ana');
  ctx.peerA = await reservation(ctx.a, 'bia');
  ctx.authorB = await reservation(ctx.b, 'carla');
  ctx.accepted = await createDecidedSubmission(ctx.a, ctx.authorA, 'Trabalho aceito', 'ACCEPTED');
  ctx.rejected = await createDecidedSubmission(ctx.a, ctx.authorA, 'Trabalho recusado', 'REJECTED');
  ctx.foreign = await createDecidedSubmission(ctx.b, ctx.authorB, 'Trabalho outra org', 'ACCEPTED');
});

after(async () => {
  await prisma.event.updateMany({ where: { name: { startsWith: token } }, data: { status: 'CANCELLED' } });
  await prisma.$disconnect();
});

test('autor correto abre aceite e recusa com VIEWED e hash; peer e outra org não veem', async () => {
  current = ctx.authorA;
  const accepted = await authors.acceptanceLetter(ctx.a.event.slug, 'Bearer ficticio', ctx.accepted.id);
  assert.equal(accepted.kind, 'acceptance');
  assert.equal(accepted.delivery.action, 'VIEWED');
  assert.equal(accepted.delivery.channel, 'AUTHOR_AREA');
  assert.match(accepted.text, /Aceite/u);
  const acceptedHash = createHash('sha256').update(accepted.text).digest('hex');

  const rejected = await authors.acceptanceLetter(ctx.a.event.slug, 'Bearer ficticio', ctx.rejected.id);
  assert.equal(rejected.kind, 'rejection');
  assert.equal(rejected.delivery.action, 'VIEWED');
  assert.match(rejected.text, /Recusa/u);

  const deliveries = await prisma.scientificDecisionDelivery.findMany({
    where: { eventId: ctx.a.event.id, organizationId: ctx.a.organizationId },
    orderBy: { createdAt: 'asc' },
  });
  assert.equal(deliveries.length, 2);
  assert.equal(deliveries[0].action, 'VIEWED');
  assert.equal(deliveries[0].kind, 'ACCEPTANCE');
  assert.equal(deliveries[0].documentHash, acceptedHash);
  assert.equal(deliveries[1].kind, 'REJECTION');

  current = ctx.peerA;
  await assert.rejects(
    () => authors.acceptanceLetter(ctx.a.event.slug, 'Bearer ficticio', ctx.accepted.id),
    NotFoundException,
  );

  current = ctx.authorB;
  await assert.rejects(
    () => authors.acceptanceLetter(ctx.a.event.slug, 'Bearer ficticio', ctx.accepted.id),
    NotFoundException,
  );
  await assert.rejects(
    () => authors.acceptanceLetter(ctx.b.event.slug, 'Bearer ficticio', ctx.accepted.id),
    NotFoundException,
  );
});

test('download grava DOWNLOADED e troca de sessão impede aplicar recibo no trabalho alheio', async () => {
  current = ctx.authorA;
  const downloaded = await authors.recordDecisionDownload(ctx.a.event.slug, 'Bearer ficticio', ctx.accepted.id);
  assert.equal(downloaded.delivery.action, 'DOWNLOADED');
  assert.equal(downloaded.kind, 'acceptance');
  const hash = createHash('sha256').update(downloaded.text).digest('hex');
  const row = await prisma.scientificDecisionDelivery.findFirst({
    where: {
      submissionId: ctx.accepted.id,
      action: 'DOWNLOADED',
      documentHash: hash,
    },
  });
  assert.ok(row);

  // Simula sessão que mudou para o peer antes do download do trabalho do autor.
  current = ctx.peerA;
  await assert.rejects(
    () => authors.recordDecisionDownload(ctx.a.event.slug, 'Bearer ficticio', ctx.accepted.id),
    NotFoundException,
  );
  assert.equal(
    await prisma.scientificDecisionDelivery.count({
      where: { submissionId: ctx.accepted.id, action: 'DOWNLOADED' },
    }),
    1,
  );
});

test('histórico de entregas fica no evento/org corretos sem vazar a outra organização', async () => {
  const rows = await prisma.scientificDecisionDelivery.findMany({
    where: { eventId: ctx.a.event.id, organizationId: ctx.a.organizationId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      kind: true,
      action: true,
      documentHash: true,
      organizationId: true,
      eventId: true,
      submission: { select: { title: true } },
    },
  });
  assert.ok(rows.length >= 3);
  assert.ok(rows.every((row) => row.organizationId === ctx.a.organizationId));
  assert.ok(rows.every((row) => row.eventId === ctx.a.event.id));
  assert.ok(rows.every((row) => typeof row.documentHash === 'string' && row.documentHash.length === 64));
  assert.doesNotMatch(JSON.stringify(rows), /@evolvia-ci\.local|passwordHash/u);
  assert.equal(
    await prisma.scientificDecisionDelivery.count({
      where: { eventId: ctx.b.event.id, organizationId: ctx.b.organizationId },
    }),
    0,
  );
});
