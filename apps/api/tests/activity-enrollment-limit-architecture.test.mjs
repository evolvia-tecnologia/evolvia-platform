import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('o limite fica no evento e a auditoria não leva atividade nem e-mail', async () => {
  const [service, controller, agenda] = await Promise.all([
    read('../src/activity-enrollment-limit.service.ts'),
    read('../src/activity-enrollment-limit.controller.ts'),
    read('../src/participant-agenda.service.ts'),
  ]);
  assert.match(service, /organizationId: event\.organizationId/u);
  assert.match(service, /EVENT_EDITOR_ROLES/u);
  assert.match(service, /activity\.enrollment_limit_configured/u);
  const blocks = service.match(/metadata: \{[\s\S]*?\} as Prisma\.InputJsonObject/gu) ?? [];
  assert.equal(blocks.length, 1);
  assert.match(blocks[0], /max: rule\.max/u);
  assert.doesNotMatch(blocks[0], /email|title|activityId|protocol|name/u);
  assert.doesNotMatch(controller, /organizationId/u);
  assert.match(agenda, /alreadyEnrolled: ownEnrollments\.length/u);
  assert.match(agenda, /maxPerPerson/u);
});
