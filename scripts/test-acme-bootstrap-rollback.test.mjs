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
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const HOMOLOGACAO = join(RAIZ, 'infra/certbot/bootstrap-homologacao.sh');
const STAGING = join(RAIZ, 'infra/certbot/bootstrap-staging-tls.sh');

const DOMINIO = 'homologacao.evolviatecnologia.com';
const IPV4 = '64.181.174.36';
const MARCADOR = 'MARCADOR_DA_CONFIGURACAO_ANTERIOR_EM_PRODUCAO';

/** Overrides que o teste precisa para isolar o ambiente sem tocar em /etc. */
const OVERRIDES_EXIGIDOS = {
  // EVOLVIA_CERTBOT_BIN e exigida dos dois, por motivos diferentes: homologacao
  // INVOCA /usr/local/bin/certbot por caminho absoluto; staging-tls so grava esse
  // caminho num `ln -sfn`, dentro de `if ! command -v certbot`. O segundo caso
  // hoje nao chega a executar porque o stub do PATH fecha o ramo — mas a guarda
  // le a fonte, nao o ramo tomado, e depender do ramo seria depender de sorte.
  'infra/certbot/bootstrap-staging-tls.sh': [
    'EVOLVIA_NGINX_SITE', 'EVOLVIA_NGINX_LINK', 'EVOLVIA_ACME_WEBROOT',
    'EVOLVIA_STAGING_ENV_FILE', 'EVOLVIA_CERT_DIR', 'EVOLVIA_BACKUP_ROOT',
    'EVOLVIA_RENEWAL_HOOKS_DIR', 'EVOLVIA_CERTBOT_BIN', 'EVOLVIA_CERTBOT_SNAP_BIN',
  ],
  // homologacao acrescenta LEGACY_LINK: `rm -f /etc/nginx/sites-enabled/default`
  // esta fora de qualquer variavel, e remove um link do host que nao e seu.
  'infra/certbot/bootstrap-homologacao.sh': [
    'EVOLVIA_NGINX_SITE', 'EVOLVIA_NGINX_LINK', 'EVOLVIA_ACME_WEBROOT',
    'EVOLVIA_CERT_DIR', 'EVOLVIA_BACKUP_ROOT', 'EVOLVIA_RENEWAL_HOOKS_DIR',
    'EVOLVIA_CERTBOT_BIN', 'EVOLVIA_CERTBOT_SNAP_BIN', 'EVOLVIA_NGINX_LEGACY_LINK',
  ],
};

/**
 * Prefixos de sistema sob os quais nenhum caminho literal pode sobrar no script:
 * um unico deles escapa do sandbox e escreve na maquina que roda o teste.
 * Caminho dentro de `${VAR:-/padrao}` nao conta — ali o literal e so o padrao,
 * e o override o substitui.
 */
const PREFIXOS_DE_SISTEMA = ['etc', 'var', 'opt', 'usr', 'snap', 'run', 'srv'];

