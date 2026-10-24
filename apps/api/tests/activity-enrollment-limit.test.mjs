import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ActivityEnrollmentLimitPolicyError,
  normalizeEnrollmentLimit,
  readEnrollmentLimit,
} from '../src/activity-enrollment-limit.policy.ts';
import { classifyAgenda, enrollmentBlockReason } from '../src/participant-agenda.policy.ts';

const slot = {
  capacity: 10,
  speakers: 0,
  enrolled: 0,
  startAt: new Date('2026-10-15T15:00:00Z'),
  endAt: new Date('2026-10-15T16:00:00Z'),
  blocks: [],
  activityId: 'oficina',
};

test('o limite aceita de 1 a 20 ou nenhum teto', () => {
  assert.equal(normalizeEnrollmentLimit({ max: 3 }).max, 3);
  assert.equal(normalizeEnrollmentLimit({ max: null }).confirmByOrganization, false);
  assert.equal(normalizeEnrollmentLimit({ max: 2, confirmByOrganization: true }).confirmByOrganization, true);
  assert.throws(() => normalizeEnrollmentLimit({ max: 2, confirmByOrganization: 'sim' }), ActivityEnrollmentLimitPolicyError);
  assert.equal(readEnrollmentLimit({ max: '3' }), null);
  for (const input of [{ max: 0 }, { max: 21 }, { max: 1.5 }, { max: 2, extra: true }, null]) {
    assert.throws(() => normalizeEnrollmentLimit(input), ActivityEnrollmentLimitPolicyError);
  }
});

test('o teto bloqueia a reserva e o horário cruzado continua na frente', () => {
  assert.equal(enrollmentBlockReason({ ...slot, maxPerPerson: 2, alreadyEnrolled: 2 }), 'Você já atingiu o limite de atividades deste evento.');
  assert.equal(enrollmentBlockReason({ ...slot, maxPerPerson: null, alreadyEnrolled: 9 }), null);
  assert.equal(enrollmentBlockReason({
    ...slot,
    maxPerPerson: 1,
    alreadyEnrolled: 1,
    blocks: [{ id: 'outra', startAt: slot.startAt, endAt: slot.endAt }],
  }), 'Este horário cruza com outra atividade da sua agenda.');
  const view = classifyAgenda({
    speaking: [],
    enrolled: [{ id: 'poster', title: 'Pôster', activityType: 'Pôster', startAt: '2026-10-15T12:00:00.000Z', endAt: '2026-10-15T13:00:00.000Z', spaceName: null }],
    catalog: [{ id: 'oficina', title: 'Oficina', activityType: 'Oficina', startAt: '2026-10-15T15:00:00.000Z', endAt: '2026-10-15T16:00:00.000Z', spaceName: 'Sala', capacity: 12, speakers: 0, enrolledCount: 0 }],
    maxPerPerson: 1,
  });
  assert.equal(view.open[0].reason, 'Você já atingiu o limite de atividades deste evento.');
  const waiting = classifyAgenda({
    speaking: [],
    enrolled: [],
    requested: [{ id: 'poster', title: 'Pôster', activityType: 'Pôster', startAt: '2026-10-15T12:00:00.000Z', endAt: '2026-10-15T13:00:00.000Z', spaceName: null }],
    catalog: [
      { id: 'poster', title: 'Pôster', activityType: 'Pôster', startAt: '2026-10-15T12:00:00.000Z', endAt: '2026-10-15T13:00:00.000Z', spaceName: null, capacity: 10, speakers: 0, enrolledCount: 0 },
      { id: 'oficina', title: 'Oficina', activityType: 'Oficina', startAt: '2026-10-15T12:30:00.000Z', endAt: '2026-10-15T14:00:00.000Z', spaceName: 'Sala', capacity: 10, speakers: 0, enrolledCount: 0 },
    ],
    maxPerPerson: 1,
  });
  assert.deepEqual(waiting.open.map((item) => item.reason), ['Este horário cruza com outra atividade da sua agenda.']);
  assert.equal(waiting.requested.length, 1);
});
