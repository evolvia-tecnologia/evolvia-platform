import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { AuthGuard } from '../dist/auth.guard.js';
import { AuthorizationService } from '../dist/authorization.service.js';
import { PrismaService } from '../dist/prisma.service.js';
import { EventFinancialResponsibilityController } from '../dist/event-financial-responsibility.controller.js';
import { EventFinancialResponsibilityService } from '../dist/event-financial-responsibility.service.js';

async function fiscalFixture(t) {
  const db = new PrismaClient();
  t.after(() => db.$disconnect());
  class FiscalTestModule {}
  Module({
    imports: [JwtModule.register({ secret: randomUUID() })],
    controllers: [EventFinancialResponsibilityController],
    providers: [AuthGuard, AuthorizationService, EventFinancialResponsibilityService, { provide: PrismaService, useValue: db }],
  })(FiscalTestModule);
  const app = await NestFactory.create(FiscalTestModule, { logger: false });
  t.after(() => app.close());
  const server = await app.listen(0, '127.0.0.1');
  async function createOwner() {
    const slug = randomUUID();
    const owner = await db.user.create({ data: { name: 'Teste fiscal', email: slug + '@example.invalid', passwordHash: 'fixture' } });
    const org = await db.organization.create({ data: { name: 'Fiscal', slug, createdById: owner.id,
      memberships: { create: { userId: owner.id, role: 'OWNER', status: 'ACTIVE' } } } });
    return { owner, org, token: app.get(JwtService).sign({ sub: owner.id, email: owner.email }) };
  }
  const { owner, org, token } = await createOwner();
  const outsider = await createOwner();
  const event = await db.event.create({ data: { name: 'Teste fiscal', slug: randomUUID(), eventType: 'Outro',
    format: 'IN_PERSON', registrationMode: 'PAID', status: 'CANCELLED', ownerId: owner.id, organizationId: org.id } });
  const scope = { organizationId: org.id, eventId: event.id };
  const catalog = await db.eventRegistrationCatalog.create({ data: scope });
  const category = await db.eventRegistrationCategory.create({ data: { ...scope, catalogId: catalog.id, code: 'G', name: 'Geral' } });
  const lot = await db.eventRegistrationLot.create({ data: { ...scope, categoryId: category.id, code: 'L', name: 'Lote',
    startsAt: new Date('2026-01-01'), endsAt: new Date('2026-12-01'), priceCents: 750 } });
  const paidAt = new Date('2026-10-01');
  const reservation = await db.eventRegistrationReservation.create({ data: { ...scope, categoryId: category.id, lotId: lot.id,
    protocol: randomUUID().slice(0,16), idempotencyKeyHash: randomUUID(), payloadHash: randomUUID(), identityHash: randomUUID(), emailHash: randomUUID(),
    registrationData: {}, basePriceCents: 750, finalPriceCents: 750, status: 'CONFIRMED', confirmedAt: paidAt } });
  const checkout = await db.eventRegistrationCheckout.create({ data: { ...scope, reservationId: reservation.id,
    idempotencyKeyHash: randomUUID(), requestHash: randomUUID(), amountCents: 750, expiresAt: paidAt, paidAt, status: 'PAID' } });
  const receipt = await db.eventRegistrationPaymentReceipt.create({ data: { ...scope, reservationId: reservation.id, checkoutId: checkout.id,
    number: randomUUID().slice(0,20), sellerSnapshot: {}, amountCents: 750, paidAt } });
  const url = 'http://127.0.0.1:' + server.address().port + '/events/' + event.id + '/financial-responsibility/receipts/' + receipt.id + '/nfse-draft';
  const setup = { issuerId: org.id, recipientId: 'recipient', serviceCode: '12.01', municipalityIbgeCode: '3550308' };
  const send = (auth, body) => fetch(url, { method: body === undefined ? 'GET' : 'PUT',
    headers: { 'content-type': 'application/json', ...(auth && { authorization: 'Bearer ' + auth }) }, body: JSON.stringify(body) });
  return { db, org, owner, token, outsider, checkout, receipt, url, setup, send };
}

