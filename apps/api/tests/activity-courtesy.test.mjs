import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ActivityCourtesyPolicyError,
  normalizeCourtesyDecision,
  normalizeCourtesyQuotas,
  readCourtesyQuotas,
} from '../src/activity-courtesy.policy.ts';
import { enrollmentBlockReason } from '../src/participant-agenda.policy.ts';

const activityId = 'atividade1';

test('a cortesia aceita uma cota por atividade publicada', () => {
  assert.deepEqual(normalizeCourtesyQuotas({ quotas: [{ activityId, count: 2 }, { activityId: 'atividade2', count: 0 }] }), [{ activityId, count: 2 }]);
  assert.equal(normalizeCourtesyDecision({}), false);
  assert.equal(normalizeCourtesyDecision({ courtesy: true }), true);
  assert.deepEqual(readCourtesyQuotas({ quotas: 'duas' }), []);
  assert.throws(() => normalizeCourtesyQuotas(null), ActivityCourtesyPolicyError);
  assert.throws(() => normalizeCourtesyQuotas({ quotas: [{ activityId, count: 2, extra: true }] }), ActivityCourtesyPolicyError);
  assert.throws(() => normalizeCourtesyQuotas({ quotas: [{ activityId: 'curta', count: 1 }] }), ActivityCourtesyPolicyError);
  assert.throws(() => normalizeCourtesyDecision({ courtesy: true, extra: true }), ActivityCourtesyPolicyError);
});

test('a cota de cortesia sai da vaga que a pessoa reserva', () => {
  const slot = {
    capacity: 10, speakers: 1, enrolled: 6, courtesyQuota: 3,
    startAt: new Date('2026-10-15T15:00:00Z'), endAt: new Date('2026-10-15T16:00:00Z'),
    blocks: [], activityId,
  };
  assert.equal(enrollmentBlockReason(slot), 'Não há vaga restante nesta atividade.');
  assert.equal(enrollmentBlockReason({ ...slot, courtesyQuota: 0 }), null);
});
