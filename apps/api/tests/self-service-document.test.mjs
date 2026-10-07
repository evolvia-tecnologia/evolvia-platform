import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { CheckInService } from '../dist/check-in.service.js';
import { issueCheckInCode } from '../dist/check-in-policy.js';
import { DeskPolicyError, normalizeSelfServiceRequest } from '../src/event-desk-policy.ts';
import { RegistrationReservationPolicyError, normalizePublicRegistration } from '../src/registration-reservations-policy.ts';

const SECRET = 'segredo-de-teste-do-totem-com-tamanho-suficiente';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function storedIdentity(document) {
  const result = normalizePublicRegistration({
    categoryId: 'category_valid_01',
    lotId: 'lot_valid_000001',
    answers: {
      full_name: 'Pessoa Participante',
      preferred_name: 'Pessoa',
      identity_document: document,
      email: 'pessoa@example.com',
      phone: '11999999999',
      terms_acceptance: true,
    },
  });
  return String(result.answers.identity_document);
}

test('o totem gera o mesmo hash que a ficha grava para CPF e passaporte', () => {
  for (const typed of ['529.982.247-25', '52998224725', 'ab-123 456', 'AB123456', 'x1/2.3-4']) {
    const kiosk = normalizeSelfServiceRequest({ method: 'CPF', value: ` ${typed} ` }).value;
    assert.equal(sha256(kiosk), sha256(storedIdentity(typed)), typed);
  }
});

test('documentos que a ficha recusa também são recusados no totem', () => {
  for (const typed of ['529.982.247-24', '111.111.111-11', '12345678901', 'AB12', 'AB_12345', 'A'.repeat(41)]) {
    assert.throws(() => storedIdentity(typed), RegistrationReservationPolicyError, typed);
    assert.throws(() => normalizeSelfServiceRequest({ method: 'CPF', value: typed }), DeskPolicyError, typed);
  }
});

function fakePrisma() {
  const events = [
    { id: 'event_a', name: 'Evento A', slug: 'evento-a', organizationId: 'org_a' },
    { id: 'event_b', name: 'Evento B', slug: 'evento-b', organizationId: 'org_b' },
  ];
  const row = (id, eventId, organizationId, status, document, protocol) => ({
    id, eventId, organizationId, status, protocol,
    identityHash: sha256(storedIdentity(document)),
    emailHash: sha256(`${id}@example.com`),
    registrationData: { full_name: `Pessoa ${id}`, identity_document: storedIdentity(document), email: `${id}@example.com`, phone: '11999999999' },
    category: { name: 'Participante' },
  });
  const reservations = [
    row('rescpfaaaa01', 'event_a', 'org_a', 'CONFIRMED', '529.982.247-25', 'EVO-AAAA0000BBBB1111'),
    row('respassaaa01', 'event_a', 'org_a', 'CONFIRMED', 'ab-123456', 'EVO-AAAA0000BBBB2222'),
    row('respassbbb01', 'event_b', 'org_b', 'CONFIRMED', 'AB123456', 'EVO-AAAA0000BBBB3333'),
    row('respendaaa01', 'event_a', 'org_a', 'PENDING', 'XY998877', 'EVO-AAAA0000BBBB4444'),
  ];
  const checkIns = new Map();
  const audits = [];
  const queries = [];
  const pick = (item, select) => Object.fromEntries(Object.keys(select).map((key) => [key, item[key]]));
  const matches = (item, where) => Object.entries(where).every(([key, value]) => item[key] === value);
  const checkInTable = {
    findUnique: async ({ where }) => checkIns.get(where.reservationId) ?? null,
    findFirst: async ({ where }) => [...checkIns.values()].find((item) => matches(item, where)) ?? null,
    create: async ({ data }) => { checkIns.set(data.reservationId, { ...data, reversedAt: null, reversalReason: null }); },
  };
  const db = {
    event: {
      findFirst: async ({ where }) => {
        const event = events.find((item) => item.slug === where.slug && where.status === 'PUBLISHED');
        return event ? {
          ...event,
          capabilities: [{ config: { selfService: { cpf: true, email: true, qr: true, protocol: true } } }],
          eventPublication: null,
        } : null;
      },
    },
    eventRegistrationReservation: {
      findMany: async ({ where, select, take }) => {
        queries.push(where);
        return reservations.filter((item) => matches(item, where)).slice(0, take).map((item) => pick(item, select));
      },
      findFirst: async ({ where, select }) => {
        queries.push(where);
        const found = reservations.find((item) => matches(item, where));
        return found ? pick(found, select) : null;
      },
    },
    eventRegistrationCheckIn: checkInTable,
    auditLog: { create: async ({ data }) => { audits.push(data); } },
  };
  db.$transaction = async (callback) => callback(db);
  return { db, checkIns, audits, queries };
}

