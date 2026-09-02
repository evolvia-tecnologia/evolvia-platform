import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveScientificNumericRules,
  SCIENTIFIC_NUMERIC_RULE_BOUNDS,
  SCIENTIFIC_NUMERIC_RULE_DEFAULTS,
  validateScientificNumericRules,
} from '../dist/scientific-submission-numeric-rules.js';

test('regras numéricas usam os padrões canônicos da issue 124', () => {
  const resolved = resolveScientificNumericRules(null, {});
  assert.equal(resolved.ok, true);
  assert.deepEqual(resolved.rules, {
    maxSubmissionsPerAuthor: 1,
    minAuthors: 1,
    maxAuthors: null,
    titleMaxLength: 250,
    minKeywords: 3,
    maxKeywords: 5,
  });
  assert.equal(SCIENTIFIC_NUMERIC_RULE_DEFAULTS.titleMaxLength, 250);
  assert.equal(SCIENTIFIC_NUMERIC_RULE_DEFAULTS.minKeywords, 3);
  assert.equal(SCIENTIFIC_NUMERIC_RULE_DEFAULTS.maxKeywords, 5);
});

test('rejeita combinações incoerentes de mínimo e máximo', () => {
  const authors = resolveScientificNumericRules({ minAuthors: 4, maxAuthors: 8 }, { minAuthors: 9 });
  assert.equal(authors.ok, false);
  assert.equal(authors.errors.some((error) => error.field === 'maxAuthors'), true);

  const keywords = resolveScientificNumericRules({ minKeywords: 3, maxKeywords: 5 }, { minKeywords: 8 });
  assert.equal(keywords.ok, false);
  assert.equal(keywords.errors.some((error) => error.field === 'maxKeywords'), true);
});

test('rejeita valores fora dos limites seguros sem usar o conteúdo científico', () => {
  const cases = [
    ['maxSubmissionsPerAuthor', 0],
    ['maxSubmissionsPerAuthor', 101],
    ['minAuthors', 0],
    ['titleMaxLength', 49],
    ['titleMaxLength', 1001],
    ['minKeywords', -1],
    ['maxKeywords', 21],
  ];

  for (const [field, value] of cases) {
    const resolved = resolveScientificNumericRules(SCIENTIFIC_NUMERIC_RULE_DEFAULTS, { [field]: value });
    assert.equal(resolved.ok, false, `${field}=${value} deveria ser rejeitado`);
    assert.equal(resolved.errors[0].field, field);
    assert.equal(JSON.stringify(resolved.errors).includes('Biomarcadores'), false);
  }

  assert.equal(SCIENTIFIC_NUMERIC_RULE_BOUNDS.titleMaxLength.min, 50);
  assert.equal(SCIENTIFIC_NUMERIC_RULE_BOUNDS.titleMaxLength.max, 1000);
});

test('aceita ajuste coerente e preserva o par mínimo/máximo já persistido', () => {
  const resolved = resolveScientificNumericRules(
    { minAuthors: 2, maxAuthors: 6, minKeywords: 3, maxKeywords: 8, titleMaxLength: 250, maxSubmissionsPerAuthor: 2 },
    { minAuthors: 4, titleMaxLength: 180 },
  );
  assert.equal(resolved.ok, true);
  assert.equal(resolved.rules.minAuthors, 4);
  assert.equal(resolved.rules.maxAuthors, 6);
  assert.equal(resolved.rules.titleMaxLength, 180);
  assert.equal(resolved.rules.maxKeywords, 8);
});

test('máximo de autores vazio permanece ilimitado e números quebrados são recusados', () => {
  const unlimited = resolveScientificNumericRules(SCIENTIFIC_NUMERIC_RULE_DEFAULTS, { maxAuthors: null, minAuthors: 3 });
  assert.equal(unlimited.ok, true);
  assert.equal(unlimited.rules.maxAuthors, null);

  const broken = validateScientificNumericRules({
    ...SCIENTIFIC_NUMERIC_RULE_DEFAULTS,
    titleMaxLength: 250.4,
  });
  assert.equal(broken.some((error) => error.field === 'titleMaxLength'), true);
});
