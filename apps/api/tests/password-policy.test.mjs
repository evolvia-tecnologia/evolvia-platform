import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPasswordPolicyViolations,
  isPasswordStrong,
} from '../dist/password-policy.js';

test('aceita senha com tamanho mínimo, maiúscula, número e símbolo', () => {
  assert.equal(isPasswordStrong('Evolvia#2026'), true);
  assert.deepEqual(getPasswordPolicyViolations('Evolvia#2026'), []);
});

test('aceita letra maiúscula Unicode', () => {
  assert.equal(isPasswordStrong('Árvore#2026'), true);
});

test('rejeita senha curta', () => {
  assert.ok(getPasswordPolicyViolations('Ev#2026').includes('MIN_LENGTH'));
});

test('rejeita senha sem letra maiúscula', () => {
  assert.ok(getPasswordPolicyViolations('evolvia#2026').includes('UPPERCASE'));
});

test('rejeita senha sem número', () => {
  assert.ok(getPasswordPolicyViolations('Evolvia#Senha').includes('NUMBER'));
});

test('rejeita senha sem símbolo', () => {
  assert.ok(getPasswordPolicyViolations('Evolvia2026').includes('SYMBOL'));
});

test('espaço não conta como símbolo', () => {
  assert.ok(getPasswordPolicyViolations('Evolvia 2026').includes('SYMBOL'));
});

test('não invalida por ausência de minúscula porque ela não faz parte da política aprovada', () => {
  assert.equal(isPasswordStrong('EVOLVIA#2026'), true);
});