test('CPF e passaporte encontram só a inscrição confirmada do evento do totem', async () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
  try {
    const { db, checkIns, audits, queries } = fakePrisma();
    const service = new CheckInService(db, {});

    const cpf = await service.selfServicePreview('evento-a', { method: 'CPF', value: '529.982.247-25' });
    assert.deepEqual(Object.keys(cpf).sort(), ['alreadyCheckedIn', 'category', 'company', 'name']);
    assert.equal(cpf.name, 'Pessoa rescpfaaaa01');

    const passport = await service.selfServicePreview('evento-a', { method: 'CPF', value: 'ab 123456' });
    assert.equal(passport.name, 'Pessoa respassaaa01');
    const other = await service.selfServicePreview('evento-b', { method: 'CPF', value: 'AB-123456' });
    assert.equal(other.name, 'Pessoa respassbbb01');
    for (const where of queries) {
      assert.equal(where.status, 'CONFIRMED');
      assert.ok(where.eventId && where.organizationId);
      assert.deepEqual([where.eventId, where.organizationId], where.eventId === 'event_a' ? ['event_a', 'org_a'] : ['event_b', 'org_b']);
    }

    await assert.rejects(service.selfServicePreview('evento-a', { method: 'CPF', value: 'XY998877' }), /Não encontramos uma inscrição confirmada/u);
    await assert.rejects(service.selfServicePreview('evento-a', { method: 'CPF', value: '529.982.247-24' }), /Informe um CPF válido/u);
    await assert.rejects(service.selfServicePreview('evento-a', { method: 'CPF', value: 'AB12' }), /CPF ou passaporte válido/u);
    await assert.rejects(service.selfServicePreview('evento-inexistente', { method: 'CPF', value: 'AB123456' }), /Evento não encontrado/u);

    assert.equal((await service.selfServicePreview('evento-a', { method: 'EMAIL', value: 'RESPASSAAA01@example.com' })).name, 'Pessoa respassaaa01');
    assert.equal((await service.selfServicePreview('evento-a', { method: 'PROTOCOL', value: 'evo-aaaa0000bbbb1111' })).name, 'Pessoa rescpfaaaa01');
    const qr = issueCheckInCode('event_a', 'respassaaa01', SECRET);
    assert.equal((await service.selfServicePreview('evento-a', { method: 'QR', value: qr })).name, 'Pessoa respassaaa01');
    await assert.rejects(service.selfServicePreview('evento-b', { method: 'QR', value: qr }), /QR Code inválido para este evento/u);

    const first = await service.selfServicePrint('evento-a', { method: 'CPF', value: 'AB123456' });
    const again = await service.selfServicePrint('evento-a', { method: 'CPF', value: 'ab-123456' });
    assert.equal(first.alreadyCheckedIn, false);
    assert.equal(again.alreadyCheckedIn, true);
    assert.equal(again.checkedInAt, first.checkedInAt);
    assert.equal(checkIns.size, 1);
    assert.equal(checkIns.get('respassaaa01').eventId, 'event_a');
    assert.equal(audits.length, 1);
    assert.deepEqual(Object.keys(audits[0].metadata).sort(), ['checkedInAt', 'method', 'source']);
    const serialized = JSON.stringify({ first, audits });
    for (const secret of ['AB123456', '52998224725', sha256('AB123456')]) assert.ok(!serialized.includes(secret));
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});
