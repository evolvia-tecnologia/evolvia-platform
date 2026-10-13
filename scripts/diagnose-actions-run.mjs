import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const REPOSITORY = 'evolvia-tecnologia/evolvia-platform';

export function summarize(run, jobs, annotations, collection = {}) {
  const causes = new Set();
  for (const annotation of annotations) {
    const message = `${annotation.title ?? ''} ${annotation.message ?? ''}`;
    if (/billing|spending limit|payments? (?:have )?failed|insufficient funds|budget/i.test(message)) causes.add('billing-or-budget');
    else if (/no (?:available|matching) runner|runner.*(?:offline|unavailable)|failed to (?:acquire|provision).*runner/i.test(message)) causes.add('runner-unavailable');
    else if (/workflow.*(?:invalid|syntax)|invalid workflow|unrecognized named-value/i.test(message)) causes.add('workflow-validation');
    else causes.add('unclassified-annotation');
  }
  const pullRequest = run.event === 'pull_request';
  return {
    repository: REPOSITORY,
    runId: run.id,
    headSha: run.head_sha,
    event: run.event,
    conclusion: run.conclusion,
    jobs: jobs.map(job => ({ name: job.name, conclusion: job.conclusion, executedSteps: (job.steps ?? []).filter(step => step.status === 'completed' && step.conclusion !== 'skipped').length })),
    annotationCount: annotations.length,
    failedJobsWithoutCheckRun: collection.failedJobsWithoutCheckRun ?? 0,
    evidenceComplete: (collection.failedJobsWithoutCheckRun ?? 0) === 0,
    causeCategories: [...causes].sort(),
    publication: pullRequest ? 'not-scheduled-for-pull-request' : run.event === 'push' && run.head_branch === 'develop' ? 'depends-on-required-checks' : 'not-scheduled-by-staging-rule',
    nextAction: causes.has('billing-or-budget') ? 'organization-owner-check-actions-billing-without-automatic-changes' : causes.has('runner-unavailable') ? 'check-runner-availability-and-github-status' : causes.has('workflow-validation') ? 'inspect-workflow-annotations-and-fix-versioned-configuration' : 'inspect-annotations-in-github-ui; do-not-guess-cause',
  };
}

export function collect(runId, api) {
  if (!/^\d+$/.test(String(runId))) throw new Error('Informe um ID numérico de run.');
  const base = `repos/${REPOSITORY}`;
  const run = api(`${base}/actions/runs/${runId}`);
  const jobPages = api(`${base}/actions/runs/${runId}/jobs?filter=latest&per_page=100`, true);
  const jobs = jobPages.flatMap(page => page.jobs ?? []);
  const annotations = [];
  let failedJobsWithoutCheckRun = 0;
  for (const job of jobs.filter(job => job.conclusion === 'failure')) {
    const checkId = /\/check-runs\/(\d+)$/.exec(job.check_run_url ?? '')?.[1];
    if (!checkId) {
      failedJobsWithoutCheckRun += 1;
      continue;
    }
    annotations.push(...api(`${base}/check-runs/${checkId}/annotations?per_page=100`, true).flat());
  }
  return summarize(run, jobs, annotations, { failedJobsWithoutCheckRun });
}

export function safeErrorSummary(error) {
  const name = typeof error?.name === 'string' ? error.name : 'Error';
  const message = typeof error?.message === 'string' ? error.message : String(error);
  const singleLine = message.replace(/[\r\n]+/gu, ' ').replace(/(?:token|authorization|password|secret)=?\s*[^\s]+/giu, '$1=[redacted]').trim();
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
