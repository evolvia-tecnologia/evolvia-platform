import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
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

  const queued = harness({
    enrolledCount: 1,
    wait: { id: 'waitlist01', status: 'WAITING' },
    positionRows: [{ activityId: 'atividade1', position: 5 }],
    ownWaiting: [{
      id: 'waitlist01',
      activityId: 'atividade1',
      queuedAt: new Date('2026-11-01T12:00:00Z'),
      activity: activity(),
    }],
  });
  const placed = await queued.service.join('congresso', 'Bearer token', 'atividade1');
  assert.equal(placed.waiting[0].position, 5);
  assert.match(queued.state.positionSql, /organizationId/u);
  assert.match(queued.state.positionSql, /queuedAt/u);
  assert.equal(queued.state.positionValues.includes(scopeIds.organizationId), true);
  assert.equal(queued.state.positionValues.includes(scopeIds.eventId), true);
  assert.equal(queued.state.positionValues.includes(scopeIds.reservationId), true);
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
  assert.equal(promoted.state.createdEnrollment.courtesy, false);
  assert.equal(promoted.state.createdEnrollment.organizationId, scopeIds.organizationId);
  assert.equal(promoted.state.reservationReads.some((where) => where.id_eventId_organizationId?.id === scopeIds.reservationId && where.id_eventId_organizationId?.eventId === scopeIds.eventId && where.id_eventId_organizationId?.organizationId === scopeIds.organizationId), true);
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
  assert.equal(blocked.state.updatedWait, null);
  assert.equal(blocked.state.audits.length, 0);
});

test('promoção recusa inscrição cancelada sem gravar vaga nem auditoria', async () => {
  for (const reservation of [{ status: 'CANCELLED' }, null]) {
    const prior = harness({
      reservation,
      enrollment: { id: 'enroll0001', status: 'ENROLLED' },
      queue: [{ id: 'waitlist01', reservationId: scopeIds.reservationId, activityId: 'atividade1', status: 'WAITING', queuedAt: new Date('2026-11-01T12:00:00Z') }],
    });
    await assert.rejects(() => prior.service.promote('organizer01', scopeIds.eventId, 'waitlist01'), (error) => {
      assert.equal(error.message, 'A inscrição não está confirmada.');
      return true;
    });
    assert.equal(prior.state.createdEnrollment, null);
    assert.equal(prior.state.updatedEnrollment, null);
    assert.equal(prior.state.updatedWait, null);
    assert.equal(prior.state.audits.length, 0);

    const joining = harness({ reservation, enrolledCount: 1 });
    await assert.rejects(() => joining.service.join('congresso', 'Bearer token', 'atividade1'), (error) => {
      assert.equal(error.message, 'A inscrição não está confirmada.');
      return true;
    });
    assert.equal(joining.state.createdWait, null);
    assert.equal(joining.state.audits.length, 0);
  }
});

