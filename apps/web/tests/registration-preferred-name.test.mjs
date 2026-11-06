import test from 'node:test';
import assert from 'node:assert/strict';
import { updateRegistrationAnswer, joinPhone, splitPhone, phoneError } from '../lib/registration-input.ts';

test('suggests only first name when full name is entered', () => {
  const result = updateRegistrationAnswer({}, 'full_name', '  Maria   Júlia   da Silva  ', false);
  assert.equal(result.preferred_name, 'Maria');
});

test('suggests first name from multi-part names with Unicode whitespace', () => {
  const result = updateRegistrationAnswer({}, 'full_name', '  João\tPedro de Souza  ', false);
  assert.equal(result.preferred_name, 'João');
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

test('rejects invalid NANP phone while accepting a valid US/Canada number', () => {
  assert.equal(phoneError('+14155552671'), null);
  assert.match(phoneError('+11115552671') ?? '', /código de área/u);
  assert.match(phoneError('+14151232671') ?? '', /número de 7 dígitos/u);
  assert.match(phoneError('+1415555267') ?? '', /código de área/u);
});

test('keeps NANP area code editable while subscriber digits are incomplete', () => {
  assert.deepEqual(splitPhone('+1415'), { ddi: '1', area: '415', number: '' });
  assert.deepEqual(splitPhone('+1415555'), { ddi: '1', area: '415', number: '555' });
  assert.equal(joinPhone(splitPhone('+1415555')), '+1415555');
  assert.match(phoneError('+1415555') ?? '', /código de área/u);
});


test('keeps one- and two-digit NANP area prefixes in area input', () => {
  assert.deepEqual(splitPhone('+14'), { ddi: '1', area: '4', number: '' });
  assert.deepEqual(splitPhone('+141'), { ddi: '1', area: '41', number: '' });
  assert.equal(joinPhone(splitPhone('+141')), '+141');
  assert.match(phoneError('+141') ?? '', /código de área/u);
});
