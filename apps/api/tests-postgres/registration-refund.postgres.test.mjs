// Executa contra um PostgreSQL descartável com as migrations aplicadas (DATABASE_URL).
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test, { after, before } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { AuthorizationService } from '../dist/authorization.service.js';
import { participantHash } from '../dist/participant-area-policy.js';
import { RegistrationRefundService } from '../dist/registration-refund.service.js';

const run = randomBytes(4).toString('hex');
const prisma = new PrismaClient();
const refunds = new RegistrationRefundService(prisma, new AuthorizationService(prisma));
const people = {};
let organizationId;
let otherOrganizationId;
const reason = 'Não poderei comparecer a este evento.';
const note = 'A inscrição está dentro da regra aceita.';

function digest() {
  return randomBytes(32).toString('hex');
}

async function user(key, extra = {}) {
  people[key] = await prisma.user.create({
    data: { name: `PG ${key}`, email: `${key}-${run}@evolvia-ci.local`, passwordHash: 'x', ...extra },
  });
  return people[key];
}

async function insertEvent(orgId, data = {}) {
  return prisma.event.create({
    data: {
      ownerId: people.owner.id,
      organizationId: orgId,
      name: `Reembolso ${run}`,
      slug: `reembolso-${run}-${randomBytes(3).toString('hex')}`,
      eventType: 'Outro tipo de evento',
      format: 'IN_PERSON',
      registrationMode: 'PAID',
      status: 'PUBLISHED',
      ...data,
    },
  });
}

async function catalog(event) {
  const created = await prisma.eventRegistrationCatalog.create({
    data: { organizationId: event.organizationId, eventId: event.id },
  });
  const category = await prisma.eventRegistrationCategory.create({
    data: {
      organizationId: event.organizationId,
      eventId: event.id,
      catalogId: created.id,
      code: `cat-${randomBytes(2).toString('hex')}`,
      name: 'Geral',
    },
  });
  const lot = await prisma.eventRegistrationLot.create({
    data: {
      organizationId: event.organizationId,
      eventId: event.id,
      categoryId: category.id,
      code: `lot-${randomBytes(2).toString('hex')}`,
      name: 'Lote',
      startsAt: new Date('2026-01-01T00:00:00.000Z'),
      endsAt: new Date('2026-12-31T00:00:00.000Z'),
      priceCents: 15000,
    },
  });
  return { category, lot };
}

async function reservation(event, lot, category, input) {
  const confirmed = input.status === 'CONFIRMED';
  return prisma.eventRegistrationReservation.create({
    data: {
      organizationId: event.organizationId,
      eventId: event.id,
      categoryId: category.id,
      lotId: lot.id,
      protocol: `EVO-${randomBytes(8).toString('hex').toUpperCase()}`,
      idempotencyKeyHash: digest(),
      payloadHash: digest(),
      identityHash: input.identityHash,
      emailHash: input.emailHash,
      registrationData: { channel: 'refund-test' },
      basePriceCents: input.priceCents,
      finalPriceCents: input.priceCents,
      status: input.status,
      expiresAt: confirmed ? null : new Date(Date.now() + 3_600_000),
      confirmedAt: confirmed ? new Date('2026-10-01T12:00:00.000Z') : null,
    },
  });
}

async function checkout(row, status) {
  return prisma.eventRegistrationCheckout.create({
    data: {
      organizationId: row.organizationId,
      eventId: row.eventId,
      reservationId: row.id,
      idempotencyKeyHash: digest(),
      requestHash: digest(),
      amountCents: row.finalPriceCents,
      expiresAt: new Date(Date.now() + 3_600_000),
      status,
      paidAt: status === 'PAID' ? new Date('2026-10-01T12:05:00.000Z') : null,
    },
  });
}

async function link(userId, identityHash, email) {
  const emailHash = participantHash(email.trim().toLowerCase());
  await prisma.participantIdentityLink.create({ data: { userId, identityHash, emailHash } });
  return emailHash;
}

async function rejects(promise, status, pattern) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.getStatus?.(), status, error.message);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

before(async () => {
  await user('owner');
  await user('operator');
  await user('viewer');
  await user('outsider');
  await user('buyer', { emailVerifiedAt: new Date('2026-09-01T00:00:00.000Z') });
  await user('unverified');
  const organization = await prisma.organization.create({
    data: { name: `Org ${run}`, slug: `org-${run}`, createdById: people.owner.id },
  });
  organizationId = organization.id;
  const other = await prisma.organization.create({
    data: { name: `Outra ${run}`, slug: `outra-${run}`, createdById: people.outsider.id },
  });
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
  await prisma.event.updateMany({
    where: { name: { startsWith: `Reembolso ${run}` }, status: 'PUBLISHED' },
    data: { status: 'CANCELLED' },
  });
  await prisma.$disconnect();
});

