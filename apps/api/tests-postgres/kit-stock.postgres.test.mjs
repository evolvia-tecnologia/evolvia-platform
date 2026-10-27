import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test, { after, before } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { AuthorizationService } from '../dist/authorization.service.js';
import { EventDeskService } from '../dist/event-desk.service.js';
import { kitCsv } from '../dist/kit-report.js';

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

test('tamanho com histórico não muda de nome e a recusa desfaz a gravação', async () => {
  const ctx = await eventIn(organizationId, people.owner.id);
  const saved = await desk.saveKit(people.owner.id, ctx.event.id, {
    name: 'Kit',
    shirtsEnabled: true,
    sizes: [{ label: 'P', stockQuantity: 1 }, { label: 'M', stockQuantity: 1 }, { label: 'G', stockQuantity: 3 }],
  });
  const small = saved.sizes.find((size) => size.label === 'P');
  const medium = saved.sizes.find((size) => size.label === 'M');
  const large = saved.sizes.find((size) => size.label === 'G');
  const first = await reservation(ctx, 'Joao', 'CONFIRMED', { shirt_size: small.id });
  const second = await reservation(ctx, 'Lia', 'CONFIRMED', { shirt_size: medium.id });
  await desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: first.id, sizeId: small.id });
  await desk.deliverMaterial(people.operator.id, ctx.event.id, {
    reservationId: second.id,
    sizeId: medium.id,
    confirmSizeChange: false,
  });
  await desk.reverseMaterial(people.operator.id, ctx.event.id, { reservationId: first.id, reason: 'ajuste de grade' });
  await desk.reverseMaterial(people.operator.id, ctx.event.id, { reservationId: second.id, reason: 'ajuste de grade' });

  await rejects(
    desk.saveKit(people.owner.id, ctx.event.id, {
      name: 'Kit alterado',
      shirtsEnabled: true,
      sizes: [
        { id: small.id, label: 'M', stockQuantity: 9 },
        { id: medium.id, label: 'P', stockQuantity: 8 },
        { id: large.id, label: 'GG', stockQuantity: 7 },
      ],
    }),
    409,
    /não pode ser renomeado/,
  );
  const config = await prisma.eventKitConfig.findUnique({ where: { eventId_organizationId: { eventId: ctx.event.id, organizationId } } });
  assert.equal(config.name, 'Kit');
  const afterReject = await prisma.eventKitSize.findMany({ where: { eventId: ctx.event.id }, orderBy: { label: 'asc' } });
  assert.deepEqual(afterReject.map((size) => [size.label, size.stockQuantity, size.active]), [['G', 3, true], ['M', 1, true], ['P', 1, true]]);
  const firstRow = await prisma.eventMaterialDelivery.findUnique({ where: { reservationId: first.id } });
  const secondRow = await prisma.eventMaterialDelivery.findUnique({ where: { reservationId: second.id } });
  assert.equal(firstRow.sizeId, small.id);
  assert.equal(secondRow.sizeId, medium.id);
  assert.equal(firstRow.requestedSizeLabel, 'P');
  assert.equal(secondRow.requestedSizeLabel, 'M');
  assert.notEqual(secondRow.requestedSizeLabel, 'P');

  const renamed = await desk.saveKit(people.owner.id, ctx.event.id, {
    name: 'Kit',
    shirtsEnabled: true,
    sizes: [
      { id: small.id, label: 'P', stockQuantity: 1 },
      { id: medium.id, label: 'M', stockQuantity: 1 },
      { id: large.id, label: 'GG', stockQuantity: 3 },
    ],
  });
  assert.equal(renamed.sizes.find((size) => size.id === large.id).label, 'GG');

  await desk.saveKit(people.owner.id, ctx.event.id, {
    name: 'Kit',
    shirtsEnabled: true,
    sizes: [{ id: small.id, label: 'P', stockQuantity: 1 }, { id: large.id, label: 'GG', stockQuantity: 3 }],
  });
  const parked = await prisma.eventKitSize.findUnique({ where: { id: medium.id } });
  assert.equal(parked.label, 'M');
  assert.equal(parked.active, false);
  await rejects(
    desk.saveKit(people.owner.id, ctx.event.id, {
      name: 'Kit renomeado',
      shirtsEnabled: true,
      sizes: [
        { id: small.id, label: 'P', stockQuantity: 4 },
        { id: medium.id, label: 'XG', stockQuantity: 4 },
        { id: large.id, label: 'GG', stockQuantity: 3 },
      ],
    }),
    409,
    /não pode ser renomeado/,
  );
  const stillParked = await prisma.eventKitSize.findUnique({ where: { id: medium.id } });
  const stillSmall = await prisma.eventKitSize.findUnique({ where: { id: small.id } });
  assert.equal(stillParked.label, 'M');
  assert.equal(stillParked.active, false);
  assert.equal(stillSmall.stockQuantity, 1);
  const reactivated = await desk.saveKit(people.owner.id, ctx.event.id, {
    name: 'Kit',
    shirtsEnabled: true,
    sizes: [
      { id: small.id, label: 'P', stockQuantity: 1 },
      { id: large.id, label: 'GG', stockQuantity: 3 },
      { label: 'M', stockQuantity: 4 },
    ],
  });
  assert.equal(reactivated.sizes.find((size) => size.label === 'M').id, medium.id);
  const rows = await prisma.eventKitSize.findMany({ where: { eventId: ctx.event.id, label: 'M' } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].active, true);
  assert.equal(rows[0].stockQuantity, 4);
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

