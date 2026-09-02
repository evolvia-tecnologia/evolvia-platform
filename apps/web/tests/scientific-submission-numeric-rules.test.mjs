import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { previewScientificNumericRules } from '../lib/preview-scientific-numeric-rules.ts';

const component = readFileSync(new URL('../components/scientific-submissions.tsx', import.meta.url), 'utf8');
const preview = readFileSync(new URL('../lib/preview-scientific-numeric-rules.ts', import.meta.url), 'utf8');
const webNumericCopy = new URL('../lib/scientific-submission-numeric-rules.ts', import.meta.url);

const forbiddenLiterals = [
  'titleMaxLength: 250',
  'minKeywords: 3',
  'maxKeywords: 5',
  'maxSubmissionsPerAuthor: 1',
  'titleMaxLength: { min: 50',
  'SCIENTIFIC_NUMERIC_RULE_DEFAULTS',
  'SCIENTIFIC_NUMERIC_RULE_BOUNDS',
  'scientific-submission-numeric-rules',
];

test('a Web não copia o contrato canônico nem hardcoda defaults e bounds', () => {
  assert.equal(existsSync(webNumericCopy), false, 'a cópia integral em apps/web/lib não pode voltar');
  for (const literal of forbiddenLiterals) {
    assert.equal(component.includes(literal), false, `componente não pode conter ${literal}`);
    assert.equal(preview.includes(literal), false, `pré-validação não pode conter ${literal}`);
  }
  assert.match(component, /numericContract/u);
  assert.match(component, /payload\.numericContract/u);
  assert.match(component, /previewScientificNumericRules/u);
});

test('pré-validação da Web consome somente metadados recebidos do servidor', () => {
  const contract = {
    defaults: {
      maxSubmissionsPerAuthor: 9,
      minAuthors: 2,
      maxAuthors: 4,
      titleMaxLength: 80,
      minKeywords: 1,
      maxKeywords: 2,
    },
    bounds: {
      maxSubmissionsPerAuthor: { min: 8, max: 9 },
      minAuthors: { min: 2, max: 4 },
      maxAuthors: { min: 2, max: 4 },
      titleMaxLength: { min: 70, max: 90 },
      minKeywords: { min: 1, max: 2 },
      maxKeywords: { min: 1, max: 2 },
    },
    labels: {
      maxSubmissionsPerAuthor: 'limite de trabalhos',
      minAuthors: 'mínimo de autores',
      maxAuthors: 'máximo de autores',
      titleMaxLength: 'máximo do título',
      minKeywords: 'mínimo de palavras-chave',
      maxKeywords: 'máximo de palavras-chave',
    },
    hints: {
      maxSubmissionsPerAuthor: 'hint-submissions',
      minAuthors: 'hint-min-authors',
      maxAuthors: 'hint-max-authors',
      titleMaxLength: 'hint-title',
      minKeywords: 'hint-min-keywords',
      maxKeywords: 'hint-max-keywords',
    },
    helps: {
      maxSubmissionsPerAuthor: 'ajuda trabalhos',
      minAuthors: 'ajuda mínimo autores',
      maxAuthors: 'ajuda máximo autores',
      titleMaxLength: 'ajuda título',
      minKeywords: 'ajuda mínimo palavras',
      maxKeywords: 'ajuda máximo palavras',
    },
    messages: {
      notInteger: 'inteiro inválido para {label}',
      outOfBounds: '{label} entre {min} e {max}. {hint}',
      maxAuthorsBelowMin: 'máximo de autores incoerente',
      maxKeywordsBelowMin: 'máximo de palavras-chave incoerente',
    },
  };

  const title = previewScientificNumericRules({ ...contract.defaults, titleMaxLength: 91 }, contract);
  assert.equal(title.ok, false);
  assert.match(title.errors[0].message, /máximo do título entre 70 e 90/u);
  assert.match(title.errors[0].message, /hint-title/u);

  const authors = previewScientificNumericRules({ ...contract.defaults, minAuthors: 4, maxAuthors: 2 }, contract);
  assert.equal(authors.ok, false);
  assert.equal(authors.errors.some((error) => error.message === 'máximo de autores incoerente'), true);

  const keywords = previewScientificNumericRules({ ...contract.defaults, minKeywords: 2, maxKeywords: 1 }, contract);
  assert.equal(keywords.ok, false);
  assert.equal(keywords.errors.some((error) => error.message === 'máximo de palavras-chave incoerente'), true);

  const valid = previewScientificNumericRules(contract.defaults, contract);
  assert.equal(valid.ok, true);
});
