import assert from 'node:assert/strict';
import test from 'node:test';
import { updateRegistrationAnswer, splitPhone, joinPhone, phoneError } from '../lib/registration-input.ts';

test('sugere primeiro e último nomes e preserva nome editado ou apagado', () => {
  let answers = updateRegistrationAnswer({}, 'full_name', '  Ana   Silva ', false);
  assert.equal(answers.preferred_name, 'Ana Silva');
  answers = updateRegistrationAnswer(answers, 'preferred_name', 'Dra. Ana', true);
  answers = updateRegistrationAnswer(answers, 'full_name', 'Maria Silva', true);
  assert.equal(answers.preferred_name, 'Dra. Ana');
  answers = updateRegistrationAnswer(answers, 'preferred_name', '', true);
  assert.equal(updateRegistrationAnswer(answers, 'full_name', 'Outro Nome', true).preferred_name, '');
  assert.equal(updateRegistrationAnswer({}, 'full_name', '李 小龍', false).preferred_name, '李');
  assert.equal(updateRegistrationAnswer({}, 'full_name', '', false).preferred_name, '');
});

test('telefone mantém DDI, DDD e número e permite formato internacional', () => {
  for (const phone of ['+5511999999999', '+351912345678', '+12025550123', '+447700900123']) {
    assert.equal(joinPhone(splitPhone(phone)), phone);
    assert.equal(phoneError(phone), null);
  }
  assert.deepEqual(splitPhone('(11) 99999-9999'), { ddi: '55', area: '11', number: '999999999' });
  assert.equal(joinPhone({ ddi: '55', area: '', number: '' }), '');
  for (const bad of ['11999', '+5501999999999', '+5511888888888', '+551199999999999999', '+0 1234567', '+55 <script>']) assert.ok(phoneError(bad), bad);
});