test('a fila respeita cortesia, preferência e teto individual', async () => {
  const courtesyFull = harness({
    activity: activity({ capacity: 2, speakers: 0 }),
    enrolledCount: 1,
    publicEnrolled: 1,
    courtesyCapability: { status: 'ACTIVE', config: { quotas: [{ activityId: 'atividade1', count: 1 }] } },
    queue: [{ id: 'waitlist01', reservationId: scopeIds.reservationId, activityId: 'atividade1', status: 'WAITING', queuedAt: new Date('2026-11-01T12:00:00Z') }],
    activities: [activity({ capacity: 2, speakers: 0 })],
    counts: [{ activityId: 'atividade1', _count: { _all: 1 } }],
  });
  await assert.rejects(() => courtesyFull.service.promote('organizer01', scopeIds.eventId, 'waitlist01'), (error) => {
    assert.equal(error.message, ACTIVITY_FULL_REASON);
    return true;
  });
  assert.equal(courtesyFull.state.createdEnrollment, null);
  assert.equal(courtesyFull.state.audits.length, 0);
  assert.equal(courtesyFull.state.countQueries.some((where) => where.courtesy === false), true);
  const listed = await courtesyFull.service.organizer('organizer01', scopeIds.eventId);
  assert.equal(listed.activities[0].remaining, 0);

  const courtesyOpen = harness({
    activity: activity({ capacity: 2, speakers: 0 }),
    enrolledCount: 1,
    publicEnrolled: 0,
    courtesyCapability: { status: 'ACTIVE', config: { quotas: [{ activityId: 'atividade1', count: 1 }] } },
    queue: [{ id: 'waitlist01', reservationId: scopeIds.reservationId, activityId: 'atividade1', status: 'WAITING', queuedAt: new Date('2026-11-01T12:00:00Z') }],
  });
  await courtesyOpen.service.promote('organizer01', scopeIds.eventId, 'waitlist01');
  assert.equal(courtesyOpen.state.createdEnrollment.status, 'ENROLLED');
  assert.equal(courtesyOpen.state.createdEnrollment.courtesy, false);

  const requested = harness({
    enrolledCount: 0,
    enrollment: { id: 'enroll0001', status: 'REQUESTED' },
    queue: [{ id: 'waitlist01', reservationId: scopeIds.reservationId, activityId: 'atividade1', status: 'WAITING', queuedAt: new Date('2026-11-01T12:00:00Z') }],
    activities: [activity({ capacity: 2, speakers: 0 })],
  });
  await requested.service.promote('organizer01', scopeIds.eventId, 'waitlist01');
  assert.equal(requested.state.createdEnrollment, null);
  assert.equal(requested.state.updatedEnrollment.data.status, 'ENROLLED');
  assert.equal(requested.state.updatedEnrollment.data.courtesy, false);
  assert.deepEqual(requested.state.updatedEnrollment.where.status.in, ['CANCELLED', 'REQUESTED']);
  assert.equal(requested.state.updatedWait.status, 'PROMOTED');
  assert.equal(requested.state.audits[0].action, 'activity.waitlist_promoted');

  const limited = harness({
    enrolledCount: 0,
    held: 1,
    limitCapability: { status: 'ACTIVE', config: { max: 1, confirmByOrganization: true } },
    queue: [{ id: 'waitlist01', reservationId: scopeIds.reservationId, activityId: 'atividade1', status: 'WAITING', queuedAt: new Date('2026-11-01T12:00:00Z') }],
    activities: [activity({ capacity: 2, speakers: 0 })],
  });
  await assert.rejects(() => limited.service.promote('organizer01', scopeIds.eventId, 'waitlist01'), /limite de atividades/);
  assert.equal(limited.state.createdEnrollment, null);
  const draftHeld = harness({
    enrolledCount: 0,
    held: 1,
    unpublishedHeld: true,
    limitCapability: { status: 'ACTIVE', config: { max: 1 } },
    queue: [{ id: 'waitlist01', reservationId: scopeIds.reservationId, activityId: 'atividade1', status: 'WAITING', queuedAt: new Date('2026-11-01T12:00:00Z') }],
    activities: [activity({ capacity: 2, speakers: 0 })],
    ownEnrollments: [{ activity: { id: 'rascunho', status: 'DRAFT', startAt: new Date('2026-11-01T12:00:00Z'), endAt: new Date('2026-11-01T13:00:00Z') } }],
  });
  await draftHeld.service.promote('organizer01', scopeIds.eventId, 'waitlist01');
  assert.equal(draftHeld.state.createdEnrollment.status, 'ENROLLED');
  assert.equal(limited.state.updatedEnrollment, null);
  assert.equal(limited.state.updatedWait, null);
  assert.equal(limited.state.audits.length, 0);

  const stillWaiting = harness({
    activity: activity({ capacity: 2, speakers: 0 }),
    enrolledCount: 0,
    publicEnrolled: 0,
    courtesyCapability: { status: 'ACTIVE', config: { quotas: [{ activityId: 'atividade1', count: 1 }] } },
  });
  await assert.rejects(() => stillWaiting.service.join('congresso', 'Bearer token', 'atividade1'), (error) => {
    assert.equal(error.message, ACTIVITY_HAS_SEAT_REASON);
    return true;
  });
  assert.equal(stillWaiting.state.createdWait, null);
});

