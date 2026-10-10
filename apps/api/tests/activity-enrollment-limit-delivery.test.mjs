import assert from 'node:assert/strict';
import test from 'node:test';
import { ActivityEnrollmentLimitService } from '../dist/activity-enrollment-limit.service.js';
import { ParticipantAgendaService } from '../dist/participant-agenda.service.js';

const event = { id: 'evt_1', organizationId: 'org_1' };

test('gravar o teto audita só o número e a agenda passa a recusar a reserva', async () => {
  let config = null;
  const audits = [];
  const prisma = {
    event: { findUnique: async () => event },
    eventCapability: {
      findUnique: async () => (config ? { status: 'ACTIVE', config } : null),
      upsert: async ({ create }) => { config = create.config; return create; },
    },
    auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
    $transaction: async (run) => run(prisma),
  };
  const authorization = { requireRole: async (_userId, organizationId) => { assert.equal(organizationId, event.organizationId); } };
  const limits = new ActivityEnrollmentLimitService(prisma, authorization);
  const empty = await limits.get('user_1', event.id);
  assert.deepEqual(empty, { configured: false, max: null });
  const saved = await limits.save('user_1', event.id, { max: 1 });
  assert.deepEqual(saved, { configured: true, max: 1 });
  assert.equal(audits[0].metadata.max, 1);
  assert.equal(JSON.stringify(audits).includes('oficina'), false);

  const activity = {
    id: 'oficina', title: 'Oficina', activityType: 'Oficina', status: 'PUBLISHED',
    startAt: new Date('2026-10-15T15:00:00Z'), endAt: new Date('2026-10-15T16:00:00Z'),
    space: { name: 'Sala', capacity: 10 }, _count: { participants: 0 },
  };
  const agendaPrisma = {
    eventCapability: { findUnique: async () => ({ status: 'ACTIVE', config }) },
    eventRegistrationReservation: { findFirst: async () => ({ emailHash: null, registrationData: {}, event: { timeZone: 'UTC' } }) },
    scientificProgramActivity: { findFirst: async () => activity, findMany: async () => [] },
    eventActivityEnrollment: {
      findUnique: async () => null,
      count: async () => 0,
      findMany: async () => [{ activity: { id: 'poster', startAt: activity.startAt, endAt: activity.endAt } }],
      groupBy: async () => [],
    },
    scientificPerson: { findMany: async () => [] },
    scientificProgramParticipant: { findMany: async () => [] },
  };
  agendaPrisma.$transaction = async (run) => run(agendaPrisma);
  const agenda = new ParticipantAgendaService(agendaPrisma, {
    requireConfirmedScope: async () => ({ eventId: event.id, organizationId: event.organizationId, reservationId: 'res_1' }),
  });
  await assert.rejects(() => agenda.enroll('evento', 'Bearer token', 'oficina'), /limite de atividades/u);
});
