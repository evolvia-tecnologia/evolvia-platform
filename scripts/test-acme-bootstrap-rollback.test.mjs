// Regressão de infraestrutura: o que estes scripts deixam para trás quando falham.
//
// A invariante central é uma só, e vale para os dois bootstraps:
//   depois de QUALQUER falha, o site ativo tem de ser byte a byte igual ao de antes.
// "Criou backup" não é segurança verificável: o cenário do probe ACME cria backup e
// ainda assim deixa o servidor sem TLS. "Restaurou" é verificável, e é o que se exige aqui.
//
// Nenhum binário real é usado: nginx, systemctl, curl, getent, snap, certbot e ss são
// substituídos por stubs que registram chamadas. Isto prova fluxo de controle e efeito
// em disco — NÃO prova comportamento do Nginx, que exige Nginx real.

import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const HOMOLOGACAO = join(RAIZ, 'infra/certbot/bootstrap-homologacao.sh');
const STAGING = join(RAIZ, 'infra/certbot/bootstrap-staging-tls.sh');

const DOMINIO = 'homologacao.evolviatecnologia.com';
const IPV4 = '64.181.174.36';
const MARCADOR = 'MARCADOR_DA_CONFIGURACAO_ANTERIOR_EM_PRODUCAO';

/** Overrides que o teste precisa para isolar o ambiente sem tocar em /etc. */
const OVERRIDES_EXIGIDOS = {
  'infra/certbot/bootstrap-staging-tls.sh': [
    'EVOLVIA_NGINX_SITE', 'EVOLVIA_NGINX_LINK', 'EVOLVIA_ACME_WEBROOT',
    'EVOLVIA_STAGING_ENV_FILE', 'EVOLVIA_CERT_DIR', 'EVOLVIA_BACKUP_ROOT',
  ],
  'infra/certbot/bootstrap-homologacao.sh': [
    'EVOLVIA_NGINX_SITE', 'EVOLVIA_NGINX_LINK', 'EVOLVIA_ACME_WEBROOT',
    'EVOLVIA_CERT_DIR', 'EVOLVIA_BACKUP_ROOT',
  ],
};

const STUBS = {
  nginx: `n=$(( $(cat "$STUB_STATE/nginx.count" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$STUB_STATE/nginx.count"
echo "nginx $*" >> "$STUB_STATE/calls.log"
case " $NGINX_FAIL_AT " in *" $n "*) echo "nginx: [emerg] configuracao recusada" >&2; exit 1;; esac
exit 0`,
  systemctl: `echo "systemctl $*" >> "$STUB_STATE/calls.log"
case "$1 $2" in "reload nginx") case " $RELOAD_FAIL_AT " in *" $(( $(cat "$STUB_STATE/reload.count" 2>/dev/null || echo 0) + 1 )) "*) echo "$(( $(cat "$STUB_STATE/reload.count" 2>/dev/null || echo 0) + 1 ))" > "$STUB_STATE/reload.count"; echo "Job for nginx.service failed" >&2; exit 1;; esac
  echo "$(( $(cat "$STUB_STATE/reload.count" 2>/dev/null || echo 0) + 1 ))" > "$STUB_STATE/reload.count";; esac
exit 0`,
  getent: `[ "$1" = "ahostsv4" ] && echo "${IPV4} STREAM $2"
exit 0`,
  curl: `echo "curl $*" >> "$STUB_STATE/calls.log"
for a in "$@"; do case "$a" in *acme-challenge/*)
  [ "$CURL_ACME" = "ok" ] || exit 22
  printf '%s' "\${a##*/}"; exit 0;; esac; done
exit 0`,
  snap: 'exit 0',
  certbot: `echo "certbot $*" >> "$STUB_STATE/calls.log"
exit 0`,
  ss: 'exit 0',
};

