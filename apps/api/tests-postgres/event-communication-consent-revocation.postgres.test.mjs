import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { ParticipantAreaService } from '../dist/participant-area.service.js';

const prisma = new PrismaClient();
test.after(() => prisma.$disconnect());

test('G6.8 PG: participante revoga aceite por sessão, preserva termos e não afeta outra inscrição', async t => {
  const suffix = randomUUID();
  const owner = await prisma.user.create({ data: {
    name: 'Consent tester', email: 'consent-' + suffix + '@example.test', passwordHash: 'fixture',
  } });
  const org = await prisma.organization.create({ data: {
    name: 'Consent ' + suffix, slug: 'consent-' + suffix, createdById: owner.id,
  } });
  await prisma.organizationMembership.create({ data: { organizationId: org.id, userId: owner.id, role: 'OWNER' } });
  const event = await prisma.event.create({ data: {
    ownerId: owner.id, organizationId: org.id, name: 'Consent', slug: 'consent-event-' + suffix,
    eventType: 'Congresso', format: 'IN_PERSON', registrationMode: 'FREE', status: 'PUBLISHED',
  } });
  const catalog = await prisma.eventRegistrationCatalog.create({ data: {
    organizationId: org.id, eventId: event.id,
  } });
  const category = await prisma.eventRegistrationCategory.create({ data: {
    organizationId: org.id, eventId: event.id, catalogId: catalog.id, code: 'GERAL', name: 'Geral',
  } });
  const lot = await prisma.eventRegistrationLot.create({ data: {
    organizationId: org.id, eventId: event.id, categoryId: category.id, code: 'LOTE', name: 'Lote',
    startsAt: new Date(Date.now() - 3600000), endsAt: new Date(Date.now() + 86400000), priceCents: 0,
  } });
  t.after(async () => {
    await prisma.participantAccessSession.deleteMany({ where: { eventId: event.id } });
    await prisma.auditLog.deleteMany({ where: { eventId: event.id } });
    await prisma.eventRegistrationReservation.deleteMany({ where: { eventId: event.id } });
    await prisma.eventRegistrationLot.deleteMany({ where: { eventId: event.id } });
    await prisma.eventRegistrationCategory.deleteMany({ where: { eventId: event.id } });
    await prisma.eventRegistrationCatalog.deleteMany({ where: { eventId: event.id } });
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
    await prisma.user.delete({ where: { id: owner.id } });
  });
  const makeRegistration = async (email) => prisma.eventRegistrationReservation.create({ data: {
    organizationId: org.id, eventId: event.id, categoryId: category.id, lotId: lot.id,
    protocol: 'EVO-' + randomBytes(8).toString('hex').toUpperCase(),
    idempotencyKeyHash: randomBytes(32).toString('hex'), payloadHash: randomBytes(32).toString('hex'),
    identityHash: randomBytes(32).toString('hex'), emailHash: randomBytes(32).toString('hex'),
    registrationData: { full_name: 'Pessoa teste', email, terms_acceptance: true,
      event_communications_consent: true, future_communications_consent: true },
    basePriceCents: 0, finalPriceCents: 0, status: 'CONFIRMED', confirmedAt: new Date(),
  } });
  const first = await makeRegistration('first@example.test');
  const second = await makeRegistration('second@example.test');
  const area = new ParticipantAreaService(prisma, {}, {}, {});
  const { accessToken: firstToken } = await area.createSessionForReservation(event.id, org.id, first.id);
  const { accessToken: secondToken } = await area.createSessionForReservation(event.id, org.id, second.id);
  const auth = 'Bearer ' + firstToken;
  assert.deepEqual(await area.eventCommunicationConsent(event.slug, auth), { eventId: event.id, consented: true });
  await assert.rejects(area.revokeEventCommunicationConsent(event.slug, 'Bearer invalid'),
    error => error.getStatus?.() === 401);
  await assert.rejects(area.revokeEventCommunicationConsent('wrong-slug', auth),
    error => error.getStatus?.() === 401);
  const results = await Promise.all([area.revokeEventCommunicationConsent(event.slug, auth),
    area.revokeEventCommunicationConsent(event.slug, auth)]);
  assert.deepEqual(results.map(x => x.revoked).sort(), [false, true]);
  assert.equal((await area.eventCommunicationConsent(event.slug, auth)).consented, false);
  const updated = await prisma.eventRegistrationReservation.findUniqueOrThrow({ where: { id: first.id } });
  assert.equal(updated.registrationData.event_communications_consent, false);
  assert.equal(updated.registrationData.terms_acceptance, true);
  assert.equal(updated.registrationData.future_communications_consent, true);
  // O registro nasce com revision=1; apenas a primeira revogação a incrementa.
  assert.equal(updated.registrationRevision, 2);
  assert.equal((await area.eventCommunicationConsent(event.slug, 'Bearer ' + secondToken)).consented, true);
  assert.equal((await prisma.auditLog.count({ where: {
    eventId: event.id, entityId: first.id,
    action: 'participant.event_communications_consent_revoked',
  } })), 1);
  await prisma.participantAccessSession.updateMany({ where: { reservationId: first.id },
    data: { revokedAt: new Date() } });
  await assert.rejects(area.eventCommunicationConsent(event.slug, auth),
    error => error.getStatus?.() === 401);
});
