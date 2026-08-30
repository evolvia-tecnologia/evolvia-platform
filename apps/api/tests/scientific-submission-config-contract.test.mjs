import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const service = readFileSync(new URL('../src/scientific-submissions.service.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../prisma/migrations/20260830220000_scientific_submission_configuration/migration.sql', import.meta.url), 'utf8');

test('contrato científico persiste todos os limites definidos na issue 124', () => {
  for (const field of ['maxSubmissionsPerAuthor', 'requirePresenter', 'requireCorrespondingAuthor', 'requireAuthorInstitution', 'titleMaxLength', 'minKeywords', 'maxKeywords', 'presentationFormats']) {
    assert.match(schema, new RegExp(`\\b${field}\\b`));
    assert.match(service, new RegExp(`\\b${field}\\b`));
  }
});

test('migration é aditiva e protege combinações inválidas no PostgreSQL', () => {
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN)/iu);
  assert.match(migration, /titleMaxLength" BETWEEN 50 AND 1000/u);
  assert.match(migration, /maxKeywords" BETWEEN "minKeywords" AND 20/u);
  assert.match(migration, /maxAuthors" IS NULL OR "maxAuthors" BETWEEN "minAuthors" AND 100/u);
});

test('formas padrão e personalizadas usam códigos controlados no servidor', () => {
  assert.match(service, /code: 'ORAL'/u);
  assert.match(service, /code: 'POSTER'/u);
  assert.match(service, /code: 'EPOSTER'/u);
  assert.match(service, /normalizePresentationFormats/u);
  assert.match(service, /seen\.has\(code\)/u);
});
