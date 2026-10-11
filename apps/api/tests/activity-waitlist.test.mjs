import assert from 'node:assert/strict';
import test from 'node:test';
import { ActivityWaitlistService } from '../dist/activity-waitlist.service.js';
import {
  ACTIVITY_FULL_REASON,
  ACTIVITY_HAS_SEAT_REASON,
  waitlistFullReasonMatchesAgenda,
  waitlistParticipantName,
} from '../dist/activity-waitlist.policy.js';

const scopeIds = { eventId: 'cevent00000001', organizationId: 'corganization01', reservationId: 'creservation001' };

test('o nome da fila usa a ficha e descarta e-mail', () => {
  assert.equal(waitlistFullReasonMatchesAgenda(), true);
  assert.equal(waitlistParticipantName({ full_name: 'Ana Paula', email: 'ana@example.com' }), 'Ana Paula');
  assert.equal(waitlistParticipantName({ nome: 'Bruno Lima' }), 'Bruno Lima');
  assert.equal(waitlistParticipantName({ full_name: 'ana@example.com', nome: 'Bruno Lima' }), 'Bruno Lima');
  assert.equal(waitlistParticipantName({ full_name: 'ana@example.com' }), 'Inscrição sem nome');
  assert.equal(waitlistParticipantName({ full_name: 'A'.repeat(90) }).length, 80);
  assert.equal(waitlistParticipantName(null), 'Inscrição sem nome');
});

test('entrar na fila só acontece quando a atividade está cheia', async () => {
  const open = harness({ enrolledCount: 0 });
  await assert.rejects(() => open.service.join('congresso', 'Bearer token', 'atividade1'), (error) => {
    assert.equal(error.message, ACTIVITY_HAS_SEAT_REASON);
    return true;
  });
  assert.equal(open.state.createdWait, null);

  const overlap = harness({
    enrolledCount: 1,
    ownEnrollments: [{ activity: { id: 'poster0001', startAt: new Date('2026-11-01T14:30:00Z'), endAt: new Date('2026-11-01T15:30:00Z') } }],
  });
  await assert.rejects(() => overlap.service.join('congresso', 'Bearer token', 'atividade1'), /cruza com outra atividade/);
  assert.equal(overlap.state.createdWait, null);

  const full = harness({ enrolledCount: 1 });
  const view = await full.service.join('congresso', 'Bearer token', 'atividade1');
  assert.equal(full.state.createdWait.status, 'WAITING');
  assert.equal(full.state.createdWait.organizationId, scopeIds.organizationId);
  assert.equal(full.state.createdWait.eventId, scopeIds.eventId);
  assert.equal(full.state.audits[0].metadata.reason, 'joined');
  assert.equal(Object.hasOwn(full.state.audits[0].metadata, 'email'), false);
  assert.equal(view.timeZone, 'America/Sao_Paulo');
  assert.equal(JSON.stringify(view).includes('@'), false);

  const again = harness({ enrolledCount: 1, wait: { id: 'waitlist01', status: 'WAITING' } });
  await again.service.join('congresso', 'Bearer token', 'atividade1');
  assert.equal(again.state.createdWait, null);
  assert.equal(again.state.audits.length, 0);

  await assert.rejects(() => full.service.join('congresso', 'Bearer token', 'curta'), /Atividade inválida/);
});

test('sair da fila e promover usam o escopo do servidor', async () => {
  const left = harness({ wait: { id: 'waitlist01', status: 'WAITING' } });
  await left.service.leave('congresso', 'Bearer token', 'atividade1');
  assert.equal(left.state.updatedWait.status, 'LEFT');
  assert.equal(left.state.audits[0].metadata.reason, 'left');

  const promoted = harness({
    enrolledCount: 0,
    queue: [{ id: 'waitlist01', reservationId: scopeIds.reservationId, activityId: 'atividade1', status: 'WAITING', queuedAt: new Date('2026-11-01T12:00:00Z') }],
    activities: [activity({ capacity: 2, speakers: 0 })],
    reservations: [{ id: scopeIds.reservationId, registrationData: { full_name: 'Ana Paula', email: 'ana@example.com' } }],
  });
  await promoted.service.promote('organizer01', scopeIds.eventId, 'waitlist01');
  assert.equal(promoted.state.createdEnrollment.status, 'ENROLLED');
  assert.equal(promoted.state.createdEnrollment.organizationId, scopeIds.organizationId);
  assert.equal(promoted.state.updatedWait.status, 'PROMOTED');
  assert.equal(promoted.state.audits[0].metadata.reason, 'promoted');
  assert.equal(promoted.state.audits[0].metadata.activityId, 'atividade1');
  assert.equal(promoted.state.roleOrg, scopeIds.organizationId);

  const listed = await promoted.service.organizer('organizer01', scopeIds.eventId);
  assert.equal(listed.activities[0].people[0].participantName, 'Ana Paula');
  assert.equal(JSON.stringify(listed).includes('example.com'), false);
  assert.equal(JSON.stringify(listed).includes('@'), false);
  assert.equal(Object.hasOwn(listed, 'organizationId'), false);

  const blocked = harness({
    enrolledCount: 2,
    queue: [{ id: 'waitlist01', reservationId: scopeIds.reservationId, activityId: 'atividade1', status: 'WAITING', queuedAt: new Date('2026-11-01T12:00:00Z') }],
  });
  await assert.rejects(() => blocked.service.promote('organizer01', scopeIds.eventId, 'waitlist01'), (error) => {
    assert.equal(error.message, ACTIVITY_FULL_REASON);
    return true;
  });
  assert.equal(blocked.state.createdEnrollment, null);
});

