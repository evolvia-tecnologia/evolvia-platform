import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const service = await readFile(new URL('../src/scientific-file-batch.service.ts', import.meta.url), 'utf8');
const controller = await readFile(new URL('../src/scientific-file-batch.controller.ts', import.meta.url), 'utf8');

test('o pacote usa o evento e a auditoria não leva título nem arquivo', () => {
  assert.match(service, /organizationId: event\.organizationId/u);
  assert.match(service, /EVENT_EDITOR_ROLES/u);
  assert.match(service, /ScientificSubmissionStatus\.SUBMITTED/u);
  assert.match(service, /ScientificSubmissionStatus\.UNDER_REVIEW/u);
  assert.match(service, /ScientificSubmissionStatus\.ACCEPTED_WITH_CHANGES/u);
  assert.match(service, /belongsToEvent/u);
  assert.match(service, /where: \{ id: cursorInput, eventId: event\.id, organizationId: event\.organizationId \}/u);
  assert.match(service, /fileFitsBatch/u);
  assert.match(service, /scientific\.files_batch_downloaded/u);
  assert.doesNotMatch(service, /REJECTED|DRAFT|INCOMPLETE/u);
  const audit = service.slice(
    service.indexOf("action: 'scientific.files_batch_downloaded'"),
    service.indexOf('private async eventFor'),
  );
  assert.doesNotMatch(audit, /fileKey|email|title|registrationData|author/u);
  assert.doesNotMatch(controller, /@Body\(\)|organizationId/u);
  assert.match(controller, /X-Evolvia-Truncated/u);
});
