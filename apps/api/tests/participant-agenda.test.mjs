import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { ParticipantAgendaService } from '../dist/participant-agenda.service.js';
import { classifyAgenda, emailMatchesHash, enrollmentBlockReason } from '../dist/participant-agenda.policy.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');

test('reserva relê inscrição na transação antes de vaga, preferência ou repetição', async () => {
  for (const reservation of [null, { status: 'CANCELLED' }, { status: 'PENDING' }]) {
    for (const existing of [null, { id: 'old', status: 'ENROLLED' }, { id: 'old', status: 'REQUESTED' }]) {
      const state = { reads: 0, writes: 0 };
      const tx = {
        eventRegistrationReservation: { findUnique: async ({ where }) => {
          assert.deepEqual(where.id_eventId_organizationId, { id: 'res-1', eventId: 'event-1', organizationId: 'org-1' });
          state.reads += 1;
          return reservation;
        } },
        scientificProgramActivity: { findFirst: async () => { throw new Error('Não deve ler vaga antes da inscrição'); } },
        eventActivityEnrollment: {
          findUnique: async () => existing,
          create: async () => { state.writes += 1; },
          updateMany: async () => { state.writes += 1; },
        },
        auditLog: { create: async () => { state.writes += 1; } },
      };
      const prisma = { $transaction: async (run, options) => {
        assert.equal(options.isolationLevel, 'Serializable');
        return run(tx);
      } };
      const service = new ParticipantAgendaService(prisma, {
        requireConfirmedScope: async () => ({ eventId: 'event-1', organizationId: 'org-1', reservationId: 'res-1' }),
      });
      await assert.rejects(() => service.enroll('evento', 'Bearer test', 'activity-1'), /A inscrição não está confirmada/u);
      assert.equal(state.reads, 1);
      assert.equal(state.writes, 0);
    }
  }
});

test('inscrição confirmada mantém reserva imediata e preferência sem escrita duplicada', async () => {
  for (const confirmation of [false, true]) {
    const writes = [];
    const tx = {
      eventRegistrationReservation: {
        findUnique: async () => ({ id: 'res-1', status: 'CONFIRMED' }),
        findFirst: async () => ({ emailHash: null, registrationData: {} }),
      },
      scientificProgramActivity: { findFirst: async () => ({
        id: 'activity-1', status: 'PUBLISHED', space: { capacity: 10 }, _count: { participants: 0 },
        startAt: new Date('2026-11-01T12:00:00Z'), endAt: new Date('2026-11-01T13:00:00Z'),
      }) },
      eventActivityEnrollment: {
        findUnique: async () => writes.length ? { id: 'new', status: writes[0].status } : null,
        findMany: async () => [], count: async () => 0,
        create: async ({ data }) => { writes.push(data); },
      },
      eventCapability: { findUnique: async ({ where }) => where.eventId_code.code === 'activity_enrollment_limit'
        ? { status: 'ACTIVE', config: { max: 2, confirmByOrganization: confirmation } } : null },
      auditLog: { create: async () => {} },
    };
    const service = new ParticipantAgendaService({ $transaction: async (run) => run(tx) }, {
      requireConfirmedScope: async () => ({ eventId: 'event-1', organizationId: 'org-1', reservationId: 'res-1' }),
    });
    service.view = async () => ({});
    await service.enroll('evento', 'Bearer test', 'activity-1');
    await service.enroll('evento', 'Bearer test', 'activity-1');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].status, confirmation ? 'REQUESTED' : 'ENROLLED');
    assert.equal(writes[0].courtesy, false);
    assert.equal(writes[0].organizationId, 'org-1');
    assert.equal(writes[0].eventId, 'event-1');
  }
});

