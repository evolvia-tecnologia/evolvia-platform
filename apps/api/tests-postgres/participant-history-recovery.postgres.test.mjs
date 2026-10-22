// Executa contra um PostgreSQL descartável com as migrations aplicadas (DATABASE_URL).
// No CI roda dentro do contêiner da API, depois do smoke; localmente, após `npm run build`.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test, { after, before, describe } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { ParticipantDashboardService } from '../dist/participant-dashboard.service.js';
import {
  HISTORY_GRANT_RECOVERY_CONSENT,
  HISTORY_RECOVERY_MESSAGE,
  participantDocumentIdentity,
} from '../dist/participant-history.policy.js';
import { participantHash } from '../dist/participant-area-policy.js';

const run = randomBytes(5).toString('hex');
const token = `Histpg${run}`;
const prisma = new PrismaClient();
const sessions = [];
const dashboard = new ParticipantDashboardService(prisma, {
  createSessionForReservation: async (eventId, organizationId, reservationId) => {
    sessions.push({ eventId, organizationId, reservationId });
    return { token: 'session', eventId, reservationId };
  },
});

const cpf = '390.533.447-05';
const identity = participantDocumentIdentity({ documentKind: 'CPF', identityDocument: cpf });
const now = new Date('2026-10-22T13:00:00Z');
const people = {};
const orgs = {};
const events = {};

async function user(key, email) {
  people[key] = await prisma.user.create({
    data: {
      name: `PG ${key}`,
      email,
      passwordHash: 'x',
      emailVerifiedAt: now,
    },
  });
  return people[key];
}

async function organization(key, ownerKey) {
  const organization = await prisma.organization.create({
    data: { name: `Org ${token} ${key}`, slug: `org-${token.toLowerCase()}-${key}`, createdById: people[ownerKey].id },
  });
  await prisma.organizationMembership.create({
    data: { organizationId: organization.id, userId: people[ownerKey].id, role: 'OWNER' },
  });
  orgs[key] = organization;
  return organization;
}

async function publishedEvent(key, orgKey, ownerKey, profileCode) {
  const suffix = randomBytes(4).toString('hex');
  const event = await prisma.event.create({
    data: {
      ownerId: people[ownerKey].id,
      organizationId: orgs[orgKey].id,
      name: `${token} ${key}`,
      slug: `${token.toLowerCase()}-${key}-${suffix}`,
      eventType: 'Congresso',
      format: 'IN_PERSON',
      registrationMode: 'FREE',
      status: 'PUBLISHED',
      profileCode,
    },
  });
  const catalog = await prisma.eventRegistrationCatalog.create({
    data: { organizationId: orgs[orgKey].id, eventId: event.id },
  });
  const category = await prisma.eventRegistrationCategory.create({
    data: { organizationId: orgs[orgKey].id, eventId: event.id, catalogId: catalog.id, code: 'GERAL', name: 'Geral' },
  });
  const lot = await prisma.eventRegistrationLot.create({
    data: {
      organizationId: orgs[orgKey].id,
      eventId: event.id,
      categoryId: category.id,
      code: 'LOTE1',
      name: 'Lote 1',
      startsAt: new Date(now.getTime() - 3_600_000),
      endsAt: new Date(now.getTime() + 86_400_000),
      quantity: 10,
      priceCents: 0,
    },
  });
  events[key] = { event, category, lot, organizationId: orgs[orgKey].id };
  return events[key];
}

async function confirmedReservation(ctx, person, identityHash) {
  return prisma.eventRegistrationReservation.create({
    data: {
      organizationId: ctx.organizationId,
      eventId: ctx.event.id,
      categoryId: ctx.category.id,
      lotId: ctx.lot.id,
      protocol: `EVO-${randomBytes(8).toString('hex').toUpperCase()}`,
      idempotencyKeyHash: randomBytes(32).toString('hex'),
      payloadHash: 'b'.repeat(64),
      identityHash,
      emailHash: participantHash(person.email.trim().toLowerCase()),
      registrationData: { full_name: person.name, email: person.email },
      basePriceCents: 0,
      finalPriceCents: 0,
      status: 'CONFIRMED',
      confirmedAt: now,
    },
  });
}

async function identityLink(person, identityHash) {
  return prisma.participantIdentityLink.create({
    data: {
      userId: person.id,
      identityHash,
      emailHash: participantHash(person.email.trim().toLowerCase()),
    },
  });
}

