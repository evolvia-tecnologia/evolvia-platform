import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRegistrationPhone } from '../src/registration-phone.ts';
import { normalizePublicRegistration } from '../src/registration-reservations-policy.ts';
import { editableRegistrationFields, normalizeParticipantRegistrationPatch } from '../src/participant-registration-edit-policy.ts';

test('normaliza cadastro novo e correção sem reescrever dados históricos', () => {
  for (const phone of ['(11) 99999-9999', '5511999999999', '+55 (11) 99999-9999']) assert.equal(normalizeRegistrationPhone(phone), '+5511999999999');
  assert.equal(normalizeRegistrationPhone('+351 912345678'), '+351912345678');
  const fields = editableRegistrationFields([{ code: 'phone', label: 'Telefone', type: 'PHONE', required: true }], { phone: '1199' });
  assert.equal(fields[0].value, '1199');
  assert.equal(normalizeParticipantRegistrationPatch({ expectedRevision: 1, updates: { phone: '+1 202 555 0123' } }, fields).updates.phone, '+12025550123');
  assert.throws(() => normalizeParticipantRegistrationPatch({ expectedRevision: 1, updates: { phone: '1199' } }, fields));
});

test('API rejeita telefone inválido mesmo com cliente adulterado', () => {
  const input = { categoryId: 'category-test', lotId: 'lot-test-1', answers: { full_name: 'Pessoa QA', preferred_name: 'Pessoa', identity_document: 'TESTQA01', email: 'qa@example.com', phone: '+5511999999999', terms_acceptance: true } };
  assert.equal(normalizePublicRegistration(input).answers.phone, '+5511999999999');
  for (const phone of ['1199', '+5501999999999', '+5511888888888', 'abc', '+551199999999999999']) {
    assert.throws(() => normalizePublicRegistration({ ...input, answers: { ...input.answers, phone } }));
  }
  assert.throws(() => normalizePublicRegistration({ ...input, answers: { ...input.answers, terms_acceptance: false } }));
});
