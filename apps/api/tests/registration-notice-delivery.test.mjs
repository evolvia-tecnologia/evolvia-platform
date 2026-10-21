import assert from 'node:assert/strict';
import test from 'node:test';
import { RegistrationNoticeService } from '../dist/registration-notice.service.js';

const event = { id: 'evt_1', organizationId: 'org_1', name: 'Congresso Ensaio' };
const input = {
  subject: 'Mudança de horário',
  body: 'A abertura passou para as 9h.',
  categoryId: null,
  continuationCursor: null,
  presence: null,
  scientificResult: null,
};

function harness(rows) {
  const audits = [];
  const prisma = {
    event: { findUnique: async () => ({ ...event, timeZone: 'America/Sao_Paulo' }) },
    eventRegistrationCategory: { findMany: async () => [], findFirst: async () => null },
    eventDayPresence: {
      findFirst: async () => null,
      findMany: async () => { throw new Error('presença não pedida'); },
      count: async () => 0,
    },
    eventRegistrationReservation: {
      findFirst: async () => null,
      findMany: async ({ where, select }) => {
        assert.equal(where.organizationId, event.organizationId);
        assert.equal(where.eventId, event.id);
        assert.equal(where.status, 'CONFIRMED');
        if (where.id?.in) {
          assert.deepEqual(select, { id: true, registrationData: true });
          return rows.filter((row) => where.id.in.includes(row.id));
        }
        assert.deepEqual(select, { id: true });
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

test('presença sem fuso não envia nem audita', async () => {
  const { audits, prisma, service } = harness([]);
  prisma.event.findUnique = async () => ({ ...event, timeZone: '  ' });
  let called = 0;
  await assert.rejects(
    () => service.send('user_1', event.id, { ...input, presence: 'PRESENT' }, 'aviso-operacional-03', async () => { called += 1; return 204; }),
    /fuso horário/u,
  );
  assert.equal(called, 0);
  assert.equal(audits.length, 0);
});

test('ausência e resultado científico restringem o lote e a auditoria guarda só o código', async () => {
  const previous = {
    endpoint: process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT,
    token: process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN,
    sender: process.env.EVOLVIA_EMAIL_FROM,
  };
  process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT = 'https://mail.example/send';
  process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN = 'token-local';
  process.env.EVOLVIA_EMAIL_FROM = 'avisos@eventos.example';
  try {
    const rows = [{ id: 'c0123456789abcdefghijk', registrationData: { email: 'pessoa@example.com' } }];
    const { audits, prisma, service } = harness(rows);
    let where;
    const original = prisma.eventRegistrationReservation.findMany;
    prisma.eventRegistrationReservation.findMany = async (args) => {
      if (!args.where.id?.in) where = args.where;
      return original(args);
    };
    const result = await service.send('user_1', event.id, {
      ...input,
      presence: 'ABSENT',
      scientificResult: 'REJECTED',
    }, 'aviso-operacional-05', async () => 204);
    assert.equal(result.delivered, 1);
    assert.equal(where.dayPresences.none.reversedAt, null);
    assert.equal(where.dayPresences.none.eventId, event.id);
    assert.equal(where.dayPresences.none.organizationId, event.organizationId);
    assert.ok(where.dayPresences.none.day instanceof Date);
    assert.equal(where.authorSubmissions.some.status, 'REJECTED');
    assert.equal(where.authorSubmissions.some.eventId, event.id);
    assert.equal(where.authorSubmissions.some.organizationId, event.organizationId);
    assert.equal(audits[0].metadata.presence, 'ABSENT');
    assert.equal(audits[0].metadata.scientificResult, 'REJECTED');
    assert.equal(JSON.stringify(audits).includes('pessoa@example.com'), false);
    assert.equal(JSON.stringify(audits).includes(input.subject), false);
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

test('presença do dia consulta o registro do dia antes da ficha', async () => {
  const previous = {
    endpoint: process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT,
    token: process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN,
    sender: process.env.EVOLVIA_EMAIL_FROM,
  };
  process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT = 'https://mail.example/send';
  process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN = 'token-local';
  process.env.EVOLVIA_EMAIL_FROM = 'avisos@eventos.example';
  try {
    const id = 'c0123456789abcdefghijk';
    const { audits, prisma, service } = harness([{ id, registrationData: { email: 'pessoa@example.com' } }]);
    let presenceWhere;
    prisma.eventDayPresence.findMany = async ({ where, select }) => {
      presenceWhere = where;
      assert.deepEqual(select, { reservationId: true });
      assert.equal(where.organizationId, event.organizationId);
      assert.equal(where.eventId, event.id);
      assert.equal(where.reversedAt, null);
      assert.ok(where.day instanceof Date);
      assert.equal(where.reservation.status, 'CONFIRMED');
      assert.equal(where.reservation.id, undefined);
      assert.equal(where.reservationId, undefined);
      assert.equal(JSON.stringify(where).includes('registrationData'), false);
      return [{ reservationId: id }];
    };
    const result = await service.send('user_1', event.id, {
      ...input,
      presence: 'PRESENT',
      scientificResult: 'ACCEPTED',
    }, 'aviso-operacional-06', async () => 204);
    assert.equal(result.delivered, 1);
    assert.equal(presenceWhere.reservation.authorSubmissions.some.status, 'ACCEPTED');
    assert.equal(presenceWhere.reservation.authorSubmissions.some.organizationId, event.organizationId);
    assert.equal(audits[0].metadata.presence, 'PRESENT');
    assert.equal(audits[0].metadata.scientificResult, 'ACCEPTED');
    assert.equal(JSON.stringify(audits).includes('pessoa@example.com'), false);
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

test('o lote dispara os avisos juntos e só audita depois', async () => {
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
      { id: 'c1123456789abcdefghijk', registrationData: { email: 'outra@example.com' } },
    ];
    const { audits, service } = harness(rows);
    let inFlight = 0;
    let maxInFlight = 0;
    const result = await service.send('user_1', event.id, input, 'aviso-operacional-08', async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      assert.equal(audits.length, 0);
      return 204;
    });
    assert.ok(maxInFlight >= 2);
    assert.deepEqual(result, { delivered: 2, failed: 0, skipped: 0, remaining: 0, continuationCursor: null });
    assert.equal(audits.length, 1);
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

test('o recado individual fica na inscrição confirmada deste evento e a repetição não reenvia', async () => {
  const previous = {
    endpoint: process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT,
    token: process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN,
    sender: process.env.EVOLVIA_EMAIL_FROM,
  };
  process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT = 'https://mail.example/send';
  process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN = 'token-local';
  process.env.EVOLVIA_EMAIL_FROM = 'avisos@eventos.example';
  try {
    const direct = { subject: 'Mudança de sala', body: 'A sala passou a ser a 2.', protocol: 'EVO-0123456789ABCDEF' };
    const { audits, prisma, service } = harness([]);
    prisma.eventRegistrationReservation.findFirst = async ({ where }) => {
      assert.equal(where.organizationId, event.organizationId);
      assert.equal(where.eventId, event.id);
      assert.equal(where.status, 'CONFIRMED');
      assert.equal(where.protocol, direct.protocol);
      return { id: 'c0123456789abcdefghijk', registrationData: { email: 'pessoa@example.com' } };
    };
    const sent = [];
    const first = await service.sendDirect('user_1', event.id, direct, 'aviso-individual-01', async (_url, body) => {
      sent.push(JSON.parse(body).message.to[0]);
      return 204;
    });
    assert.deepEqual(sent, ['pessoa@example.com']);
    assert.deepEqual(first, { delivered: 1, failed: 0, skipped: 0 });
    assert.equal(JSON.stringify(audits).includes('pessoa@example.com'), false);
    assert.equal(JSON.stringify(audits).includes(direct.protocol), false);
    assert.equal(JSON.stringify(audits).includes(direct.body), false);
    prisma.auditLog.findFirst = async () => audits[0];
    prisma.eventRegistrationReservation.findFirst = async () => { throw new Error('não deveria reler a ficha'); };
    const replay = await service.sendDirect('user_1', event.id, direct, 'aviso-individual-01', async () => 204);
    assert.deepEqual(replay, first);
    prisma.auditLog.findFirst = async () => null;
    prisma.eventRegistrationReservation.findFirst = async () => null;
    await assert.rejects(
      () => service.sendDirect('user_1', event.id, { ...direct, protocol: 'EVO-FFFFFFFFFFFFFFFF' }, 'aviso-individual-02', async () => 204),
      /não encontrada/u,
    );
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
