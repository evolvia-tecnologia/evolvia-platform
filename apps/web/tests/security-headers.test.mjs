import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
});
