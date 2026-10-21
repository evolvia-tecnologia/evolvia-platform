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

function harness(status = 'CONFIRMED', data = { email: recipient }, options = {}) {
  const audits = [];
  const reservation = {
    status,
    registrationData: data,
    event: { name: 'Congresso Ensaio', organizationId: options.eventOrg ?? 'org_1' },
  };
  const prisma = {
    eventRegistrationReservation: {
      findFirst: async ({ where }) => {
        assert.equal(where.organizationId, notice.organizationId);
        assert.equal(where.eventId, notice.eventId);
        assert.equal(where.id, notice.reservationId);
        if (options.missing) return null;
        return reservation;
      },
      update: async () => { throw new Error('a inscrição confirmada não pode ser alterada pelo e-mail'); },
    },
    auditLog: {
      findMany: async ({ where }) => audits.filter((row) => where.action.in.includes(row.action) && row.entityId === where.entityId),
      create: async ({ data: row }) => {
        if (options.failAudit) throw new Error('auditoria indisponível');
        audits.push(row);
        return row;
      },
    },
  };
  return { audits, reservation, service: new RegistrationConfirmationMailService(prisma) };
}

function withDeliveryEnv(run) {
  const previous = {
    EVOLVIA_EMAIL_DELIVERY_ENDPOINT: process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT,
    EVOLVIA_EMAIL_DELIVERY_TOKEN: process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN,
    EVOLVIA_EMAIL_FROM: process.env.EVOLVIA_EMAIL_FROM,
    EVOLVIA_PUBLIC_BASE_URL: process.env.EVOLVIA_PUBLIC_BASE_URL,
  };
  return async () => {
    try {
      await run();
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  };
}

test('aceite do provedor não prova recebimento e a inscrição confirmada permanece', withDeliveryEnv(async () => {
  process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT = 'https://mail.example/send';
  process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN = 'token-local';
  process.env.EVOLVIA_EMAIL_FROM = 'avisos@eventos.example';
  process.env.EVOLVIA_PUBLIC_BASE_URL = 'https://eventos.example';

  const posts = [];
  const { audits, reservation, service } = harness();
  const poster = async (url, body, headers) => {
    posts.push({ url, body: JSON.parse(body), headers });
    return posts.length === 1 ? 204 : 500;
  };
  await service.sendConfirmed(notice, poster);
  await service.sendConfirmed(notice, poster);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.message.to[0], recipient);
  assert.match(posts[0].body.message.text, new RegExp(protocol, 'u'));
  assert.match(posts[0].body.message.text, /Acompanhe a inscrição:/u);
  assert.match(posts[0].headers['Idempotency-Key'], /^[a-f0-9]{64}$/u);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'registration.confirmation_email_accepted');
  assert.deepEqual(audits[0].metadata, {
    delivered: false,
    providerAccepted: true,
    received: false,
    reason: 'provider_accepted',
  });
  assert.equal(reservation.status, 'CONFIRMED');
  assert.equal(JSON.stringify(audits).includes(recipient), false);
  assert.equal(JSON.stringify(audits).includes(protocol), false);

  const rejected = harness();
  await rejected.service.sendConfirmed(notice, async () => 502);
  assert.deepEqual(rejected.audits[0].metadata, {
    delivered: false,
    providerAccepted: false,
    received: false,
    reason: 'rejected',
  });
  assert.equal(rejected.reservation.status, 'CONFIRMED');

  const missing = harness('CONFIRMED', {});
  let called = false;
  await missing.service.sendConfirmed(notice, async () => { called = true; return 204; });
  assert.equal(called, false);
  assert.equal(missing.audits[0].metadata.reason, 'missing_recipient');
}));

test('timeout após aceite e falha de auditoria não desfazem a inscrição', withDeliveryEnv(async () => {
  process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT = 'https://mail.example/send';
  process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN = 'token-local';
  process.env.EVOLVIA_EMAIL_FROM = 'avisos@eventos.example';
  process.env.EVOLVIA_PUBLIC_BASE_URL = 'https://eventos.example';

  const timed = harness();
  await assert.doesNotReject(() => timed.service.sendConfirmed(notice, async () => {
    throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
  }));
  assert.equal(timed.audits[0].metadata.reason, 'timeout');
  assert.equal(timed.audits[0].metadata.received, false);
  assert.equal(timed.reservation.status, 'CONFIRMED');

  const auditDown = harness('CONFIRMED', { email: recipient }, { failAudit: true });
  await assert.doesNotReject(() => auditDown.service.sendConfirmed(notice, async () => 204));
  assert.equal(auditDown.audits.length, 0);
  assert.equal(auditDown.reservation.status, 'CONFIRMED');
}));

test('sem configuração, isolamento e o teto de três falhas encerram a tentativa', withDeliveryEnv(async () => {
  delete process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT;
  delete process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN;
  delete process.env.EVOLVIA_EMAIL_FROM;
  delete process.env.EVOLVIA_PUBLIC_BASE_URL;

  const { audits, reservation, service } = harness();
  let called = 0;
  await service.sendConfirmed(notice, async () => { called += 1; return 204; });
  assert.equal(called, 0);
  assert.equal(audits[0].metadata.reason, 'not_configured');
  assert.equal(reservation.status, 'CONFIRMED');

  const isolated = harness('CONFIRMED', { email: recipient }, { eventOrg: 'org_outra' });
  let isolatedCalls = 0;
  await isolated.service.sendConfirmed(notice, async () => { isolatedCalls += 1; return 204; });
  assert.equal(isolatedCalls, 0);
  assert.equal(isolated.audits.length, 0);

  const missing = harness('CONFIRMED', { email: recipient }, { missing: true });
  let missingCalls = 0;
  await missing.service.sendConfirmed(notice, async () => { missingCalls += 1; return 204; });
  assert.equal(missingCalls, 0);
  assert.equal(missing.audits.length, 0);

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
  assert.equal(limited.reservation.status, 'CONFIRMED');
}));