test('atividade em rascunho não consome o limite nem bloqueia o horário', async () => {
  const writes = [];
  const draft = {
    id: 'rascunho', status: 'DRAFT',
    startAt: new Date('2026-11-01T12:00:00Z'), endAt: new Date('2026-11-01T13:00:00Z'),
  };
  const tx = {
    eventRegistrationReservation: {
      findUnique: async () => ({ id: 'res-1', status: 'CONFIRMED' }),
      findFirst: async () => ({ emailHash: null, registrationData: {} }),
    },
    scientificProgramActivity: { findFirst: async () => ({
      id: 'activity-1', status: 'PUBLISHED', space: { capacity: 10 }, _count: { participants: 0 },
      startAt: new Date('2026-11-01T12:00:00Z'), endAt: new Date('2026-11-01T13:00:00Z'),
    }) },
    eventActivityEnrollment: {
      findUnique: async () => null,
      findMany: async ({ where }) => where.activity?.status === 'PUBLISHED' ? [] : [{ activity: draft }],
      count: async () => 0,
      create: async ({ data }) => { writes.push(data); },
    },
    eventCapability: { findUnique: async ({ where }) => where.eventId_code.code === 'activity_enrollment_limit'
      ? { status: 'ACTIVE', config: { max: 1, confirmByOrganization: false } } : null },
    scientificPerson: { findMany: async () => [] },
    scientificProgramParticipant: { findMany: async () => [] },
    auditLog: { create: async () => {} },
  };
  const service = new ParticipantAgendaService({ $transaction: async (run) => run(tx) }, {
    requireConfirmedScope: async () => ({ eventId: 'event-1', organizationId: 'org-1', reservationId: 'res-1' }),
  });
  service.view = async () => ({});
  await service.enroll('evento', 'Bearer test', 'activity-1');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].activityId, 'activity-1');
});

test('o e-mail do palestrante só coincide com o hash da própria inscrição', () => {
  const emailHash = hash('ana@example.test');
  assert.equal(emailMatchesHash(' Ana@Example.Test ', emailHash), true);
  assert.equal(emailMatchesHash('outra@example.test', emailHash), false);
  assert.equal(emailMatchesHash(null, emailHash), false);
  assert.equal(emailMatchesHash('ana@example.test', 'zz'), false);
});

test('vaga e horário da própria agenda bloqueiam a reserva', () => {
  const blocks = [{ id: 'fala', startAt: new Date('2026-10-15T12:00:00Z'), endAt: new Date('2026-10-15T13:00:00Z') }];
  assert.equal(enrollmentBlockReason({
    capacity: 2, speakers: 1, enrolled: 1,
    startAt: new Date('2026-10-15T15:00:00Z'), endAt: new Date('2026-10-15T16:00:00Z'),
    blocks, activityId: 'oficina',
  }), 'Não há vaga restante nesta atividade.');
  assert.equal(enrollmentBlockReason({
    capacity: 10, speakers: 1, enrolled: 0,
    startAt: new Date('2026-10-15T12:30:00Z'), endAt: new Date('2026-10-15T13:30:00Z'),
    blocks, activityId: 'oficina',
  }), 'Este horário cruza com outra atividade da sua agenda.');
  assert.equal(enrollmentBlockReason({
    capacity: null, speakers: 0, enrolled: 0,
    startAt: new Date('2026-10-15T15:00:00Z'), endAt: new Date('2026-10-15T16:00:00Z'),
    blocks: [], activityId: 'oficina',
  }), 'Esta atividade não tem vagas abertas.');
  assert.equal(enrollmentBlockReason({
    capacity: 10, speakers: 1, enrolled: 0,
    startAt: new Date('2026-10-15T12:00:00Z'), endAt: new Date('2026-10-15T13:00:00Z'),
    blocks, activityId: 'fala',
  }), null);
});

test('a agenda separa apresentação, escolha e vagas sem repetir a mesma atividade', () => {
  const view = classifyAgenda({
    speaking: [{ id: 'fala', title: 'Mesa', activityType: 'Mesa', startAt: '2026-10-15T12:00:00.000Z', endAt: '2026-10-15T13:00:00.000Z', spaceName: 'Auditório', participationType: 'SPEAKER', customRoleLabel: null }],
    enrolled: [{ id: 'poster', title: 'Pôster', activityType: 'Pôster', startAt: '2026-10-15T16:00:00.000Z', endAt: '2026-10-15T17:00:00.000Z', spaceName: 'Hall' }],
    catalog: [
      { id: 'fala', title: 'Mesa', activityType: 'Mesa', startAt: '2026-10-15T12:00:00.000Z', endAt: '2026-10-15T13:00:00.000Z', spaceName: 'Auditório', capacity: 20, speakers: 2, enrolledCount: 0 },
      { id: 'poster', title: 'Pôster', activityType: 'Pôster', startAt: '2026-10-15T16:00:00.000Z', endAt: '2026-10-15T17:00:00.000Z', spaceName: 'Hall', capacity: 30, speakers: 0, enrolledCount: 1 },
      { id: 'oficina', title: 'Oficina', activityType: 'Oficina', startAt: '2026-10-15T12:30:00.000Z', endAt: '2026-10-15T14:00:00.000Z', spaceName: 'Sala', capacity: 12, speakers: 1, enrolledCount: 2 },
    ],
  });
  assert.deepEqual(view.open.map((item) => [item.id, item.reason]), [['oficina', 'Este horário cruza com outra atividade da sua agenda.']]);
  assert.equal(view.speaking.length, 1);
  assert.equal(view.enrolled.length, 1);
});

