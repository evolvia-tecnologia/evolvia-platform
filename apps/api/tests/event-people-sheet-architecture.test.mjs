import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const service = await readFile(new URL('../src/event-people-sheet.service.ts', import.meta.url), 'utf8');
const controller = await readFile(new URL('../src/event-people-sheet.controller.ts', import.meta.url), 'utf8');

test('a planilha nasce do evento autorizado e a auditoria não leva a ficha', () => {
  assert.match(service, /organizationId: event\.organizationId/u);
  assert.match(service, /RegistrationReservationStatus\.CONFIRMED/u);
  assert.match(service, /requireRole\(userId, event\.organizationId, EVENT_EDITOR_ROLES\)/u);
  assert.doesNotMatch(service, /identityHash|emailHash|payloadHash|body\.organizationId/u);
  assert.doesNotMatch(controller, /@Body\(\)|organizationId/u);
  const audit = service.slice(service.indexOf('people.sheet_exported'));
  assert.match(audit, /confirmedCount: total/u);
  assert.match(audit, /exportedCount: records\.length/u);
  assert.doesNotMatch(audit, /registrationData|displayName|protocol|email/u);
});
