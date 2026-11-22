import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { verifyConfirmationInbox } from '../scripts/verify-confirmation-inbox.mjs';
import { credentialUrl } from '../dist/registration-confirmation-mail.policy.js';

test('a leitura da caixa de teste é isolada, verifica a mensagem e persiste uma única evidência', async t => {
  const prisma = new PrismaClient();
  t.after(() => prisma.$disconnect());
  const hex = () => randomBytes(32).toString('hex');
  const slug = 'inbox-' + hex().slice(0, 14);
  const to = 'participante@example.invalid';
  const from = 'evolvia@example.invalid';
  const user = await prisma.user.create({ data: { email: slug + '@example.invalid', name: 'Teste', passwordHash: 'x' } });
  const org = await prisma.organization.create({ data: { name: slug, slug, createdById: user.id } });
  const scope = { organizationId: org.id };
  const event = await prisma.event.create({ data: { ...scope, slug, name: slug, ownerId: user.id, eventType: 'Outro tipo de evento', format: 'IN_PERSON', registrationMode: 'PAID' } });
  scope.eventId = event.id;
  const catalog = await prisma.eventRegistrationCatalog.create({ data: scope });
  const category = await prisma.eventRegistrationCategory.create({ data: { ...scope, catalogId: catalog.id, name: 'Geral', code: 'geral' } });
  const lot = await prisma.eventRegistrationLot.create({ data: { ...scope, categoryId: category.id, code: 'lot', name: 'Lote',
    startsAt: new Date(0), endsAt: new Date(), priceCents: 750 } });
  const protocol = 'EVO-' + hex().slice(0, 16).toUpperCase();
  const row = await prisma.eventRegistrationReservation.create({ data: { ...scope, categoryId: category.id, lotId: lot.id,
    protocol, idempotencyKeyHash: hex(), payloadHash: hex(), identityHash: hex(), emailHash: hex(),
    registrationData: { email: to }, basePriceCents: 750, finalPriceCents: 750, status: 'CONFIRMED' } });
  const env = { EVOLVIA_TEST_MAIL_ORGANIZATION_ID: org.id, EVOLVIA_TEST_MAIL_RECIPIENT: to,
    EVOLVIA_TEST_MAIL_ACCOUNT_ID: 'test', EVOLVIA_TEST_MAIL_INBOX_ID: 'inbox', EVOLVIA_TEST_MAIL_TOKEN: 'fixture',
    EVOLVIA_TEST_MAIL_JMAP_URL: 'https://inbox.example.invalid/api', EVOLVIA_EMAIL_FROM: from,
    EVOLVIA_EMAIL_DELIVERY_ENDPOINT: 'https://gateway.example.invalid/send', EVOLVIA_EMAIL_DELIVERY_TOKEN: 'fixture',
    EVOLVIA_PUBLIC_BASE_URL: 'https://evolvia.example.invalid' };
  const mail = { id: 'message', mailboxIds: { inbox: true }, from: [{ email: from }], to: [{ email: to }],
    subject: 'Sua inscrição foi confirmada', textBody: [{ partId: '1' }], bodyValues: { '1': { value: [
      'Protocolo: ' + protocol, 'Acompanhe a inscrição: ' + credentialUrl(env.EVOLVIA_PUBLIC_BASE_URL, slug, protocol),
    ].join('\n') } } };
  let reads = 0;
  const transport = async (url, init) => {
    reads++;
    assert.equal(url.href, env.EVOLVIA_TEST_MAIL_JMAP_URL);
    assert.equal(init.redirect, 'error');
    assert.equal(JSON.parse(init.body).methodCalls[0][0], 'Email/get');
    return Response.json({ methodResponses: [['Email/get', { accountId: 'test', list: [mail] }, 'verify']] });
  };
  const verify = (settings = env) => verifyConfirmationInbox(prisma, row.id, 'message', settings, transport);
  await assert.rejects(verify(), /Aceite/);
  await assert.rejects(verify({ ...env, EVOLVIA_TEST_MAIL_ORGANIZATION_ID: 'outra' }), /Inscrição/);
  assert.equal(reads, 0);
  const entity = { ...scope, entityType: 'EventRegistrationReservation', entityId: row.id };
  await prisma.auditLog.create({ data: { ...entity, action: 'registration.confirmation_email_accepted' } });
  mail.mailboxIds = { drafts: true };
  await assert.rejects(verify(), /não comprova/);
  mail.mailboxIds = { inbox: true };
  mail.to = [{ email: from }];
  await assert.rejects(verify(), /não comprova/);
  mail.to = [{ email: to }];
  const action = 'registration.confirmation_test_inbox_received';
  assert.equal(await prisma.auditLog.count({ where: { ...entity, action } }), 0);
  await Promise.all([verify(), verify()]);
  const evidence = await prisma.auditLog.findMany({ where: { ...entity, action } });
  assert.equal(evidence.length, 1);
  const { evidenceHash, ...metadata } = evidence[0].metadata;
  assert.match(evidenceHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(metadata, { environment: 'TEST', received: true, evidence: 'authenticated_mailbox_read' });
});