const STUBS = {
  nginx: `n=$(( $(cat "$STUB_STATE/nginx.count" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$STUB_STATE/nginx.count"
echo "nginx $*" >> "$STUB_STATE/calls.log"
case " $NGINX_FAIL_AT " in *" $n "*) echo "nginx: [emerg] configuracao recusada" >&2; exit 1;; esac
exit 0`,
  // Fotografa o que o reload CARREGOU, nao so o que sobrou em disco no fim.
  // A divergencia entre os dois e a mina: disco com configuracao que nao valida
  // e processo servindo outra coisa.
  //
  // Duas sutilezas que decidem se esta prova vale:
  //  - so registra quando o reload TEM SUCESSO. Um reload que falha nao carrega
  //    nada; registrar antes da falha inventaria um estado que nunca foi servido.
  //  - le o ALVO DO LINK habilitado, nao o arquivo do site. O Nginx serve o que
  //    esta em sites-enabled; depois de um rollback que repontou o link, o site
  //    e o servido sao arquivos diferentes.
  systemctl: `echo "systemctl $*" >> "$STUB_STATE/calls.log"
case "$1 $2" in "reload nginx")
  n=$(( $(cat "$STUB_STATE/reload.count" 2>/dev/null || echo 0) + 1 ))
  echo "$n" > "$STUB_STATE/reload.count"
  case " $RELOAD_FAIL_AT " in *" $n "*) echo "Job for nginx.service failed" >&2; exit 1;; esac
  servido="$(readlink -f "$EVOLVIA_NGINX_LINK" 2>/dev/null || true)"
  if [ -n "$servido" ] && [ -f "$servido" ]; then
    cp "$servido" "$STUB_STATE/carregado-$n"
  else
    : > "$STUB_STATE/carregado-$n"
  fi
  ;;
esac
exit 0`,
  getent: `[ "$1" = "ahostsv4" ] && echo "${IPV4} STREAM $2"
exit 0`,
  // Modela `root ${WEBROOT}` do Nginx: a URI inteira resolve sob o webroot.
  // Um desafio gravado fora de .well-known/acme-challenge/ devolve 404, como no
  // servidor real. O stub NAO pode inventar o conteudo: se inventasse, o teste
  // passaria mesmo com o defeito de caminho, que e justamente o que ele procura.
  curl: `echo "curl $*" >> "$STUB_STATE/calls.log"
for a in "$@"; do case "$a" in *acme-challenge/*)
  token="\${a##*/}"
  alvo="$EVOLVIA_ACME_WEBROOT/.well-known/acme-challenge/$token"
  plano="$EVOLVIA_ACME_WEBROOT/$token"
  # Evidencia registrada ANTES da falha injetada: so assim o caso fail distingue
  # "gravou no lugar errado" de "nunca gravou".
  printf '%s aninhado=%s plano=%s conteudo=%s\\n' "$token" \\
    "$([ -f "$alvo" ] && echo sim || echo nao)" \\
    "$([ -f "$plano" ] && echo sim || echo nao)" \\
    "$([ -f "$alvo" ] && cat "$alvo" || echo ausente)" >> "$STUB_STATE/probe.log"
  [ "$CURL_ACME" = "ok" ] || exit 22
  [ -f "$alvo" ] || exit 22
  cat "$alvo"; exit 0;; esac; done
exit 0`,
  snap: 'exit 0',
  certbot: `echo "certbot $*" >> "$STUB_STATE/calls.log"
case "$1" in certonly) [ -n "$CERTBOT_FAIL" ] && { echo "certbot: erro de emissao" >&2; exit 1; };; esac
exit 0`,
  ss: 'exit 0',
  // staging-tls exige root por `[[ "$(id -u)" -eq 0 ]]`, e `id` vem do PATH:
  // sem o stub o script morre na primeira linha quando roda sem privilegio.
  id: `[ "$1" = "-u" ] && { echo 0; exit 0; }
exit 0`,
  // homologacao resolve SUDO="sudo" quando EUID != 0 e passa TODO comando
  // privilegiado por ele. O sudo real reescreve o PATH pelo secure_path do
  // sudoers, entao os stubs seriam ignorados e os binarios de verdade do sistema
  // seriam chamados. O stub torna $SUDO um repasse que preserva o PATH.
  //
  // Isto nao e caixa de areia: um PATH mal montado volta a chamar o sudo real.
  // Por isso a guarda de caminhos absolutos abaixo existe em separado.
  sudo: 'exec "$@"',
};