test('a janela canônica, a data ausente e o fuso ausente não inventam elegibilidade', async () => {
  const event = await insertEvent(organizationId, {
    startDate: new Date('2026-11-01T03:00:00.000Z'),
    timeZone: 'America/Sao_Paulo',
  });
  const unpublished = await refunds.publicPolicy(event.slug, new Date('2026-10-01T00:00:00.000Z'));
  assert.equal(unpublished.published, false);
  assert.equal(unpublished.eligible, null);
  assert.equal(JSON.stringify(unpublished).includes('@'), false);

  const pendingDate = await insertEvent(organizationId, { timeZone: 'America/Sao_Paulo' });
  await refunds.savePolicy(people.owner.id, pendingDate.id, { window: 'DAYS_30' });
  const missingStart = await refunds.publicPolicy(pendingDate.slug);
  assert.equal(missingStart.pending, 'START_DATE');
  assert.equal(missingStart.eligible, null);
  assert.equal(missingStart.deadline, null);

  const pendingZone = await insertEvent(organizationId, { startDate: new Date('2026-11-01T03:00:00.000Z') });
  await refunds.savePolicy(people.owner.id, pendingZone.id, { window: 'DAYS_7' });
  const missingZone = await refunds.publicPolicy(pendingZone.slug);
  assert.equal(missingZone.pending, 'TIME_ZONE');
  assert.equal(missingZone.eligible, null);

  await refunds.savePolicy(people.owner.id, event.id, { window: 'DAYS_1' });
  const atLimit = await refunds.publicPolicy(event.slug, new Date('2026-10-31T03:00:00.000Z'));
  assert.equal(atLimit.eligible, true);
  assert.equal(atLimit.deadline, '2026-10-31T03:00:00.000Z');
  const after = await refunds.publicPolicy(event.slug, new Date('2026-10-31T03:00:00.001Z'));
  assert.equal(after.eligible, false);
  const again = await refunds.savePolicy(people.owner.id, event.id, { window: 'DAYS_1' });
  assert.equal(again.version, 1);
  const draft = await insertEvent(organizationId, { status: 'SETUP', slug: `rascunho-${run}` });
  await rejects(refunds.publicPolicy(draft.slug), 404);
});

test('a compra congela a versão e uma mudança posterior não reescreve o prazo', async () => {
  const event = await insertEvent(organizationId, {
    startDate: new Date('2026-11-01T03:00:00.000Z'),
    timeZone: 'America/Sao_Paulo',
  });
  const { category, lot } = await catalog(event);
  await refunds.savePolicy(people.owner.id, event.id, { window: 'DAYS_1' });
  const identityHash = digest();
  const emailHash = await link(people.buyer.id, identityHash, people.buyer.email);
  const row = await reservation(event, lot, category, {
    status: 'CONFIRMED',
    priceCents: 15000,
    identityHash,
    emailHash,
  });
  await checkout(row, 'PAID');
  const acceptedAt = new Date('2026-10-01T15:00:00.000Z');
  const acceptance = await prisma.$transaction((tx) => refunds.recordAcceptance(tx, {
    eventId: event.id,
    organizationId,
    reservationId: row.id,
  }, acceptedAt));
  assert.equal(acceptance.window, 'DAYS_1');
  assert.equal(acceptance.version, 1);
  assert.equal(acceptance.deadlineAt.toISOString(), '2026-10-31T03:00:00.000Z');
  const replay = await prisma.$transaction((tx) => refunds.recordAcceptance(tx, {
    eventId: event.id,
    organizationId,
    reservationId: row.id,
  }, new Date('2026-10-20T00:00:00.000Z')));
  assert.equal(replay.acceptedAt.toISOString(), acceptedAt.toISOString());

  await refunds.savePolicy(people.owner.id, event.id, { window: 'NONE' });
  await prisma.event.update({ where: { id: event.id }, data: { startDate: new Date('2026-12-01T03:00:00.000Z') } });
  const frozen = await prisma.registrationRefundAcceptance.findUniqueOrThrow({ where: { reservationId: row.id } });
  assert.equal(frozen.window, 'DAYS_1');
  assert.equal(frozen.deadlineAt.toISOString(), '2026-10-31T03:00:00.000Z');
  const view = await refunds.accountView(people.buyer.id, event.slug, new Date('2026-10-15T00:00:00.000Z'));
  assert.equal(view.current.window, 'NONE');
  assert.equal(view.accepted.window, 'DAYS_1');
  assert.equal(view.accepted.eligible, true);

  const lateIdentity = digest();
  const lateEmail = `tarde-${run}@evolvia-ci.local`;
  const lateUser = await user('late', { email: lateEmail, emailVerifiedAt: new Date() });
  const lateHash = await link(lateUser.id, lateIdentity, lateEmail);
  const lateRow = await reservation(event, lot, category, {
    status: 'CONFIRMED',
    priceCents: 15000,
    identityHash: lateIdentity,
    emailHash: lateHash,
  });
  await checkout(lateRow, 'PAID');
  await prisma.$transaction((tx) => refunds.recordAcceptance(tx, {
    eventId: event.id,
    organizationId,
    reservationId: lateRow.id,
  }, new Date('2026-10-20T00:00:00.000Z')));
  await rejects(
    refunds.requestFromAccount(lateUser.id, event.slug, { reason }, new Date('2026-10-20T00:00:00.000Z')),
    409,
    /nenhum momento/u,
  );
});