function ambiente({ nginxFailAt = '', reloadFailAt = '', curlAcme = 'ok', comCertificado = true } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'evolvia-acme-'));
  const caminhos = {
    site: join(base, 'etc/nginx/sites-available/evolvia-homologacao'),
    link: join(base, 'etc/nginx/sites-enabled/evolvia-homologacao'),
    webroot: join(base, 'var/www/certbot'),
    certDir: join(base, 'etc/letsencrypt/live', DOMINIO),
    backups: join(base, 'opt/evolvia/backups'),
    envFile: join(base, 'opt/evolvia/environments/staging/.env'),
    stub: join(base, 'stub'),
    state: join(base, 'state'),
  };
  for (const dir of [join(base, 'etc/nginx/sites-available'), join(base, 'etc/nginx/sites-enabled'),
    caminhos.webroot, caminhos.certDir, caminhos.backups, join(base, 'opt/evolvia/environments/staging'),
    caminhos.stub, caminhos.state]) mkdirSync(dir, { recursive: true });

  writeFileSync(caminhos.envFile, 'WEB_HOST_PORT=3000\nAPI_HOST_PORT=4000\n');
  if (comCertificado) {
    writeFileSync(join(caminhos.certDir, 'fullchain.pem'), 'certificado-existente\n');
    writeFileSync(join(caminhos.certDir, 'privkey.pem'), 'chave-existente\n');
  }
  // Pré-estado: o site ativo já serve a configuração anterior, e o link aponta para ele.
  writeFileSync(caminhos.site, `${MARCADOR}\n`);
  symlinkSync(caminhos.site, caminhos.link);

  for (const [nome, corpo] of Object.entries(STUBS)) {
    const alvo = join(caminhos.stub, nome);
    writeFileSync(alvo, `#!/bin/sh\n${corpo}\n`);
    chmodSync(alvo, 0o755);
  }

  return {
    base,
    caminhos,
    env: {
      ...process.env,
      PATH: `${caminhos.stub}:${process.env.PATH}`,
      STUB_STATE: caminhos.state,
      NGINX_FAIL_AT: nginxFailAt,
      RELOAD_FAIL_AT: reloadFailAt,
      CURL_ACME: curlAcme,
      CERTBOT_EMAIL: 'operacao@exemplo.invalid',
      CERTBOT_SKIP_DRY_RUN: '1',
      EVOLVIA_HOMOLOGATION_DOMAIN: DOMINIO,
      EVOLVIA_HOMOLOGATION_IPV4: IPV4,
      EVOLVIA_NGINX_SITE: caminhos.site,
      EVOLVIA_NGINX_LINK: caminhos.link,
      EVOLVIA_ACME_WEBROOT: caminhos.webroot,
      EVOLVIA_CERT_DIR: caminhos.certDir,
      EVOLVIA_BACKUP_ROOT: caminhos.backups,
      EVOLVIA_STAGING_ENV_FILE: caminhos.envFile,
    },
  };
}

/**
 * Sem isto, um script que IGNORE os overrides escreveria no /etc real e deixaria o
 * arquivo do sandbox intocado — e as asserções de "preservou byte a byte" passariam
 * sem significar nada. Toda verificação de preservação exige antes a prova de que o
 * script de fato operou dentro do sandbox.
 */
const confirmarIsolamento = (contexto) => {
  assert.ok(
    existsSync(contexto.caminhos.backups) && readdirSync(contexto.caminhos.backups).length > 0,
    'o script nao escreveu nada no sandbox: provavelmente ignorou os overrides e operou no /etc real',
  );
};

const chamadas = (contexto) => {
  const log = join(contexto.caminhos.state, 'calls.log');
  return existsSync(log) ? readFileSync(log, 'utf8') : '';
};

const executar = (script, contexto) => {
  const resultado = spawnSync('bash', [script], { env: contexto.env, encoding: 'utf8' });
  confirmarIsolamento(contexto);
  return resultado;
};

test('os scripts aceitam override de caminho, sem o qual nenhum teste pode isolar o ambiente', () => {
  const faltando = [];
  for (const [relativo, variaveis] of Object.entries(OVERRIDES_EXIGIDOS)) {
    const fonte = readFileSync(join(RAIZ, relativo), 'utf8');
    for (const variavel of variaveis) {
      if (!fonte.includes(`\${${variavel}:-`)) faltando.push(`${relativo}: ${variavel}`);
    }
  }
  assert.deepEqual(faltando, [], `Sem estes overrides o teste escreveria no /etc real:\n${faltando.join('\n')}`);
});

