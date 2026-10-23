import assert from 'node:assert/strict';
import test from 'node:test';
import { preferenceParticipantName } from '../src/activity-preference.policy.ts';

test('o nome da preferência não leva e-mail nem documento', () => {
  assert.equal(preferenceParticipantName({ full_name: '  Ana   Souza  ', email: 'ana@example.test' }), 'Ana Souza');
  assert.equal(preferenceParticipantName({ nome: 'Bruno Lima', cpf: '00000000000' }), 'Bruno Lima');
  assert.equal(preferenceParticipantName({ full_name: 'ana@example.test' }), 'Inscrição sem nome');
  assert.equal(preferenceParticipantName({ email: 'ana@example.test' }), 'Inscrição sem nome');
  assert.equal(preferenceParticipantName(null), 'Inscrição sem nome');
  assert.equal(preferenceParticipantName({ full_name: 'A'.repeat(90) }).length, 80);
});
