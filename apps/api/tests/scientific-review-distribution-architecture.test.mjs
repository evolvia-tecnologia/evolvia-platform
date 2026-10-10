import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const service = await readFile(new URL('../src/scientific-review-distribution.service.ts', import.meta.url), 'utf8');
const controller = await readFile(new URL('../src/scientific-review-distribution.controller.ts', import.meta.url), 'utf8');

test('o lote nasce do evento e a auditoria não leva nome nem contato', () => {
  assert.match(service, /organizationId: event\.organizationId/u);
  assert.match(service, /requireRole\(userId, event\.organizationId, EVENT_EDITOR_ROLES\)/u);
  assert.match(service, /ScientificSubmissionStatus\.SUBMITTED/u);
  assert.match(service, /hasAnother \? rows\.slice\(0, SCAN\) : rows/u);
  assert.doesNotMatch(controller, /@Body\(\)|organizationId/u);
  const audit = service.slice(service.indexOf('scientific.review_batch_assigned'), service.indexOf('private present'));
  assert.match(audit, /assignedCount: fresh\.plan\.plans\.length/u);
  assert.doesNotMatch(audit, /email|registrationData|reviewerName|title|author/u);
});