test('relatório e CSV separam preferência, entrega, estorno e páginas', async () => {
  const ctx = await eventIn(organizationId, people.owner.id);
  const saved = await desk.saveKit(people.owner.id, ctx.event.id, {
    name: 'Kit',
    shirtsEnabled: true,
    sizes: [{ label: 'P', stockQuantity: 5 }, { label: 'M', stockQuantity: 1 }, { label: 'G', stockQuantity: 5 }],
  });
  const small = saved.sizes.find((size) => size.label === 'P');
  const medium = saved.sizes.find((size) => size.label === 'M');
  const large = saved.sizes.find((size) => size.label === 'G');
  const before = await desk.kitReport(people.operator.id, ctx.event.id, {});
  assert.equal(before.kit.sizes.find((size) => size.label === 'M').available, 1);
  assert.equal(before.kit.sizes.find((size) => size.label === 'M').delivered, 0);
  assert.equal(before.total, 0);

  const ana = await reservation(ctx, 'Ana', 'CONFIRMED', { shirt_size: medium.id });
  const bia = await reservation(ctx, 'Bia', 'CONFIRMED', { shirt_size: medium.id });
  const caio = await reservation(ctx, 'Caio', 'CONFIRMED', { shirt_size: small.id });
  const formula = await reservation(ctx, 'Eva', 'CONFIRMED', { shirt_size: large.id, preferred_name: '=João "Lia"; @calc' });
  await prisma.eventRegistrationReservation.update({ where: { id: ana.id }, data: { protocol: `${token}-ana`.slice(0, 32) } });
  await prisma.eventRegistrationReservation.update({ where: { id: bia.id }, data: { protocol: `${token}-bia`.slice(0, 32) } });
  await prisma.eventRegistrationReservation.update({ where: { id: formula.id }, data: { protocol: `${token}-eva`.slice(0, 32) } });

  assert.equal((await available(ctx.event.id, 'M')).available, 1);
  const delivered = await desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: ana.id, sizeId: medium.id });
  assert.equal(delivered.alreadyDelivered, false);
  const repeated = await desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: ana.id, sizeId: medium.id });
  assert.equal(repeated.alreadyDelivered, true);
  assert.equal((await available(ctx.event.id, 'M')).delivered, 1);
  await desk.deliverMaterial(people.operator.id, ctx.event.id, {
    reservationId: bia.id,
    sizeId: large.id,
    confirmSizeChange: true,
  });
  await desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: formula.id, sizeId: large.id });
  const duda = await reservation(ctx, 'Duda', 'CONFIRMED', { shirt_size: small.id });
  await prisma.eventRegistrationReservation.update({ where: { id: duda.id }, data: { protocol: `${token}-dud`.slice(0, 32) } });
  await desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: duda.id, sizeId: small.id });
  await desk.reverseMaterial(people.operator.id, ctx.event.id, { reservationId: duda.id, reason: 'camisa devolvida na mesa' });
  await rejects(
    desk.reverseMaterial(people.operator.id, ctx.event.id, { reservationId: duda.id, reason: 'camisa devolvida na mesa' }),
    404,
  );

  const sameInstant = new Date('2026-10-03T15:00:00.000Z');
  await prisma.eventMaterialDelivery.update({ where: { reservationId: ana.id }, data: { deliveredAt: sameInstant } });
  await prisma.eventMaterialDelivery.update({ where: { reservationId: bia.id }, data: { deliveredAt: sameInstant } });
  await prisma.eventMaterialDelivery.update({ where: { reservationId: formula.id }, data: { deliveredAt: new Date('2026-10-01T12:00:00.000Z') } });
  await prisma.eventMaterialDelivery.update({ where: { reservationId: duda.id }, data: { deliveredAt: new Date('2026-09-01T12:00:00.000Z') } });

  const page = await desk.kitReport(people.operator.id, ctx.event.id, { page: '1', pageSize: '1' });
  assert.equal(page.total, 5);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].protocol, `${token}-ana`.slice(0, 32));
  assert.equal(page.items[0].requestedSizeLabel, 'M');
  assert.equal(page.items[0].deliveredSizeLabel, 'M');
  assert.equal(page.items[0].situation, 'ENTREGUE');
  const second = await desk.kitReport(people.operator.id, ctx.event.id, { page: '2', pageSize: '1' });
  assert.equal(second.items[0].protocol, `${token}-bia`.slice(0, 32));
  assert.equal(second.items[0].requestedSizeLabel, 'M');
  assert.equal(second.items[0].deliveredSizeLabel, 'G');
  const pending = await desk.kitReport(people.operator.id, ctx.event.id, { situation: 'PENDENTE' });
  assert.equal(pending.total, 1);
  assert.equal(pending.items[0].name, 'Caio');
  assert.equal(pending.items[0].requestedSizeLabel, 'P');
  assert.equal(pending.items[0].deliveredSizeLabel, 'Não informado');
  assert.equal(pending.items[0].at, null);
  const reversed = await desk.kitReport(people.operator.id, ctx.event.id, { situation: 'ESTORNADO' });
  assert.equal(reversed.items[0].name, 'Duda');
  assert.equal(reversed.items[0].deliveredSizeLabel, 'P');
  const bySize = await desk.kitReport(people.operator.id, ctx.event.id, { sizeId: large.id, situation: 'ENTREGUE' });
  assert.deepEqual(bySize.items.map((item) => item.protocol), [`${token}-bia`.slice(0, 32), `${token}-eva`.slice(0, 32)]);
  const period = await desk.kitReport(people.operator.id, ctx.event.id, { from: '2026-10-02', to: '2026-10-03' });
  assert.deepEqual(period.items.map((item) => item.protocol), [`${token}-ana`.slice(0, 32), `${token}-bia`.slice(0, 32)]);
  const outside = await desk.kitReport(people.operator.id, ctx.event.id, { from: '2026-11-01', to: '2026-11-02', situation: 'PENDENTE' });
  assert.equal(outside.total, 0);
  assert.equal(JSON.stringify(page.items).includes('documento-secreto'), false);
  assert.equal(JSON.stringify(page.items).includes('@evolvia-ci.local'), false);
  assert.equal(JSON.stringify(page.items).includes(ana.id), false);

  const csv = await desk.exportKitReport(people.owner.id, ctx.event.id, { sizeId: large.id, situation: 'ENTREGUE' });
  assert.equal(csv, kitCsv(bySize.items));
  assert.match(csv, /João/u);
  assert.match(csv, /'=João ""Lia""; @calc/u);
  assert.equal(csv.includes('documento-secreto'), false);
  assert.equal(csv.includes('@evolvia-ci.local'), false);
  assert.equal(csv.includes(formula.id), false);
  assert.equal(csv.includes(large.id), false);
  await rejects(desk.exportKitReport(people.operator.id, ctx.event.id, { situation: 'ENTREGUE' }), 404, /Evento não encontrado/);
  await rejects(desk.kitReport(people.viewer.id, ctx.event.id, {}), 404);
  await rejects(desk.exportKitReport(people.viewer.id, ctx.event.id, {}), 404);
  const other = await eventIn(otherOrganizationId, people.outsider.id);
  await rejects(desk.kitReport(people.owner.id, other.event.id, {}), 404);
  await rejects(desk.kitReport(people.outsider.id, ctx.event.id, { sizeId: medium.id }), 404);
  await rejects(desk.kitReport(people.owner.id, ctx.event.id, { sizeId: 'tamanho-de-outro-evento' }), 400, /deste evento/);

  await desk.reverseMaterial(people.operator.id, ctx.event.id, { reservationId: ana.id, reason: 'última camisa conferida' });
  const after = await available(ctx.event.id, 'M');
  assert.equal(after.forecast, 1);
  assert.equal(after.delivered, 0);
  assert.equal(after.available, 1);
  const history = await prisma.eventMaterialDelivery.findUnique({ where: { reservationId: ana.id }, include: { size: true } });
  assert.equal(history.size.label, 'M');
  assert.equal(history.requestedSizeLabel, 'M');
  assert.ok(history.reversedAt);
  const anaReport = await desk.kitReport(people.operator.id, ctx.event.id, { situation: 'ESTORNADO', sizeId: medium.id });
  assert.equal(anaReport.items.some((item) => item.protocol === `${token}-ana`.slice(0, 32) && item.deliveredSizeLabel === 'M'), true);
});


