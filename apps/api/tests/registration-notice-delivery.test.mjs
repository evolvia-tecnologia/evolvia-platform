import assert from 'node:assert/strict';
import test from 'node:test';
import { RegistrationNoticeService } from '../dist/registration-notice.service.js';

const event = { id: 'evt_1', organizationId: 'org_1', name: 'Congresso Ensaio' };
const input = {
  subject: 'Mudança de horário',
  body: 'A abertura passou para as 9h.',
  categoryId: null,
  continuationCursor: null,
};

function harness(rows) {
  const audits = [];
  const prisma = {
    event: { findUnique: async () => event },
    eventRegistrationCategory: { findMany: async () => [], findFirst: async () => null },
    eventRegistrationReservation: {
      findFirst: async () => null,
      findMany: async ({ where }) => {
        assert.equal(where.organizationId, event.organizationId);
        assert.equal(where.eventId, event.id);
        assert.equal(where.status, 'CONFIRMED');
        return rows;
      },
      count: async () => 0,
    },
    auditLog: {
      findFirst: async () => null,
      create: async ({ data }) => { audits.push(data); return data; },
    },
  };
  const authorization = { requireRole: async (_userId, organizationId) => { assert.equal(organizationId, event.organizationId); } };
  return { audits, prisma, service: new RegistrationNoticeService(prisma, authorization) };
}

test('sem canal configurado nada é marcado como enviado', async () => {
  const previous = process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT;
  delete process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT;
  try {
    const { audits, service } = harness([{ id: 'c0123456789abcdefghijk', registrationData: { email: 'pessoa@example.com' } }]);
    let called = 0;
    await assert.rejects(
      () => service.send('user_1', event.id, input, 'aviso-operacional-01', async () => { called += 1; return 204; }),
      /não está configurado/u,
    );
    assert.equal(called, 0);
    assert.equal(audits.length, 0);
  } finally {
    if (previous === undefined) delete process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT;
    else process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT = previous;
  }
});

test('o lote confirma só quem o provedor aceitou e a repetição não reenvia', async () => {
  const previous = {
    endpoint: process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT,
    token: process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN,
    sender: process.env.EVOLVIA_EMAIL_FROM,
  };
  process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT = 'https://mail.example/send';
  process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN = 'token-local';
  process.env.EVOLVIA_EMAIL_FROM = 'avisos@eventos.example';
  try {
    const rows = [
      { id: 'c0123456789abcdefghijk', registrationData: { email: 'pessoa@example.com' } },
      { id: 'c1123456789abcdefghijk', registrationData: { email: 'sem-arroba' } },
      { id: 'c2123456789abcdefghijk', registrationData: { email: 'outra@example.com' } },
    ];
    const sent = [];
    const { audits, prisma, service } = harness(rows);
    const first = await service.send('user_1', event.id, input, 'aviso-operacional-02', async (_url, body) => {
      const message = JSON.parse(body);
      sent.push(message.message.to[0]);
      return message.message.to[0] === 'outra@example.com' ? 502 : 204;
    });
    assert.deepEqual(sent, ['pessoa@example.com', 'outra@example.com']);
    assert.deepEqual(first, { delivered: 1, failed: 1, skipped: 1, remaining: 0, continuationCursor: null });
    assert.equal(JSON.stringify(audits).includes('pessoa@example.com'), false);
    assert.equal(JSON.stringify(audits).includes(input.body), false);
    prisma.auditLog.findFirst = async () => audits[0];
    prisma.auditLog.create = async () => { throw new Error('não deveria gravar de novo'); };
    prisma.eventRegistrationReservation.findMany = async () => { throw new Error('não deveria reler a ficha'); };
    const replay = await service.send('user_1', event.id, input, 'aviso-operacional-02', async () => 204);
    assert.deepEqual(replay, first);
  } finally {
    for (const [key, value] of Object.entries({
      EVOLVIA_EMAIL_DELIVERY_ENDPOINT: previous.endpoint,
      EVOLVIA_EMAIL_DELIVERY_TOKEN: previous.token,
      EVOLVIA_EMAIL_FROM: previous.sender,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
