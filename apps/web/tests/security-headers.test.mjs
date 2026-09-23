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
const stagingNginxApplyPath = fileURLToPath(
  new URL('../../../infra/nginx/apply-staging-nginx.sh', import.meta.url),
);
const devRedirectBootstrapPath = fileURLToPath(
  new URL('../../../infra/certbot/bootstrap-dev-redirect.sh', import.meta.url),
);

const [
  httpsProxy,
  httpProxy,
  nextConfig,
  workflow,
  stagingTlsBootstrap,
  stagingNginxApply,
  deployScript,
  devRedirectProxy,
  devRedirectBootstrap,
] = await Promise.all([
  readFile(new URL('../../../infra/nginx/evolvia-https.conf', import.meta.url), 'utf8'),
  readFile(new URL('../../../infra/nginx/evolvia.conf', import.meta.url), 'utf8'),
  readFile(new URL('../next.config.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../../.github/workflows/validacao-v02.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../../infra/certbot/bootstrap-staging-tls.sh', import.meta.url), 'utf8'),
  readFile(new URL('../../../infra/nginx/apply-staging-nginx.sh', import.meta.url), 'utf8'),
  readFile(new URL('../../../deploy.sh', import.meta.url), 'utf8'),
  readFile(new URL('../../../infra/nginx/evolvia-dev-redirect.conf', import.meta.url), 'utf8'),
  readFile(new URL('../../../infra/certbot/bootstrap-dev-redirect.sh', import.meta.url), 'utf8'),
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
  assert.match(nextConfig, /source: '[/]:path[*]'/u);
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

test('promoção do Nginx usa o deploy autorizado com backup, validação e rollback', async () => {
  assert.doesNotMatch(workflow, /\sscp\s/u);
  assert.match(workflow, /"deploy \$GITHUB_SHA"/u);

  for (const contract of [
    'git rev-parse --verify HEAD',
    'mktemp /tmp/evolvia-nginx.',
    'apply-staging-nginx.sh',
    'evolvia-https.conf',
  ]) {
    assert.ok(deployScript.includes(contract), contract);
  }

  for (const contract of [
    'trap rollback ERR',
    'nginx -t',
    'systemctl reload nginx',
    'BACKUP_SITE',
    'LEGACY_LINK',
    'HAD_LEGACY_LINK',
    'readlink "$LEGACY_LINK"',
    'rm -f "$LEGACY_LINK"',
    'server_tokens off;',
    'proxy_hide_header Strict-Transport-Security;',
    'contrato ausente:',
    'Implantação abortada sem alterações',
    'Rollback concluído. Backup restaurado de:',
  ]) {
    assert.ok(stagingNginxApply.includes(contract), contract);
  }

  const { stderr } = await execFileAsync('bash', ['-n', stagingNginxApplyPath]);
  assert.equal(stderr, '');
});

test('bootstrap administrativo mantém sintaxe Bash válida', async () => {
  const { stderr } = await execFileAsync('bash', ['-n', stagingTlsBootstrapPath]);
  assert.equal(stderr, '');
});

test('domínio dev legado redireciona com TLS para a homologação canônica', async () => {
  for (const contract of [
    'server_name dev.evolviatecnologia.com;',
    'ssl_certificate /etc/letsencrypt/live/dev.evolviatecnologia.com/fullchain.pem;',
    'ssl_certificate_key /etc/letsencrypt/live/dev.evolviatecnologia.com/privkey.pem;',
    'return 308 https://homologacao.evolviatecnologia.com$request_uri;',
    'server_tokens off;',
    'Strict-Transport-Security "max-age=31536000" always;',
    'X-Content-Type-Options "nosniff" always;',
    'Referrer-Policy "no-referrer" always;',
    'X-Frame-Options "DENY" always;',
  ]) {
    assert.ok(devRedirectProxy.includes(contract), contract);
  }

  for (const contract of [
    'trap rollback ERR',
    'CERTBOT_EMAIL',
    '--register-unsafely-without-email',
    'CERTBOT_CONTACT_ARGS',
    'certbot certonly',
    'nginx -t',
    'systemctl reload nginx',
    'BACKUP_SITE',
    'HAD_LINK',
    'PREVIOUS_LINK_TARGET',
    'readlink "$TARGET_LINK"',
    'HTTP_HEADERS',
    'HTTPS_HEADERS',
    'server: nginx/',
  ]) {
    assert.ok(devRedirectBootstrap.includes(contract), contract);
  }

  // Com root /var/www/certbot, o Nginx resolve o URI completo dentro do webroot.
  assert.match(devRedirectBootstrap, /CHALLENGE_PATH="\$\{WEBROOT\}\/\.well-known\/acme-challenge\/\$\{CHALLENGE\}"/u);
  assert.match(devRedirectBootstrap, /install -d -m 0755 "\$\{WEBROOT\}\/\.well-known\/acme-challenge"/u);

  const { stderr } = await execFileAsync('bash', ['-n', devRedirectBootstrapPath]);
  assert.equal(stderr, '');
});

test('deploy ativa o redirecionamento dev e preserva opt-out operacional explícito', () => {
  assert.match(deployScript, /EVOLVIA_DEV_REDIRECT_BOOTSTRAP:-1/u);
  assert.match(deployScript, /sudo env CERTBOT_EMAIL=/u);
  assert.match(deployScript, /bash infra\/certbot\/bootstrap-dev-redirect\.sh/u);
});