function ambiente({ nginxFailAt = '', reloadFailAt = '', curlAcme = 'ok', comCertificado = true, certbotFail = '', legado = 'ausente' } = {}, t) {
  const base = mkdtempSync(join(tmpdir(), 'evolvia-acme-'));
  t?.after(() => rmSync(base, { recursive: true, force: true }));
  const caminhos = {
    site: join(base, 'etc/nginx/sites-available/evolvia-homologacao'),
    link: join(base, 'etc/nginx/sites-enabled/evolvia-homologacao'),
    webroot: join(base, 'var/www/certbot'),
    certDir: join(base, 'etc/letsencrypt/live', DOMINIO),
    backups: join(base, 'opt/evolvia/backups'),
    legado: join(base, 'etc/nginx/sites-enabled/default'),
    hooks: join(base, 'etc/letsencrypt/renewal-hooks/deploy'),
    // Alvo do `ln -sfn` do certbot: caminho PROPRIO, distinto do stub, para que o
    // link criado pelo script aponte para o stub em vez de se apontar a si mesmo.
    certbotBin: join(base, 'usr/local/bin/certbot'),
    envFile: join(base, 'opt/evolvia/environments/staging/.env'),
    siteAnterior: join(base, 'etc/nginx/sites-available/evolvia-anterior'),
    siteLegado: join(base, 'etc/nginx/sites-available/evolvia'),
    linkLegado: join(base, 'etc/nginx/sites-enabled/evolvia'),
    stub: join(base, 'stub'),
    state: join(base, 'state'),
  };
  for (const dir of [join(base, 'etc/nginx/sites-available'), join(base, 'etc/nginx/sites-enabled'),
    caminhos.webroot, caminhos.certDir, caminhos.backups, join(base, 'opt/evolvia/environments/staging'),
    join(base, 'usr/local/bin'), caminhos.stub, caminhos.state]) mkdirSync(dir, { recursive: true });

  writeFileSync(caminhos.envFile, 'WEB_HOST_PORT=3000\nAPI_HOST_PORT=4000\n');
  if (comCertificado) {
    writeFileSync(join(caminhos.certDir, 'fullchain.pem'), 'certificado-existente\n');
    writeFileSync(join(caminhos.certDir, 'privkey.pem'), 'chave-existente\n');
  }
  // Pré-estado: o site ativo já serve a configuração anterior, e o link aponta para ele.
  writeFileSync(caminhos.site, `${MARCADOR}\n`);
  // O link aponta para um alvo DISTINTO do site: se o script o repontar e nao
  // restaurar, a diferenca aparece. Apontando para o mesmo arquivo, o caso
  // passaria sem que houvesse restauracao alguma.
  writeFileSync(caminhos.siteAnterior, `${MARCADOR}\n`);
  symlinkSync(caminhos.siteAnterior, caminhos.link);
  // Modo DISTINTO do 0644 que os scripts instalam: um rollback que faca
  // `install -m 0644` restaura o conteudo e perde a permissao, e a diferenca
  // precisa aparecer. Com 0644 no pre-estado, o caso passaria por coincidencia.
  chmodSync(caminhos.site, 0o640);

  // Site legado `evolvia`, o que existe no host de homologacao desde o bootstrap
  // administrativo anterior. 'canonico' = byte a byte um dos templates versionados;
  // 'incerto' = conteudo que o script nao reconhece e por isso deve recusar migrar.
  if (legado !== 'ausente') {
    const conteudo = legado === 'canonico'
      ? readFileSync(join(RAIZ, 'infra/nginx/evolvia.conf'), 'utf8')
      : 'CONFIGURACAO_DE_ORIGEM_DESCONHECIDA\n';
    writeFileSync(caminhos.siteLegado, conteudo);
    symlinkSync(caminhos.siteLegado, caminhos.linkLegado);
  }

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
      CERTBOT_FAIL: certbotFail,
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
      EVOLVIA_NGINX_LEGACY_LINK: caminhos.legado,
      EVOLVIA_RENEWAL_HOOKS_DIR: caminhos.hooks,
      EVOLVIA_CERTBOT_SNAP_BIN: join(caminhos.stub, 'certbot'),
      // Sem isto o script resolve /usr/local/bin/certbot por caminho absoluto: o
      // stub do PATH nunca e chamado e o teste mede um certbot que nao e o seu.
      EVOLVIA_CERTBOT_BIN: caminhos.certbotBin,
    },
  };
}

/**
 * Sem isto, um script que IGNORE os overrides escreveria no /etc real e deixaria o
 * arquivo do sandbox intocado — e as asserções de "preservou byte a byte" passariam
 * sem significar nada. Toda verificação de preservação exige antes a prova de que o
 * script de fato operou dentro do sandbox.
 */