test('quem ficou fora das primeiras pessoas entra na contagem real da atividade', async () => {
  const listed = harness({
    queue: [{ id: 'waitlist01', reservationId: scopeIds.reservationId, activityId: 'atividade1', status: 'WAITING', queuedAt: new Date('2026-11-01T12:00:00Z') }],
    activities: [activity({ capacity: 2, speakers: 0 })],
    reservations: [{ id: scopeIds.reservationId, registrationData: { full_name: 'Ana Paula' } }],
    waitlistCounts: [{ activityId: 'atividade1', _count: { _all: 120 } }],
  });
  const view = await listed.service.organizer('organizer01', scopeIds.eventId);
  assert.equal(view.activities[0].people.length, 1);
  assert.equal(view.activities[0].hiddenCount, 119);
  assert.equal(view.truncated, true);
  assert.equal(JSON.stringify(view).includes('@'), false);
});

test('a fila não bloqueia outro horário e a preferência não entra de novo', async () => {
  const overlap = new Date('2026-11-01T15:30:00Z');
  const joining = harness({
    enrolledCount: 1,
    otherWaiting: [{ activity: { id: 'poster0001', startAt: overlap, endAt: new Date('2026-11-01T16:30:00Z') } }],
  });
  await joining.service.join('congresso', 'Bearer token', 'atividade1');
  assert.equal(joining.state.createdWait.status, 'WAITING');

  const promoted = harness({
    activity: activity({ capacity: 2, speakers: 0 }),
    enrolledCount: 0,
    otherWaiting: [{ activity: { id: 'poster0001', startAt: overlap, endAt: new Date('2026-11-01T16:30:00Z') } }],
    queue: [{ id: 'waitlist01', reservationId: scopeIds.reservationId, activityId: 'atividade1', status: 'WAITING', queuedAt: new Date('2026-11-01T12:00:00Z') }],
  });
  await promoted.service.promote('organizer01', scopeIds.eventId, 'waitlist01');
  assert.equal(promoted.state.createdEnrollment.status, 'ENROLLED');

  const requested = harness({ enrolledCount: 1, enrollment: { id: 'enroll0001', status: 'REQUESTED' } });
  await assert.rejects(() => requested.service.join('congresso', 'Bearer token', 'atividade1'), /preferência registrada/);
  assert.equal(requested.state.createdWait, null);
  assert.equal(requested.state.audits.length, 0);

  const other = activity({ capacity: 2, speakers: 2 });
  other.id = 'atividade2';
  other.title = 'Outra cheia';
  const listed = harness({
    catalog: [other],
    counts: [{ activityId: 'atividade2', _count: { _all: 2 } }],
    ownWaiting: [{
      id: 'waitlist01',
      activityId: 'atividade1',
      queuedAt: new Date('2026-11-01T12:00:00Z'),
      activity: activity(),
    }],
    positionRows: [{ activityId: 'atividade1', position: 1 }],
  });
  const view = await listed.service.view('congresso', 'Bearer token');
  assert.equal(view.full.some((item) => item.activityId === 'atividade2' && item.canJoin), true);
});

