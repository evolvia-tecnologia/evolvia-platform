import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [migration, operations, turnstile, checkIn, controller, turnstileController] = await Promise.all([
  readFile(new URL('../prisma/migrations/20261004010000_show_entrance_operations/migration.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/show-operations.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/turnstile.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/check-in.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/show-operations.controller.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/turnstile.controller.ts', import.meta.url), 'utf8'),
]);

test('migration de show é aditiva e guarda apenas hashes', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "EventStaffCredential"/u);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "EventStaffAccess"/u);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "EventTurnstileKey"/u);
  assert.match(migration, /"codeHash" CHAR\(64\)/u);
  assert.match(migration, /"keyHash" CHAR\(64\)/u);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS/u);
  assert.match(migration, /EventStaffAccess_organizationId_eventId_credentialId_idx/u);
  assert.match(migration, /AuditLog_organizationId_eventId_action_idx/u);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE|plaintext|secret/iu);
});

test('relatório e lista de ingressos não devolvem dados pessoais do participante', () => {
  const list = operations.slice(operations.indexOf('async listTickets'), operations.indexOf('async createStaff'));
  assert.doesNotMatch(list, /registrationData|email|identity|phone|full_name|preferred_name/u);
  assert.match(list, /protocol: row\.protocol/u);
  assert.match(list, /status: ticketStatus/u);
  const keyList = operations.slice(operations.indexOf('eventTurnstileKey.findMany'), operations.indexOf('const recentAccesses'));
  assert.match(keyList, /keyHint: true/u);
  assert.doesNotMatch(keyList, /keyHash|secret/u);
  assert.match(operations, /id: `ticket-\$\{row\.reservationId\}`/u);
  assert.match(operations, /id: `staff-\$\{row\.id\}`/u);
  assert.match(operations, /codeHash: issued\.codeHash/u);
  assert.match(operations, /keyHash: issued\.keyHash/u);
  assert.doesNotMatch(operations, /metadata: \{[^}]*displayName|metadata: \{[^}]*secret|metadata: \{[^}]*code:/u);
});

test('API de catraca exige a chave do evento e exporta só a projeção marcada', () => {
  assert.match(turnstileController, /@Controller\('v1\/events\/:slug\/turnstile'\)/u);
  assert.doesNotMatch(turnstileController, /AuthGuard/u);
  assert.match(controller, /@UseGuards\(AuthGuard\)/u);
  const listed = turnstile.slice(turnstile.indexOf('async listTickets'), turnstile.indexOf('async validateEntry'));
  assert.doesNotMatch(listed, /lastUsedAt/u);
  assert.match(listed, /projectTurnstileTicket/u);
  assert.match(turnstile, /if \(classified\.kind !== 'TICKET'\) return \{ result: 'DENIED'/u);
  assert.match(turnstile, /UnauthorizedException\(INVALID_KEY\)/u);
  assert.match(turnstile, /key\.event\.slug === normalizedSlug/u);
  assert.doesNotMatch(turnstile, /emailHash|identityHash|identity_document|phone/u);
});

test('portaria aceita equipe sem transformar o código de equipe em ingresso', () => {
  assert.match(checkIn, /classified\.kind === 'STAFF'/u);
  assert.match(checkIn, /hashSecret\(code\)/u);
  assert.match(checkIn, /kind: 'STAFF'/u);
  assert.match(checkIn, /kind: 'TICKET'/u);
  assert.match(checkIn, /CHECK_IN_REPEATED_ACTION/u);
  const staffAndTicketEntry = checkIn.slice(checkIn.indexOf('async checkIn('), checkIn.indexOf('async selfCheckIn('));
  assert.doesNotMatch(staffAndTicketEntry, /registrationData|email/u);
});