const confirmarIsolamento = (contexto, resultado) => {
  if (existsSync(contexto.caminhos.backups) && readdirSync(contexto.caminhos.backups).length > 0) return;
  // Sem o detalhe abaixo, uma falha precoce por outro motivo (sintaxe, pre-requisito
  // ausente, comando que faltou no PATH) chegava aqui como "ignorou os overrides",
  // que e um diagnostico errado e custa tempo de quem for corrigir.
  const detalhe = resultado
    ? `\nstatus: ${resultado.status}\nsinal: ${resultado.signal}\nstderr: ${resultado.stderr}\nstdout: ${resultado.stdout}`
    : '';
  assert.fail(`o script nao escreveu nada no sandbox: provavelmente ignorou os overrides e operou no /etc real${detalhe}`);
};

/** O conteudo que cada reload BEM-SUCEDIDO carregou, na ordem. */
const carregados = (contexto) => {
  const estado = contexto.caminhos.state;
  return readdirSync(estado)
    .filter((nome) => nome.startsWith('carregado-'))
    .sort((esquerda, direita) => Number(esquerda.slice(10)) - Number(direita.slice(10)))
    .map((nome) => readFileSync(join(estado, nome), 'utf8'));
};

const probes = (contexto) => {
  const log = join(contexto.caminhos.state, 'probe.log');
  return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : [];
};

const chamadas = (contexto) => {
  const log = join(contexto.caminhos.state, 'calls.log');
  return existsSync(log) ? readFileSync(log, 'utf8') : '';
};

const invocacoesNginx = (contexto) => {
  const arquivo = join(contexto.caminhos.state, 'nginx.count');
  return existsSync(arquivo) ? Number(readFileSync(arquivo, 'utf8').trim()) : 0;
};

/**
 * Falhar nao basta: tem de ser A falha injetada.
 *
 * `status !== 0` aceitaria uma falha anterior — o script morrendo na checagem de
 * DNS satisfaria um caso que diz provar rollback de reload. Pior: com timeout no
 * spawn, um processo morto por sinal devolve `status: null`, e `notEqual(null, 0)`
 * PASSA. Um teste que trava viraria um teste verde.
 *
 * Aqui se exige saida por codigo de saida, codigo diferente de zero, e prova
 * positiva de que a etapa injetada foi alcancada.
 */
const exigirFalhaNaEtapa = (resultado, alcancou, etapa) => {
  assert.equal(resultado.error, undefined,
    `o processo nao completou (${resultado.error?.code}): a falha de ${etapa} nao foi exercitada`);
  assert.equal(resultado.signal, null,
    `o processo foi morto por sinal (${resultado.signal}): a falha de ${etapa} nao foi exercitada`);
  assert.equal(typeof resultado.status, 'number',
    `o processo nao terminou com codigo de saida: a falha de ${etapa} nao foi exercitada`);
  assert.notEqual(resultado.status, 0, `o script deveria falhar em ${etapa}`);
  assert.ok(alcancou, `o script falhou ANTES de chegar a ${etapa}: este caso nao prova nada sobre ela`);
};

const exigirSucesso = (resultado) => {
  assert.equal(resultado.error, undefined, `o processo nao completou (${resultado.error?.code})`);
  assert.equal(resultado.signal, null, `o processo foi morto por sinal (${resultado.signal})`);
  assert.equal(resultado.status, 0, resultado.stderr);
};

/**
 * Verificada ANTES do spawn. A checagem posterior detectava o problema tarde demais:
 * um script que ignorasse os overrides ja teria escrito no /etc da maquina que roda
 * o teste. Aqui ele simplesmente nao chega a ser executado.
 */
const exigirOverrides = (script) => {
  const relativo = script.slice(RAIZ.length).split(sep).join('/');
  const variaveis = OVERRIDES_EXIGIDOS[relativo];
  assert.ok(variaveis, `sem lista de overrides para ${relativo}`);
  const fonte = readFileSync(script, 'utf8');
  const faltando = variaveis.filter((variavel) => !fonte.includes(`\${${variavel}:-`));
  assert.deepEqual(faltando, [],
    `${relativo} nao aceita override de caminho (${faltando.join(', ')}): o teste seria executado contra o /etc real e por isso NAO foi executado`);
};

