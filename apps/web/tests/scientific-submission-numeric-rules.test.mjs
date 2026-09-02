import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  resolveScientificNumericRules,
  SCIENTIFIC_NUMERIC_RULE_DEFAULTS,
} from '../lib/scientific-submission-numeric-rules.ts';

test('a Web reutiliza o mesmo contrato numérico do servidor', () => {
  const api = readFileSync(new URL('../../api/src/scientific-submission-numeric-rules.ts', import.meta.url), 'utf8');
  const web = readFileSync(new URL('../lib/scientific-submission-numeric-rules.ts', import.meta.url), 'utf8');
  assert.equal(web, api);
});

test('a Web recusa mínimo maior que máximo antes de enviar', () => {
  const authors = resolveScientificNumericRules(SCIENTIFIC_NUMERIC_RULE_DEFAULTS, { minAuthors: 6, maxAuthors: 2 });
  assert.equal(authors.ok, false);
  assert.equal(authors.errors.some((error) => /máximo de autores não pode ser menor/u.test(error.message)), true);

  const keywords = resolveScientificNumericRules(SCIENTIFIC_NUMERIC_RULE_DEFAULTS, { minKeywords: 7, maxKeywords: 4 });
  assert.equal(keywords.ok, false);
  assert.equal(keywords.errors.some((error) => /palavras-chave não pode ser menor/u.test(error.message)), true);
});

test('a Web aceita os padrões 1, 250, 3 e 5', () => {
  const resolved = resolveScientificNumericRules(null, {});
  assert.equal(resolved.ok, true);
  assert.equal(resolved.rules.maxSubmissionsPerAuthor, 1);
  assert.equal(resolved.rules.titleMaxLength, 250);
  assert.equal(resolved.rules.minKeywords, 3);
  assert.equal(resolved.rules.maxKeywords, 5);
});