test('prévia fiscal HTTP persiste uma vez e revalida organização, recibo e pagamento', async t => {
  const { db, token, outsider, checkout, receipt, url, setup, send } = await fiscalFixture(t);
  assert.equal((await send(null)).status, 401);
  assert.equal((await send(outsider.token, setup)).status, 404);
  assert.equal((await send(token)).status, 404);
  assert.equal((await send(token, {})).status, 400);
  assert.equal((await send(token, { ...setup, issuerId: outsider.org.id })).status, 400);
  const sibling = await db.event.create({ data: { organizationId: receipt.organizationId, ownerId: (await db.organization.findUniqueOrThrow({ where: { id: receipt.organizationId } })).createdById,
    name: 'Outro evento', slug: randomUUID(), eventType: 'Outro', registrationMode: 'PAID', format: 'IN_PERSON' } });
  const otherEventUrl = url.replace('/events/' + receipt.eventId + '/', '/events/' + sibling.id + '/');
  assert.equal((await fetch(otherEventUrl, { method: 'PUT', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(setup) })).status, 404);
  const requests = await Promise.all(Array.from({ length: 6 }, () => send(token, { ...setup, amountCents: 1, issueAuthorized: true })));
  for (const response of requests) {
    assert.equal(response.status, 200);
    const draft = await response.json();
    assert.equal(draft.amountCents, 750);
    assert.equal(draft.issueAuthorized, false);
    assert.equal(draft.status, 'AWAITING_MUNICIPAL_ADAPTER');
  }
  const audits = await db.auditLog.findMany({ where: { entityId: receipt.id, action: 'nfse.draft_prepared' } });
  assert.equal(audits.length, 1);
  assert.equal(audits[0].metadata, null);
  assert.equal(audits[0].organizationId, receipt.organizationId);
  assert.equal(await db.fiscalReceiptDraft.count({ where: { receiptId: receipt.id } }), 1);
  assert.equal((await send(token, { ...setup, recipientId: 'other' })).status, 409);
  assert.equal((await (await send(token)).json()).recipientId, setup.recipientId);
  assert.equal((await send(outsider.token)).status, 404);
  const headers = { authorization: 'Bearer ' + token };
  for (const provider of ['enotas', 'notazz']) {
    const adapterUrl = url + '/adapters/' + provider;
    assert.equal((await fetch(adapterUrl, { headers: { authorization: 'Bearer ' + outsider.token } })).status, 404);
    const response = await fetch(adapterUrl, { headers });
    assert.equal(response.status, 200);
    const preview = await response.json();
    assert.equal(preview.provider, provider);
    assert.equal(preview.operation, 'PREVIEW');
    assert.equal(preview.issueAuthorized, false);
    assert.equal(preview.service.amountCents, 750);
    assert.equal(preview.source.receiptId, receipt.id);
    assert.equal(preview.idempotencyKey, (await (await send(token)).json()).idempotencyKey);
  }
  assert.equal((await fetch(url + '/adapters/unknown', { headers })).status, 404);
  await db.eventRegistrationCheckout.update({ where: { id: checkout.id }, data: { status: 'CANCELED' } });
  assert.equal((await send(token)).status, 404);
});

test('dois tomadores concorrentes e revogação do OWNER preservam a primeira prévia', async t => {
  const { db, org, owner, token, receipt, url, setup, send } = await fiscalFixture(t);
  const proposals = [setup, { ...setup, recipientId: 'segundo-tomador' }];
  const responses = await Promise.all(proposals.map(body => send(token, body)));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const winner = responses.findIndex(response => response.status === 200);
  const draft = await responses[winner].json();
  assert.equal(draft.recipientId, proposals[winner].recipientId);
  assert.deepEqual(await (await send(token, proposals[winner])).json(), draft);
  const membership = await db.organizationMembership.findFirstOrThrow({ where: { userId: owner.id, organizationId: org.id } });
  await db.organizationMembership.update({ where: { id: membership.id }, data: { role: 'ADMIN' } });
  assert.equal((await send(token)).status, 404);
  assert.equal((await send(token, proposals[winner])).status, 404);
  for (const provider of ['enotas', 'notazz']) {
    assert.equal((await fetch(url + '/adapters/' + provider, { headers: { authorization: 'Bearer ' + token } })).status, 404);
  }
  const stored = await db.fiscalReceiptDraft.findUniqueOrThrow({ where: { receiptId: receipt.id } });
  assert.equal(stored.recipientId, proposals[winner].recipientId);
  assert.equal(stored.idempotencyKey, draft.idempotencyKey);
});

test('revogação confirmada depois da leitura impede gravar rascunho e auditoria', async t => {
  const { db, org, owner, receipt, setup } = await fiscalFixture(t);
  const { readOrPrepareFiscalDraft } = await import('../dist/nfse-draft-store.js');
  let revoked = false;
  const instrumented = db.$extends({ query: { eventRegistrationPaymentReceipt: {
    async findFirst({ args, query }) {
      const result = await query(args);
      if (result && !revoked) {
        const change = await db.organizationMembership.updateMany({ where: { userId: owner.id, organizationId: org.id }, data: { role: 'ADMIN' } });
        assert.equal(change.count, 1);
        revoked = true;
      }
      return result;
    },
  } } });
  await assert.rejects(readOrPrepareFiscalDraft(instrumented, owner.id, receipt.eventId, receipt.id, { setup }),
    error => error.getStatus?.() === 404);
  assert.equal(revoked, true);
  assert.equal(await db.fiscalReceiptDraft.count({ where: { receiptId: receipt.id } }), 0);
  assert.equal(await db.auditLog.count({ where: { entityId: receipt.id, action: 'nfse.draft_prepared' } }), 0);
});

test('cancelamento do checkout após a leitura impede persistir prévia e auditoria', async t => {
  const { db, owner, checkout, receipt, setup } = await fiscalFixture(t);
  const { readOrPrepareFiscalDraft } = await import('../dist/nfse-draft-store.js');
  let cancelled = false;
  const instrumented = db.$extends({ query: { eventRegistrationPaymentReceipt: {
    async findFirst({ args, query }) {
      const result = await query(args);
      if (result && !cancelled) {
        await db.eventRegistrationCheckout.update({ where: { id: checkout.id }, data: { status: 'CANCELED' } });
        cancelled = true;
      }
      return result;
    },
  } } });
  await assert.rejects(readOrPrepareFiscalDraft(instrumented, owner.id, receipt.eventId, receipt.id, { setup }),
    error => error.getStatus?.() === 404);
  assert.equal(cancelled, true);
  assert.equal(await db.fiscalReceiptDraft.count({ where: { receiptId: receipt.id } }), 0);
  assert.equal(await db.auditLog.count({ where: { entityId: receipt.id, action: 'nfse.draft_prepared' } }), 0);
});
