import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ParticipantRegistrationEditPolicyError,
  editableRegistrationFields,
  normalizeParticipantRegistrationPatch,
  participantEditPayloadHash,
} from '../src/participant-registration-edit-policy.ts';

const form = [
  { code: 'full_name', label: 'Nome completo', type: 'TEXT', required: true, enabled: true },
  { code: 'identity_document', label: 'CPF', type: 'DOCUMENT', required: true, enabled: true },
  { code: 'email', label: 'E-mail', type: 'EMAIL', required: true, enabled: true },
  { code: 'phone', label: 'Telefone', type: 'PHONE', required: true, enabled: true },
  { code: 'accessibility', label: 'Acessibilidade', type: 'TEXTAREA', required: false, enabled: true },
];

test('expõe somente campos editáveis e preserva valor atual', () => {
  const fields = editableRegistrationFields(form, { full_name: 'Ana', identity_document: 'hash-free', email: 'ana@example.com', phone: '1199' });
  assert.deepEqual(fields.map((field) => field.code), ['full_name', 'phone', 'accessibility']);
  assert.equal(fields[0].value, 'Ana');
});

test('rejeita campo protegido e revisão ausente', () => {
  const fields = editableRegistrationFields(form, {});
  assert.throws(() => normalizeParticipantRegistrationPatch({ expectedRevision: 1, updates: { email: 'outro@example.com' } }, fields), ParticipantRegistrationEditPolicyError);
  assert.throws(() => normalizeParticipantRegistrationPatch({ updates: { phone: '1199' } }, fields), ParticipantRegistrationEditPolicyError);
});

test('hash do payload é determinístico pela ordem dos campos', () => {
  const left = participantEditPayloadHash({ expectedRevision: 2, updates: { phone: '1', full_name: 'Ana' } });
  const right = participantEditPayloadHash({ expectedRevision: 2, updates: { full_name: 'Ana', phone: '1' } });
  assert.equal(left, right);
});

test('campo numérico vazio respeita obrigatoriedade e não vira zero', () => {
  const required = editableRegistrationFields([{ code: 'quantity', label: 'Quantidade', type: 'NUMBER', required: true }], {});
  const optional = editableRegistrationFields([{ code: 'quantity', label: 'Quantidade', type: 'NUMBER', required: false }], {});
  assert.throws(() => normalizeParticipantRegistrationPatch({ expectedRevision: 1, updates: { quantity: '' } }, required), ParticipantRegistrationEditPolicyError);
  assert.equal(normalizeParticipantRegistrationPatch({ expectedRevision: 1, updates: { quantity: '' } }, optional).updates.quantity, '');
  assert.throws(() => normalizeParticipantRegistrationPatch({ expectedRevision: 1, updates: { quantity: null } }, required), ParticipantRegistrationEditPolicyError);
});

test('opção facultativa pode ser limpa, enquanto seleção obrigatória não pode', () => {
  const definition = { code: 'choice', label: 'Escolha', type: 'SELECT', options: [{ id: 'a', label: 'A' }] };
  const optional = editableRegistrationFields([{ ...definition, required: false }], {});
  const required = editableRegistrationFields([{ ...definition, required: true }], {});
  assert.equal(normalizeParticipantRegistrationPatch({ expectedRevision: 1, updates: { choice: '' } }, optional).updates.choice, '');
  assert.throws(() => normalizeParticipantRegistrationPatch({ expectedRevision: 1, updates: { choice: '' } }, required), ParticipantRegistrationEditPolicyError);
});

test('seleção múltipla obrigatória exige ao menos uma opção', () => {
  const fields = editableRegistrationFields([{ code: 'choices', label: 'Escolhas', type: 'CHECKBOX', required: true, options: [{ id: 'a', label: 'A' }] }], {});
  assert.throws(() => normalizeParticipantRegistrationPatch({ expectedRevision: 1, updates: { choices: [] } }, fields), ParticipantRegistrationEditPolicyError);
  assert.deepEqual(normalizeParticipantRegistrationPatch({ expectedRevision: 1, updates: { choices: ['a'] } }, fields).updates.choices, ['a']);
});
