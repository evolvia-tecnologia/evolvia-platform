import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test, { after, before } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { AuthorizationService } from '../dist/authorization.service.js';
import { EventDeskService } from '../dist/event-desk.service.js';

const run = randomBytes(4).toString('hex');
const token = `Kitpg${run}`;
const prisma = new PrismaClient();
const desk = new EventDeskService(prisma, new AuthorizationService(prisma));
const people = {};
let organizationId;
let otherOrganizationId;

function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function user(key) {
  people[key] = await prisma.user.create({
    data: { name: `PG ${key}`, email: `${key}-${run}@evolvia-ci.local`, passwordHash: 'x' },
  });
  return people[key];
}

async function rejects(promise, status, pattern) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.getStatus?.(), status, `esperado ${status}, recebido ${error.getStatus?.()}: ${error.message}`);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

async function eventIn(org, ownerId) {
  const suffix = randomBytes(3).toString('hex');
  const event = await prisma.event.create({
    data: {
      ownerId, organizationId: org, name: `${token} evento`, slug: `${token.toLowerCase()}-${suffix}`,
      eventType: 'Outro tipo de evento', format: 'IN_PERSON', registrationMode: 'FREE', status: 'PUBLISHED',
    },
  });
  await prisma.eventCapability.create({ data: { eventId: event.id, code: 'material_delivery', status: 'ACTIVE' } });
  const catalog = await prisma.eventRegistrationCatalog.create({ data: { organizationId: org, eventId: event.id } });
  const category = await prisma.eventRegistrationCategory.create({
    data: { organizationId: org, eventId: event.id, catalogId: catalog.id, code: 'GERAL', name: 'Geral' },
  });
  const lot = await prisma.eventRegistrationLot.create({
    data: {
      organizationId: org, eventId: event.id, categoryId: category.id, code: 'LOTE', name: 'Lote',
      startsAt: new Date(Date.now() - 3_600_000), endsAt: new Date(Date.now() + 86_400_000), quantity: 20, priceCents: 0,
    },
  });
  return { event, category, lot };
}

async function reservation(ctx, name, status, answers = {}) {
  return prisma.eventRegistrationReservation.create({
    data: {
      organizationId: ctx.event.organizationId,
      eventId: ctx.event.id,
      categoryId: ctx.category.id,
      lotId: ctx.lot.id,
      protocol: `${token}-${randomBytes(4).toString('hex')}`,
      idempotencyKeyHash: sha(`${name}-${randomBytes(4).toString('hex')}`),
      payloadHash: sha(name),
      identityHash: sha(`doc-${name}-${randomBytes(2).toString('hex')}`),
      emailHash: sha(`${name}@evolvia-ci.local`),
      registrationData: { full_name: name, preferred_name: name, identity_document: 'documento-secreto', email: `${name}@evolvia-ci.local`, ...answers },
      basePriceCents: 0,
      finalPriceCents: 0,
      status,
      expiresAt: status === 'PENDING_PAYMENT' ? new Date(Date.now() + 3_600_000) : null,
      confirmedAt: status === 'CONFIRMED' ? new Date() : null,
    },
  });
}

async function available(eventId, label) {
  const kit = await desk.kit(people.owner.id, eventId);
  return kit.sizes.find((size) => size.label === label);
}

before(async () => {
  await user('owner');
  await user('operator');
  await user('viewer');
  await user('outsider');
  const organization = await prisma.organization.create({
    data: { name: `Org ${token}`, slug: `org-${token.toLowerCase()}`, createdById: people.owner.id },
  });
  const other = await prisma.organization.create({
    data: { name: `Outra ${token}`, slug: `out-${token.toLowerCase()}`, createdById: people.outsider.id },
  });
  organizationId = organization.id;
  otherOrganizationId = other.id;
  await prisma.organizationMembership.createMany({
    data: [
      { organizationId, userId: people.owner.id, role: 'OWNER' },
      { organizationId, userId: people.operator.id, role: 'OPERATOR' },
      { organizationId, userId: people.viewer.id, role: 'VIEWER' },
      { organizationId: otherOrganizationId, userId: people.outsider.id, role: 'OWNER' },
    ],
  });
});

