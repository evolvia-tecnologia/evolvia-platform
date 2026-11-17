import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificProgramService } from '../dist/scientific-program.service.js';

function fixture({ denied = false, participants = ['speaker-1', 'speaker-1'], early = false } = {}) {
  const event = { id: 'event-1', organizationId: 'org-1', profileCode: 'SCIENTIFIC_EVENT', status: 'SETUP',
    startDate: new Date('2026-10-15T00:00:00Z'), endDate: new Date('2026-10-16T00:00:00Z') };
  const activity = { id: 'activity-1', eventId: event.id, organizationId: event.organizationId,
    startAt: new Date(early ? '2026-10-15T09:00:00Z' : '2026-10-15T11:00:00Z'),
    endAt: new Date(early ? '2026-10-15T10:00:00Z' : '2026-10-15T12:00:00Z'), spaceId: null };
  const queries = [], writes = [];
  const prisma = {
    event: { findUnique: async () => event },
    scientificProgramActivity: {
      findFirst: async ({ where }) => where.id === activity.id && where.eventId === event.id
        && where.organizationId === event.organizationId ? activity : null,
    },
    scientificProgramParticipant: { findMany: async (query) => {
      queries.push(query);
      assert.equal(query.where.eventId, event.id);
      assert.equal(query.where.organizationId, event.organizationId);
      if (query.where.activityId === activity.id) return participants.map(personId => ({ personId }));
      assert.deepEqual(query.where.activityId, { not: activity.id });
      assert.deepEqual(query.where.personId, { in: [...new Set(participants)] });
      return [{ person: { name: 'Dra. Ana' }, activity: { title: 'Mesa anterior',
        startAt: new Date('2026-10-15T10:00:00Z'), endAt: new Date('2026-10-15T11:00:00Z'),
      } }];
    } },
    $transaction: async (callback) => callback({
      scientificProgramActivity: { update: async (input) => { writes.push(input); } },
      auditLog: { create: async () => undefined },
    }),
  };
  const service = new ScientificProgramService(prisma,
    { requireRole: async () => { if (denied) throw new Error('acesso negado'); } },
    { assertFoundationMutable: () => undefined });
  service.get = async () => ({ updated: true });
  return { service, queries, writes };
}

test('alterar início recusa sobreposição de palestrante antes de gravar', async () => {
  const { service, writes } = fixture();
  await assert.rejects(service.updateActivity('owner-1', 'event-1', 'activity-1', {
    startAt: '2026-10-15T10:30:00Z',
  }), { status: 409, message: /Dra\. Ana.*Mesa anterior/ });
  assert.equal(writes.length, 0);
});

test('várias pessoas vinculadas são verificadas em uma única consulta', async () => {
  const { service, queries, writes } = fixture({ participants: ['speaker-1', 'speaker-2', 'speaker-3'] });
  await assert.rejects(service.updateActivity('owner-1', 'event-1', 'activity-1', {
    startAt: '2026-10-15T10:30:00Z',
  }), { status: 409 });
  assert.equal(queries.length, 2);
  assert.equal(writes.length, 0);
});

test('alterar término também revalida as pessoas vinculadas', async () => {
  const { service, writes } = fixture({ early: true });
  await assert.rejects(service.updateActivity('owner-1', 'event-1', 'activity-1', {
    endAt: '2026-10-15T10:30:00Z',
  }), { status: 409 });
  assert.equal(writes.length, 0);
});

test('horários consecutivos continuam permitidos e funções duplicadas não repetem busca', async () => {
  const { service, queries, writes } = fixture();
  assert.deepEqual(await service.updateActivity('owner-1', 'event-1', 'activity-1', {
    startAt: '2026-10-15T11:00:00Z', endAt: '2026-10-15T12:30:00Z',
  }), { updated: true });
  assert.equal(writes.length, 1);
  assert.equal(queries.length, 2);
  assert.equal(writes[0].data.status, 'DRAFT');
});

test('alterar só título preserva o contrato sem buscar disponibilidade', async () => {
  const { service, queries, writes } = fixture();
  await service.updateActivity('owner-1', 'event-1', 'activity-1', { title: 'Título atualizado' });
  assert.equal(queries.length, 0);
  assert.equal(writes[0].data.title, 'Título atualizado');
});

test('sem autorização não consulta participantes nem grava', async () => {
  const { service, queries, writes } = fixture({ denied: true });
  await assert.rejects(service.updateActivity('owner-1', 'event-1', 'activity-1', {
    startAt: '2026-10-15T10:30:00Z',
  }), /acesso negado/);
  assert.equal(queries.length, 0);
  assert.equal(writes.length, 0);
});

test('atividade de outro evento é negada antes da busca de pessoas', async () => {
  const { service, queries, writes } = fixture();
  await assert.rejects(service.updateActivity('owner-1', 'event-other', 'activity-1', {
    startAt: '2026-10-15T10:30:00Z',
  }), { status: 404 });
  assert.equal(queries.length, 0);
  assert.equal(writes.length, 0);
});

test('atividade sem palestrantes permite alteração de horário', async () => {
  const { service, queries, writes } = fixture({ participants: [] });
  await service.updateActivity('owner-1', 'event-1', 'activity-1', { startAt: '2026-10-15T10:30:00Z' });
  assert.equal(queries.length, 1);
  assert.equal(writes.length, 1);
});
