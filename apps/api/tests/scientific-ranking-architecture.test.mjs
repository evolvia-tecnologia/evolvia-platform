import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('a classificação fica no evento e a auditoria não leva texto nem parecer', async () => {
  const [service, controller] = await Promise.all([
    read('../src/scientific-ranking.service.ts'),
    read('../src/scientific-ranking.controller.ts'),
  ]);
  assert.match(service, /organizationId: event\.organizationId/u);
  assert.match(service, /EVENT_EDITOR_ROLES/u);
  assert.match(service, /scientific\.ranking_configured/u);
  assert.match(service, /ScientificReviewAssignmentStatus\.SUBMITTED/u);
  const blocks = service.match(/metadata: \{[\s\S]*?\} as Prisma\.InputJsonObject/gu) ?? [];
  assert.equal(blocks.length, 1);
  assert.match(blocks[0], /cutoff: rule\.cutoff/u);
  assert.doesNotMatch(blocks[0], /title|email|author|comment|name|protocol/u);
  assert.doesNotMatch(service, /authorComment|confidentialComment|emailHash|authors:/u);
  assert.doesNotMatch(controller, /organizationId/u);
});