test('pedido repetido ou concorrente permanece único e a aprovação não devolve dinheiro', async () => {
  const event = await insertEvent(organizationId, { timeZone: 'America/Sao_Paulo' });
  const sibling = await insertEvent(organizationId);
  const other = await insertEvent(otherOrganizationId);
  const { category, lot } = await catalog(event);
  await refunds.savePolicy(people.owner.id, event.id, { window: 'ANYTIME' });
  const identityHash = digest();
  const emailHash = await link(people.buyer.id, identityHash, people.buyer.email);
  const row = await reservation(event, lot, category, {
    status: 'CONFIRMED',
    priceCents: 9000,
    identityHash,
    emailHash,
  });
  await checkout(row, 'PAID');
  await prisma.$transaction((tx) => refunds.recordAcceptance(tx, {
    eventId: event.id,
    organizationId,
    reservationId: row.id,
  }, new Date('2026-10-02T00:00:00.000Z')));

  const token = digest();
  await prisma.participantAccessSession.create({
    data: {
      organizationId,
      eventId: event.id,
      reservationId: row.id,
      tokenHash: participantHash(token),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  const seen = await refunds.participantView(event.slug, `Bearer ${token}`);
  assert.equal(seen.protocol, row.protocol);
  assert.equal(seen.paid, true);
  await rejects(refunds.participantView(event.slug, `Bearer ${digest()}`), 401);

  const [first, second] = await Promise.all([
    refunds.requestFromAccount(people.buyer.id, event.slug, { reason }),
    refunds.requestFromSession(event.slug, `Bearer ${token}`, { reason: 'Quero cancelar minha participação agora.' }),
  ]);
  assert.equal(first.id, second.id);
  assert.equal(await prisma.registrationRefundRequest.count({ where: { reservationId: row.id } }), 1);
  const replay = await refunds.requestFromAccount(people.buyer.id, event.slug, { reason });
  assert.equal(replay.id, first.id);
  assert.equal(replay.statusLabel, 'Em análise');

  const unpaid = await reservation(event, lot, category, {
    status: 'PENDING_PAYMENT',
    priceCents: 9000,
    identityHash: digest(),
    emailHash: digest(),
  });
  await checkout(unpaid, 'CREATING');
  const unpaidToken = digest();
  await prisma.participantAccessSession.create({
    data: {
      organizationId,
      eventId: event.id,
      reservationId: unpaid.id,
      tokenHash: participantHash(unpaidToken),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  await rejects(refunds.requestFromSession(event.slug, `Bearer ${unpaidToken}`, { reason }), 409, /inscrição paga/u);

  const stranger = digest();
  await link(people.outsider.id, stranger, people.outsider.email);
  await prisma.user.update({ where: { id: people.outsider.id }, data: { emailVerifiedAt: new Date() } });
  await rejects(refunds.requestFromAccount(people.outsider.id, event.slug, { reason }), 404, /Inscrição não encontrada/u);
  await rejects(refunds.accountView(people.unverified.id, event.slug), 404);

  await rejects(refunds.savePolicy(people.operator.id, event.id, { window: 'NONE' }), 404, /Organização não encontrada/u);
  await rejects(refunds.decide(people.operator.id, event.id, first.id, { decision: 'APPROVE', note }), 404, /Organização não encontrada/u);
  await rejects(refunds.listRequests(people.viewer.id, event.id), 404);
  await rejects(refunds.listRequests(people.outsider.id, event.id), 404);
  await rejects(refunds.decide(people.owner.id, sibling.id, first.id, { decision: 'APPROVE', note }), 404, /Pedido não encontrado/u);
  await rejects(refunds.decide(people.outsider.id, other.id, first.id, { decision: 'APPROVE', note }), 404);

  const approved = await refunds.decide(people.owner.id, event.id, first.id, { decision: 'APPROVE', note });
  assert.equal(approved.statusLabel, 'Aprovado, aguardando processamento');
  assert.equal(approved.registrationStatus, 'CONFIRMED');
  assert.equal(approved.checkoutStatus, 'PAID');
  const stored = await prisma.eventRegistrationReservation.findUniqueOrThrow({
    where: { id: row.id },
    include: { checkout: true, checkIn: true, refundRequest: true },
  });
  assert.equal(stored.status, 'CONFIRMED');
  assert.equal(stored.checkout.status, 'PAID');
  assert.equal(stored.checkIn, null);
  assert.equal(stored.refundRequest.status, 'APPROVED');
  await rejects(refunds.decide(people.owner.id, event.id, first.id, { decision: 'REJECT', note }), 409, /já foi analisado/u);

  const listed = await refunds.listRequests(people.owner.id, event.id);
  assert.equal(listed.items.some((item) => item.id === first.id), true);
  assert.equal(JSON.stringify(listed).includes(people.buyer.email), false);
  const otherList = await refunds.listRequests(people.outsider.id, other.id);
  assert.equal(otherList.items.length, 0);
  const audits = await prisma.auditLog.findMany({
    where: { eventId: event.id, action: { in: ['refund.policy_accepted', 'refund.requested', 'refund.approved'] } },
    select: { action: true, metadata: true },
  });
  assert.equal(new Set(audits.map((item) => item.action)).size, 3);
  assert.equal(JSON.stringify(audits).includes(people.buyer.email), false);
});

test('compra sem regra ou com pendência congelada não ganha elegibilidade depois', async () => {
  const event = await insertEvent(organizationId);
  const { category, lot } = await catalog(event);
  const identityHash = digest();
  const email = `semregra-${run}@evolvia-ci.local`;
  const person = await user('semregra', { email, emailVerifiedAt: new Date() });
  const emailHash = await link(person.id, identityHash, email);
  const row = await reservation(event, lot, category, {
    status: 'CONFIRMED',
    priceCents: 5000,
    identityHash,
    emailHash,
  });
  await checkout(row, 'PAID');
  const missing = await prisma.$transaction((tx) => refunds.recordAcceptance(tx, {
    eventId: event.id,
    organizationId,
    reservationId: row.id,
  }, new Date()));
  assert.equal(missing, null);
  await rejects(refunds.requestFromAccount(person.id, event.slug, { reason }), 409, /não foi registrada/u);

  await refunds.savePolicy(people.owner.id, event.id, { window: 'DAYS_30' });
  const pendingIdentity = digest();
  const pendingEmail = `pendente-${run}@evolvia-ci.local`;
  const pendingUser = await user('pendente', { email: pendingEmail, emailVerifiedAt: new Date() });
  const pendingHash = await link(pendingUser.id, pendingIdentity, pendingEmail);
  const pendingRow = await reservation(event, lot, category, {
    status: 'CONFIRMED',
    priceCents: 5000,
    identityHash: pendingIdentity,
    emailHash: pendingHash,
  });
  await checkout(pendingRow, 'PAID');
  const pendingAcceptance = await prisma.$transaction((tx) => refunds.recordAcceptance(tx, {
    eventId: event.id,
    organizationId,
    reservationId: pendingRow.id,
  }, new Date('2026-10-03T00:00:00.000Z')));
  assert.equal(pendingAcceptance.pendingCode, 'START_DATE');
  assert.equal(pendingAcceptance.deadlineAt, null);
  await prisma.event.update({
    where: { id: event.id },
    data: { startDate: new Date('2026-12-20T03:00:00.000Z'), timeZone: 'America/Sao_Paulo' },
  });
  await rejects(
    refunds.requestFromAccount(pendingUser.id, event.slug, { reason }, new Date('2026-10-04T00:00:00.000Z')),
    409,
    /Na compra, a data de início ainda não estava definida/u,
  );
});
