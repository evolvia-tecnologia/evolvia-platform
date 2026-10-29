// G2.10: PostgreSQL real descartável, migrations aplicadas pelo CI.
// Não chama Asaas, não cria cobranças e não usa credenciais de produção.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test, { after } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { RegistrationReservationsService } from '../dist/registration-reservations.service.js';
import { RegistrationOrderCheckoutService } from '../dist/registration-order-checkout.service.js';

const prisma = new PrismaClient();
const reservations = new RegistrationReservationsService(
  prisma, { isConfigured: () => false }, { notifyRegistrationConfirmed: async () => {} },
);
const grouped = new RegistrationOrderCheckoutService(prisma, {}, {}, {});
const run = randomBytes(8).toString('hex');
after(() => prisma.$disconnect());

async function fixture(label, capacity = 2) {
  const suffix = randomBytes(5).toString('hex');
  const user = await prisma.user.create({ data: {
    name: 'G2.10 QA ' + label, email: 'g210-' + suffix + '@evolvia-ci.local', passwordHash: 'x',
  } });
  const organization = await prisma.organization.create({ data: {
    name: 'G2.10 QA ' + label, slug: 'g210-' + suffix, createdById: user.id,
  } });
  const event = await prisma.event.create({ data: {
    ownerId: user.id, organizationId: organization.id, name: 'G2.10 QA ' + label,
    slug: 'g210-event-' + suffix, eventType: 'Outro tipo de evento',
    format: 'IN_PERSON', registrationMode: 'PAID', status: 'PUBLISHED',
  } });
  const scope = { organizationId: organization.id, eventId: event.id };
  const catalog = await prisma.eventRegistrationCatalog.create({ data: scope });
  const category = await prisma.eventRegistrationCategory.create({ data: {
    ...scope, catalogId: catalog.id, code: 'GENERAL', name: 'Geral', capacity,
  } });
  const lot = await prisma.eventRegistrationLot.create({ data: {
    ...scope, categoryId: category.id, code: 'LOT', name: 'Lote',
    startsAt: new Date(Date.now() - 3600_000), endsAt: new Date(Date.now() + 86400_000),
    quantity: capacity, priceCents: 3000,
  } });
  await prisma.eventRegistrationTermsDocument.create({ data: {
    ...scope, storageKey: 'terms/g210/' + suffix + '.pdf', fileName: 'termos.pdf',
    byteSize: 10, checksumSha256: 'a'.repeat(64), version: 1, createdByUserId: user.id,
  } });
  return { event, organization, category, lot };
}

function order(ctx, label) {
  const entries = [0, 1].map((index) => {
    const id = 'PASS' + run + label + index;
    return {
      categoryId: ctx.category.id, lotId: ctx.lot.id,
      answers: {
        full_name: 'Participante ' + label + index, preferred_name: 'Pessoa ' + label,
        identity_document: id, email: 'g210-' + label + index + '-' + run + '@evolvia-ci.local',
        phone: '11999999999', terms_acceptance: true, registration_type: ctx.category.id,
      },
    };
  });
  const first = entries[0].answers;
  const party = { kind: 'PERSON', name: first.full_name, document: first.identity_document, email: first.email };
  return { entries, billing: { payer: party, recipient: party } };
}

test('G2.10 PostgreSQL Serializable: two concurrent 2-entry orders never oversell 2 seats', async () => {
  for (let round = 0; round < 2; round += 1) {
    const ctx = await fixture('race-' + round);
    const keyA = randomUUID();
    const keyB = randomUUID();
    const outcomes = await Promise.allSettled([
      reservations.reserveOrder(ctx.event.slug, order(ctx, 'A' + round), keyA),
      reservations.reserveOrder(ctx.event.slug, order(ctx, 'B' + round), keyB),
    ]);
    const success = outcomes.filter((item) => item.status === 'fulfilled');
    assert.equal(success.length, 1, 'exactly one atomic order wins');
    const failed = outcomes.find((item) => item.status === 'rejected');
    assert.equal(failed.reason.getStatus?.(), 409);
    const rows = await prisma.eventRegistrationReservation.findMany({
      where: { eventId: ctx.event.id, organizationId: ctx.organization.id },
    });
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.status === 'PENDING_PAYMENT'));
    assert.equal(await prisma.eventRegistrationOrder.count({
      where: { eventId: ctx.event.id, organizationId: ctx.organization.id },
    }), 1);
    const winnerIndex = outcomes.findIndex((item) => item.status === 'fulfilled');
    const winnerKey = winnerIndex === 0 ? keyA : keyB;
    const winnerBody = order(ctx, (winnerIndex === 0 ? 'A' : 'B') + round);
    const replay = await reservations.reserveOrder(ctx.event.slug, winnerBody, winnerKey);
    assert.equal(replay.orderId, success[0].value.orderId, 'idempotent replay cannot create more seats');
    assert.equal(await prisma.eventRegistrationReservation.count({ where: { eventId: ctx.event.id } }), 2);
  }
});

test('G2.10 PostgreSQL: status capability is scoped to event and organization', async () => {
  const first = await fixture('tenant-a');
  const second = await fixture('tenant-b');
  const key = randomUUID();
  const created = await reservations.reserveOrder(first.event.slug, order(first, 'tenant-a'), key);
  const own = await grouped.getStatus(first.event.slug, created.orderId, key);
  assert.equal(own.orderId, created.orderId);
  assert.equal(own.entries.length, 2);
  await assert.rejects(
    grouped.getStatus(second.event.slug, created.orderId, key),
    (error) => error.getStatus?.() === 404,
  );
  await assert.rejects(
    grouped.getStatus(first.event.slug, created.orderId, randomUUID()),
    (error) => error.getStatus?.() === 404,
  );
  assert.doesNotMatch(JSON.stringify(own), /g210-tenant-a0|PASS/u);
});
