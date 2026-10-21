import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { OperationalReadingsService } from '../dist/operational-readings.service.js';

const event = { id: 'evt_1', organizationId: 'org_1' };

function harness() {
  const seen = [];
  const count = (value) => async ({ where }) => {
    seen.push(where);
    assert.equal(where.organizationId, event.organizationId);
    assert.equal(where.eventId, event.id);
    return value;
  };
  const groups = (rows) => async ({ where }) => {
    seen.push(where);
    assert.equal(where.organizationId, event.organizationId);
    return rows;
  };
  const prisma = {
    event: { findUnique: async () => event },
    eventDayPresence: {
      count: async ({ where }) => {
        assert.equal(where.organizationId, event.organizationId);
        assert.equal(where.eventId, event.id);
        return where.reversedAt === null ? 6 : 1;
      },
      groupBy: groups([{ day: '2026-10-01' }, { day: '2026-10-02' }]),
    },
    eventActivityAccess: { count: count(4), groupBy: groups([{ activityId: 'a' }, { activityId: 'b' }]) },
    eventMaterialDelivery: { count: count(2) },
    eventRegistrationCheckIn: { count: count(3) },
    eventRegistrationWaitlistEntry: {
      count: async ({ where }) => {
        assert.equal(where.organizationId, event.organizationId);
        assert.equal(where.eventId, event.id);
        return where.status === 'WAITING' ? 5 : 1;
      },
    },
    eventActivityEnrollment: { count: count(7) },
    scientificProgramActivity: { count: count(8) },
    scientificReviewAssignment: {
      count: async ({ where }) => (where.status === 'SUBMITTED' ? 9 : 2),
      groupBy: groups([{ submissionId: 's1' }, { submissionId: 's2' }]),
    },
    scientificSubmission: { count: count(6) },
    eventCertificate: { count: count(1) },
  };
  const authorization = { requireRole: async (_userId, organizationId) => { assert.equal(organizationId, event.organizationId); } };
  return { seen, service: new OperationalReadingsService(prisma, authorization) };
}

test('a leitura devolve as quinze contas do evento e nenhum identificador', async () => {
  const { service } = harness();
  const view = await service.get('user_1', event.id);
  assert.deepEqual(view.readings, {
    dayPresence: 6,
    presenceDays: 2,
    dayPresenceReversed: 1,
    activityPresence: 4,
    activitiesWithPresence: 2,
    materialReversed: 2,
    checkInReversed: 3,
    waitlistWaiting: 5,
    waitlistOffered: 1,
    activityEnrollments: 7,
    publishedActivities: 8,
    reviewsSubmitted: 9,
    reviewsOpen: 2,
    worksWithoutReview: 4,
    certificatesIssued: 1,
  });
  assert.equal(JSON.stringify(view).includes('submissionId'), false);
  assert.equal(JSON.stringify(view).includes('@'), false);
});

test('outra organização ou evento ausente não lê as contas', async () => {
  const missing = new OperationalReadingsService(
    { event: { findUnique: async () => null } },
    { requireRole: async () => { throw new Error('não deveria autorizar'); } },
  );
  await assert.rejects(() => missing.get('user_1', 'evt_1'), NotFoundException);

  const foreign = new OperationalReadingsService(
    { event: { findUnique: async () => event } },
    { requireRole: async () => { throw new NotFoundException('Organização não encontrada.'); } },
  );
  await assert.rejects(() => foreign.get('user_2', event.id), /Organização não encontrada/u);
});
