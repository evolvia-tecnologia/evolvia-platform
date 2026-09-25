import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const service = await readFile(new URL('../src/participant-area.service.ts', import.meta.url), 'utf8');
const controller = await readFile(new URL('../src/participant-area.controller.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../prisma/migrations/20260923114500_participant_access_sessions/migration.sql', import.meta.url), 'utf8');

test('sessão exige escopo composto e armazena somente hash do token', () => {
  assert.match(service, /const organizationId = event\.organizationId/u);
  assert.match(service, /return this\.issueSession\(event\.id, organizationId, reservation\.id\)/u);
  assert.match(service, /eventId: eventId/u);
  assert.match(service, /reservationId: reservationId/u);
  assert.match(service, /tokenHash: participantHash\(token\)/u);
  assert.match(service, /deleteMany\(\{[\s\S]*organizationId,[\s\S]*eventId: eventId,[\s\S]*reservationId: reservationId/u);
  assert.doesNotMatch(migration, /identityDocument|documentValue|rawToken/u);
});

test('leitura e revogação exigem bearer e sessão vigente', () => {
  assert.match(controller, /@Get\('me'\)/u);
  assert.match(controller, /@Delete\('sessions\/current'\)/u);
  assert.match(service, /revokedAt: null, expiresAt: \{ gt: now \}/u);
  assert.match(service, /status: EventStatus\.PUBLISHED/u);
  assert.match(service, /if \(!session\) throw new UnauthorizedException/u);
  assert.doesNotMatch(service, /NotFoundException/u);
});

test('DTO da área não retorna PII nem token persistido', () => {
  const returned = service.slice(service.indexOf('return {\n      event:'), service.indexOf('  async revoke'));
  assert.doesNotMatch(returned, /registrationData|identityHash|emailHash|tokenHash|full_name|email/u);
});

test('migration é aditiva, idempotente e vinculada ao escopo composto', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS/u);
  assert.match(migration, /CREATE (?:UNIQUE )?INDEX IF NOT EXISTS/u);
  assert.match(migration, /\("reservationId", "eventId", "organizationId"\)/u);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE/u);
});
