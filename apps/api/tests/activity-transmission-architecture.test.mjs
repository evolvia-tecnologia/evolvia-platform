import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const service = await readFile(new URL('../src/activity-transmission.service.ts', import.meta.url), 'utf8');
const controller = await readFile(new URL('../src/activity-transmission.controller.ts', import.meta.url), 'utf8');
const agenda = await readFile(new URL('../src/participant-agenda.service.ts', import.meta.url), 'utf8');

test('o link da atividade usa o evento e a auditoria não guarda o endereço', () => {
  assert.match(service, /organizationId: event\.organizationId/u);
  assert.match(service, /event\.activity_transmission_configured/u);
  const audit = service.slice(service.indexOf("action: 'event.activity_transmission_configured'"), service.indexOf('return { transmission: link }'));
  assert.doesNotMatch(audit, /url|email|registrationData/u);
  assert.doesNotMatch(controller, /organizationId/u);
  assert.match(agenda, /speaking: agenda\.speaking\.map\(withLink\)/u);
  assert.match(agenda, /enrolled: agenda\.enrolled\.map\(withLink\)/u);
  assert.match(agenda, /open: agenda\.open/u);
  assert.doesNotMatch(agenda.slice(agenda.indexOf('open: agenda.open')), /withLink/u);
});