/**
 * Caminhos de sistema que sobraram no script, ja descontados comentarios e os
 * padroes de `${VAR:-/padrao}`. Enumerar override por override nao basta: basta um
 * literal que eu nao tenha previsto para o script escrever fora do sandbox. Esta
 * leitura e cega ao meu inventario, e por isso cobre o que ele esquece.
 */
const caminhosDeSistemaRemanescentes = (fonte) => {
  const limpa = fonte
    .split('\n')
    .map((linha) => linha.replace(/#.*$/u, ''))
    .join('\n')
    .replaceAll(/\$\{[A-Za-z_][A-Za-z0-9_]*:-[^}]*\}/gu, '');
  const padrao = new RegExp(`/(?:${PREFIXOS_DE_SISTEMA.join('|')})/[A-Za-z0-9._/\${}-]*`, 'gu');
  return [...new Set(limpa.match(padrao) ?? [])].sort();
};

/**
 * Verificada ANTES do spawn, junto com os overrides: um script que ainda escreva em
 * caminho absoluto nao e executado, mesmo que aceite todos os overrides da lista.
 * exigirOverrides prova que o script PODE ser desviado; esta prova que nao sobrou
 * caminho por onde ele escape.
 */
const exigirAusenciaDeCaminhosDeSistema = (script) => {
  const relativo = script.slice(RAIZ.length).split(sep).join('/');
  const remanescentes = caminhosDeSistemaRemanescentes(readFileSync(script, 'utf8'));
  assert.deepEqual(remanescentes, [],
    `${relativo} ainda escreve em caminho absoluto do sistema (${remanescentes.join(', ')}): executa-lo escreveria fora do sandbox e por isso NAO foi executado`);
};

const executar = (script, contexto) => {
  exigirOverrides(script);
  exigirAusenciaDeCaminhosDeSistema(script);
  const resultado = spawnSync('bash', [script], { env: contexto.env, encoding: 'utf8', timeout: 30_000 });
  confirmarIsolamento(contexto, resultado);
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

test('nenhum dos scripts escreve em caminho absoluto do sistema fora dos padroes de override', () => {
  const remanescentes = [];
  for (const relativo of Object.keys(OVERRIDES_EXIGIDOS)) {
    for (const caminho of caminhosDeSistemaRemanescentes(readFileSync(join(RAIZ, relativo), 'utf8'))) {
      remanescentes.push(`${relativo}: ${caminho}`);
    }
  }
  assert.deepEqual(remanescentes, [],
    `Enquanto estes caminhos existirem, executar os scripts escreve fora do sandbox:\n${remanescentes.join('\n')}`);
});

for (const [rotulo, script] of [['homologacao', HOMOLOGACAO], ['staging-tls', STAGING]]) {
  test(`${rotulo}: probe ACME recusado preserva o site ativo byte a byte`, (t) => {
    const contexto = ambiente({ curlAcme: 'fail' }, t);
    const antes = readFileSync(contexto.caminhos.site, 'utf8');
    const resultado = executar(script, contexto);
    exigirFalhaNaEtapa(resultado, probes(contexto).length > 0, 'consulta publica do desafio ACME');
    assert.equal(readFileSync(contexto.caminhos.site, 'utf8'), antes,
      'o site ativo foi deixado diferente do original apos a falha');
  });

  test(`${rotulo}: recusa do nginx -t final preserva o site ativo byte a byte`, (t) => {
    const contexto = ambiente({ nginxFailAt: '2' }, t);
    const antes = readFileSync(contexto.caminhos.site, 'utf8');
    const resultado = executar(script, contexto);
    exigirFalhaNaEtapa(resultado, invocacoesNginx(contexto) >= 2, 'segunda validacao do nginx -t');
    assert.equal(readFileSync(contexto.caminhos.site, 'utf8'), antes);
  });

  test(`${rotulo}: falha no reload do Nginx preserva o site ativo byte a byte`, (t) => {
    const contexto = ambiente({ reloadFailAt: '1' }, t);
    const antes = readFileSync(contexto.caminhos.site, 'utf8');
    const resultado = executar(script, contexto);
    exigirFalhaNaEtapa(resultado, /systemctl reload nginx/u.test(chamadas(contexto)), 'reload do Nginx');
    assert.equal(readFileSync(contexto.caminhos.site, 'utf8'), antes);
  });

  test(`${rotulo}: falha restaura o link simbolico para o alvo anterior`, (t) => {
    const contexto = ambiente({ curlAcme: 'fail' }, t);
    const alvoAntes = readlinkSync(contexto.caminhos.link);
    const resultado = executar(script, contexto);
    exigirFalhaNaEtapa(resultado, probes(contexto).length > 0, 'consulta publica do desafio ACME');
    assert.equal(lstatSync(contexto.caminhos.link).isSymbolicLink(), true, 'o link deixou de ser link');
    assert.equal(readlinkSync(contexto.caminhos.link), alvoAntes, 'o link passou a apontar para outro alvo');
  });

  test(`${rotulo}: falha nao remove certificado existente`, (t) => {
    const contexto = ambiente({ curlAcme: 'fail' }, t);
    const resultado = executar(script, contexto);
    exigirFalhaNaEtapa(resultado, probes(contexto).length > 0, 'consulta publica do desafio ACME');
    assert.equal(readFileSync(join(contexto.caminhos.certDir, 'fullchain.pem'), 'utf8'), 'certificado-existente\n');
    assert.equal(readFileSync(join(contexto.caminhos.certDir, 'privkey.pem'), 'utf8'), 'chave-existente\n');
  });

  test(`${rotulo}: certificado existente nao dispara nova emissao`, (t) => {
    const contexto = ambiente({}, t);
    const resultado = executar(script, contexto);
    // Sem exigir sucesso, uma falha ANTES do certbot satisfaria o doesNotMatch:
    // "nao reemitiu" por nunca ter chegado la nao e a propriedade desejada.
    exigirSucesso(resultado);
    assert.doesNotMatch(chamadas(contexto), /certbot certonly/u,
      'houve emissao de certificado mesmo havendo um valido no lugar');
  });

  test(`${rotulo}: caminho feliz instala a configuracao nova e recarrega`, (t) => {
    const contexto = ambiente({}, t);
    const resultado = executar(script, contexto);
    exigirSucesso(resultado);
    const depois = readFileSync(contexto.caminhos.site, 'utf8');
    assert.doesNotMatch(depois, new RegExp(MARCADOR, 'u'), 'a configuracao anterior nao foi substituida');
    assert.match(chamadas(contexto), /systemctl reload nginx/u);
  });

  test(`${rotulo}: duas execucoes seguidas deixam o mesmo estado`, (t) => {
    const contexto = ambiente({}, t);
    exigirSucesso(executar(script, contexto));
    const primeira = readFileSync(contexto.caminhos.site, 'utf8');
    exigirSucesso(executar(script, contexto));
    assert.equal(readFileSync(contexto.caminhos.site, 'utf8'), primeira,
      'a segunda execucao produziu estado diferente da primeira');
  });

  test(`${rotulo}: o desafio existe sob .well-known no momento do probe e nao sobra depois`, (t) => {
    for (const curlAcme of ['ok', 'fail']) {
      const contexto = ambiente({ curlAcme }, t);
      executar(script, contexto);
      const registros = probes(contexto);
      assert.equal(registros.length > 0, true, `${curlAcme}: o script nao consultou o desafio`);
      for (const registro of registros) {
        const token = registro.split(' ')[0];
        // Medido DENTRO do stub, antes de qualquer falha injetada: distingue
        // "gravou no lugar errado" de "nunca gravou".
        assert.match(registro, /aninhado=sim/u,
          `${curlAcme}: no momento do probe o desafio nao estava em .well-known/acme-challenge/`);
        assert.match(registro, /plano=nao/u,
          `${curlAcme}: o desafio foi gravado em ${'${WEBROOT}'}/${'${CHALLENGE}'}, onde o Nginx com root nao o encontra`);
        assert.match(registro, new RegExp(`conteudo=${token}$`, 'u'),
          `${curlAcme}: o conteudo servido nao corresponde ao token pedido`);
        assert.equal(existsSync(join(contexto.caminhos.webroot, '.well-known/acme-challenge', token)), false,
          `${curlAcme}: o desafio sobrou apos a execucao`);
      }
    }
  });

  test(`${rotulo}: falha na emissao do certificado preserva o site ativo byte a byte`, (t) => {
    const contexto = ambiente({ comCertificado: false, certbotFail: '1' }, t);
    const antes = readFileSync(contexto.caminhos.site, 'utf8');
    const resultado = executar(script, contexto);
    exigirFalhaNaEtapa(resultado, /certbot certonly/u.test(chamadas(contexto)), 'emissao do certificado');
    assert.equal(readFileSync(contexto.caminhos.site, 'utf8'), antes,
      'o site ativo foi deixado diferente do original apos falha de emissao');
  });

  test(`${rotulo}: falha restaura tambem a permissao do site ativo`, (t) => {
    const contexto = ambiente({ curlAcme: 'fail' }, t);
    const modoAntes = statSync(contexto.caminhos.site).mode & 0o777;
    const resultado = executar(script, contexto);
    exigirFalhaNaEtapa(resultado, probes(contexto).length > 0, 'consulta publica do desafio ACME');
    const modoDepois = statSync(contexto.caminhos.site).mode & 0o777;
    assert.equal(modoDepois.toString(8), modoAntes.toString(8),
      'o rollback devolveu o conteudo mas nao a permissao: restaurar com `install -m 0644` fixo perde o modo anterior');
  });

  test(`${rotulo}: o estado carregado pelo Nginx nao diverge do que ficou em disco`, (t) => {
    const contexto = ambiente({ nginxFailAt: '2' }, t);
    executar(script, contexto);
    const estados = carregados(contexto);
    assert.equal(estados.length > 0, true, 'nenhum reload bem-sucedido foi executado');
    // Compara com o que o link habilitado serve agora, nao com o arquivo do site:
    // e isso que o Nginx entregaria no proximo reload.
    const servido = readFileSync(realpathSync(contexto.caminhos.link), 'utf8');
    assert.equal(estados.at(-1), servido,
      'o que esta habilitado agora nunca foi carregado por um reload bem-sucedido: o proximo reload falha');
  });

  test(`${rotulo}: falha restaura o site legado habilitado`, (t) => {
    const contexto = ambiente({ curlAcme: 'fail', legado: 'canonico' }, t);
    const resultado = executar(script, contexto);
    exigirFalhaNaEtapa(resultado, probes(contexto).length > 0, 'consulta publica do desafio ACME');
    assert.equal(lstatSync(contexto.caminhos.linkLegado).isSymbolicLink(), true,
      'o link do site legado nao foi restaurado apos a falha');
    assert.equal(readlinkSync(contexto.caminhos.linkLegado), contexto.caminhos.siteLegado);
  });

  test(`${rotulo}: caminho feliz retira o site legado habilitado`, (t) => {
    const contexto = ambiente({ legado: 'canonico' }, t);
    exigirSucesso(executar(script, contexto));
    assert.equal(existsSync(contexto.caminhos.linkLegado), false, 'o site legado continua habilitado');
  });

  test(`${rotulo}: site legado de origem incerta impede a migracao sem tocar no ativo`, (t) => {
    const contexto = ambiente({ legado: 'incerto' }, t);
    const antes = readFileSync(contexto.caminhos.site, 'utf8');
    const resultado = executar(script, contexto);
    assert.notEqual(resultado.status, 0, 'o script aceitou migrar um site legado de origem desconhecida');
    assert.match(resultado.stderr, /origem incerta/iu, 'a recusa nao foi a da origem incerta');
    assert.equal(readFileSync(contexto.caminhos.site, 'utf8'), antes);
    assert.equal(lstatSync(contexto.caminhos.linkLegado).isSymbolicLink(), true);
  });
}
