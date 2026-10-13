import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collect, summarize } from './diagnose-actions-run.mjs';

const run = { id: 1625, event: 'pull_request', head_sha: 'abc', conclusion: 'failure' };
test('PR does not schedule staging and no steps means no test evidence', () => {
  const result = summarize(run, [{ name: 'quality', conclusion: 'failure', steps: null }], []);
  assert.equal(result.publication, 'not-scheduled-for-pull-request');
  assert.equal(result.jobs[0].executedSteps, 0);
  assert.deepEqual(result.causeCategories, []);
});
test('budget evidence is classified without echoing private annotation text', () => {
  const result = summarize(run, [], [{ message: 'The job was not started because recent account payments have failed. Private details.' }]);
  assert.deepEqual(result.causeCategories, ['billing-or-budget']);
  assert.ok(!JSON.stringify(result).includes('Private details'));
});
test('runner and workflow evidence remain distinct', () => {
  assert.deepEqual(summarize(run, [], [{ message: 'No matching runner' }]).causeCategories, ['runner-unavailable']);
  assert.deepEqual(summarize(run, [], [{ message: 'Invalid workflow file' }]).causeCategories, ['workflow-validation']);
});
test('develop push needs required checks, unknown error does not imply billing', () => {
  const result = summarize({ ...run, event: 'push', head_branch: 'develop' }, [], [{ message: 'Unknown error' }]);
  assert.equal(result.publication, 'depends-on-required-checks');
  assert.deepEqual(result.causeCategories, ['unclassified-annotation']);
});
test('all job and annotation pages are collected through read-only endpoints', () => {
  const endpoints = [];
  const result = collect(1625, (endpoint, paginate) => {
    endpoints.push(endpoint);
    if (endpoint.endsWith('/runs/1625')) return run;
    assert.equal(paginate, true);
    if (endpoint.includes('/jobs?')) return [{ jobs: [{ name: 'quality', conclusion: 'failure', check_run_url: 'https://api.github.com/repos/x/y/check-runs/17' }] }, { jobs: [{ name: 'deploy', conclusion: 'skipped' }] }];
    return [[{ message: 'Spending limit reached' }], [{ message: 'Spending limit reached' }]];
  });
  assert.equal(result.jobs.length, 2);
  assert.equal(result.annotationCount, 2);
  assert.equal(endpoints.length, 3);
});
test('invalid run ID is rejected before any request', () => {
  assert.throws(() => collect('../bad', () => assert.fail()), /numérico/);
});
