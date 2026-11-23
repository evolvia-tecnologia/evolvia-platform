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
  assert.throws(() => validateCategoryAnswers({ ...base, terms_acceptance: null }, b, categoryB), /obrigatório/);
  assert.throws(() => validateCategoryAnswers({ ...base, institution: 'Outra', full_name: '   ' }, b, categoryB), /obrigatório/);
});

test('campos globais são mantidos quando a categoria muda', () => {
  for (const id of [categoryA, categoryB]) {
    const fields = publicRegistrationFields(schema, id);
    assert.ok(fields.some((field) => field.code === 'accessibility'));
    assert.ok(fields.some((field) => field.code === 'full_name'));
  }
});

test('metadados armazenados não enfraquecem campos essenciais', () => {
  const fields = publicRegistrationFields([
    { code: 'terms_acceptance', label: 'Pular consentimento', type: 'TEXT', required: false, enabled: true, appliesToCategoryIds: [categoryA] },
    { code: 'identity_document', label: 'Documento livre', type: 'TEXTAREA', required: false, enabled: true },
  ], categoryB);
  const terms = fields.find((field) => field.code === 'terms_acceptance');
  const identity = fields.find((field) => field.code === 'identity_document');
  assert.equal(terms?.type, 'CONSENT');
  assert.equal(terms?.required, true);
  assert.equal(terms?.appliesToCategoryIds, undefined);
  assert.equal(identity?.type, 'DOCUMENT');
  assert.equal(identity?.required, true);
  assert.throws(() => validateCategoryAnswers({ ...base, terms_acceptance: false }, fields, categoryB), /obrigatório/);
});

test('respostas nulas ou estruturais não lançam exceção de tipo', () => {
  const fields = publicRegistrationFields(schema, categoryB);
  for (const answers of [null, undefined, []]) {
    assert.throws(() => validateCategoryAnswers(answers, fields, categoryB), /inválidas/);
  }
});

test('G6.8: consentimento de e-mail é opcional, não pré-selecionado e impossível de impor pelo organizador', () => {
  for (const id of [categoryA, categoryB]) {
    const fields = publicRegistrationFields([
      { code: 'communication_opt_in', label: 'Aceite obrigatório e genérico',
        type: 'TEXT', required: true, enabled: true, appliesToCategoryIds: [categoryA] },
    ], id);
    const consent = fields.find(field => field.code === 'communication_opt_in');
    assert.ok(consent);
    assert.equal(consent.type, 'CONSENT');
    assert.equal(consent.required, false);
    assert.equal(consent.appliesToCategoryIds, undefined);
    assert.notEqual(consent.label, 'Aceite obrigatório e genérico');
    assert.doesNotThrow(() => validateCategoryAnswers(base, fields, id));
    assert.doesNotThrow(() => validateCategoryAnswers({ ...base, communication_opt_in: false }, fields, id));
    assert.doesNotThrow(() => validateCategoryAnswers({ ...base, communication_opt_in: true }, fields, id));
    for (const invalid of ['true', 'yes', 'on', 1, null, { consent: true }, []]) {
      assert.throws(() => validateCategoryAnswers({ ...base, communication_opt_in: invalid }, fields, id), /verdadeiro ou falso/);
    }
    assert.throws(() => validateCategoryAnswers({ ...base, terms_acceptance: false, communication_opt_in: true }, fields, id), /obrigatório/);
  }
});
