// G2.10: PostgreSQL real descartável, migrations aplicadas pelo CI.
// Não chama Asaas, não cria cobranças e não usa credenciais de produção.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import test, { after } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { RegistrationReservationsService } from '../dist/registration-reservations.service.js';
import { RegistrationOrderCheckoutService } from '../dist/registration-order-checkout.service.js';
import { asaasStubPaidWebhook } from '../dist/asaas-checkout-policy.js';

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
  const storedOrder = await prisma.eventRegistrationOrder.findUniqueOrThrow({ where: { id: created.orderId } });
  const originalBilling = order(first, 'tenant-a').billing;
  const expectedBilling = Object.fromEntries(Object.entries(originalBilling).map(([role, party]) => [
    role, { ...party, document: party.document.replace(/[^A-Za-z0-9]/g, '').toUpperCase() },
  ]));
  assert.deepEqual(storedOrder.billingSnapshot, expectedBilling,
    'dados de cobrança normalizados devem residir somente no pedido agrupado');
  const participantRows = await prisma.eventRegistrationReservation.findMany({
    where: { eventId: first.event.id, organizationId: first.organization.id },
    select: { billingSnapshot: true },
  });
  assert.equal(participantRows.length, 2);
  assert.ok(participantRows.every((row) => row.billingSnapshot === null),
    'nenhuma cópia do pagador nas reservas individuais');
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

test('G2.10 PostgreSQL: webhook pago reverte toda a transação se a confirmação agrupada falhar após a escrita', async () => {
  // Somente banco descartável do CI e evento Asaas simulado: nenhuma cobrança ou e-mail real.
  const names = ['ASAAS_MODE', 'EVOLVIA_CI_MODE', 'NODE_ENV', 'ASAAS_WEBHOOK_TOKEN'];
  const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const token = 'g210-postgres-webhook-token-test-123456789';
  Object.assign(process.env, {
    ASAAS_MODE: 'ci_stub', EVOLVIA_CI_MODE: '1',
    NODE_ENV: 'test', ASAAS_WEBHOOK_TOKEN: token,
  });
  try {
    const ctx = await fixture('paid-rollback', 2);
    const key = randomUUID();
    const reserved = await reservations.reserveOrder(ctx.event.slug, order(ctx, 'paid-rollback'), key);
    const providerCheckoutId = 'chk_g210_' + randomBytes(10).toString('hex');
    const providerEventId = 'stub_' + providerCheckoutId;
    const checkout = await prisma.eventRegistrationOrderCheckout.create({ data: {
      organizationId: ctx.organization.id, eventId: ctx.event.id,
      orderId: reserved.orderId, provider: 'ASAAS', providerCheckoutId,
      idempotencyKeyHash: createHash('sha256').update(key).digest('hex'),
      requestHash: 'a'.repeat(64), status: 'ACTIVE', amountCents: 6000,
      expiresAt: new Date(Date.now() + 20 * 60_000),
    } });
    const payload = asaasStubPaidWebhook(providerCheckoutId, 6000);
    const injectedPrisma = {
      $transaction: (callback, options) => prisma.$transaction(async (tx) => {
        let confirmations = 0;
        const intercepted = new Proxy(tx, {
          get(target, property) {
            if (property === 'eventRegistrationReservation') return {
              updateMany: async (input) => {
                confirmations += 1;
                // A confirmação é agrupada: falhar DEPOIS da escrita prova rollback real.
                const result = await target.eventRegistrationReservation.updateMany(input);
                assert.equal(confirmations, 1, 'deve haver uma única atualização agrupada');
                assert.equal(result.count, 2, 'ambas as reservas devem ser alcançadas');
                throw new Error('simulated_post_batch_confirmation_failure');
              },
            };
            return target[property];
          },
        });
        return callback(intercepted);
      }, options),
    };
    const blocked = new RegistrationOrderCheckoutService(injectedPrisma, {}, {}, {
      notifyRegistrationConfirmed: async () => assert.fail('Notificação não pode sair de transação revertida'),
    });
    await assert.rejects(
      () => blocked.receiveWebhook(token, payload),
      /simulated_post_batch_confirmation_failure/,
    );
    const scope = { eventId: ctx.event.id, organizationId: ctx.organization.id };
    const afterFailure = await prisma.eventRegistrationReservation.findMany({
      where: scope, select: { status: true, confirmedAt: true },
    });
    assert.equal(afterFailure.length, 2);
    assert.ok(afterFailure.every((row) => row.status === 'PENDING_PAYMENT' && row.confirmedAt === null));
    assert.equal((await prisma.eventRegistrationOrder.findUniqueOrThrow({
      where: { id: reserved.orderId },
    })).status, 'PENDING_PAYMENT');
    assert.equal((await prisma.eventRegistrationOrderCheckout.findUniqueOrThrow({
      where: { id: checkout.id },
    })).status, 'ACTIVE');
    assert.equal(await prisma.asaasCheckoutWebhookEvent.count({
      where: { providerEventId },
    }), 0, 'Inbox do webhook também precisa reverter');

    const notices = [];
    const live = new RegistrationOrderCheckoutService(prisma, {}, {}, {
      notifyRegistrationConfirmed: async (notice) => notices.push(notice),
    });
    const confirmed = await live.receiveWebhook(token, payload);
    assert.equal(confirmed.accepted, true);
    const afterSuccess = await prisma.eventRegistrationReservation.findMany({
      where: scope, select: { status: true, confirmedAt: true },
    });
    assert.ok(afterSuccess.every((row) => row.status === 'CONFIRMED' && row.confirmedAt));
    assert.equal((await prisma.eventRegistrationOrder.findUniqueOrThrow({
      where: { id: reserved.orderId },
    })).status, 'CONFIRMED');
    assert.equal((await prisma.eventRegistrationOrderCheckout.findUniqueOrThrow({
      where: { id: checkout.id },
    })).status, 'PAID');
    const webhookInbox = await prisma.asaasCheckoutWebhookEvent.findUniqueOrThrow({
      where: { providerEventId },
    });
    assert.equal(webhookInbox.checkoutId, null, 'legacy checkout FK must remain unused');
    assert.equal(webhookInbox.orderCheckoutId, checkout.id, 'grouped webhook must bind to the order checkout');
    assert.equal(webhookInbox.eventId, ctx.event.id, 'webhook must retain event scope');
    assert.equal(webhookInbox.organizationId, ctx.organization.id, 'webhook must retain tenant scope');
    assert.ok(webhookInbox.processedAt, 'webhook inbox must be committed with confirmations');
    assert.equal(notices.length, 2);
    assert.deepEqual(await live.receiveWebhook(token, payload), {
      accepted: true, queued: false, duplicate: true,
    });
    assert.equal(notices.length, 2, 'Replay não pode duplicar notificações');
  } finally {
    for (const name of names) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
  }
});