after(async () => {
  await prisma.event.updateMany({ where: { name: { startsWith: token } }, data: { status: 'CANCELLED' } });
  await prisma.$disconnect();
});

test('preferência não reserva estoque e a última camisa não fica negativa', async () => {
  const ctx = await eventIn(organizationId, people.owner.id);
  const saved = await desk.saveKit(people.owner.id, ctx.event.id, {
    name: 'Kit do corredor',
    shirtsEnabled: true,
    sizes: [{ label: 'P', stockQuantity: 1 }, { label: 'M', stockQuantity: 2 }],
  });
  assert.equal(saved.shirtsEnabled, true);
  assert.equal(saved.sizes.find((size) => size.label === 'P').available, 1);
  const small = saved.sizes.find((size) => size.label === 'P');
  const medium = saved.sizes.find((size) => size.label === 'M');

  const form = await prisma.eventRegistrationForm.findUnique({ where: { eventId_organizationId: { eventId: ctx.event.id, organizationId } } });
  const shirt = form.fields.find((field) => field.code === 'shirt_size');
  assert.equal(shirt.type, 'SELECT');
  assert.deepEqual(shirt.options.map((option) => option.id).sort(), [small.id, medium.id].sort());

  const first = await reservation(ctx, 'Ana', 'CONFIRMED', { shirt_size: small.id });
  const second = await reservation(ctx, 'Bia', 'CONFIRMED', { shirt_size: small.id });
  assert.equal((await available(ctx.event.id, 'P')).available, 1);

  const found = await desk.search(people.operator.id, ctx.event.id, { kind: 'NAME', value: 'Ana' });
  assert.equal(found.items[0].shirtPreference.label, 'P');
  assert.equal(JSON.stringify(found).includes('documento-secreto'), false);
  assert.equal(JSON.stringify(found).includes('@evolvia-ci.local'), false);

  const [one, two] = await Promise.allSettled([
    desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: first.id, sizeId: small.id }),
    desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: second.id, sizeId: small.id }),
  ]);
  const outcomes = [one, two];
  assert.equal(outcomes.filter((item) => item.status === 'fulfilled').length, 1);
  const rejected = outcomes.find((item) => item.status === 'rejected');
  assert.equal(rejected.reason.getStatus(), 409);
  assert.match(rejected.reason.message, /estoque deste tamanho/);
  const afterRace = await available(ctx.event.id, 'P');
  assert.equal(afterRace.available, 0);
  assert.equal(afterRace.delivered, 1);
  assert.equal(afterRace.forecast, 1);
  assert.ok(afterRace.available >= 0);

  const winner = one.status === 'fulfilled' ? first : second;
  const repeated = await desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: winner.id, sizeId: small.id });
  assert.equal(repeated.alreadyDelivered, true);
  assert.equal((await available(ctx.event.id, 'P')).delivered, 1);

  const pending = await reservation(ctx, 'Caio', 'PENDING_PAYMENT', { shirt_size: medium.id });
  await rejects(
    desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: pending.id, sizeId: medium.id }),
    400,
    /confirmada/,
  );
  await rejects(desk.saveKit(people.operator.id, ctx.event.id, { name: 'Kit do corredor', shirtsEnabled: true, sizes: [{ id: small.id, label: 'P', stockQuantity: 1 }] }), 404);
  await rejects(desk.kit(people.viewer.id, ctx.event.id), 404);
  await rejects(desk.deliverMaterial(people.outsider.id, ctx.event.id, { reservationId: first.id, sizeId: small.id }), 404);

  const other = await eventIn(otherOrganizationId, people.outsider.id);
  const foreign = await reservation(other, 'Duda', 'CONFIRMED');
  await rejects(
    desk.deliverMaterial(people.owner.id, ctx.event.id, { reservationId: foreign.id, sizeId: small.id }),
    400,
    /deste evento/,
  );
  await rejects(
    desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: winner.id, sizeId: 'tamanho-de-outro-evento' }),
    400,
    /deste evento/,
  );
  await rejects(
    desk.deliverMaterial(people.outsider.id, other.event.id, { reservationId: first.id }),
    400,
  );
});

