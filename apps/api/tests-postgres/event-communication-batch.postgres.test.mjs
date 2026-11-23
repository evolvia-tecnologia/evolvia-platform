import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { AuthorizationService } from '../dist/authorization.service.js';
import { EventCommunicationBatchService } from '../dist/event-communication-batch.service.js';

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

test('G6.8 PG: lote PREPARED durável, criptografado e idempotente sem envio nem vazamento entre tenants', async t => {
  const nonce = randomUUID();
  const owner = await prisma.user.create({ data: {
    name: 'Operador de teste', email: 'bulk-' + nonce + '@example.test', passwordHash: 'fixture',
  } });
  const org = await prisma.organization.create({ data: {
    name: 'G6.8 fixture', slug: 'g68-' + nonce, createdById: owner.id,
  } });
  await prisma.organizationMembership.create({ data: { organizationId: org.id, userId: owner.id, role: 'OWNER' } });
  const event = await prisma.event.create({ data: {
    ownerId: owner.id, organizationId: org.id, name: 'G6.8', slug: 'g68-event-' + nonce,
    eventType: 'Congresso', format: 'IN_PERSON', registrationMode: 'FREE', status: 'PUBLISHED',
  } });
  const draftId = randomUUID(), batchId = randomUUID();
  await prisma.eventCommunicationDraft.create({ data: {
    id: draftId, organizationId: org.id, eventId: event.id, subject: 'Aviso de teste',
    body: 'Mensagem aprovada', revision: 1,
  } });
  t.after(async () => {
    await prisma.eventCommunicationRecipient.deleteMany({ where: { eventId: event.id } });
    await prisma.eventCommunicationBatch.deleteMany({ where: { eventId: event.id } });
    await prisma.auditLog.deleteMany({ where: { eventId: event.id } });
    await prisma.eventCommunicationDraft.deleteMany({ where: { eventId: event.id } });
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
    await prisma.user.delete({ where: { id: owner.id } });
  });
  const key = process.env.EVOLVIA_COMMUNICATION_OUTBOX_KEY;
  process.env.EVOLVIA_COMMUNICATION_OUTBOX_KEY = randomBytes(32).toString('base64');
  t.after(() => { if (key === undefined) delete process.env.EVOLVIA_COMMUNICATION_OUTBOX_KEY;
    else process.env.EVOLVIA_COMMUNICATION_OUTBOX_KEY = key; });
  let snapshots = 0;
  const audience = { snapshot: async (userId, eventId, filters, consentOnly) => {
    snapshots++;
    assert.equal(userId, owner.id);
    assert.equal(eventId, event.id);
    assert.equal(consentOnly, true);
    assert.equal(filters.audience, 'CONFIRMED_REGISTRATIONS');
    return { contacts: [{ name: 'Ana', email: 'ANA@example.test' }, { name: 'Bia', email: 'bia@example.test' }] };
  } };
  const service = new EventCommunicationBatchService(prisma, new AuthorizationService(prisma), audience);
  const payload = { id: batchId, draftId, draftRevision: 1, filters: { audience: 'CONFIRMED_REGISTRATIONS' } };
  const first = await service.prepare(owner.id, event.id, payload);
  assert.equal(first.status, 'PREPARED');
  assert.equal(first.recipientCount, 2);
  assert.equal(first.sendingAvailable, false);
  assert.equal(first.receivedCount, 0);
  assert.deepEqual(await service.prepare(owner.id, event.id, payload), first);
  assert.equal(snapshots, 1, 'replay não refaz o público nem envia');
  assert.equal((await service.list(owner.id, event.id)).batches.length, 1);
  assert.equal(await prisma.eventCommunicationBatch.count({ where: { eventId: event.id } }), 1);
  const recipients = await prisma.eventCommunicationRecipient.findMany({ where: { batchId } });
  assert.equal(recipients.length, 2);
  assert.deepEqual(recipients.map(x => x.status), ['PENDING', 'PENDING']);
  assert.doesNotMatch(JSON.stringify(recipients), /ana@example.test|bia@example.test|Aviso de teste/u);
  assert.equal(new Set(recipients.map(x => x.emailFingerprint)).size, 2);
  const audit = await prisma.auditLog.findMany({ where: { eventId: event.id, action: 'event.communication_batch_prepared' } });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].metadata.sent, false);
  assert.doesNotMatch(JSON.stringify(audit), /ana@example|bia@example|Mensagem aprovada/u);
  await assert.rejects(service.prepare(owner.id, event.id, { ...payload, draftRevision: 2 }),
    error => error.getStatus?.() === 409);
  await assert.rejects(service.prepare('unknown-user', event.id, payload));
  await assert.rejects(prisma.eventCommunicationRecipient.create({ data: {
    batchId, eventId: event.id, organizationId: 'other-organization', emailFingerprint: 'f'.repeat(64),
    emailEnvelope: 'not-a-real-email',
  } }));
  assert.equal(await prisma.eventCommunicationRecipient.count({ where: { batchId } }), 2);
});