test('fila longa não esconde outra atividade e mantém ordem e contagem', async () => {
  const queue = Array.from({ length: 601 }, (_, index) => ({
    id: `wait${String(index).padStart(5, '0')}`,
    activityId: 'atividade1', reservationId: `res${index}`,
    status: 'WAITING', queuedAt: new Date('2026-11-01T12:00:00Z'),
  }));
  queue.push({
    id: 'lastwait01', activityId: 'atividade2', reservationId: 'res-other',
    status: 'WAITING', queuedAt: new Date('2026-11-01T13:00:00Z'),
  });
  const second = { ...activity(), id: 'atividade2', title: 'Outra atividade' };
  const listed = harness({
    queue: [...queue].reverse(), activities: [activity(), second],
    reservations: [{ id: 'res-other', registrationData: { full_name: 'Outra pessoa' } }],
  });
  const view = await listed.service.organizer('organizer01', scopeIds.eventId);
  assert.equal(view.activities.length, 2);
  const first = view.activities.find((row) => row.activityId === 'atividade1');
  const other = view.activities.find((row) => row.activityId === 'atividade2');
  assert.equal(first.people.length, 100);
  assert.equal(first.hiddenCount, 501);
  assert.deepEqual(first.people.slice(0, 2).map((row) => [row.id, row.position]), [['wait00000', 1], ['wait00001', 2]]);
  assert.equal(other.people[0].participantName, 'Outra pessoa');
  assert.equal(other.hiddenCount, 0);
  assert.equal(view.truncated, true);
  assert.match(listed.state.organizerSql, /PARTITION BY entry\."activityId"/u);
  assert.match(listed.state.organizerSql, /AS row_num/u);
  assert.match(listed.state.organizerSql, /ranked\.row_num <=/u);
  assert.doesNotMatch(listed.state.organizerSql, /AS position\b/u);
  assert.equal(listed.state.organizerValues.includes(100), true);
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
      id: scopeIds.reservationId,
      status: 'CONFIRMED',
      emailHash: null,
      registrationData: { full_name: 'Ana Paula', email: 'ana@example.com' },
      event: { timeZone: 'America/Sao_Paulo' },
    },
    reservationReads: [],
    countQueries: [],
    publicEnrolled: undefined,
    held: 0,
    requestedEnrollments: [],
    limitCapability: null,
    courtesyCapability: null,
    updatedEnrollment: null,
    catalog: [],
    counts: [],
    audits: [],
    createdWait: null,
    createdEnrollment: null,
    updatedWait: null,
    ahead: 0,
    positionQuery: null,
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
      findMany: async ({ where } = {}) => {
        const status = where?.status;
        if (status?.in) {
          if (state.unpublishedHeld && where.activity?.status === 'PUBLISHED') return [];
          const rows = [];
          if (status.in.includes('ENROLLED')) rows.push(...state.ownEnrollments);
          if (status.in.includes('REQUESTED')) rows.push(...state.requestedEnrollments);
          return rows;
        }
        if (status === 'REQUESTED') return state.requestedEnrollments;
        return state.ownEnrollments;
      },
      count: async ({ where }) => {
        assert.equal(where.organizationId, scopeIds.organizationId);
        assert.equal(where.eventId, scopeIds.eventId);
        state.countQueries.push(where);
        if (where.reservationId) {
          if (state.unpublishedHeld && where.activity?.status === 'PUBLISHED') return 0;
          return state.held ?? 0;
        }
        if (where.courtesy === false) return state.publicEnrolled ?? state.enrolledCount;
        return state.enrolledCount;
      },
      create: async ({ data }) => { state.createdEnrollment = data; return data; },
      updateMany: async ({ where, data }) => {
        state.updatedEnrollment = { where, data };
        return { count: 1 };
      },
      groupBy: async () => state.counts,
    },
    eventActivityWaitlistEntry: {
      findUnique: async () => state.wait,
      findFirst: async ({ where }) => state.queue.find((item) => item.id === where.id && item.status === where.status) ?? null,
      findMany: async ({ where, take }) => {
        assert.equal(where.organizationId, scopeIds.organizationId);
        assert.equal(where.eventId, scopeIds.eventId);
        if (where.activityId?.in) return state.peers;
        if (where.reservationId && where.activityId?.not) return state.otherWaiting;
        if (where.reservationId) return state.ownWaiting;
        const ordered = [...state.queue].sort((a, b) => a.queuedAt - b.queuedAt || a.id.localeCompare(b.id));
        return take ? ordered.slice(0, take) : ordered;
      },
      create: async ({ data }) => { state.createdWait = data; return data; },
      count: async ({ where }) => {
        assert.equal(where.organizationId, scopeIds.organizationId);
        assert.equal(where.eventId, scopeIds.eventId);
        state.positionQuery = where;
        return state.ahead;
      },
      updateMany: async ({ where, data }) => {
        assert.equal(where.organizationId ?? scopeIds.organizationId, scopeIds.organizationId);
        state.updatedWait = data;
        return { count: 1 };
      },
      groupBy: async ({ where }) => {
        assert.equal(where.organizationId, scopeIds.organizationId);
        assert.equal(where.eventId, scopeIds.eventId);
        assert.equal(where.status, 'WAITING');
        return state.waitlistCounts ?? [...new Set(state.queue.map((row) => row.activityId))].map((activityId) => ({
          activityId, _count: { _all: state.queue.filter((row) => row.activityId === activityId).length },
        }));
      },
    },
    eventRegistrationReservation: {
      findFirst: async ({ where }) => readReservation(where),
      findUnique: async ({ where }) => readReservation(where),
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
    eventCapability: {
      findUnique: async ({ where }) => {
        const code = where?.eventId_code?.code;
        if (code === 'activity_enrollment_limit') return state.limitCapability;
        if (code === 'activity_courtesy') return state.courtesyCapability;
        return null;
      },
    },
  };
  const readReservation = (where) => {
    assert.equal(where.organizationId ?? where.id_eventId_organizationId?.organizationId, scopeIds.organizationId);
    state.reservationReads.push(where);
    return state.reservation;
  };
  tx.$queryRaw = async (query) => {
    const sql = (query.strings ?? []).join(' ');
    if (sql.includes('ROW_NUMBER()')) {
      state.organizerSql = sql;
      state.organizerValues = query.values;
      assert.equal(query.values.includes(scopeIds.organizationId), true);
      assert.equal(query.values.includes(scopeIds.eventId), true);
      const counts = new Map();
      return [...state.queue].sort((a, b) => a.queuedAt - b.queuedAt || a.id.localeCompare(b.id)).filter((row) => {
        const count = (counts.get(row.activityId) ?? 0) + 1;
        counts.set(row.activityId, count);
        return count <= 100;
      });
    }
    state.positionSql = (query.strings ?? []).join(' ');
    state.positionValues = query.values ?? [];
    return state.positionRows ?? [];
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

test('a terceira falha serializável da fila vira conflito e outro erro não repete', async () => {
  const serialization = () => new Prisma.PrismaClientKnownRequestError('serialization', { code: 'P2034', clientVersion: 'test' });
  let attempts = 0;
  const exhausted = new ActivityWaitlistService({
    $transaction: async () => {
      attempts += 1;
      throw serialization();
    },
  }, {
    requireConfirmedScope: async () => ({ eventId: 'evt_1', organizationId: 'org_1', reservationId: 'reserva01' }),
  }, {});
  await assert.rejects(
    () => exhausted.join('congresso', 'Bearer token', 'atividade1'),
    (error) => {
      assert.equal(error.getStatus?.(), 409);
      assert.match(error.message, /Não foi possível atualizar a fila/u);
      return true;
    },
  );
  assert.equal(attempts, 3);

  let otherAttempts = 0;
  const other = new ActivityWaitlistService({
    $transaction: async () => {
      otherAttempts += 1;
      throw new Error('falha de leitura');
    },
  }, {
    requireConfirmedScope: async () => ({ eventId: 'evt_1', organizationId: 'org_1', reservationId: 'reserva01' }),
  }, {});
  await assert.rejects(() => other.join('congresso', 'Bearer token', 'atividade1'), /falha de leitura/u);
  assert.equal(otherAttempts, 1);
});

