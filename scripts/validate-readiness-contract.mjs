import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const LEGACY_DOMAIN = 'dev.evolviatecnologia.com';

const caminho = (relativo) => fileURLToPath(new URL(`../${relativo}`, import.meta.url));

const [compose, workflow, controller, deploy, nginxHttp, nginxHttps] = await Promise.all([
  readFile(new URL('../docker-compose.yml', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/validacao-v02.yml', import.meta.url), 'utf8'),
  readFile(new URL('../apps/api/src/health.controller.ts', import.meta.url), 'utf8'),
  readFile(new URL('../deploy.sh', import.meta.url), 'utf8'),
  readFile(new URL('../infra/nginx/evolvia.conf', import.meta.url), 'utf8'),
  readFile(new URL('../infra/nginx/evolvia-https.conf', import.meta.url), 'utf8'),
]);

// Readiness da API: a rota precisa provar banco de dados, não apenas processo vivo.
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

// Provas públicas do domínio canônico. Estão aqui para que remover qualquer uma
// delas do workflow reprove o contrato: o alias legado saiu, estas não saem.
const PROVAS_CANONICAS = [
  ["'^strict-transport-security: .*max-age=31536000'", 'HSTS com max-age de um ano'],
  ["'^x-content-type-options: nosniff$'", 'X-Content-Type-Options nosniff'],
  ["'^referrer-policy: strict-origin-when-cross-origin$'", 'Referrer-Policy estrita'],
  ["'^x-frame-options: sameorigin$'", 'X-Frame-Options SAMEORIGIN'],
  ["'^x-powered-by:'", 'ocultação de tecnologia Web'],
  ["'^server: nginx/[0-9]'", 'ocultação da versão do proxy'],
  ['Esperado 301 ou 308', 'redirecionamento HTTP permanente'],
  ['https://homologacao.evolviatecnologia.com/*', 'destino HTTPS canônico do redirecionamento'],
];

for (const [literal, rotulo] of PROVAS_CANONICAS) {
  assert.ok(
    workflow.includes(literal),
    `A prova pública do domínio canônico não pode ser removida: ${rotulo}.`,
  );
}

// Invariantes negativas do domínio legado dev.evolviatecnologia.com, desativado
// por decisão do PO. Substituem os asserts que validavam o diagnóstico do alias.
const ARQUIVOS_LEGADOS = [
  'infra/certbot/diagnose-dev-tls.sh',
  'infra/certbot/bootstrap-dev-redirect.sh',
  'infra/nginx/evolvia-dev-redirect.conf',
];

for (const relativo of ARQUIVOS_LEGADOS) {
  assert.ok(
    !existsSync(caminho(relativo)),
    `O domínio legado foi desativado; este arquivo não pode voltar ao repositório: ${relativo}.`,
  );
}

assert.ok(
  !deploy.includes(LEGACY_DOMAIN),
  'O deploy não pode voltar a mencionar o domínio legado.',
);
assert.ok(
  !deploy.includes('DEV_REDIRECT_BOOTSTRAP'),
  'O deploy não pode voltar a expor a chave de bootstrap do alias legado.',
);
assert.ok(
  !deploy.includes('bootstrap-dev-redirect'),
  'O deploy não pode voltar a invocar o bootstrap do alias legado: ele encerrava o deploy.sh inteiro quando o alias não resolvia.',
);
assert.ok(
  !nginxHttp.includes(LEGACY_DOMAIN) && !nginxHttps.includes(LEGACY_DOMAIN),
  'As configurações Nginx canônicas não podem voltar a servir o domínio legado.',
);

// PENDENTE, para quem tem escopo em .github/workflows: ao remover o passo
// "Comprovar certificado e redirecionamento do alias dev" do job homologacao,
// acrescentar no MESMO commit as duas invariantes abaixo, que fecham o cerco.
// Elas não entram antes disso porque reprovariam enquanto o passo existe, e um
// gate vermelho por construção, à espera de outro agente, não é um gate.
//
//   assert.ok(!workflow.includes('bash infra/certbot/diagnose-dev-tls.sh'), '...');
//   assert.ok(!workflow.includes('Comprovar certificado e redirecionamento do alias dev'), '...');

// Sintaxe dos scripts canônicos de infraestrutura. Antes isto só cobria o
// script legado; agora cobre o que de fato publica a homologação.
const SCRIPTS_CANONICOS = [
  'deploy.sh',
  'infra/certbot/bootstrap-homologacao.sh',
  'infra/certbot/bootstrap-staging-tls.sh',
  'infra/nginx/apply-staging-nginx.sh',
];

for (const relativo of SCRIPTS_CANONICOS) {
  execFileSync('bash', ['-n', caminho(relativo)], { stdio: 'pipe' });
}

console.log('Contratos operacionais de readiness e provas públicas canônicas validados; domínio legado ausente.');