test('troca de tamanho exige confirmação e o estorno devolve o estoque uma vez', async () => {
  const ctx = await eventIn(organizationId, people.owner.id);
  const saved = await desk.saveKit(people.owner.id, ctx.event.id, {
    name: 'Kit',
    shirtsEnabled: true,
    sizes: [{ label: 'M', stockQuantity: 1 }, { label: 'G', stockQuantity: 1 }],
  });
  const medium = saved.sizes.find((size) => size.label === 'M');
  const large = saved.sizes.find((size) => size.label === 'G');
  const person = await reservation(ctx, 'Eva', 'CONFIRMED', { shirt_size: medium.id });
  await rejects(
    desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: person.id, sizeId: large.id }),
    400,
    /Confirme a troca/,
  );
  assert.equal((await available(ctx.event.id, 'G')).delivered, 0);

  const delivered = await desk.deliverMaterial(people.operator.id, ctx.event.id, {
    reservationId: person.id,
    sizeId: large.id,
    confirmSizeChange: true,
  });
  assert.equal(delivered.sizeChangeConfirmed, true);
  assert.equal(delivered.sizeLabel, 'G');
  assert.equal((await available(ctx.event.id, 'G')).available, 0);
  const audit = await prisma.auditLog.findFirst({
    where: { eventId: ctx.event.id, entityId: person.id, action: 'registration.material_delivered' },
    orderBy: { createdAt: 'desc' },
  });
  assert.equal(audit.metadata.sizeChangeConfirmed, true);
  assert.equal(audit.metadata.requestedSizeLabel, 'M');
  assert.equal(JSON.stringify(audit.metadata).includes('documento-secreto'), false);

  const reversed = await desk.reverseMaterial(people.operator.id, ctx.event.id, { reservationId: person.id, reason: 'tamanho trocado na retirada' });
  assert.ok(reversed.reversedAt);
  assert.equal((await available(ctx.event.id, 'G')).available, 1);
  await rejects(
    desk.reverseMaterial(people.operator.id, ctx.event.id, { reservationId: person.id, reason: 'tamanho trocado na retirada' }),
    404,
  );
  assert.equal((await available(ctx.event.id, 'G')).available, 1);
  const history = await prisma.eventMaterialDelivery.findUnique({ where: { reservationId: person.id } });
  assert.ok(history.reversedAt);
  assert.equal(history.sizeId, large.id);
});

test('desativar M conserva o nome e a preferência inativa exige confirmação', async () => {
  const ctx = await eventIn(organizationId, people.owner.id);
  const saved = await desk.saveKit(people.owner.id, ctx.event.id, {
    name: 'Kit',
    shirtsEnabled: true,
    sizes: [{ label: 'M', stockQuantity: 2 }, { label: 'G', stockQuantity: 2 }, { label: 'P', stockQuantity: 1 }],
  });
  const medium = saved.sizes.find((size) => size.label === 'M');
  const large = saved.sizes.find((size) => size.label === 'G');
  const small = saved.sizes.find((size) => size.label === 'P');
  const person = await reservation(ctx, 'Iara', 'CONFIRMED', { shirt_size: medium.id });
  await desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: person.id, sizeId: medium.id });
  await desk.reverseMaterial(people.operator.id, ctx.event.id, { reservationId: person.id, reason: 'camisa devolvida antes de desativar' });
  await desk.saveKit(people.owner.id, ctx.event.id, {
    name: 'Kit',
    shirtsEnabled: true,
    sizes: [{ id: large.id, label: 'G', stockQuantity: 2 }, { id: small.id, label: 'P', stockQuantity: 1 }],
  });
  const stored = await prisma.eventKitSize.findUnique({ where: { id: medium.id } });
  assert.equal(stored.label, 'M');
  assert.equal(stored.active, false);
  assert.equal(stored.label.startsWith('~'), false);
  const history = await prisma.eventMaterialDelivery.findUnique({ where: { reservationId: person.id }, include: { size: true } });
  assert.equal(history.sizeId, medium.id);
  assert.equal(history.size.label, 'M');
  assert.ok(history.reversedAt);

  const found = await desk.search(people.operator.id, ctx.event.id, { kind: 'NAME', value: 'Iara' });
  assert.equal(found.items[0].shirtPreference.label, 'M');
  assert.equal(found.items[0].shirtPreference.sizeId, medium.id);
  await rejects(
    desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: person.id, sizeId: large.id }),
    400,
    /Confirme a troca/,
  );
  assert.equal((await available(ctx.event.id, 'G')).delivered, 0);
  await rejects(
    desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: person.id, sizeId: medium.id, confirmSizeChange: true }),
    400,
    /não está disponível/,
  );
  const delivered = await desk.deliverMaterial(people.operator.id, ctx.event.id, {
    reservationId: person.id,
    sizeId: large.id,
    confirmSizeChange: true,
  });
  assert.equal(delivered.sizeLabel, 'G');
  assert.equal(delivered.sizeChangeConfirmed, true);
  assert.equal((await available(ctx.event.id, 'G')).delivered, 1);
  assert.equal((await available(ctx.event.id, 'M')), undefined);
});

