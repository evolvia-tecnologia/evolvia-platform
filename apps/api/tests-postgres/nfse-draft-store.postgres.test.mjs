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

test('prévia fiscal HTTP persiste uma vez e revalida organização, recibo e pagamento', async t => {
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
  const setup = { issuerId: 'issuer', recipientId: 'recipient', serviceCode: '12.01', municipalityIbgeCode: '3550308' };
  const send = (auth, body) => fetch(url, { method: body === undefined ? 'GET' : 'PUT',
    headers: { 'content-type': 'application/json', ...(auth && { authorization: 'Bearer ' + auth }) }, body: JSON.stringify(body) });
  assert.equal((await send(null)).status, 401);
  assert.equal((await send(outsider.token, setup)).status, 404);
  assert.equal((await send(token)).status, 404);
  assert.equal((await send(token, {})).status, 400);
  const requests = await Promise.all(Array.from({ length: 6 }, () => send(token, { ...setup, amountCents: 1, issueAuthorized: true })));
  for (const response of requests) {
    assert.equal(response.status, 200);
    const draft = await response.json();
    assert.equal(draft.amountCents, 750);
    assert.equal(draft.issueAuthorized, false);
    assert.equal(draft.status, 'AWAITING_MUNICIPAL_ADAPTER');
  }
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
