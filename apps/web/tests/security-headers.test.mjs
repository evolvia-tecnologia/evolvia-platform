import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const stagingTlsBootstrapPath = fileURLToPath(
  new URL('../../../infra/certbot/bootstrap-staging-tls.sh', import.meta.url),
);

const [httpsProxy, httpProxy, nextConfig, workflow, stagingTlsBootstrap] = await Promise.all([
  readFile(new URL('../../../infra/nginx/evolvia-https.conf', import.meta.url), 'utf8'),
  readFile(new URL('../../../infra/nginx/evolvia.conf', import.meta.url), 'utf8'),
  readFile(new URL('../next.config.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../../.github/workflows/validacao-v02.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../../infra/certbot/bootstrap-staging-tls.sh', import.meta.url), 'utf8'),
]);

test('proxy HTTPS publica cabeçalhos defensivos sem expor versões', () => {
  assert.match(httpsProxy, /server_tokens off;/u);
  assert.match(httpsProxy, /Strict-Transport-Security "max-age=31536000; includeSubDomains" always;/u);
  assert.match(httpsProxy, /X-Content-Type-Options "nosniff" always;/u);
  assert.match(httpsProxy, /Referrer-Policy "strict-origin-when-cross-origin" always;/u);
  assert.match(httpsProxy, /X-Frame-Options "SAMEORIGIN" always;/u);
  assert.match(nextConfig, /poweredByHeader: false/u);
  for (const header of [
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'X-Frame-Options',
  ]) {
    assert.match(httpsProxy, new RegExp(`proxy_hide_header ${header};`, 'u'), header);
  }
});

test('Web preserva os cabeçalhos defensivos mesmo antes do proxy', () => {
  assert.match(nextConfig, /Strict-Transport-Security/u);
  assert.match(nextConfig, /max-age=31536000; includeSubDomains/u);
  assert.match(nextConfig, /X-Content-Type-Options/u);
  assert.match(nextConfig, /nosniff/u);
  assert.match(nextConfig, /Referrer-Policy/u);
  assert.match(nextConfig, /strict-origin-when-cross-origin/u);
  assert.match(nextConfig, /X-Frame-Options/u);
  assert.match(nextConfig, /SAMEORIGIN/u);
  assert.match(nextConfig, /source: '\\/:path\\*'/u);
});

test('configuração HTTP de provisionamento preserva defesas compatíveis', () => {
  assert.match(httpProxy, /server_tokens off;/u);
  assert.match(httpProxy, /X-Content-Type-Options "nosniff" always;/u);
  assert.match(httpProxy, /Referrer-Policy "strict-origin-when-cross-origin" always;/u);
  assert.match(httpProxy, /X-Frame-Options "SAMEORIGIN" always;/u);
  assert.doesNotMatch(httpProxy, /Strict-Transport-Security/u);
});

test('deploy só conclui após comprovar cabeçalhos e ocultação tecnológica', () => {
  for (const contract of [
    'strict-transport-security',
    'x-content-type-options',
    'referrer-policy',
    'x-frame-options',
    'x-powered-by',
    'server: nginx/',
    'Cabeçalho HTTPS ausente ou divergente',
    'Status HTTPS inesperado',
    'Redirecionamento HTTP inesperado',
    'validacao_falhou',
  ]) {
    assert.match(workflow, new RegExp(contract, 'u'), contract);
  }
});

test('bootstrap administrativo sincroniza as defesas no Nginx ativo com certificado existente', () => {
  assert.match(stagingTlsBootstrap, /CERTIFICATE_PRESENT=0/u);
  assert.match(stagingTlsBootstrap, /if \[\[ "\$CERTIFICATE_PRESENT" == "0" && -z "\$\{CERTBOT_EMAIL:-\}" \]\]/u);
  assert.match(stagingTlsBootstrap, /if \[\[ "\$CERTIFICATE_PRESENT" == "0" \]\]; then/u);
  assert.match(stagingTlsBootstrap, /server_tokens off;/u);
  assert.match(stagingTlsBootstrap, /Strict-Transport-Security "max-age=31536000; includeSubDomains" always;/u);
  assert.match(stagingTlsBootstrap, /X-Content-Type-Options "nosniff" always;/u);
  assert.match(stagingTlsBootstrap, /Referrer-Policy "strict-origin-when-cross-origin" always;/u);
  assert.match(stagingTlsBootstrap, /X-Frame-Options "SAMEORIGIN" always;/u);
  for (const header of [
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'X-Frame-Options',
  ]) {
    assert.match(stagingTlsBootstrap, new RegExp(`proxy_hide_header ${header};`, 'u'), header);
  }
});

test('bootstrap administrativo mantém sintaxe Bash válida', async () => {
  const { stderr } = await execFileAsync('bash', ['-n', stagingTlsBootstrapPath]);
  assert.equal(stderr, '');
});