before(async () => {
  await user('orgOwner1', `org1-${run}@evolvia-ci.local`);
  await user('orgOwner2', `org2-${run}@evolvia-ci.local`);
  await user('titular', `titular-${run}@evolvia-ci.local`);
  await user('solicitante', `solicitante-${run}@evolvia-ci.local`);
  await user('sozinho', `sozinho-${run}@evolvia-ci.local`);
  await organization('titular', 'orgOwner1');
  await organization('solicitante', 'orgOwner2');
  await publishedEvent('congresso', 'titular', 'orgOwner1', 'SCIENTIFIC_EVENT');
  await publishedEvent('curso', 'solicitante', 'orgOwner2', 'CORPORATE_TRAINING');
  await confirmedReservation(events.congresso, people.titular, identity.identityHash);
  await confirmedReservation(events.curso, people.solicitante, identity.identityHash);
  await identityLink(people.titular, identity.identityHash);
  await identityLink(people.solicitante, identity.identityHash);
});

after(async () => {
  await prisma.event.updateMany({ where: { name: { startsWith: token } }, data: { status: 'CANCELLED' } });
  await prisma.$disconnect();
});

describe('histórico após troca de e-mail', { concurrency: 1 }, () => {
test('reserva confirmada do solicitante não vira dono nem abre histórico ou sessão alheia', async () => {
  const request = await dashboard.requestHistoryRecovery(people.solicitante.id, {
    documentKind: 'CPF',
    identityDocument: cpf,
  }, now);
  assert.equal(request.message, HISTORY_RECOVERY_MESSAGE);

  const grants = await prisma.participantIdentityLink.findMany({
    where: { identityHash: identity.identityHash, historyGrantSource: HISTORY_GRANT_RECOVERY_CONSENT },
  });
  assert.equal(grants.length, 0);
  const links = await prisma.participantIdentityLink.findMany({ where: { identityHash: identity.identityHash } });
  assert.equal(links.every((link) => link.verifiedAt === null), true);

  const recoveries = await prisma.participantHistoryRecovery.findMany({
    where: { requesterUserId: people.solicitante.id, identityHash: identity.identityHash, consumedAt: null },
  });
  assert.deepEqual(recoveries.map((row) => row.targetUserId), [people.titular.id]);

  const history = await dashboard.history(people.solicitante.id);
  assert.deepEqual(history.events, []);
  assert.equal(history.pendingConfirmations.length, 0);

  const mine = await dashboard.get(people.solicitante.id);
  assert.deepEqual(mine.events.map((item) => item.slug), [events.curso.event.slug]);

  await assert.rejects(() => dashboard.enterEvent(people.solicitante.id, events.congresso.event.slug), (error) => {
    assert.equal(error.getStatus(), 404);
    return true;
  });
  assert.equal(sessions.length, 0);
});

test('vincular a própria inscrição confirmada não promove verifiedAt nem concede histórico', async () => {
  const ownCpf = '529.982.247-25';
  const ownIdentity = participantDocumentIdentity({ documentKind: 'CPF', identityDocument: ownCpf });
  await confirmedReservation(events.curso, people.sozinho, ownIdentity.identityHash);
  const afterLink = await dashboard.link(people.sozinho.id, { identityDocument: ownCpf });
  assert.deepEqual(afterLink.events.map((item) => item.slug), [events.curso.event.slug]);
  const created = await prisma.participantIdentityLink.findFirst({
    where: { userId: people.sozinho.id, identityHash: ownIdentity.identityHash },
  });
  assert.equal(created?.verifiedAt, null);
  assert.equal(created?.historyGrantSource, null);
  const history = await dashboard.history(people.sozinho.id);
  assert.deepEqual(history.events, []);
});

test('só o consentimento do dono ligado autoriza histórico e sessão do outro e-mail', async () => {
  const recovery = await prisma.participantHistoryRecovery.findFirst({
    where: { requesterUserId: people.solicitante.id, identityHash: identity.identityHash, consumedAt: null },
  });
  await dashboard.confirmHistoryRecovery(people.titular.id, { recoveryId: recovery.id }, now);
  const granted = await prisma.participantIdentityLink.findFirst({
    where: { userId: people.solicitante.id, identityHash: identity.identityHash },
  });
  assert.equal(granted.historyGrantSource, HISTORY_GRANT_RECOVERY_CONSENT);
  assert.ok(granted.verifiedAt);

  const history = await dashboard.history(people.solicitante.id);
  assert.deepEqual(history.events.map((item) => item.slug), [events.congresso.event.slug]);

  const opened = await dashboard.enterEvent(people.solicitante.id, events.congresso.event.slug);
  assert.equal(opened.eventId, events.congresso.event.id);
  assert.equal(sessions.at(-1).reservationId, opened.reservationId);

  await assert.rejects(
    () => dashboard.confirmHistoryRecovery(people.titular.id, { recoveryId: recovery.id }, now),
    (error) => {
      assert.equal(error.getStatus(), 404);
      return true;
    },
  );
});

test('confirmação expirada, de outra conta ou em paralelo não concede histórico', async () => {
  const otherCpf = '153.509.460-56';
  const otherIdentity = participantDocumentIdentity({ documentKind: 'CPF', identityDocument: otherCpf });
  await confirmedReservation(events.congresso, people.titular, otherIdentity.identityHash);
  await identityLink(people.titular, otherIdentity.identityHash);
  await dashboard.requestHistoryRecovery(people.solicitante.id, {
    documentKind: 'CPF',
    identityDocument: otherCpf,
  }, now);
  const recovery = await prisma.participantHistoryRecovery.findFirst({
    where: { requesterUserId: people.solicitante.id, identityHash: otherIdentity.identityHash, consumedAt: null },
  });

  await assert.rejects(
    () => dashboard.confirmHistoryRecovery(people.solicitante.id, { recoveryId: recovery.id }, now),
    (error) => {
      assert.equal(error.getStatus(), 404);
      return true;
    },
  );
  await assert.rejects(
    () => dashboard.confirmHistoryRecovery(people.titular.id, { recoveryId: recovery.id }, new Date(now.getTime() + 31 * 60 * 1000)),
    (error) => {
      assert.equal(error.getStatus(), 404);
      return true;
    },
  );

  const first = dashboard.confirmHistoryRecovery(people.titular.id, { recoveryId: recovery.id }, now);
  const second = dashboard.confirmHistoryRecovery(people.titular.id, { recoveryId: recovery.id }, now);
  const results = await Promise.allSettled([first, second]);
  const accepted = results.filter((item) => item.status === 'fulfilled');
  const rejected = results.filter((item) => item.status === 'rejected');
  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.getStatus(), 404);

  const consumed = await prisma.participantHistoryRecovery.findUnique({ where: { id: recovery.id } });
  assert.ok(consumed.consumedAt);
});

test('documento inválido do autenticado responde 400 e não vaza existência', async () => {
  const before = await prisma.participantHistoryRecovery.count({
    where: { requesterUserId: people.solicitante.id },
  });
  await assert.rejects(
    () => dashboard.requestHistoryRecovery(people.solicitante.id, {
      documentKind: 'CPF',
      identityDocument: '111.111.111-11',
    }, now),
    (error) => {
      assert.equal(error.getStatus(), 400);
      return true;
    },
  );
  const after = await prisma.participantHistoryRecovery.count({
    where: { requesterUserId: people.solicitante.id },
  });
  assert.equal(after, before);
});

test('intruso com vínculo mais recente não libera o histórico do titular ao aprovar o solicitante', async () => {
  const shared = participantDocumentIdentity({ documentKind: 'PASSPORT', identityDocument: 'TAB12345', issuerCountry: 'BR' });
  const owner = await user('tab-t', `tab-t-${run}@evolvia-ci.local`);
  const intruso = await user('tab-a', `tab-a-${run}@evolvia-ci.local`);
  const requester = await user('tab-b', `tab-b-${run}@evolvia-ci.local`);
  await confirmedReservation(events.congresso, owner, shared.identityHash);
  await confirmedReservation(events.curso, intruso, shared.identityHash);
  await identityLink(owner, shared.identityHash);
  await identityLink(intruso, shared.identityHash);
  await dashboard.requestHistoryRecovery(requester.id, {
    documentKind: 'PASSPORT', identityDocument: 'TAB12345', issuerCountry: 'BR',
  }, now);
  const targets = await prisma.participantHistoryRecovery.findMany({
    where: { requesterUserId: requester.id, identityHash: shared.identityHash, consumedAt: null },
  });
  assert.deepEqual(targets.map((row) => row.targetUserId).sort(), [intruso.id, owner.id].sort());
  const attackerRecovery = targets.find((row) => row.targetUserId === intruso.id);
  await dashboard.confirmHistoryRecovery(intruso.id, { recoveryId: attackerRecovery.id }, now);
  const granted = await prisma.participantIdentityLink.findFirst({
    where: { userId: requester.id, identityHash: shared.identityHash },
  });
  assert.equal(granted.grantedByUserId, intruso.id);
  assert.equal(granted.grantorEmailHash, participantHash(intruso.email.trim().toLowerCase()));
  const history = await dashboard.history(requester.id);
  assert.deepEqual(history.events.map((item) => item.slug), [events.curso.event.slug]);
  await assert.rejects(() => dashboard.enterEvent(requester.id, events.congresso.event.slug), (error) => {
    assert.equal(error.getStatus(), 404);
    return true;
  });
  const opened = await dashboard.enterEvent(requester.id, events.curso.event.slug);
  assert.equal(opened.eventId, events.curso.event.id);
});

test('cadeia de consentimento não entrega o congresso do titular ao terceiro', async () => {
  const shared = participantDocumentIdentity({ documentKind: 'PASSPORT', identityDocument: 'CHAIN123', issuerCountry: 'BR' });
  const owner = await user('chain-t', `chain-t-${run}@evolvia-ci.local`);
  const first = await user('chain-a', `chain-a-${run}@evolvia-ci.local`);
  const second = await user('chain-b', `chain-b-${run}@evolvia-ci.local`);
  await confirmedReservation(events.congresso, owner, shared.identityHash);
  await confirmedReservation(events.curso, first, shared.identityHash);
  await identityLink(owner, shared.identityHash);
  await identityLink(first, shared.identityHash);
  await dashboard.requestHistoryRecovery(first.id, {
    documentKind: 'PASSPORT', identityDocument: 'CHAIN123', issuerCountry: 'BR',
  }, now);
  const toOwner = await prisma.participantHistoryRecovery.findFirst({
    where: { requesterUserId: first.id, targetUserId: owner.id, identityHash: shared.identityHash, consumedAt: null },
  });
  await dashboard.confirmHistoryRecovery(owner.id, { recoveryId: toOwner.id }, now);
  assert.deepEqual((await dashboard.history(first.id)).events.map((item) => item.slug), [events.congresso.event.slug]);

  await dashboard.requestHistoryRecovery(second.id, {
    documentKind: 'PASSPORT', identityDocument: 'CHAIN123', issuerCountry: 'BR',
  }, now);
  const pending = await prisma.participantHistoryRecovery.findMany({
    where: { requesterUserId: second.id, identityHash: shared.identityHash, consumedAt: null },
  });
  assert.deepEqual(pending.map((row) => row.targetUserId), [first.id]);
  await dashboard.confirmHistoryRecovery(first.id, { recoveryId: pending[0].id }, now);
  assert.deepEqual((await dashboard.history(second.id)).events.map((item) => item.slug), [events.curso.event.slug]);
  await assert.rejects(() => dashboard.enterEvent(second.id, events.congresso.event.slug), (error) => {
    assert.equal(error.getStatus(), 404);
    return true;
  });
});

test('primeira vinculação maliciosa não abre a sessão do titular', async () => {
  const lone = await user('so-intruso', `so-intruso-${run}@evolvia-ci.local`);
  const requester = await user('vitima', `vitima-${run}@evolvia-ci.local`);
  const stolen = participantDocumentIdentity({ documentKind: 'PASSPORT', identityDocument: 'AB999999', issuerCountry: 'BR' });
  await confirmedReservation(events.congresso, people.titular, stolen.identityHash);
  await confirmedReservation(events.curso, lone, stolen.identityHash);
  await identityLink(lone, stolen.identityHash);
  await dashboard.requestHistoryRecovery(requester.id, {
    documentKind: 'PASSPORT', identityDocument: 'AB999999', issuerCountry: 'BR',
  }, now);
  const pending = await prisma.participantHistoryRecovery.findMany({
    where: { requesterUserId: requester.id, identityHash: stolen.identityHash, consumedAt: null },
  });
  assert.deepEqual(pending.map((row) => row.targetUserId), [lone.id]);
  await dashboard.confirmHistoryRecovery(lone.id, { recoveryId: pending[0].id }, now);
  assert.deepEqual((await dashboard.history(requester.id)).events.map((item) => item.slug), [events.curso.event.slug]);
  await assert.rejects(() => dashboard.enterEvent(requester.id, events.congresso.event.slug), (error) => {
    assert.equal(error.getStatus(), 404);
    return true;
  });
});

test('sem vínculo prévio o pedido aceita em silêncio e não cria recuperação', async () => {
  const unknown = participantDocumentIdentity({ documentKind: 'CPF', identityDocument: '390.533.447-05' });
  const stranger = await user('estranho', `estranho-${run}@evolvia-ci.local`);
  const before = await prisma.participantHistoryRecovery.count({ where: { requesterUserId: stranger.id } });
  const request = await dashboard.requestHistoryRecovery(stranger.id, {
    documentKind: 'PASSPORT',
    identityDocument: 'AB123456',
    issuerCountry: 'BR',
  }, now);
  assert.equal(request.message, HISTORY_RECOVERY_MESSAGE);
  const after = await prisma.participantHistoryRecovery.count({ where: { requesterUserId: stranger.id } });
  assert.equal(after, before);
  assert.notEqual(unknown.identityHash, participantDocumentIdentity({
    documentKind: 'PASSPORT', identityDocument: 'AB123456', issuerCountry: 'BR',
  }).identityHash);
});
});
