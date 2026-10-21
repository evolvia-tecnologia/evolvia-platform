import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('as quinze contas ficam no evento e não levam pessoa nem endereço', async () => {
  const [service, controller] = await Promise.all([
    read('../src/operational-readings.service.ts'),
    read('../src/operational-readings.controller.ts'),
  ]);
  assert.match(service, /organizationId: event\.organizationId/u);
  assert.match(service, /EVENT_EDITOR_ROLES/u);
  assert.match(service, /worksWithoutReview\(submissions, reviewedGroups\.length\)/u);
  assert.match(service, /eventRegistrationWaitlistEntry\.groupBy/u);
  assert.match(service, /scientificReviewAssignment\.groupBy/u);
  assert.doesNotMatch(service, /eventRegistrationWaitlistEntry\.count/u);
  assert.doesNotMatch(service, /scientificReviewAssignment\.count/u);
  const block = service.match(/assembleOperationalReadings\(\{[\s\S]*?\}\)/u)?.[0] ?? '';
  assert.match(block, /dayPresence,/u);
  assert.match(block, /certificatesIssued,/u);
  assert.doesNotMatch(block, /submissionId|activityId|email|protocol|title|displayName|token|url/u);
  assert.doesNotMatch(service, /registrationData|emailHash|identityHash|authorComment|confidentialComment|displayName/u);
  assert.doesNotMatch(controller, /organizationId/u);
});
