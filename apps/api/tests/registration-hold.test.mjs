import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_HOLD_MINUTES,
  HOLD_MINUTE_OPTIONS,
  RegistrationHoldPolicyError,
  SUGGESTED_HOLD_MINUTES,
  isHoldMinutes,
  normalizeHoldMinutes,
  readHoldMinutes,
} from '../src/registration-hold.policy.ts';

test('a reserva paga aceita só 15, 20, 30, 45 ou 60 minutos', () => {
  assert.deepEqual([...HOLD_MINUTE_OPTIONS], [15, 20, 30, 45, 60]);
  assert.equal(DEFAULT_HOLD_MINUTES, 20);
  assert.equal(SUGGESTED_HOLD_MINUTES, 15);
  for (const minutes of HOLD_MINUTE_OPTIONS) {
    assert.equal(isHoldMinutes(minutes), true);
    assert.equal(normalizeHoldMinutes({ minutes }), minutes);
  }
  assert.equal(readHoldMinutes('ACTIVE', { minutes: 45 }), 45);
  assert.equal(readHoldMinutes('DISABLED', { minutes: 45 }), 20);
  assert.equal(readHoldMinutes(undefined, { minutes: 15 }), 20);
  assert.equal(readHoldMinutes('ACTIVE', { minutes: 10 }), 20);
  assert.equal(readHoldMinutes('ACTIVE', null), 20);
  for (const input of [null, [], { minutes: '15' }, { minutes: 15, extra: true }, { minutes: 25 }, {}]) {
    assert.throws(() => normalizeHoldMinutes(input), RegistrationHoldPolicyError);
  }
});
