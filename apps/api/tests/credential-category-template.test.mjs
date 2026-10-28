import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultCategoryLabelFields, normalizeCategoryLabelFields,
  updateCategoryLabelTemplate, labelTemplateForCategory,
  categoryLabelTemplates, categoryBadgeItems,
} from '../dist/credential-category-template.policy.js';
import { DeskPolicyError } from '../dist/event-desk-policy.js';

const categoryA = 'cm12345678901234567890001';
const categoryB = 'cm12345678901234567890002';
const available = ['preferred_name', 'full_name', 'institution', 'city_state', 'job_title', 'company_custom'];

test('cada categoria nasce com nome preferido, empresa, cidade/estado e QR nessa ordem', () => {
  assert.deepEqual(defaultCategoryLabelFields(), ['preferred_name', 'institution', 'city_state', 'qr']);
  assert.deepEqual(labelTemplateForCategory({}, categoryA), defaultCategoryLabelFields());
  assert.notStrictEqual(defaultCategoryLabelFields(), defaultCategoryLabelFields());
});

test('organizador altera a ordem e inclui ou remove campos válidos da ficha', () => {
  const ordered = normalizeCategoryLabelFields(
    ['job_title', 'preferred_name', 'city_state', 'institution', 'qr', 'company_custom'], available);
  assert.deepEqual(ordered, ['job_title', 'preferred_name', 'city_state', 'institution', 'qr', 'company_custom']);
  assert.deepEqual(normalizeCategoryLabelFields([], available), []);
  assert.deepEqual(normalizeCategoryLabelFields(['institution', 'preferred_name'], available),
    ['institution', 'preferred_name']);
});

test('bloqueia CPF, telefone, e-mail, campos estranhos, duplicados e excesso', () => {
  const bad = [
    ['identity_document'], ['email'], ['phone'], ['terms_acceptance'],
    ['unknown_field'], ['qr', 'qr'], Array(13).fill('qr'),
    'preferred_name',
  ];
  for (const candidate of bad) {
    assert.throws(() => normalizeCategoryLabelFields(candidate, available), DeskPolicyError);
  }
});

test('configuração da categoria A não altera a categoria B nem totem ou tamanho', () => {
  const original = { selfService: ['EMAIL'], label: { preset: '9x4', widthMm: 90, heightMm: 40 } };
  const withA = updateCategoryLabelTemplate(original, categoryA, ['preferred_name', 'qr']);
  const withB = updateCategoryLabelTemplate(withA, categoryB, ['institution', 'city_state', 'qr']);
  assert.deepEqual(labelTemplateForCategory(withB, categoryA), ['preferred_name', 'qr']);
  assert.deepEqual(labelTemplateForCategory(withB, categoryB), ['institution', 'city_state', 'qr']);
  assert.deepEqual(original.selfService, ['EMAIL']);
  assert.deepEqual(withB.selfService, ['EMAIL']);
  assert.deepEqual(withB.label, original.label);
  assert.equal(categoryLabelTemplates(withB).length, 2);
});

test('reconfigurar categoria substitui modelo anterior sem criar duplicidade', () => {
  const first = updateCategoryLabelTemplate({}, categoryA, ['preferred_name', 'qr']);
  const second = updateCategoryLabelTemplate(first, categoryA, ['city_state']);
  assert.deepEqual(categoryLabelTemplates(second), [{ categoryId: categoryA, fields: ['city_state'] }]);
});

test('impressão respeita ordem, combina cidade/UF e nunca expõe CPF/e-mail', () => {
  const items = categoryBadgeItems({
    preferred_name: 'Bia', institution: 'Empresa Exemplo',
    city: 'Osasco', state: 'SP', job_title: 'Palestrante',
    identity_document: '52998224725', email: 'naoexpor@example.test',
  }, ['job_title', 'preferred_name', 'institution', 'city_state', 'qr', 'email']);
  assert.deepEqual(items, [
    { code: 'job_title', kind: 'text', value: 'Palestrante' },
    { code: 'preferred_name', kind: 'text', value: 'Bia' },
    { code: 'institution', kind: 'text', value: 'Empresa Exemplo' },
    { code: 'city_state', kind: 'text', value: 'Osasco / SP' },
    { code: 'qr', kind: 'qr', value: '' },
  ]);
  assert.doesNotMatch(JSON.stringify(items), /52998224725|naoexpor/u);
});

test('nome para crachá usa nome completo quando participante não informa preferência', () => {
  const content = categoryBadgeItems({ full_name: 'Beatriz Teste', company: 'Organização Fictícia' },
    ['preferred_name', 'institution', 'city_state', 'qr']);
  assert.deepEqual(content, [
    { code: 'preferred_name', kind: 'text', value: 'Beatriz Teste' },
    { code: 'institution', kind: 'text', value: 'Organização Fictícia' },
    { code: 'qr', kind: 'qr', value: '' },
  ]);
});

test('campos numéricos permitidos são impressos, valores não finitos não são expostos', () => {
  const fields = ['score_publico', 'number_publico'];
  assert.deepEqual(normalizeCategoryLabelFields(fields, fields), fields);
  assert.deepEqual(categoryBadgeItems({ score_publico: 10.5, number_publico: Number.NaN }, fields), [
    { code: 'score_publico', kind: 'text', value: '10.5' },
  ]);
});
