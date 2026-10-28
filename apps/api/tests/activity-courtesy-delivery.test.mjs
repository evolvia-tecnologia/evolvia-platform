import assert from 'node:assert/strict';
import test from 'node:test';
import { ActivityCourtesyService } from '../dist/activity-courtesy.service.js';
import { ParticipantAgendaService } from '../dist/participant-agenda.service.js';

const event = { id: 'evt_1', organizationId: 'org_1' };
const activityId = 'atividade1';

test('a cortesia confirmada ocupa o lugar separado quando a vaga aberta acabou', async () => {
  let config = { quotas: [{ activityId, count: 1 }] };
  const audits = [];
  let courtesy = false;
  const activity = {
    id: activityId, title: 'Oficina', activityType: 'Oficina', status: 'PUBLISHED',
    startAt: new Date('2026-10-15T15:00:00Z'), endAt: new Date('2026-10-15T16:00:00Z'),
    space: { name: 'Sala', capacity: 2 }, _count: { participants: 0 },
  };
  const prisma = {
    event: { findUnique: async () => event },
    scientificProgramActivity: {
      findMany: async ({ where } = {}) => {
        const ids = where?.id?.in;
        if (Array.isArray(ids) && !ids.includes(activityId)) return [];
        return [activity];
      },
      findFirst: async () => activity,
    },
    eventActivityEnrollment: {
      findFirst: async () => ({ id: 'pref_1', reservationId: 'res_1', activityId, status: 'REQUESTED' }),
      findUnique: async () => ({ id: 'pref_1', reservationId: 'res_1', activityId, status: 'REQUESTED' }),
      findMany: async () => [],
      count: async ({ where }) => (where.courtesy ? 0 : 2),
      groupBy: async () => [],
      updateMany: async ({ data }) => { courtesy = data.courtesy; return { count: 1 }; },
    },
    eventCapability: {
      findUnique: async () => ({ status: 'ACTIVE', config }),
      upsert: async ({ update }) => { config = update.config; return update; },
    },
    eventRegistrationReservation: {
      findFirst: async () => ({ id: 'res_1', status: 'CONFIRMED', emailHash: null, registrationData: {} }),
      findUnique: async () => ({ id: 'res_1', status: 'CONFIRMED', emailHash: null, registrationData: {} }),
    },
    scientificPerson: { findMany: async () => [] },
    auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
    $transaction: async (run) => run(prisma),
  };
  const agenda = new ParticipantAgendaService(prisma, { requireConfirmedScope: async () => { throw new Error('área da pessoa'); } });
  await assert.rejects(
    () => agenda.confirmRequested(prisma, { eventId: event.id, organizationId: event.organizationId }, 'pref_1', 'user_1', false),
    /Não há vaga restante/u,
  );
  await agenda.confirmRequested(prisma, { eventId: event.id, organizationId: event.organizationId }, 'pref_1', 'user_1', true);
  assert.equal(courtesy, true);
  assert.equal(audits.at(-1).metadata.courtesy, true);
  assert.equal(JSON.stringify(audits).includes('Oficina'), false);

  const courtesyService = new ActivityCourtesyService(prisma, {
    requireRole: async (_userId, organizationId) => { assert.equal(organizationId, event.organizationId); },
  });
  const view = await courtesyService.get('user_1', event.id);
  assert.equal(view.activities[0].courtesyQuota, 1);
  assert.equal(view.activities[0].title, 'Oficina');
  assert.equal(JSON.stringify(view).includes('@'), false);
  await assert.rejects(
    () => courtesyService.save('user_1', event.id, { quotas: [{ activityId: 'ausente01', count: 1 }] }),
    /Atividade ausente01 não encontrada ou não publicada/u,
  );
  await assert.rejects(
    () => courtesyService.save('user_1', event.id, { quotas: [{ activityId, count: 3 }] }),
    /não pode passar das vagas abertas/u,
  );
});