for (const [rotulo, script] of [['homologacao', HOMOLOGACAO], ['staging-tls', STAGING]]) {
  test(`${rotulo}: probe ACME recusado preserva o site ativo byte a byte`, () => {
    const contexto = ambiente({ curlAcme: 'fail' });
    const antes = readFileSync(contexto.caminhos.site, 'utf8');
    const resultado = executar(script, contexto);
    assert.notEqual(resultado.status, 0, 'o script tem de falhar quando o desafio nao responde');
    assert.equal(readFileSync(contexto.caminhos.site, 'utf8'), antes,
      'o site ativo foi deixado diferente do original apos a falha');
  });

  test(`${rotulo}: recusa do nginx -t final preserva o site ativo byte a byte`, () => {
    const contexto = ambiente({ nginxFailAt: '2' });
    const antes = readFileSync(contexto.caminhos.site, 'utf8');
    const resultado = executar(script, contexto);
    assert.notEqual(resultado.status, 0);
    assert.equal(readFileSync(contexto.caminhos.site, 'utf8'), antes);
  });

  test(`${rotulo}: falha no reload do Nginx preserva o site ativo byte a byte`, () => {
    const contexto = ambiente({ reloadFailAt: '1' });
    const antes = readFileSync(contexto.caminhos.site, 'utf8');
    const resultado = executar(script, contexto);
    assert.notEqual(resultado.status, 0);
    assert.equal(readFileSync(contexto.caminhos.site, 'utf8'), antes);
  });

  test(`${rotulo}: falha restaura o link simbolico para o alvo anterior`, () => {
    const contexto = ambiente({ curlAcme: 'fail' });
    const alvoAntes = readlinkSync(contexto.caminhos.link);
    executar(script, contexto);
    assert.equal(lstatSync(contexto.caminhos.link).isSymbolicLink(), true, 'o link deixou de ser link');
    assert.equal(readlinkSync(contexto.caminhos.link), alvoAntes, 'o link passou a apontar para outro alvo');
  });

  test(`${rotulo}: falha nao remove certificado existente`, () => {
    const contexto = ambiente({ curlAcme: 'fail' });
    executar(script, contexto);
    assert.equal(readFileSync(join(contexto.caminhos.certDir, 'fullchain.pem'), 'utf8'), 'certificado-existente\n');
    assert.equal(readFileSync(join(contexto.caminhos.certDir, 'privkey.pem'), 'utf8'), 'chave-existente\n');
  });

  test(`${rotulo}: certificado existente nao dispara nova emissao`, () => {
    const contexto = ambiente();
    executar(script, contexto);
    assert.doesNotMatch(chamadas(contexto), /certbot certonly/u,
      'houve emissao de certificado mesmo havendo um valido no lugar');
  });

  test(`${rotulo}: caminho feliz instala a configuracao nova e recarrega`, () => {
    const contexto = ambiente();
    const resultado = executar(script, contexto);
    assert.equal(resultado.status, 0, resultado.stderr);
    const depois = readFileSync(contexto.caminhos.site, 'utf8');
    assert.doesNotMatch(depois, new RegExp(MARCADOR, 'u'), 'a configuracao anterior nao foi substituida');
    assert.match(chamadas(contexto), /systemctl reload nginx/u);
  });

  test(`${rotulo}: duas execucoes seguidas deixam o mesmo estado`, () => {
    const contexto = ambiente();
    assert.equal(executar(script, contexto).status, 0);
    const primeira = readFileSync(contexto.caminhos.site, 'utf8');
    assert.equal(executar(script, contexto).status, 0);
    assert.equal(readFileSync(contexto.caminhos.site, 'utf8'), primeira,
      'a segunda execucao produziu estado diferente da primeira');
  });

  test(`${rotulo}: o desafio ACME fica sob .well-known e nao sobra em sucesso nem em falha`, () => {
    for (const curlAcme of ['ok', 'fail']) {
      const contexto = ambiente({ curlAcme });
      executar(script, contexto);
      const pedido = chamadas(contexto).match(/acme-challenge\/([^\s]+)/u);
      assert.ok(pedido, `${curlAcme}: o script nao consultou o desafio`);
      const esperado = join(contexto.caminhos.webroot, '.well-known/acme-challenge', pedido[1]);
      assert.equal(existsSync(esperado), false, `${curlAcme}: o desafio sobrou em ${esperado}`);
      assert.equal(existsSync(join(contexto.caminhos.webroot, pedido[1])), false,
        `${curlAcme}: o desafio foi gravado fora de .well-known/acme-challenge, onde o Nginx nao o encontra`);
    }
  });
}