function activity({ capacity = 2, speakers = 1 } = {}) {
  return {
    id: 'atividade1',
    title: 'Oficina cheia',
    activityType: 'WORKSHOP',
    startAt: new Date('2026-11-01T15:00:00Z'),
    endAt: new Date('2026-11-01T16:00:00Z'),
    status: 'PUBLISHED',
    space: { name: 'Sala 1', capacity },
    _count: { participants: speakers },
  };
}

function harness(overrides = {}) {
  const state = {
    activity: activity(),
    enrollment: null,
    wait: null,
    enrolledCount: 1,
    ownEnrollments: [],
    otherWaiting: [],
    ownWaiting: [],
    peers: [],
    people: [],
    speakers: [],
    reservation: {
      emailHash: null,
      registrationData: { full_name: 'Ana Paula', email: 'ana@example.com' },
      event: { timeZone: 'America/Sao_Paulo' },
    },
    catalog: [],
    counts: [],
    audits: [],
    createdWait: null,
    createdEnrollment: null,
    updatedWait: null,
    roleOrg: null,
    event: { id: scopeIds.eventId, organizationId: scopeIds.organizationId, timeZone: 'America/Sao_Paulo' },
    queue: [],
    activities: [],
    reservations: [],
    ...overrides,
  };
  const tx = {
    scientificProgramActivity: {
      findFirst: async ({ where }) => {
        assert.equal(where.eventId, scopeIds.eventId);
        assert.equal(where.organizationId, scopeIds.organizationId);
        return state.activity?.id === where.id ? state.activity : null;
      },
      findMany: async ({ where }) => where?.id?.in ? state.activities : state.catalog,
    },
    eventActivityEnrollment: {
      findUnique: async () => state.enrollment,
      findMany: async () => state.ownEnrollments,
      count: async ({ where }) => {
        assert.equal(where.organizationId, scopeIds.organizationId);
        assert.equal(where.eventId, scopeIds.eventId);
        return state.enrolledCount;
      },
      create: async ({ data }) => { state.createdEnrollment = data; return data; },
      updateMany: async () => ({ count: 1 }),
      groupBy: async () => state.counts,
    },
    eventActivityWaitlistEntry: {
      findUnique: async () => state.wait,
      findFirst: async ({ where }) => state.queue.find((item) => item.id === where.id && item.status === where.status) ?? null,
      findMany: async ({ where }) => {
        assert.equal(where.organizationId, scopeIds.organizationId);
        assert.equal(where.eventId, scopeIds.eventId);
        if (where.activityId?.in) return state.peers;
        if (where.reservationId && where.activityId?.not) return state.otherWaiting;
        if (where.reservationId) return state.ownWaiting;
        return state.queue;
      },
      create: async ({ data }) => { state.createdWait = data; return data; },
      updateMany: async ({ where, data }) => {
        assert.equal(where.organizationId ?? scopeIds.organizationId, scopeIds.organizationId);
        state.updatedWait = data;
        return { count: 1 };
      },
    },
    eventRegistrationReservation: {
      findFirst: async ({ where }) => {
        assert.equal(where.organizationId, scopeIds.organizationId);
        return state.reservation;
      },
      findMany: async ({ where }) => {
        assert.equal(where.organizationId, scopeIds.organizationId);
        return state.reservations;
      },
    },
    scientificPerson: { findMany: async () => state.people },
    scientificProgramParticipant: { findMany: async () => state.speakers },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
    event: {
      findUnique: async ({ where }) => where.id === state.event.id ? state.event : null,
    },
  };
  tx.$transaction = async (run, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    return run(tx);
  };
  const service = new ActivityWaitlistService(tx, {
    requireConfirmedScope: async () => scopeIds,
  }, {
    requireRole: async (_userId, organizationId) => { state.roleOrg = organizationId; },
  });
  return { service, state };
}
