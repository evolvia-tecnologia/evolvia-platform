import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { ActivityPreferenceService } from '../dist/activity-preference.service.js';

const event = { id: 'evt_1', organizationId: 'org_1', timeZone: 'America/Sao_Paulo' };

test('a lista mostra o nome e a confirmação reserva a vaga sem devolver o e-mail', async () => {
  const audits = [];
  let status = 'REQUESTED';
  const row = {
    id: 'pref_1',
    status: 'REQUESTED',
    reservationId: 'res_1',
    activityId: 'oficina',
    createdAt: new Date('2026-10-15T10:00:00Z'),
    activity: {
      id: 'oficina', title: 'Oficina', activityType: 'Oficina', status: 'PUBLISHED',
      startAt: new Date('2026-10-15T15:00:00Z'), endAt: new Date('2026-10-15T16:00:00Z'),
      space: { name: 'Sala', capacity: 8 },
      _count: { participants: 0 },
    },
    reservation: { registrationData: { full_name: 'Ana Souza', email: 'ana@example.test' } },
  };
  const prisma = {
    event: { findUnique: async () => event },
    eventActivityEnrollment: {
      findMany: async () => (status === 'REQUESTED' ? [row] : []),
      findFirst: async () => (status === 'REQUESTED' ? row : null),
      findUnique: async () => (status === 'REQUESTED' ? row : null),
      count: async () => 0,
      groupBy: async () => [],
      updateMany: async () => { status = 'ENROLLED'; return { count: 1 }; },
    },
    eventCapability: { findUnique: async () => null },
    scientificProgramActivity: { findFirst: async () => row.activity },
    eventRegistrationReservation: {
      findFirst: async () => ({ id: 'res_1', status: 'CONFIRMED', emailHash: null, registrationData: {} }),
      findUnique: async () => ({ id: 'res_1', status: 'CONFIRMED', emailHash: null, registrationData: {} }),
    },
    scientificPerson: { findMany: async () => [] },
    auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
    $transaction: async (run) => run(prisma),
  };
  const agenda = {
    confirmRequested: async (tx, scope, enrollmentId, actorUserId) => {
      assert.equal(scope.eventId, event.id);
      assert.equal(scope.organizationId, event.organizationId);
      assert.equal(enrollmentId, 'pref_1');
      assert.equal(actorUserId, 'user_1');
      const { ParticipantAgendaService } = await import('../dist/participant-agenda.service.js');
      return new ParticipantAgendaService(tx, { requireConfirmedScope: async () => { throw new Error('não deve abrir a área da pessoa'); } }).confirmRequested(tx, scope, enrollmentId, actorUserId);
    },
    declineRequested: async () => { throw new Error('não recusa neste ensaio'); },
  };
  const service = new ActivityPreferenceService(prisma, {
    requireRole: async (_userId, organizationId) => { assert.equal(organizationId, event.organizationId); },
  }, agenda);
  const listed = await service.list('user_1', event.id);
  assert.equal(listed.preferences[0].participantName, 'Ana Souza');
  assert.equal(listed.timeZone, 'America/Sao_Paulo');
  assert.equal(JSON.stringify(listed).includes('ana@example.test'), false);
  const after = await service.confirm('user_1', event.id, 'pref_1');
  assert.equal(after.preferences.length, 0);
  assert.equal(audits[0].action, 'activity.preference_confirmed');
  assert.equal(JSON.stringify(audits).includes('ana@example.test'), false);
  assert.equal(JSON.stringify(audits).includes('Ana Souza'), false);
});

test('a terceira falha serializável da preferência vira conflito', async () => {
  let attempts = 0;
  const prisma = {
    event: { findUnique: async () => event },
    $transaction: async () => {
      attempts += 1;
      throw new Prisma.PrismaClientKnownRequestError('serialization', { code: 'P2034', clientVersion: 'test' });
    },
  };
  const service = new ActivityPreferenceService(prisma, { requireRole: async () => {} }, {});
  await assert.rejects(
    () => service.confirm('user_1', event.id, 'pref_1'),
    (error) => {
      assert.equal(error.getStatus?.(), 409);
      assert.match(error.message, /Não foi possível atualizar a preferência/u);
      return true;
    },
  );
  assert.equal(attempts, 3);
});
