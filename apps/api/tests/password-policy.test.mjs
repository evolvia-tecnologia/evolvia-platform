import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PASSWORD_MAX_BCRYPT_BYTES,
  getPasswordCharacterLength,
  getPasswordPolicyViolations,
  getPasswordUtf8ByteLength,
  isPasswordStrong,
} from '../dist/password-policy.js';

test('aceita senha com tamanho mínimo, maiúscula, número e símbolo', () => {
  assert.equal(isPasswordStrong('Evolvia#2026'), true);
  assert.deepEqual(getPasswordPolicyViolations('Evolvia#2026'), []);
});

test('aceita letra maiúscula Unicode', () => {
  assert.equal(isPasswordStrong('Árvore#2026'), true);
});

test('conta caracteres Unicode como o usuário percebe, sem depender de code units', () => {
  assert.equal(getPasswordCharacterLength('A1#abc😀'), 7);
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

test('aceita exatamente o limite efetivo de 72 bytes do bcrypt', () => {
  const password = `A1#${'a'.repeat(PASSWORD_MAX_BCRYPT_BYTES - 3)}`;
  assert.equal(getPasswordUtf8ByteLength(password), PASSWORD_MAX_BCRYPT_BYTES);
  assert.equal(isPasswordStrong(password), true);
});

test('rejeita 73 bytes para impedir truncamento silencioso do bcrypt', () => {
  const password = `A1#${'a'.repeat(PASSWORD_MAX_BCRYPT_BYTES - 2)}`;
  assert.equal(getPasswordUtf8ByteLength(password), PASSWORD_MAX_BCRYPT_BYTES + 1);
  assert.ok(getPasswordPolicyViolations(password).includes('MAX_BYTES'));
});

test('limite é calculado em bytes UTF-8 também para caracteres multibyte', () => {
  const exactly72 = `Á1#${'a'.repeat(68)}`;
  const over72 = `${exactly72}a`;

  assert.equal(getPasswordUtf8ByteLength(exactly72), PASSWORD_MAX_BCRYPT_BYTES);
  assert.equal(isPasswordStrong(exactly72), true);
  assert.equal(getPasswordUtf8ByteLength(over72), PASSWORD_MAX_BCRYPT_BYTES + 1);
  assert.ok(getPasswordPolicyViolations(over72).includes('MAX_BYTES'));
});
