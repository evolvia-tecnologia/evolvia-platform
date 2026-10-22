import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVITY_TRANSMISSION_MAX,
  activityDisplayTitle,
  readActivityLinks,
  replaceActivityLink,
  TransmissionPolicyError,
} from '../src/transmission-policy.ts';

const activityId = 'c'.repeat(25);
const link = { kind: 'LIVE', title: 'Sala da mesa', url: 'https://video.example.com/mesa' };

test('o link da atividade fica no evento e o título perigoso não aparece', () => {
  assert.equal(activityDisplayTitle('Mesa redonda'), 'Mesa redonda');
  assert.equal(activityDisplayTitle('<script>'), 'Atividade sem título exibível');
  const stored = replaceActivityLink([], activityId, link);
  assert.equal(stored.length, 1);
  assert.deepEqual(readActivityLinks({ links: stored }), stored);
  assert.deepEqual(replaceActivityLink(stored, activityId, null), []);
  assert.throws(() => replaceActivityLink([], 'atividade/../outra', link), TransmissionPolicyError);
  const full = Array.from({ length: ACTIVITY_TRANSMISSION_MAX }, (_, index) => ({
    activityId: `c${String(index).padStart(24, '0')}`,
    ...link,
  }));
  assert.throws(() => replaceActivityLink(full, 'd'.repeat(25), link), /40 links/u);
});
