import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const REPOSITORY = 'evolvia-tecnologia/evolvia-platform';

export function summarize(run = {}, jobs = [], annotations = [], collection = {}) {
  const safeRun = run && typeof run === 'object' ? run : {};
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const safeAnnotations = Array.isArray(annotations) ? annotations : [];
  const safeCollection = collection && typeof collection === 'object' ? collection : {};
  const causes = new Set();
  for (const annotation of safeAnnotations) {
    const message = `${annotation?.title ?? ''} ${annotation?.message ?? ''}`;
    if (/billing|spending limit|payments? (?:have )?failed|insufficient funds|budget/i.test(message)) causes.add('billing-or-budget');
    else if (/no (?:available|matching) runner|runner.*(?:offline|unavailable)|failed to (?:acquire|provision).*runner/i.test(message)) causes.add('runner-unavailable');
    else if (/workflow.*(?:invalid|syntax)|invalid workflow|unrecognized named-value/i.test(message)) causes.add('workflow-validation');
    else causes.add('unclassified-annotation');
  }
  const pullRequest = safeRun.event === 'pull_request';
  const failedJobsWithoutCheckRun = safeCollection.failedJobsWithoutCheckRun ?? 0;
  const invalidApiResponses = safeCollection.invalidApiResponses ?? 0;
  return {
    repository: REPOSITORY,
    runId: safeRun.id,
    headSha: safeRun.head_sha,
    event: safeRun.event,
    conclusion: safeRun.conclusion,
    jobs: safeJobs.map(job => ({ name: job?.name, conclusion: job?.conclusion, executedSteps: (Array.isArray(job?.steps) ? job.steps : []).filter(step => step?.status === 'completed' && step?.conclusion !== 'skipped').length })),
    annotationCount: safeAnnotations.length,
    failedJobsWithoutCheckRun,
    invalidApiResponses,
    evidenceComplete: failedJobsWithoutCheckRun === 0 && invalidApiResponses === 0,
    causeCategories: [...causes].sort(),
    publication: pullRequest ? 'not-scheduled-for-pull-request' : safeRun.event === 'push' && safeRun.head_branch === 'develop' ? 'depends-on-required-checks' : 'not-scheduled-by-staging-rule',
    nextAction: causes.has('billing-or-budget') ? 'organization-owner-check-actions-billing-without-automatic-changes' : causes.has('runner-unavailable') ? 'check-runner-availability-and-github-status' : causes.has('workflow-validation') ? 'inspect-workflow-annotations-and-fix-versioned-configuration' : 'inspect-annotations-in-github-ui; do-not-guess-cause',
  };
}

export function collect(runId, api) {
  if (!/^\d+$/.test(String(runId))) throw new Error('Informe um ID numérico de run.');
  const base = `repos/${REPOSITORY}`;
  const run = api(`${base}/actions/runs/${runId}`);
  const rawJobPages = api(`${base}/actions/runs/${runId}/jobs?filter=latest&per_page=100`, true);
  let invalidApiResponses = run && typeof run === 'object' ? 0 : 1;
  const jobPages = Array.isArray(rawJobPages) ? rawJobPages : [];
  if (!Array.isArray(rawJobPages)) invalidApiResponses += 1;
  const jobs = jobPages.flatMap(page => {
    if (!Array.isArray(page?.jobs)) {
      invalidApiResponses += 1;
      return [];
    }
    return page.jobs;
  });
  const annotations = [];
  let failedJobsWithoutCheckRun = 0;
  for (const job of jobs.filter(job => job?.conclusion === 'failure')) {
    const checkId = /\/check-runs\/(\d+)$/.exec(job?.check_run_url ?? '')?.[1];
    if (!checkId) {
      failedJobsWithoutCheckRun += 1;
      continue;
    }
    let rawAnnotationPages;
    try {
      rawAnnotationPages = api(`${base}/check-runs/${checkId}/annotations?per_page=100`, true);
    } catch {
      invalidApiResponses += 1;
      continue;
    }
    if (!Array.isArray(rawAnnotationPages)) {
      invalidApiResponses += 1;
      continue;
    }
    for (const page of rawAnnotationPages) {
      if (!Array.isArray(page)) {
        invalidApiResponses += 1;
        continue;
      }
      annotations.push(...page);
    }
  }
  return summarize(run, jobs, annotations, { failedJobsWithoutCheckRun, invalidApiResponses });
}

export function safeErrorSummary(error) {
  const name = typeof error?.name === 'string' ? error.name : 'Error';
  let message = typeof error?.message === 'string' ? error.message : String(error);
  if (error?.stderr) message += ` (stderr: ${String(error.stderr).trim()})`;
  const singleLine = message.slice(0, 2000)
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, '')
    .replace(/[\r\n]+/gu, ' ')
    .replace(/\b(authorization|proxy-authorization)\b\s*(?:=|:|\s)\s*(?:(?:Bearer|Basic)\s+)?(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu, '$1=[redacted]')
    .replace(/\b(access[_-]?token|id[_-]?token|token|password|passwd|secret|api[_-]?key|client[_-]?secret)\b\s*(?:=|:)\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu, '$1=[redacted]')
    .replace(/\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{20,}\b/gu, '[github-token-redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu, '[jwt-redacted]')
    .trim();
  return `${name}: ${singleLine.slice(0, 400)}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = collect(process.argv[2], (endpoint, paginate = false) => {
      const args = ['api', endpoint];
      if (paginate) args.push('--paginate', '--slurp');
      return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 10 * 1024 * 1024 }));
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Diagnóstico incompleto. Confira o ID do run, o GitHub CLI autenticado e acesso de leitura a Actions/checks. Nenhuma configuração foi alterada.');
    console.error(safeErrorSummary(error));
    process.exitCode = 1;
  }
}
