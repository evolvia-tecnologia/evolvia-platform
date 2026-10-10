import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('o aviso fica no evento e a auditoria não leva destinatário nem texto', async () => {
  const [service, controller] = await Promise.all([
    read('../src/registration-notice.service.ts'),
    read('../src/registration-notice.controller.ts'),
  ]);
  assert.match(service, /organizationId: event\.organizationId/u);
  assert.match(service, /EVENT_EDITOR_ROLES/u);
  assert.match(service, /RegistrationReservationStatus\.CONFIRMED/u);
  assert.match(service, /registration\.notice_dispatched/u);
  assert.match(service, /registration\.notice_directed/u);
  assert.match(service, /protocol: notice\.protocol/u);
  assert.match(service, /dayPresences/u);
  assert.match(service, /authorSubmissions/u);
  assert.match(service, /reversedAt: null/u);
  assert.match(service, /select: \{ reservationId: true \}/u);
  const blocks = service.match(/metadata: \{[\s\S]*?\} as Prisma\.InputJsonObject/gu) ?? [];
  assert.equal(blocks.length, 2);
  for (const metadata of blocks) {
    assert.match(metadata, /delivered:/u);
    assert.doesNotMatch(metadata, /email|subject|body|registrationData|url|token|protocol/u);
  }
  assert.doesNotMatch(controller, /organizationId/u);
  assert.doesNotMatch(service, /emailHash|billingSnapshot|identityHash/u);
});