test('a terceira falha serializável da reserva vira conflito', async () => {
  let attempts = 0;
  const service = new ParticipantAgendaService({
    $transaction: async () => {
      attempts += 1;
      throw new Prisma.PrismaClientKnownRequestError('serialization', { code: 'P2034', clientVersion: 'test' });
    },
  }, {
    requireConfirmedScope: async () => ({ eventId: 'event-1', organizationId: 'org-1', reservationId: 'res-1' }),
  });
  await assert.rejects(
    () => service.enroll('evento', 'Bearer token', 'atividade1'),
    (error) => {
      assert.equal(error.getStatus?.(), 409);
      assert.match(error.message, /Não foi possível reservar a vaga/u);
      return true;
    },
  );
  assert.equal(attempts, 3);
});

test('a consulta da agenda fica no evento da inscrição e não devolve e-mail', async () => {
  const emailHash = hash('ana@example.test');
  let reservationReads = 0;
  const prisma = {
    eventRegistrationReservation: { findUnique: async ({ where }) => {
      reservationReads += 1;
      assert.deepEqual(where.id_eventId_organizationId, { id: 'res-1', eventId: 'event-1', organizationId: 'org-1' });
      return { emailHash, registrationData: { email: 'Ana@Example.Test' }, event: { timeZone: 'America/Sao_Paulo' } };
    } },
    scientificPerson: { findMany: async ({ where }) => {
      assert.equal(where.eventId, 'event-1');
      assert.equal(where.organizationId, 'org-1');
      assert.equal(where.email, 'ana@example.test');
      return [{ id: 'person-1', email: 'ana@example.test' }];
    } },
    scientificProgramParticipant: { findMany: async ({ where }) => {
      assert.equal(where.eventId, 'event-1');
      assert.deepEqual(where.personId, { in: ['person-1'] });
      const row = {
        participationType: 'SPEAKER', customRoleLabel: null,
        activity: {
          id: 'fala', title: 'Mesa', activityType: 'Mesa', status: 'PUBLISHED',
          startAt: new Date('2026-10-15T12:00:00Z'), endAt: new Date('2026-10-15T13:00:00Z'),
          space: { name: 'Auditório', capacity: 20 },
        },
      };
      return [row, { ...row, participationType: 'CHAIR' }];
    } },
    eventActivityEnrollment: { findMany: async () => [], groupBy: async () => [] },
    eventCapability: { findUnique: async () => null },
    scientificProgramActivity: { findMany: async ({ where }) => {
      assert.equal(where.eventId, 'event-1');
      assert.equal(where.organizationId, 'org-1');
      assert.equal(where.status, 'PUBLISHED');
      return [];
    } },
  };
  const service = new ParticipantAgendaService(prisma, {
    requireConfirmedScope: async () => ({ eventId: 'event-1', organizationId: 'org-1', reservationId: 'res-1' }),
  });
  const agenda = await service.get('evento', 'Bearer token');
  assert.equal(reservationReads, 1);
  assert.equal(agenda.speaking.length, 1);
  assert.equal(agenda.speaking[0].title, 'Mesa');
  assert.equal(agenda.speaking[0].participationType, 'SPEAKER');
  const serialized = JSON.stringify(agenda);
  assert.equal(serialized.includes('ana@example.test'), false);
  assert.equal(serialized.includes(emailHash), false);
});

