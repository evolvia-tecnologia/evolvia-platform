import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultCategoryLabelFields, normalizeCategoryLabelFields,
  updateCategoryLabelTemplate, labelTemplateForCategory,
  categoryLabelTemplates, categoryBadgeItems, normalizeLabelFieldStyles,
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

test('modelos legados duplicados usam o último válido sem perder outras categorias', () => {
  const config = { categoryLabelTemplates: [
    { categoryId: categoryA, fields: ['preferred_name', 'qr'] },
    { categoryId: categoryB, fields: ['institution', 'qr'] },
    { categoryId: categoryA, fields: ['qr', 'qr'] },
    { categoryId: categoryA, fields: ['job_title', 'qr'] },
    { categoryId: categoryA, fields: ['preferred_name'], styles: { preferred_name: { align: ['left'], bold: false, color: '#111827' } } },
  ] };
  const models = categoryLabelTemplates(config);
  assert.equal(models.length, 2);
  assert.deepEqual(labelTemplateForCategory(config, categoryA), ['preferred_name']);
  assert.equal(models.find((model) => model.categoryId === categoryA)?.styles, undefined);
  assert.deepEqual(labelTemplateForCategory(config, categoryB), ['institution', 'qr']);
  const updated = updateCategoryLabelTemplate(config, categoryA, ['city_state', 'qr']);
  assert.equal(categoryLabelTemplates(updated).length, 2);
  assert.deepEqual(labelTemplateForCategory(updated, categoryA), ['city_state', 'qr']);
  assert.deepEqual(labelTemplateForCategory(updated, categoryB), ['institution', 'qr']);
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

test('etiqueta preserva valores escolhidos acima de 80 caracteres sem truncamento silencioso', () => {
  const longName = 'Ana Beatriz '.repeat(12).trim();
  const longCompany = 'Instituição de Pesquisa '.repeat(8).trim();
  const longCity = 'Município de Nome Composto '.repeat(6).trim();
  const longCustom = 'Participação científica '.repeat(8).trim();
  const items = categoryBadgeItems({
    preferred_name: longName, institution: longCompany, city_state: longCity,
    company_custom: longCustom, email: 'privado@example.test',
  }, ['preferred_name', 'institution', 'city_state', 'company_custom', 'qr']);
  assert.deepEqual(items.map(item => item.code),
    ['preferred_name', 'institution', 'city_state', 'company_custom', 'qr']);
  assert.deepEqual(items.slice(0, 4).map(item => item.value),
    [longName, longCompany, longCity, longCustom]);
  assert.doesNotMatch(JSON.stringify(items), /privado@example\.test/);
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

test('impressão recupera empresa de campos legados quando o principal está vazio', () => {
  const items = categoryBadgeItems({
    company: '  ', company_name: '  Empresa Histórica  ', organization: 'Outra Empresa',
  }, ['institution']);
  assert.deepEqual(items, [{ code: 'institution', kind: 'text', value: 'Empresa Histórica' }]);
  assert.deepEqual(categoryBadgeItems({
    company: null, company_name: '', organization: '  Organização Alternativa  ',
  }, ['institution']), [{ code: 'institution', kind: 'text', value: 'Organização Alternativa' }]);
  assert.deepEqual(categoryBadgeItems({
    company: '', company_name: ' ', organization: null,
  }, ['institution']), []);
});

test('campos numéricos permitidos são impressos, valores não finitos não são expostos', () => {
  const fields = ['score_publico', 'number_publico'];
  assert.deepEqual(normalizeCategoryLabelFields(fields, fields), fields);
  assert.deepEqual(categoryBadgeItems({ score_publico: 10.5, number_publico: Number.NaN }, fields), [
    { code: 'score_publico', kind: 'text', value: '10.5' },
  ]);
});

test('estilos por campo usam paleta segura e rejeitam CSS arbitrário', () => {
  const styles = normalizeLabelFieldStyles({ preferred_name: { align: 'center', bold: true, color: '#1d4ed8' } }, ['preferred_name', 'qr']);
  assert.equal(styles.preferred_name.align, 'center');
  for (const candidate of [
    { email: { align: 'left', bold: false, color: '#111827' } },
    { preferred_name: { align: 'justify', bold: false, color: '#111827' } },
    { preferred_name: { align: 'left', bold: true, color: 'url(javascript:evil)' } },
    { preferred_name: { align: 'left', bold: 'yes', color: '#111827' } },
  ]) assert.throws(() => normalizeLabelFieldStyles(candidate, ['preferred_name']), DeskPolicyError);
  const config = updateCategoryLabelTemplate({}, categoryA, ['preferred_name', 'qr'], styles);
  assert.equal(labelTemplateForCategory(config, categoryA)[0], 'preferred_name');
  assert.deepEqual(categoryLabelTemplates(config)[0].styles, styles);
  const items = categoryBadgeItems({ preferred_name: 'Bia' }, ['preferred_name'], styles);
  assert.deepEqual(items[0].style, styles.preferred_name);
});

test('impede texto branco invisível no papel e mantém campos de modelos legados', () => {
  const whiteStyle = { preferred_name: { align: 'center', bold: false, color: '#ffffff' } };
  assert.throws(() => normalizeLabelFieldStyles(whiteStyle, ['preferred_name', 'qr']), DeskPolicyError);
  const legacy = { categoryLabelTemplates: [{
    categoryId: categoryA, fields: ['preferred_name', 'qr'], styles: whiteStyle,
  }] };
  const [model] = categoryLabelTemplates(legacy);
  assert.deepEqual(model.fields, ['preferred_name', 'qr']);
  assert.equal(model.styles, undefined);
  assert.deepEqual(labelTemplateForCategory(legacy, categoryA), ['preferred_name', 'qr']);
  for (const color of ['#111827', '#1d4ed8', '#065f46', '#9a3412', '#7c2d12', '#6b21a8', '#be123c']) {
    assert.equal(normalizeLabelFieldStyles({
      preferred_name: { align: 'left', bold: false, color },
    }, ['preferred_name']).preferred_name.color, color);
  }
});

test('rejeita alinhamento com tipo array e mantém crachá acessível diante de estilo corrompido', () => {
  assert.throws(() => normalizeLabelFieldStyles({
    preferred_name: { align: ['left'], bold: false, color: '#111827' },
  }, ['preferred_name']), DeskPolicyError);
  const corrupted = { categoryLabelTemplates: [{
    categoryId: categoryA, fields: ['preferred_name', 'qr'],
    styles: { preferred_name: { align: ['left'], bold: false, color: '#111827' } },
  }] };
  const model = categoryLabelTemplates(corrupted)[0];
  assert.deepEqual(model.fields, ['preferred_name', 'qr']);
  assert.equal(model.styles, undefined);
  assert.deepEqual(labelTemplateForCategory(corrupted, categoryA), ['preferred_name', 'qr']);
});

test('configurações legadas malformadas não duplicam QR nem quebram outras categorias', () => {
  const invalidModels = [
    ['preferred_name', 'qr', 'qr'],
    Array.from({ length: 13 }, (_, index) => `custom_${index}`),
  ];
  for (const fields of invalidModels) {
    const config = { categoryLabelTemplates: [
      { categoryId: categoryA, fields },
      { categoryId: categoryB, fields: ['preferred_name', 'qr'] },
    ] };
    assert.deepEqual(categoryLabelTemplates(config).map((item) => item.categoryId), [categoryB]);
    assert.deepEqual(labelTemplateForCategory(config, categoryA), defaultCategoryLabelFields());
    assert.deepEqual(labelTemplateForCategory(config, categoryB), ['preferred_name', 'qr']);
  }
});

test('modelo por categoria é independente do perfil do evento e da organização', () => {
  for (const profile of ['SCIENTIFIC', 'CORPORATE', 'FAIR', 'ENTERTAINMENT', 'SPORTS']) {
    const scoped = { profileCode: profile, organizationId: 'organization_test_01' };
    const config = updateCategoryLabelTemplate(scoped, categoryA, ['preferred_name', 'qr'], {
      preferred_name: { align: 'center', bold: true, color: '#1d4ed8' },
    });
    assert.deepEqual(labelTemplateForCategory(config, categoryA), ['preferred_name', 'qr']);
    assert.deepEqual(labelTemplateForCategory(config, categoryB), defaultCategoryLabelFields());
    assert.equal(categoryLabelTemplates(config)[0].styles.preferred_name.align, 'center');
  }
});

test('campo personalizado constructor não herda estilo do protótipo e aceita estilo explícito', () => {
  // "constructor" é um código sintaticamente permitido; {} herda constructor de Object.prototype.
  const data = JSON.parse('{"constructor":"Valor público"}');
  assert.deepEqual(categoryBadgeItems(data, ['constructor']), [
    { code: 'constructor', kind: 'text', value: 'Valor público' },
  ]);
  const styles = normalizeLabelFieldStyles({
    constructor: { align: 'right', bold: true, color: '#111827' },
  }, ['constructor']);
  assert.deepEqual(categoryBadgeItems(data, ['constructor'], styles), [
    { code: 'constructor', kind: 'text', value: 'Valor público', style: styles.constructor },
  ]);
  assert.deepEqual(categoryBadgeItems({}, ['qr']), [
    { code: 'qr', kind: 'qr', value: '' },
  ]);
});

test('não herda estilos do protótipo nem aceita __proto__ como campo de etiqueta', () => {
  const inherited = Object.create({
    preferred_name: { align: 'right', bold: true, color: '#be123c' },
  });
  assert.deepEqual(normalizeLabelFieldStyles(inherited, ['preferred_name']), {},
    'estilo herdado não deve ser salvo como configuração explícita');
  const injected = JSON.parse('{"__proto__":{"align":"left","bold":false,"color":"#111827"}}');
  assert.throws(() => normalizeLabelFieldStyles(injected, ['preferred_name']), DeskPolicyError,
    'chave reservada não pode ser persistida ou modificar o protótipo');
  assert.equal(Object.prototype.polluted, undefined);
});

test('código reservado __proto__ não altera protótipos nem é exibido em etiquetas', () => {
  const field = '__proto__';
  assert.throws(() => normalizeCategoryLabelFields([field], [field]), DeskPolicyError);
  const injectedStyles = JSON.parse('{"__proto__":{"align":"left","bold":false,"color":"#111827"}}');
  assert.throws(() => normalizeLabelFieldStyles(injectedStyles, [field]), DeskPolicyError);
  const legacy = { categoryLabelTemplates: [
    { categoryId: categoryA, fields: [field, 'qr'] },
    { categoryId: categoryB, fields: ['preferred_name', 'qr'] },
  ] };
  assert.deepEqual(categoryLabelTemplates(legacy).map((model) => model.categoryId), [categoryB]);
  assert.deepEqual(labelTemplateForCategory(legacy, categoryA), defaultCategoryLabelFields());
  const data = JSON.parse('{"__proto__":"não imprimir","preferred_name":"Ana"}');
  assert.deepEqual(categoryBadgeItems(data, [field, 'preferred_name']), [
    { code: 'preferred_name', kind: 'text', value: 'Ana' },
  ]);
  assert.equal(Object.prototype.polluted, undefined);
});


test('família e tamanho da fonte persistem por campo/categoria com whitelist estrita', () => {
  const style = { align: 'center', bold: true, color: '#1d4ed8', fontFamily: 'serif', fontSizeMm: 3.5 };
  const normalized = normalizeLabelFieldStyles({ preferred_name: style }, ['preferred_name', 'qr']);
  assert.deepEqual(normalized.preferred_name, style);
  const config = updateCategoryLabelTemplate({}, categoryA, ['preferred_name', 'qr'], normalized);
  assert.deepEqual(categoryLabelTemplates(config)[0].styles.preferred_name, style);
  assert.deepEqual(categoryBadgeItems({ preferred_name: 'Nome Longo' }, ['preferred_name'], normalized)[0].style, style);
  assert.equal(categoryLabelTemplates(config).find((item) => item.categoryId === categoryB), undefined);
  const legacy = normalizeLabelFieldStyles({ preferred_name: { align: 'left', bold: false, color: '#111827' } }, ['preferred_name']);
  assert.equal(legacy.preferred_name.fontFamily, undefined);
  assert.equal(legacy.preferred_name.fontSizeMm, undefined);
  for (const bad of [
    { ...style, fontFamily: 'url(evil)' }, { ...style, fontFamily: ['sans'] },
    { ...style, fontSizeMm: 1 }, { ...style, fontSizeMm: 99 },
    { ...style, fontSizeMm: '3.5' }, { ...style, fontSizeMm: Number.NaN },
    { ...style, fontSizeMm: 3.75 }, { ...style, fontSizeMm: 3.5, css: 'position:absolute' },
  ]) assert.throws(() => normalizeLabelFieldStyles({ preferred_name: bad }, ['preferred_name']), DeskPolicyError);
});


test('leitura de estilos legados descarta apenas o campo inválido sem perder os válidos', () => {
  const valid = { align: 'right', bold: true, color: '#065f46', fontFamily: 'mono', fontSizeMm: 3 };
  const legacy = { categoryLabelTemplates: [{
    categoryId: categoryA, fields: ['preferred_name', 'institution', 'qr'],
    styles: JSON.parse(JSON.stringify({
      preferred_name: valid,
      institution: { align: 'left', bold: false, color: '#ffffff' },
      qr: { align: 'center', bold: false, color: '#111827' },
    })),
  }] };
  const model = categoryLabelTemplates(legacy)[0];
  assert.deepEqual(model.fields, ['preferred_name', 'institution', 'qr']);
  assert.deepEqual(model.styles.preferred_name, valid);
  assert.equal(model.styles.institution, undefined);
  assert.equal(model.styles.qr.align, 'center');
  assert.deepEqual(categoryBadgeItems({ preferred_name: 'Nome', institution: 'Empresa' }, model.fields, model.styles)
    .map((item) => item.code), ['preferred_name', 'institution', 'qr']);
  const injected = JSON.parse('{"__proto__":{"align":"left","bold":false,"color":"#111827"}}');
  const safe = categoryLabelTemplates({ categoryLabelTemplates: [{
    categoryId: categoryA, fields: ['preferred_name', 'qr'],
    styles: { ...injected, preferred_name: valid },
  }] })[0];
  assert.deepEqual(safe.styles.preferred_name, valid);
  assert.equal(Object.prototype.polluted, undefined);
});