test('troca e reutilização de rótulos preservam histórico e unicidade', async () => {
  const ctx = await eventIn(organizationId, people.owner.id);
  const saved = await desk.saveKit(people.owner.id, ctx.event.id, {
    name: 'Kit',
    shirtsEnabled: true,
    sizes: [{ label: 'P', stockQuantity: 1 }, { label: 'M', stockQuantity: 1 }],
  });
  const small = saved.sizes.find((size) => size.label === 'P');
  const medium = saved.sizes.find((size) => size.label === 'M');
  const first = await reservation(ctx, 'Joao', 'CONFIRMED', { shirt_size: small.id });
  const second = await reservation(ctx, 'Lia', 'CONFIRMED', { shirt_size: medium.id });
  await desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: first.id, sizeId: small.id });
  await desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: second.id, sizeId: medium.id });
  await desk.reverseMaterial(people.operator.id, ctx.event.id, { reservationId: first.id, reason: 'ajuste de grade' });
  await desk.reverseMaterial(people.operator.id, ctx.event.id, { reservationId: second.id, reason: 'ajuste de grade' });

  const swapped = await desk.saveKit(people.owner.id, ctx.event.id, {
    name: 'Kit',
    shirtsEnabled: true,
    sizes: [{ id: small.id, label: 'M', stockQuantity: 1 }, { id: medium.id, label: 'P', stockQuantity: 1 }],
  });
  assert.deepEqual(swapped.sizes.map((size) => size.label), ['M', 'P']);
  const afterSwap = await prisma.eventKitSize.findMany({ where: { eventId: ctx.event.id }, orderBy: { label: 'asc' } });
  assert.deepEqual(afterSwap.map((size) => size.label), ['M', 'P']);
  assert.equal(afterSwap.some((size) => size.label.startsWith('~')), false);
  const firstRow = await prisma.eventMaterialDelivery.findUnique({ where: { reservationId: first.id } });
  const secondRow = await prisma.eventMaterialDelivery.findUnique({ where: { reservationId: second.id } });
  assert.equal(firstRow.sizeId, small.id);
  assert.equal(secondRow.sizeId, medium.id);
  assert.equal(firstRow.requestedSizeLabel, 'P');
  assert.equal(secondRow.requestedSizeLabel, 'M');

  await desk.saveKit(people.owner.id, ctx.event.id, {
    name: 'Kit',
    shirtsEnabled: true,
    sizes: [{ id: small.id, label: 'M', stockQuantity: 1 }],
  });
  const parked = await prisma.eventKitSize.findUnique({ where: { id: medium.id } });
  assert.equal(parked.label, 'P');
  assert.equal(parked.active, false);
  await rejects(
    desk.saveKit(people.owner.id, ctx.event.id, {
      name: 'Kit',
      shirtsEnabled: true,
      sizes: [{ id: small.id, label: 'P', stockQuantity: 1 }],
    }),
    409,
    /permanece no histórico/,
  );
  const untouched = await prisma.eventKitSize.findUnique({ where: { id: medium.id } });
  const kept = await prisma.eventKitSize.findUnique({ where: { id: small.id } });
  assert.equal(untouched.label, 'P');
  assert.equal(untouched.active, false);
  assert.equal(kept.label, 'M');
  const reactivated = await desk.saveKit(people.owner.id, ctx.event.id, {
    name: 'Kit',
    shirtsEnabled: true,
    sizes: [{ id: small.id, label: 'M', stockQuantity: 1 }, { label: 'P', stockQuantity: 4 }],
  });
  assert.equal(reactivated.sizes.find((size) => size.label === 'P').id, medium.id);
  const rows = await prisma.eventKitSize.findMany({ where: { eventId: ctx.event.id, label: 'P' } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].active, true);
});

