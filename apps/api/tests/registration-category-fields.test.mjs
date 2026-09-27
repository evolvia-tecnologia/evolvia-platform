import assert from 'node:assert/strict';
import test from 'node:test';
import { publicRegistrationFields, validateCategoryAnswers } from '../src/registration-category-fields.ts';

const categoryA = 'category-a';
const categoryB = 'category-b';
const schema = [
  { code: 'badge_name', label: 'Nome no crachá', type: 'TEXT', required: true, enabled: true, appliesToCategoryIds: [categoryA] },
  { code: 'institution', label: 'Instituição', type: 'TEXT', required: false, enabled: true, appliesToCategoryIds: [categoryB] },
  { code: 'accessibility', label: 'Acessibilidade', type: 'TEXTAREA', required: false, enabled: true },
  { code: 'discarded', label: 'Desativado', type: 'TEXT', required: false, enabled: false },
];
const base = {
  full_name: 'Pessoa Exemplo',
  preferred_name: 'Pessoa',
  identity_document: '52998224725',
  email: 'pessoa@example.com',
  phone: '11999999999',
  terms_acceptance: true,
};

test('campos essenciais permanecem globais e campo obrigatório é exclusivo da categoria', () => {
  const a = publicRegistrationFields(schema, categoryA);
  const b = publicRegistrationFields(schema, categoryB);
  assert.ok(a.some((field) => field.code === 'badge_name' && field.required));
  assert.ok(!b.some((field) => field.code === 'badge_name'));
  assert.ok(b.some((field) => field.code === 'institution'));
  assert.ok(!a.some((field) => field.code === 'institution'));
  assert.ok(a.some((field) => field.code === 'terms_acceptance' && field.required));
  assert.ok(b.some((field) => field.code === 'email' && field.required));
  assert.ok(!a.some((field) => field.code === 'discarded'));
  assert.throws(() => validateCategoryAnswers(base, a, categoryA), /Nome no crachá/);
  assert.doesNotThrow(() => validateCategoryAnswers(base, b, categoryB));
  assert.doesNotThrow(() => validateCategoryAnswers({ ...base, badge_name: 'Exemplo' }, a, categoryA));
});

test('servidor rejeita resposta de outra categoria, categoria divergente e campo extra', () => {
  const b = publicRegistrationFields(schema, categoryB);
  assert.throws(() => validateCategoryAnswers({ ...base, badge_name: 'Vazamento' }, b, categoryB), /não pertencem/);
  assert.throws(() => validateCategoryAnswers({ ...base, registration_type: categoryA }, b, categoryB), /não corresponde/);
  assert.throws(() => validateCategoryAnswers({ ...base, injected: '<script>' }, b, categoryB), /não pertencem/);
  assert.throws(() => validateCategoryAnswers({ ...base, institution: 'Outra', terms_acceptance: false }, b, categoryB), /obrigatório/);
});

test('campos globais são mantidos quando a categoria muda', () => {
  for (const id of [categoryA, categoryB]) {
    const fields = publicRegistrationFields(schema, id);
    assert.ok(fields.some((field) => field.code === 'accessibility'));
    assert.ok(fields.some((field) => field.code === 'full_name'));
  }
});
