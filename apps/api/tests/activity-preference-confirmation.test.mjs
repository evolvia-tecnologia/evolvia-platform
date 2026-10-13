import assert from 'node:assert/strict';
import test from 'node:test';
import { ParticipantAgendaService } from '../dist/participant-agenda.service.js';

const scope = { eventId: 'evt_1', organizationId: 'org_1' };
const activity = {
  id: 'atividade1', title: 'Oficina', activityType: 'Oficina', status: 'PUBLISHED',
  startAt: new Date('2026-10-15T15:00:00Z'), endAt: new Date('2026-10-15T16:00:00Z'),
  space: { name: 'Sala', capacity: 8 },
  _count: { participants: 0 },
};
const row = {
  id: 'pref_1', status: 'REQUESTED', reservationId: 'res_1', activityId: 'atividade1',
};

function harness({ reservationStatus = 'CONFIRMED', reservation = true, max = null, held = 0 } = {}) {
  const writes = [];
  const audits = [];
  const reservationReads = [];
  const readReservation = (query) => {
    reservationReads.push(query);
    if (!reservation) return null;
    return { id: 'res_1', status: reservationStatus, emailHash: null, registrationData: {} };
  };
  const prisma = {
    eventActivityEnrollment: {
      findFirst: async () => row,
      findUnique: async () => row,
      findMany: async () => [],
      count: async ({ where }) => (where.reservationId ? held : 0),
      updateMany: async (input) => { writes.push(input); return { count: 1 }; },
    },
    scientificProgramActivity: { findFirst: async () => activity },
    eventRegistrationReservation: {
      findFirst: async (query) => readReservation(query),
      findUnique: async (query) => readReservation(query),
    },
    eventCapability: {
      findUnique: async ({ where }) => (
        where.eventId_code.code === 'activity_enrollment_limit' && max != null
          ? { status: 'ACTIVE', config: { max, confirmByOrganization: true } }
          : null
      ),
    },
    scientificPerson: { findMany: async () => [] },
    auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
  };
  const service = new ParticipantAgendaService(prisma, { requireConfirmedScope: async () => { throw new Error('fora da transação'); } });
  return { service, writes, audits, reservationReads, prisma };
}

test('confirmação relê a inscrição confirmada no evento antes de gravar a vaga', async () => {
  const { service, writes, audits, reservationReads, prisma } = harness();
  await service.confirmRequested(prisma, scope, 'pref_1', 'user_1');
  assert.equal(writes.length, 1);
  assert.equal(audits[0].action, 'activity.preference_confirmed');
  const key = reservationReads[0].where.id_eventId_organizationId;
  assert.equal(key.eventId, scope.eventId);
  assert.equal(key.organizationId, scope.organizationId);
  assert.equal(key.id, 'res_1');
});

test('inscrição cancelada antes ou durante a transação não vira vaga nem auditoria', async () => {
  for (const reservation of [{ reservationStatus: 'CANCELLED' }, { reservation: false }]) {
    const { service, writes, audits, prisma } = harness(reservation);
    await assert.rejects(
      () => service.confirmRequested(prisma, scope, 'pref_1', 'user_1'),
      (error) => error.status === 409 && error.message === 'A inscrição não está confirmada.',
    );
    assert.equal(writes.length, 0);
    assert.equal(audits.length, 0);
  }
});

test('rascunho não consome o limite nem cruza o horário na confirmação', async () => {
  const { service, writes, prisma } = harness({ max: 1, held: 1 });
  const draft = {
    id: 'rascunho', status: 'DRAFT',
    startAt: new Date('2026-10-15T15:00:00Z'), endAt: new Date('2026-10-15T16:00:00Z'),
  };
  prisma.eventActivityEnrollment.count = async ({ where }) => (
    where.reservationId && where.activity?.status === 'PUBLISHED' ? 0 : 1
  );
  prisma.eventActivityEnrollment.findMany = async ({ where }) => (
    where.activity?.status === 'PUBLISHED' ? [] : [{ activity: draft }]
  );
  await service.confirmRequested(prisma, scope, 'pref_1', 'user_1');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].data.status, 'ENROLLED');
});

test('limite reduzido depois da preferência impede a confirmação sem gravar', async () => {
  const { service, writes, audits, prisma } = harness({ max: 1, held: 1 });
  await assert.rejects(
    () => service.confirmRequested(prisma, scope, 'pref_1', 'user_1'),
    (error) => error.status === 409 && /limite de atividades/u.test(error.message),
  );
  assert.equal(writes.length, 0);
  assert.equal(audits.length, 0);
});