test('a ficha já publicada recebe o SELECT sem apagar a resposta anterior', async () => {
  const ctx = await eventIn(organizationId, people.owner.id);
  const form = await prisma.eventRegistrationForm.create({
    data: {
      organizationId,
      eventId: ctx.event.id,
      fields: [{ id: 'essential-full-name', code: 'full_name', label: 'Nome completo', type: 'TEXT', required: true, enabled: true }],
      publishedVersion: 1,
      revision: 2,
    },
  });
  await prisma.eventRegistrationFormVersion.create({
    data: {
      organizationId,
      eventId: ctx.event.id,
      formId: form.id,
      version: 1,
      schema: [{ id: 'essential-full-name', code: 'full_name', label: 'Nome completo', type: 'TEXT', required: true, enabled: true }],
      createdById: people.owner.id,
    },
  });
  const saved = await desk.saveKit(people.owner.id, ctx.event.id, {
    name: 'Kit',
    shirtsEnabled: true,
    sizes: [{ label: 'P', stockQuantity: 3 }],
  });
  const updated = await prisma.eventRegistrationForm.findUnique({ where: { id: form.id } });
  assert.equal(updated.publishedVersion, 2);
  assert.equal(updated.revision, 3);
  const published = await prisma.eventRegistrationFormVersion.findFirst({ where: { formId: form.id, version: 2 } });
  const shirt = published.schema.find((field) => field.code === 'shirt_size');
  assert.equal(shirt.type, 'SELECT');
  assert.equal(shirt.options[0].id, saved.sizes[0].id);
  assert.equal(published.schema.some((field) => field.code === 'full_name'), true);
  const person = await reservation(ctx, 'Helena', 'CONFIRMED', { shirt_size: saved.sizes[0].id });
  assert.equal((await available(ctx.event.id, 'P')).available, 3);
  const found = await desk.search(people.operator.id, ctx.event.id, { kind: 'NAME', value: 'Helena' });
  assert.equal(found.items[0].reservationId, person.id);
  assert.equal(found.items[0].shirtPreference.label, 'P');
});

test('evento sem camisa e entrega antiga permanecem genéricos', async () => {
  const ctx = await eventIn(organizationId, people.owner.id);
  await desk.saveKit(people.owner.id, ctx.event.id, { name: 'Kit simples', shirtsEnabled: false, sizes: [] });
  const person = await reservation(ctx, 'Fabio', 'CONFIRMED');
  const delivered = await desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: person.id });
  assert.equal(delivered.sizeLabel, null);
  const row = await prisma.eventMaterialDelivery.findUnique({ where: { reservationId: person.id } });
  assert.equal(row.sizeId, null);

  const legacy = await reservation(ctx, 'Gabi', 'CONFIRMED');
  await prisma.eventMaterialDelivery.create({
    data: { reservationId: legacy.id, eventId: ctx.event.id, organizationId, actorUserId: people.operator.id },
  });
  const again = await desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: legacy.id });
  assert.equal(again.alreadyDelivered, true);
  await desk.reverseMaterial(people.operator.id, ctx.event.id, { reservationId: legacy.id, reason: 'entrega antiga desfeita' });
  const restored = await desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: legacy.id });
  assert.equal(restored.restored, true);
  assert.equal(restored.sizeLabel, null);
  const report = await desk.report(people.operator.id, ctx.event.id);
  assert.equal(report.kit.shirtsEnabled, false);
  assert.deepEqual(report.kit.sizes, []);
});
