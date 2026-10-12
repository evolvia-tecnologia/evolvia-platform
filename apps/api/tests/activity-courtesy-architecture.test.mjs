import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('a cortesia fica no evento e a auditoria não leva nome', async () => {
  const [service, controller, agenda] = await Promise.all([
    read('../src/activity-courtesy.service.ts'),
    read('../src/activity-courtesy.controller.ts'),
    read('../src/participant-agenda.service.ts'),
  ]);
  assert.match(service, /organizationId: event\.organizationId/u);
  assert.match(service, /EVENT_EDITOR_ROLES/u);
  assert.match(service, /activity\.courtesy_configured/u);
  const blocks = service.match(/metadata: \{[\s\S]*?\} as Prisma\.InputJsonObject/gu) ?? [];
  assert.equal(blocks.length, 1);
  assert.match(blocks[0], /quotas: quotas\.length/u);
  assert.doesNotMatch(blocks[0], /email|title|full_name|protocol/u);
  assert.doesNotMatch(controller, /organizationId/u);
  assert.match(agenda, /courtesyQuota/u);
  assert.match(agenda, /Não há cortesia restante nesta atividade/u);
});
