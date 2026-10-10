import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('o tempo da reserva fica no evento e a auditoria não leva dado pessoal', async () => {
  const [service, controller, reservations] = await Promise.all([
    read('../src/registration-hold.service.ts'),
    read('../src/registration-hold.controller.ts'),
    read('../src/registration-reservations.service.ts'),
  ]);
  assert.match(service, /organizationId: event\.organizationId/u);
  assert.match(service, /EVENT_EDITOR_ROLES/u);
  assert.match(service, /registration\.hold_configured/u);
  const audit = service.slice(service.indexOf("action: 'registration.hold_configured'"));
  const metadata = audit.slice(0, audit.indexOf('} as Prisma.InputJsonObject'));
  assert.match(metadata, /minutes/u);
  assert.doesNotMatch(metadata, /url|email|priceCents|name|registrationData|code/u);
  assert.doesNotMatch(controller, /organizationId/u);
  assert.match(reservations, /private async holdMinutes/u);
  assert.match(reservations, /await this\.holdMinutes\(tx, event\.id\)/u);
  assert.doesNotMatch(reservations, /RESERVATION_MINUTES/u);
  const response = reservations.slice(reservations.indexOf('private toPublicReservation'));
  assert.doesNotMatch(response, /registrationData|identityHash|emailHash|organizationId|eventId/u);
});
