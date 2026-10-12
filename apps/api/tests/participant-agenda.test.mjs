import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ParticipantAgendaService } from '../dist/participant-agenda.service.js';
import { classifyAgenda, emailMatchesHash, enrollmentBlockReason } from '../dist/participant-agenda.policy.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');

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

test('a consulta da agenda fica no evento da inscrição e não devolve e-mail', async () => {
  const emailHash = hash('ana@example.test');
  const prisma = {
    eventRegistrationReservation: { findFirst: async ({ where }) => {
      assert.equal(where.eventId, 'event-1');
      assert.equal(where.id, 'res-1');
      return { emailHash, registrationData: { email: 'Ana@Example.Test' }, event: { timeZone: 'America/Sao_Paulo' } };
    } },
    scientificPerson: { findMany: async ({ where }) => {
      assert.equal(where.eventId, 'event-1');
      assert.equal(where.organizationId, 'org-1');
      assert.deepEqual(where.email, { equals: 'ana@example.test', mode: 'insensitive' });
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
  assert.equal(agenda.speaking.length, 1);
  assert.equal(agenda.speaking[0].title, 'Mesa');
  assert.equal(agenda.speaking[0].participationType, 'SPEAKER');
  const serialized = JSON.stringify(agenda);
  assert.equal(serialized.includes('ana@example.test'), false);
  assert.equal(serialized.includes(emailHash), false);
});
