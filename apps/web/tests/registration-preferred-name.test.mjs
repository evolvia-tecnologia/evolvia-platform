import test from 'node:test';
import assert from 'node:assert/strict';
import { updateRegistrationAnswer, joinPhone, splitPhone } from '../lib/registration-input.ts';

test('suggests first and last name when full name is entered', () => {
  const result = updateRegistrationAnswer({}, 'full_name', '  Maria   Júlia   da Silva  ', false);
  assert.equal(result.preferred_name, 'Maria Silva');
});

test('keeps a single name when there is no surname', () => {
  const result = updateRegistrationAnswer({}, 'full_name', 'Maria', false);
  assert.equal(result.preferred_name, 'Maria');
});

test('preserves preferred name after explicit edit, including blank', () => {
  const result = updateRegistrationAnswer({ preferred_name: '' }, 'full_name', 'Maria da Silva', true);
  assert.equal(result.preferred_name, '');
});

test('does not modify preferred name when other answers change', () => {
  const result = updateRegistrationAnswer({ preferred_name: 'MJ' }, 'email', 'maria@example.org', false);
  assert.equal(result.preferred_name, 'MJ');
});


test('preserves non-Brazilian area code when joining international phone', () => {
  assert.equal(joinPhone({ ddi: '1', area: '415', number: '5552671' }), '+14155552671');
  assert.equal(joinPhone({ ddi: '55', area: '11', number: '912345678' }), '+5511912345678');
});

test('international phone split and join preserve digits', () => {
  const phone = '+14155552671';
  assert.equal(joinPhone(splitPhone(phone)), phone);
});

test('NANP phone split exposes three-digit area code for editing', () => {
  assert.deepEqual(splitPhone('+14155552671'), { ddi: '1', area: '415', number: '5552671' });
  assert.equal(joinPhone(splitPhone('+14155552671')), '+14155552671');
});
