import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collect, parseJsonOutput, safeErrorSummary, summarize } from './diagnose-actions-run.mjs';

const run = { id: 1625, event: 'pull_request', head_sha: 'abc', conclusion: 'failure' };
test('PR does not schedule staging and no steps means no test evidence', () => {
  const result = summarize(run, [{ name: 'quality', conclusion: 'failure', steps: null }], []);
  assert.equal(result.publication, 'not-scheduled-for-pull-request');
  assert.equal(result.jobs[0].executedSteps, 0);
  assert.equal(result.evidenceComplete, true);
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
    if (endpoint.includes('/jobs?')) return [{ jobs: [{ name: 'quality', conclusion: 'failure', check_run_url: 'https://api.github.com/repos/x/y/check-runs/17?attempt=2' }] }, { jobs: [{ name: 'deploy', conclusion: 'skipped' }] }];
    return [[{ message: 'Spending limit reached' }], [{ message: 'Spending limit reached' }]];
  });
  assert.equal(result.jobs.length, 2);
  assert.equal(result.annotationCount, 2);
  assert.equal(result.evidenceComplete, true);
  assert.equal(endpoints.length, 3);
});
test('failed job without check URL is reported but does not hide other evidence', () => {
  const result = collect(1625, endpoint => {
    if (endpoint.endsWith('/runs/1625')) return run;
    if (endpoint.includes('/jobs?')) return [{ jobs: [
      { name: 'quality', conclusion: 'failure', check_run_url: null },
      { name: 'detect', conclusion: 'failure', check_run_url: 'https://api.github.com/repos/x/y/check-runs/18' },
    ] }];
    return [[{ message: 'No matching runner' }]];
  });
  assert.equal(result.failedJobsWithoutCheckRun, 1);
  assert.equal(result.evidenceComplete, false);
  assert.deepEqual(result.causeCategories, ['runner-unavailable']);
});
test('null and malformed API pages are reported as incomplete evidence', () => {
  const missingJobs = collect(1625, endpoint => endpoint.endsWith('/runs/1625') ? run : null);
  assert.equal(missingJobs.jobs.length, 0);
  assert.equal(missingJobs.invalidApiResponses, 1);
  assert.equal(missingJobs.evidenceComplete, false);

  const missingAnnotations = collect(1625, endpoint => {
    if (endpoint.endsWith('/runs/1625')) return run;
    if (endpoint.includes('/jobs?')) return [{ jobs: [{ name: 'quality', conclusion: 'failure', check_run_url: 'https://api.github.com/repos/x/y/check-runs/19' }] }];
    return { unexpected: true };
  });
  assert.equal(missingAnnotations.invalidApiResponses, 1);
  assert.equal(missingAnnotations.annotationCount, 0);
  assert.equal(missingAnnotations.evidenceComplete, false);
  assert.deepEqual(summarize(null, null, null, null).jobs, []);
});
test('annotation API failure preserves partial evidence from other jobs', () => {
  const result = collect(1625, endpoint => {
    if (endpoint.endsWith('/runs/1625')) return run;
    if (endpoint.includes('/jobs?')) return [{ jobs: [
      { name: 'quality', conclusion: 'failure', check_run_url: 'https://api.github.com/repos/x/y/check-runs/20' },
      { name: 'detect', conclusion: 'failure', check_run_url: 'https://api.github.com/repos/x/y/check-runs/21' },
    ] }];
    if (endpoint.includes('/check-runs/20/')) throw new Error('temporary API failure');
    return [[{ message: 'No matching runner' }]];
  });
  assert.equal(result.invalidApiResponses, 1);
  assert.equal(result.annotationCount, 1);
  assert.equal(result.evidenceComplete, false);
  assert.deepEqual(result.causeCategories, ['runner-unavailable']);
});
test('CLI error summary is useful, single-line and redacts common credentials', () => {
  const error = Object.assign(
    new Error('gh failed\nauthorization: Bearer-abc token=top-secret password=hunter2 secret="two words"'),
    { stderr: 'permission denied; authorization Basic dXNlcjpwYXNz; access_token=ghp_abcdefghijklmnopqrstuvwxyz' },
  );
  const output = safeErrorSummary(error);
  assert.match(output, /^Error: gh failed /u);
  assert.doesNotMatch(output, /Bearer-abc|top-secret|hunter2|two words|dXNlcjpwYXNz|ghp_[a-z]+|\n/u);
  assert.match(output, /authorization=\[redacted\]/u);
  assert.match(output, /token=\[redacted\]/u);
  assert.match(output, /password=\[redacted\]/u);
  assert.match(output, /secret=\[redacted\]/u);
  assert.match(output, /access_token=\[redacted\]/u);
  assert.match(output, /stderr: permission denied/u);
});
test('diagnostic phrases without credential separators remain readable', () => {
  const output = safeErrorSummary(new Error('token expired; password incorrect; secret key unavailable'));
  assert.equal(output, 'Error: token expired; password incorrect; secret key unavailable');
});
test('quoted credentials with escaped quotes are fully redacted', () => {
  const output = safeErrorSummary(
    new Error('password="p@ss\\"word" secret=\'alpha\\\'beta\' authorization: Bearer "gamma\\"delta"'),
  );
  assert.equal(output, 'Error: password=[redacted] secret=[redacted] authorization=[redacted]');
  assert.doesNotMatch(output, /p@ss|alpha|beta|gamma|delta/u);
});
test('authorization sanitizer handles long whitespace without exposing the value', () => {
  const output = safeErrorSummary(new Error(`authorization${' '.repeat(1500)}Bearer sensitive-value`));
  assert.equal(output, 'Error: authorization=[redacted]');
});
test('authorization sanitizer rejects a long whitespace-only value without backtracking ambiguity', () => {
  const output = safeErrorSummary(new Error(`authorization${' '.repeat(15_000)};`));
  assert.ok(output.length <= 407);
  assert.match(output, /^Error: authorization /u);
  assert.doesNotMatch(output, /\[redacted\]/u);
});
test('standalone GitHub tokens and JWTs are redacted even without a key', () => {
  const output = safeErrorSummary(
    new Error('ghp_abcdefghijklmnopqrstuvwxyz github_pat_11AAAA_BBBBCCCCDDDDEEEEFFFF eyJabcdefghijk.abcdefghijkl.abcdefghijkl'),
  );
  assert.equal(output, 'Error: [github-token-redacted] [github-token-redacted] [jwt-redacted]');
});
test('token crossing the former input boundary is sanitized before output truncation', () => {
  const token = `github_pat_${'A'.repeat(1800)}_tail`;
  const output = safeErrorSummary(new Error(`${'x'.repeat(350)} ${token} done`));
  assert.doesNotMatch(output, /github_pat_|AAAA/u);
  assert.match(output, /\[github-token-redacted\]/u);
});
test('oversized stderr is bounded before sanitization', () => {
  const output = safeErrorSummary({ name: 'Error', message: 'gh failed', stderr: 'x'.repeat(1_000_000) });
  assert.ok(output.length <= 407);
  assert.match(output, /^Error: gh failed \(stderr: x/u);
});
test('token crossing the bounded input edge is redacted without scanning all stderr', () => {
  const token = `github_pat_${'B'.repeat(20_000)}_tail`;
  const output = safeErrorSummary({
    name: 'Error',
    message: `${'x'.repeat(350)} ${token}`,
    stderr: 'ignored'.repeat(1_000_000),
  });
  assert.ok(output.length <= 407);
  assert.doesNotMatch(output, /github_pat_|BBBB/u);
  assert.match(output, /\[github-token-redacted\]/u);
});
test('invalid JSON preserves sanitized stdout for diagnosis', () => {
  assert.throws(
    () => parseJsonOutput('<html>proxy error password="p@ss\\"word"</html>'),
    error => {
      const output = safeErrorSummary(error);
      assert.match(output, /stdout:/u);
      assert.match(output, /password=\[redacted\]/u);
      assert.doesNotMatch(output, /p@ss/u);
      return true;
    },
  );
});
test('invalid run ID is rejected before any request', () => {
  assert.throws(() => collect('../bad', () => assert.fail()), /numérico/);
});
