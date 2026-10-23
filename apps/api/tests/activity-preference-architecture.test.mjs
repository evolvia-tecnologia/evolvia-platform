import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('a confirmação fica no evento e não devolve a ficha', async () => {
  const [service, controller, agenda] = await Promise.all([
    read('../src/activity-preference.service.ts'),
    read('../src/activity-preference.controller.ts'),
    read('../src/participant-agenda.service.ts'),
  ]);
  assert.match(service, /organizationId: event\.organizationId/u);
  assert.match(service, /EVENT_EDITOR_ROLES/u);
  assert.match(service, /preferenceParticipantName/u);
  assert.doesNotMatch(service, /email:|cpf:|registrationData,/u);
  assert.doesNotMatch(controller, /organizationId/u);
  assert.match(agenda, /EventActivityEnrollmentStatus\.REQUESTED/u);
  assert.match(agenda, /activity\.preference_confirmed/u);
  const blocks = agenda.match(/metadata: \{[^}]+\}/gu) ?? [];
  assert.ok(blocks.some((block) => block.includes("reason: 'confirmed'")));
  for (const block of blocks) assert.doesNotMatch(block, /email|full_name|cpf|protocol/u);
});
