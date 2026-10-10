import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OPERATIONAL_READING_KEYS,
  OperationalReadingsPolicyError,
  assembleOperationalReadings,
  worksWithoutReview,
} from '../src/operational-readings.policy.ts';

test('as quinze contas aceitam inteiros e o trabalho sem parecer não fica negativo', () => {
  assert.equal(OPERATIONAL_READING_KEYS.length, 15);
  const input = Object.fromEntries(OPERATIONAL_READING_KEYS.map((key) => [key, 0]));
  input.worksWithoutReview = 4;
  assert.equal(assembleOperationalReadings(input).worksWithoutReview, 4);
  assert.equal(worksWithoutReview(3, 5), 0);
  assert.equal(worksWithoutReview(8, 3), 5);
  assert.throws(() => worksWithoutReview(-1, 0), OperationalReadingsPolicyError);
  assert.throws(() => assembleOperationalReadings({ dayPresence: 1 }), OperationalReadingsPolicyError);
  assert.equal(JSON.stringify(assembleOperationalReadings(input)).includes('@'), false);
});
