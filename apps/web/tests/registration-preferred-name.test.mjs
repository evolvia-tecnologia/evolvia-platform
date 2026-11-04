import test from 'node:test';
import assert from 'node:assert/strict';
import { updateRegistrationAnswer } from '../lib/registration-input.ts';

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
