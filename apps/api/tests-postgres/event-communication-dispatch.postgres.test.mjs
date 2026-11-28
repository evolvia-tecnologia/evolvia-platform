import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { AuthorizationService } from '../dist/authorization.service.js';
import { EventCommunicationBatchService } from '../dist/event-communication-batch.service.js';
import { EventCommunicationDispatchService } from '../dist/event-communication-dispatch.service.js';

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

test('G6.8 worker PostgreSQL — escopo, claim entre réplicas, revogação, retry local e conciliação assinada', async t => {
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
  const draftId = randomUUID();
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
  const mailbox = 'authorized@example.test';
  const receiptKey = randomBytes(32).toString('hex');
  const env = {
    EVOLVIA_EMAIL_DELIVERY_ENDPOINT: 'https://mail.example.test/send', EVOLVIA_EMAIL_FROM: 'sender@example.test',
    EVOLVIA_EMAIL_DELIVERY_TOKEN: 'test-only', EVOLVIA_PUBLIC_BASE_URL: 'https://homologacao.evolviatecnologia.com',
    EVOLVIA_COMMUNICATION_OUTBOX_KEY: randomBytes(32).toString('base64'), EVOLVIA_COMMUNICATION_DELIVERY_ENABLED: '1',
    EVOLVIA_COMMUNICATION_ORGANIZATION_ID: org.id, EVOLVIA_COMMUNICATION_EVENT_ID: event.id,
    EVOLVIA_COMMUNICATION_TEST_MAILBOX: mailbox, EVOLVIA_COMMUNICATION_RECEIPT_KEY: receiptKey,
  };
  for (const [key, value] of Object.entries(env)) {
    const old = process.env[key];
    process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  let eligible = true, preflightFails = false;
  const audience = { snapshot: async () => {
    if (preflightFails) throw new Error('banco indisponível antes de chamar o transporte');
    return { contacts: eligible ? [{ email: mailbox }, { email: 'other@example.test' }] : [] };
  } };
  const service = new EventCommunicationBatchService(prisma, new AuthorizationService(prisma), audience);
  const a = new EventCommunicationDispatchService(prisma, audience);
  const b = new EventCommunicationDispatchService(prisma, audience);
  const prepare = async () => (await service.prepare(owner.id, event.id,
    { id: randomUUID(), draftId, draftRevision: 1, filters: {} })).id;
  const list = async id => (await service.list(owner.id, event.id)).batches.find(x => x.id === id);
  const postKeys = new Set();
  const post = async request => {
    const key = request.headers.get('Idempotency-Key');
    assert.equal(postKeys.has(key), false);
    postKeys.add(key);
    assert.deepEqual((await request.json()).message.to, [mailbox]);
    return 202;
  };
  const id = await prepare();
  assert.equal(await a.drain(post), 0);
  await assert.rejects(a.start('other-user', event.id, id), e => e.getStatus() === 404);
  await assert.rejects(a.start(owner.id, 'other-event', id), e => e.getStatus() === 503);
  process.env.EVOLVIA_PUBLIC_BASE_URL = 'https://production.example.test';
  await assert.rejects(a.start(owner.id, event.id, id), e => e.getStatus() === 503);
  process.env.EVOLVIA_PUBLIC_BASE_URL = env.EVOLVIA_PUBLIC_BASE_URL;
  await Promise.all([a.start(owner.id, event.id, id), b.start(owner.id, event.id, id)]);
  assert.equal(await prisma.auditLog.count({ where: { entityId: id, action: 'event.communication_batch_started' } }), 1);
  await Promise.all([a.drain(post), b.drain(post)]);
  const accepted = await prisma.eventCommunicationRecipient.findFirstOrThrow({ where: { batchId: id, status: 'ACCEPTED' } });
  assert.equal(postKeys.size, 1);
  let summary = await list(id);
  assert.equal(summary.acceptedCount, 1);
  assert.equal(summary.cancelledCount, 1);
  assert.equal(summary.receivedCount, 0);
  const evidence = createHash('sha256').update('fixture-mailbox-observation').digest('hex');
  const canonical = JSON.stringify(['bulk-mailbox-received-v1', org.id, event.id, id, accepted.id, evidence]);
  const sig = createHmac('sha256', Buffer.from(receiptKey, 'hex')).update(canonical).digest('hex');
  await assert.rejects(a.reconcile(event.id, id, accepted.id, evidence, '0'.repeat(64)), e => e.getStatus() === 404);
  await assert.rejects(a.reconcile('wrong', id, accepted.id, evidence, sig), e => e.getStatus() === 404);
  await Promise.all([a.reconcile(event.id, id, accepted.id, evidence, sig), b.reconcile(event.id, id, accepted.id, evidence, sig)]);
  assert.equal((await list(id)).receivedCount, 1);
  assert.equal(await prisma.auditLog.count({ where: { entityId: accepted.id, action: 'event.communication_mailbox_received' } }), 1);

  const revoked = await prepare();
  await a.start(owner.id, event.id, revoked);
  eligible = false;
  await a.drain(post);
  assert.equal((await list(revoked)).cancelledCount, 2);
  assert.equal(postKeys.size, 1);
  eligible = true;

  const uncertain = await prepare();
  await a.start(owner.id, event.id, uncertain);
  let calls = 0;
  const timeout = async () => { calls++; throw new Error('timeout after write'); };
  await a.drain(timeout);
  await b.drain(timeout);
  assert.equal(calls, 1);
  assert.equal((await list(uncertain)).unknownCount, 1);

  const retry = await prepare();
  await a.start(owner.id, event.id, retry);
  preflightFails = true;
  await a.drain(post);
  assert.equal((await list(retry)).pendingCount, 1);
  assert.equal(await b.drain(post), 0);
  preflightFails = false;
  await prisma.eventCommunicationRecipient.updateMany({ where: { batchId: retry, status: 'PENDING' }, data: { nextAttemptAt: new Date(0) } });
  await b.drain(post);
  assert.equal((await list(retry)).acceptedCount, 1);

  const stale = await prepare();
  await a.start(owner.id, event.id, stale);
  await prisma.eventCommunicationRecipient.updateMany({ where: { batchId: stale },
    data: { status: 'CLAIMED', claimToken: randomUUID(), claimUntil: new Date(0) } });
  await b.drain(post);
  summary = await list(stale);
  assert.equal(summary.unknownCount, 2);
  assert.equal(summary.status, 'UNKNOWN');
  assert.equal(postKeys.size, 2);
});
