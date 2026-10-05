import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const service = readFileSync(new URL('../src/scientific-submissions.service.ts', import.meta.url), 'utf8');
const formatPolicy = readFileSync(new URL('../src/scientific-submission-policy.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../prisma/migrations/20260830220000_scientific_submission_configuration/migration.sql', import.meta.url), 'utf8');
const extendedMigration = readFileSync(new URL('../prisma/migrations/20261004140000_scientific_submission_settings/migration.sql', import.meta.url), 'utf8');

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

test('configurações novas são aditivas e não apagam trabalho já enviado', () => {
  for (const field of ['collectScientificName', 'collectFundingAgency', 'collectConflictOfInterest', 'showProceedingsAuthorization', 'reviewersPerSubmission', 'coordinatorDecidesStatus', 'evaluationStyle', 'acceptedWorkUploadEnabled', 'abstractCounterUnit']) {
    assert.match(schema, new RegExp(`\\b${field}\\b`));
    assert.match(service, new RegExp(`\\b${field}\\b`));
  }
  assert.doesNotMatch(extendedMigration, /DROP\s+(TABLE|COLUMN)/iu);
  assert.match(extendedMigration, /maxPresenters" BETWEEN 1 AND 20/u);
  assert.match(extendedMigration, /showProceedingsAuthorization/u);
});

test('formas padrão e personalizadas usam códigos controlados no servidor', () => {
  assert.match(formatPolicy, /code: 'ORAL'/u);
  assert.match(formatPolicy, /code: 'TEMA_LIVRE'/u);
  assert.match(formatPolicy, /code: 'POSTER'/u);
  assert.match(formatPolicy, /code: 'EPOSTER'/u);
  assert.match(service, /normalizePresentationFormats/u);
  assert.match(service, /seen\.has\(code\)/u);
});

test('coleta de autores, ordem e instituição é aditiva', () => {
  const collectionMigration = readFileSync(new URL('../prisma/migrations/20261004210000_scientific_author_collection/migration.sql', import.meta.url), 'utf8');
  for (const field of ['collectAdditionalAuthors', 'collectAuthorOrder', 'collectAuthorInstitution']) {
    assert.match(schema, new RegExp(`\\b${field}\\b`));
    assert.match(service, new RegExp(`\\b${field}\\b`));
    assert.match(collectionMigration, new RegExp(field, 'u'));
  }
  assert.doesNotMatch(collectionMigration, /DROP\s+(TABLE|COLUMN)/iu);
});

test('estação científica só adiciona a publicação do trabalho aprovado', () => {
  const stationMigration = readFileSync(new URL('../prisma/migrations/20261004220000_scientific_station/migration.sql', import.meta.url), 'utf8');
  for (const field of ['stationPublicCode', 'stationShowAbstract', 'stationShowEposter']) {
    assert.match(schema, new RegExp(`\\b${field}\\b`));
    assert.match(stationMigration, new RegExp(field, 'u'));
  }
  assert.doesNotMatch(stationMigration, /DROP\s+(TABLE|COLUMN)/iu);
  const station = readFileSync(new URL('../src/scientific-station.service.ts', import.meta.url), 'utf8');
  assert.match(station, /stationShowAbstract/u);
  assert.match(station, /application\/pdf|files\.read/u);
});