test('remover tamanho com entrega ativa retorna conflito e preserva configuração e auditoria', async () => {
  const ctx = await eventIn(organizationId, people.owner.id);
  const saved = await desk.saveKit(people.owner.id, ctx.event.id, {
    name: 'Kit original', shirtsEnabled: true,
    sizes: [{ label: 'M', stockQuantity: 2 }, { label: 'G', stockQuantity: 1 }],
  });
  const medium = saved.sizes.find((size) => size.label === 'M');
  const large = saved.sizes.find((size) => size.label === 'G');
  const person = await reservation(ctx, 'Camila ativa', 'CONFIRMED', { shirt_size: medium.id });
  await desk.deliverMaterial(people.operator.id, ctx.event.id, { reservationId: person.id, sizeId: medium.id });
  const before = await desk.kit(people.owner.id, ctx.event.id);
  const auditCount = await prisma.auditLog.count({ where: { eventId: ctx.event.id } });
  await rejects(desk.saveKit(people.owner.id, ctx.event.id, {
    name: 'Kit alterado', shirtsEnabled: true,
    sizes: [{ id: large.id, label: 'G', stockQuantity: 9 }],
  }), 409, /ainda tem camisas entregues/);
  assert.deepEqual(await desk.kit(people.owner.id, ctx.event.id), before);
  assert.equal(await prisma.auditLog.count({ where: { eventId: ctx.event.id } }), auditCount);
  const delivery = await prisma.eventMaterialDelivery.findUnique({ where: { reservationId: person.id }, include: { size: true } });
  assert.equal(delivery.sizeId, medium.id);
  assert.equal(delivery.size.label, 'M');
  assert.equal(delivery.size.active, true);
  assert.equal(delivery.reversedAt, null);
});

