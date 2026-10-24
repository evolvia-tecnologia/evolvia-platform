import assert from 'node:assert/strict';
import test from 'node:test';
import { RegistrationConfirmationMailService } from '../dist/registration-confirmation-mail.service.js';

const protocol = 'EVO-0123456789ABCDEF';
const recipient = 'pessoa@example.com';
const notice = {
  organizationId: 'org_1',
  eventId: 'evt_1',
  reservationId: 'res_1',
  protocol,
  slug: 'ensaio-lotes',
};

function harness(status = 'CONFIRMED', data = { email: recipient }) {
  const audits = [];
  const prisma = {
    eventRegistrationReservation: {
      findFirst: async ({ where }) => {
        assert.equal(where.organizationId, notice.organizationId);
        assert.equal(where.eventId, notice.eventId);
        assert.equal(where.id, notice.reservationId);
        if (where.organizationId !== 'org_1') return null;
        return { status, registrationData: data, event: { name: 'Congresso Ensaio', organizationId: 'org_1' } };
      },
    },
    auditLog: {
      findMany: async ({ where }) => audits.filter((row) => where.action.in.includes(row.action) && row.entityId === where.entityId),
      create: async ({ data: row }) => { audits.push(row); return row; },
    },
  };
  return { audits, service: new RegistrationConfirmationMailService(prisma) };
}

test('só a resposta de sucesso marca a confirmação como enviada', async () => {
  const previous = {
    endpoint: process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT,
    token: process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN,
    sender: process.env.EVOLVIA_EMAIL_FROM,
    base: process.env.EVOLVIA_PUBLIC_BASE_URL,
  };
  process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT = 'https://mail.example/send';
  process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN = 'token-local';
  process.env.EVOLVIA_EMAIL_FROM = 'avisos@eventos.example';
  process.env.EVOLVIA_PUBLIC_BASE_URL = 'https://eventos.example';
  try {
    const posts = [];
    const { audits, service } = harness();
    const poster = async (url, body, headers) => {
      posts.push({ url, body: JSON.parse(body), headers });
      return posts.length === 1 ? 204 : 500;
    };
    await service.sendConfirmed(notice, poster);
    await service.sendConfirmed(notice, poster);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].body.message.to[0], recipient);
    assert.match(posts[0].body.message.text, new RegExp(protocol, 'u'));
    assert.match(posts[0].headers['Idempotency-Key'], /^[a-f0-9]{64}$/u);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, 'registration.confirmation_email_delivered');
    assert.deepEqual(audits[0].metadata, { delivered: true, reason: 'delivered' });
    assert.equal(JSON.stringify(audits).includes(recipient), false);
    assert.equal(JSON.stringify(audits).includes(protocol), false);

    const rejected = harness();
    await rejected.service.sendConfirmed(notice, async () => 502);
    assert.deepEqual(rejected.audits[0].metadata, { delivered: false, reason: 'rejected' });

    const missing = harness('CONFIRMED', {});
    let called = false;
    await missing.service.sendConfirmed(notice, async () => { called = true; return 204; });
    assert.equal(called, false);
    assert.equal(missing.audits[0].metadata.reason, 'missing_recipient');
  } finally {
    process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT = previous.endpoint;
    process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN = previous.token;
    process.env.EVOLVIA_EMAIL_FROM = previous.sender;
    process.env.EVOLVIA_PUBLIC_BASE_URL = previous.base;
  }
});

test('sem configuração não marca enviado e a terceira falha encerra a tentativa', async () => {
  const previous = {
    endpoint: process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT,
    token: process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN,
    sender: process.env.EVOLVIA_EMAIL_FROM,
    base: process.env.EVOLVIA_PUBLIC_BASE_URL,
  };
  delete process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT;
  delete process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN;
  delete process.env.EVOLVIA_EMAIL_FROM;
  delete process.env.EVOLVIA_PUBLIC_BASE_URL;
  try {
    const { audits, service } = harness();
    let called = 0;
    await service.sendConfirmed(notice, async () => { called += 1; return 204; });
    assert.equal(called, 0);
    assert.equal(audits[0].metadata.reason, 'not_configured');

    process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT = 'https://mail.example/send';
    process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN = 'token-local';
    process.env.EVOLVIA_EMAIL_FROM = 'avisos@eventos.example';
    process.env.EVOLVIA_PUBLIC_BASE_URL = 'https://eventos.example';
    const limited = harness();
    let calls = 0;
    const reject = async () => { calls += 1; return 500; };
    await limited.service.sendConfirmed(notice, reject);
    await limited.service.sendConfirmed(notice, reject);
    await limited.service.sendConfirmed(notice, reject);
    await limited.service.sendConfirmed(notice, reject);
    assert.equal(calls, 3);
    assert.equal(limited.audits.length, 3);
  } finally {
    for (const [key, value] of Object.entries({
      EVOLVIA_EMAIL_DELIVERY_ENDPOINT: previous.endpoint,
      EVOLVIA_EMAIL_DELIVERY_TOKEN: previous.token,
      EVOLVIA_EMAIL_FROM: previous.sender,
      EVOLVIA_PUBLIC_BASE_URL: previous.base,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
