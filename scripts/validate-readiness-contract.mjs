import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const diagnosticUrl = new URL('../infra/certbot/diagnose-dev-tls.sh', import.meta.url);
const [compose, workflow, controller, devTlsDiagnostic] = await Promise.all([
  readFile(new URL('../docker-compose.yml', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/validacao-v02.yml', import.meta.url), 'utf8'),
  readFile(new URL('../apps/api/src/health.controller.ts', import.meta.url), 'utf8'),
  readFile(diagnosticUrl, 'utf8'),
]);

assert.match(controller, /@Get\('ready'\)/u);
assert.match(controller, /SELECT 1/u);
assert.match(controller, /dependencies: \{ database: 'ok' \}/u);

assert.match(compose, /127\.0\.0\.1:4000\/health\/ready/u);
assert.doesNotMatch(compose, /127\.0\.0\.1:4000\/health >\/dev\/null/u);

assert.match(workflow, /127\.0\.0\.1:4000\/health\/ready/u);
assert.match(workflow, /\$HOMOLOGATION_URL\/api\/health\/ready/u);
assert.match(workflow, /Readiness público comprovado: API e PostgreSQL prontos/u);
assert.match(workflow, /Readiness público ausente ou divergente/u);
assert.ok(
  workflow.includes('"database"[[:space:]]*:[[:space:]]*"ok"'),
  'A prova pública precisa exigir o banco de dados pronto.',
);

execFileSync('bash', ['-n', fileURLToPath(diagnosticUrl)], { stdio: 'pipe' });
assert.match(devTlsDiagnostic, /EVOLVIA_DEV_DOMAIN:-dev\.evolviatecnologia\.com/u);
assert.match(devTlsDiagnostic, /-servername "\$DOMAIN"/u);
assert.match(devTlsDiagnostic, /-verify_hostname "\$DOMAIN"/u);
assert.match(devTlsDiagnostic, /-verify_return_error/u);
assert.match(devTlsDiagnostic, /Verify return code: 0 \(ok\)/u);
assert.match(devTlsDiagnostic, /subjectAltName/u);
assert.match(devTlsDiagnostic, /-checkend 604800/u);
assert.match(devTlsDiagnostic, /https:\/\/\$\{DOMAIN\}\/\*\)/u);
assert.match(devTlsDiagnostic, /strict-transport-security/u);
assert.match(devTlsDiagnostic, /x-content-type-options/u);
assert.match(devTlsDiagnostic, /referrer-policy/u);
assert.match(devTlsDiagnostic, /x-frame-options/u);
assert.match(devTlsDiagnostic, /nginx -T/u);
assert.match(devTlsDiagnostic, /certbot certificates/u);
assert.match(devTlsDiagnostic, /mktemp -d/u);
assert.match(devTlsDiagnostic, /trap cleanup EXIT/u);
assert.match(devTlsDiagnostic, /este diagnóstico é exclusivo de dev; homologação foi recusada/u);
assert.doesNotMatch(devTlsDiagnostic, /(?:--insecure|\s-k\s)/u);
assert.doesNotMatch(
  devTlsDiagnostic,
  /(?:systemctl|certbot\s+(?:certonly|renew)|nginx\s+-s|apt-get|snap\s+install|install\s+-m)/u,
);
assert.doesNotMatch(devTlsDiagnostic, /(?:cat|source|\.)\s+[^\n]*\.env/u);

console.log('Contratos operacionais de readiness e diagnóstico TLS de dev validados.');