test('primeira configuração serializa duas conexões mesmo sem tamanhos existentes', { timeout: 30000 }, async () => {
  const ctx = await eventIn(organizationId, people.owner.id);
  const scope = { eventId: ctx.event.id, organizationId };
  const firstLocked = Promise.withResolvers();
  const secondStarted = Promise.withResolvers();
  const release = Promise.withResolvers();
  const clients = [new PrismaClient(), new PrismaClient()];
  let secondPid;
  const wait = async (promise) => {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Barreira da configuração não alcançada.')), 8000);
      })]);
    } finally { clearTimeout(timer); }
  };
  const instruments = clients.map((client, index) => new Proxy(client, { get(target, key) {
    if (key !== '$transaction') return Reflect.get(target, key);
    return (callback, options) => client.$transaction((tx) => callback(new Proxy(tx, { get(targetTx, method) {
      if (method !== '$queryRaw') return Reflect.get(targetTx, method);
      return async (strings, ...values) => {
        const isEventLock = /FROM\s+"Event"\s/u.test(strings.join('?')) && /FOR UPDATE/u.test(strings.join('?'));
        if (isEventLock && index === 1) {
          const [row] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
          secondPid = row.pid;
          secondStarted.resolve();
        }
        const rows = await tx.$queryRaw(strings, ...values);
        if (isEventLock && index === 0) {
          firstLocked.resolve();
          await wait(release.promise);
        }
        return rows;
      };
    } })), { ...options, timeout: 20000 });
  } }));
  const services = instruments.map((client) => new EventDeskService(client, new AuthorizationService(client)));
  let first;
  let second;
  try {
    first = services[0].saveKit(people.owner.id, ctx.event.id, {
      name: 'Kit primeiro', shirtsEnabled: true, sizes: [{ label: 'P', stockQuantity: 2 }],
    });
    // Observe settlement immediately so a failed barrier never creates an unhandled rejection.
    const firstResult = Promise.allSettled([first]);
    await wait(firstLocked.promise);
    second = services[1].saveKit(people.owner.id, ctx.event.id, {
      name: 'Kit segundo', shirtsEnabled: true, sizes: [{ label: 'M', stockQuantity: 3 }],
    });
    const secondResult = Promise.allSettled([second]);
    await wait(secondStarted.promise);
    const deadline = Date.now() + 5000;
    let blocked = false;
    while (Date.now() < deadline) {
      const [row] = await prisma.$queryRaw`SELECT cardinality(pg_blocking_pids(${secondPid}::integer)) > 0 AS blocked`;
      if (row.blocked) { blocked = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.equal(blocked, true, 'a segunda conexão deve aguardar o lock real no PostgreSQL');
    assert.equal(await prisma.eventKitConfig.count({ where: scope }), 0);
    assert.equal(await prisma.eventKitSize.count({ where: scope }), 0);
    release.resolve();
    const outcomes = [...await firstResult, ...await secondResult];
    assert.ok(outcomes.every((outcome) => outcome.status === 'fulfilled'), outcomes.map((outcome) => outcome.reason?.message).join('; '));
    const config = await prisma.eventKitConfig.findUnique({ where: { eventId_organizationId: scope } });
    assert.equal(config.name, 'Kit segundo');
    const sizes = await prisma.eventKitSize.findMany({ where: scope });
    assert.deepEqual(sizes.map((size) => [size.label, size.stockQuantity]), [['M', 3]]);
    const form = await prisma.eventRegistrationForm.findUnique({ where: { eventId_organizationId: scope } });
    assert.deepEqual(form.fields.find((field) => field.code === 'shirt_size').options, [{ id: sizes[0].id, label: 'M' }]);
    assert.equal(await prisma.auditLog.count({ where: { ...scope, action: 'kit.config_updated' } }), 2);
  } finally {
    release.resolve();
    await Promise.allSettled([first, second].filter(Boolean));
    await Promise.all(clients.map((client) => client.$disconnect()));
  }
});

