import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LEGACY_DOMAIN = 'dev.evolviatecnologia.com';

const raiz = fileURLToPath(new URL('../', import.meta.url));
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
assert.doesNotMatch(
  workflow,
  /diagnose-dev-tls/iu,
  'O workflow não pode voltar a executar o diagnóstico do alias legado.',
);
assert.doesNotMatch(
  workflow,
  /\balias[\s_:-]+dev\b/iu,
  'O workflow não pode voltar a exigir a comprovação do alias legado.',
);

// Varredura do inventário rastreado pelo git: o mesmo conjunto que `git grep`
// percorre. Existe porque corrigir uma referência por execução de CI prova
// apenas a última falha — aqui todas as pendências aparecem de uma vez, com
// caminho e linha. Binários são descartados por byte nulo, não por extensão.
const TOKENS_LEGADOS = [
  'bootstrap-dev-redirect',
  'diagnose-dev-tls',
  'evolvia-dev-redirect',
  'DEV_REDIRECT_BOOTSTRAP',
  'EVOLVIA_DEV_',
];

// Única decisão de política, não de descoberta: o domínio nu é procurado apenas
// em arquivos executáveis, para que registro histórico em Markdown siga
// permitido. Os tokens acima nomeiam arquivos apagados e a chave administrativa
// do alias: não têm uso legítimo em nenhum arquivo rastreado.
const EXTENSOES_EXECUTAVEIS = new Set([
  '.cjs',
  '.conf',
  '.js',
  '.json',
  '.jsx',
  '.mjs',
  '.sh',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);

// Exceções deliberadas. Contêm os tokens dentro das próprias
// invariantes negativas ou no registro de desativação.
//
// Nenhum arquivo de segurança está isento para contornar ocorrência: a única
// residual do repositório foi corrigida na origem, em
// scripts/validate-gate1-human-accessibility-evidence.test.mjs.
const ISENTOS = new Set([
  'scripts/validate-readiness-contract.mjs',
  'apps/web/tests/security-headers.test.mjs',
  'docs/operacao-ssl-homologacao.md',
]);

const rastreados = execFileSync('git', ['ls-files', '-z'], {
  cwd: raiz,
  maxBuffer: 64 * 1024 * 1024,
})
  .toString('utf8')
  .split('\0')
  .filter(Boolean);

assert.ok(
  rastreados.length > 0,
  'A varredura não obteve o inventário rastreado pelo git; sem ele não há prova de ausência.',
);

const residuos = [];

for (const relativo of rastreados) {
  if (ISENTOS.has(relativo)) {
    continue;
  }

  // path.join, e não o auxiliar caminho(): git ls-files sempre devolve barra
  // normal, e no Windows fileURLToPath devolve barra invertida. A API URL
  // resolveria o separador, mas corta fragmento e consulta e decodifica
  // porcentagem — um arquivo rastreado chamado "nota#1.md" viraria "nota",
  // existsSync devolveria falso e ele seria pulado em silêncio. Numa varredura
  // que serve para provar ausência, pular em silêncio é o pior defeito possível.
  const absoluto = join(raiz, relativo);
  if (!existsSync(absoluto)) {
    continue;
  }

  const bruto = readFileSync(absoluto);
  if (bruto.includes(0)) {
    continue;
  }

  const ponto = relativo.lastIndexOf('.');
  const barra = relativo.lastIndexOf('/');
  const extensao = ponto > barra ? relativo.slice(ponto) : '';
  const procurados = EXTENSOES_EXECUTAVEIS.has(extensao)
    ? [...TOKENS_LEGADOS, LEGACY_DOMAIN]
    : TOKENS_LEGADOS;

  bruto
    .toString('utf8')
    .split('\n')
    .forEach((linha, indice) => {
      for (const token of procurados) {
        if (linha.includes(token)) {
          residuos.push(`${relativo}:${indice + 1}: ${token}`);
          return;
        }
      }
    });
}

assert.deepEqual(
  residuos,
  [],
  `Dependências residuais do domínio legado desativado:\n${residuos.join('\n')}`,
);

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

console.log(
  `Contratos operacionais e provas públicas canônicas validados; ${rastreados.length} arquivos rastreados sem dependência do domínio legado.`,
);
