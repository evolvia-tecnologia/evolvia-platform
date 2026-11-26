/**
 * Contrato do verificador do build servido (#571).
 *
 * Sem rede: `avaliar` e puro e `executar` recebe o `fetch` por parametro. Um
 * teste que dependesse da homologacao mediria a homologacao, nao o verificador.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAMINHO_PADRAO, MINIMO_DO_SHA, MOTIVOS,
  avaliar, decidirEntrada, executar, lerArgumentos,
} from './validate-served-sha.mjs';

const SHA = 'ab02d8d859f29061ff45ec0ebfc27f17aa0ffe3a';
const URL_BASE = 'https://homologacao.evolviatecnologia.com';

const resposta = (status, corpo) => ({
  status,
  text: async () => (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
});

// ------------------------------------------------------------- a entrada

test('le --chave valor e --chave=valor, e tem caminho padrao', () => {
  const a = lerArgumentos(['--url', URL_BASE, '--sha', SHA]);
  assert.equal(a.url, URL_BASE);
  assert.equal(a.sha, SHA);
  assert.equal(a.caminho, CAMINHO_PADRAO);
  const b = lerArgumentos([`--url=${URL_BASE}`, `--sha=${SHA}`, '--caminho=/health/ready']);
  assert.equal(b.caminho, '/health/ready');
});

test('url invalida e recusada antes de qualquer rede', () => {
  for (const url of [undefined, '', 'nao-e-url', 'ftp://exemplo.org', 'homologacao.evolviatecnologia.com']) {
    const d = decidirEntrada({ url, sha: SHA, caminho: CAMINHO_PADRAO });
    assert.equal(d.autorizado, false, `aceitou ${String(url)}`);
    assert.equal(d.motivo, MOTIVOS.url_invalida);
  }
});

test('sha invalido e recusado, e abreviacao valida e aceita', () => {
  for (const sha of [undefined, '', 'nao-hex', 'ab02d8', 'z'.repeat(40), `${SHA}0`]) {
    const d = decidirEntrada({ url: URL_BASE, sha, caminho: CAMINHO_PADRAO });
    assert.equal(d.autorizado, false, `aceitou ${String(sha)}`);
    assert.equal(d.motivo, MOTIVOS.sha_invalido);
  }
  // O diretorio de backup do Nginx carrega 12 caracteres; o minimo e 7.
  assert.equal(decidirEntrada({ url: URL_BASE, sha: SHA.slice(0, 12) }).autorizado, true);
  assert.equal(decidirEntrada({ url: URL_BASE, sha: SHA.slice(0, MINIMO_DO_SHA) }).autorizado, true);
});

test('sha em maiusculas nao faz a conferencia falhar por caixa', () => {
  const d = decidirEntrada({ url: URL_BASE, sha: SHA.toUpperCase() });
  assert.equal(d.autorizado, true);
  assert.equal(d.sha, SHA, 'o sha deveria ter sido normalizado para minusculas');
});

test('o alvo e montado sobre a URL base, sem perder o caminho', () => {
  assert.equal(
    decidirEntrada({ url: URL_BASE, sha: SHA }).alvo,
    `${URL_BASE}${CAMINHO_PADRAO}`,
  );
  assert.equal(
    decidirEntrada({ url: `${URL_BASE}/`, sha: SHA, caminho: '/health/ready' }).alvo,
    `${URL_BASE}/health/ready`,
  );
});

// -------------------------------------------------------------- o veredito

test('build igual ao esperado passa, inclusive por abreviacao', () => {
  assert.equal(avaliar({ status: 200, corpo: { build: SHA }, shaEsperado: SHA }).ok, true);
  assert.equal(avaliar({ status: 200, corpo: { build: SHA }, shaEsperado: SHA.slice(0, 12) }).ok, true);
  assert.equal(avaliar({ status: 200, corpo: { build: SHA.toUpperCase() }, shaEsperado: SHA }).ok, true);
});

test('campo "build" ausente NAO passa', () => {
  // Este e o caso que importa: a resposta de antes da mudanca. Um verificador
  // que ignorasse a ausencia daria verde justamente contra o build antigo.
  const r = avaliar({
    status: 200,
    corpo: { status: 'ready', service: 'evolvia-api', version: '0.2.0-alpha.3', dependencies: { database: 'ok' } },
    shaEsperado: SHA,
  });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /nao tem o campo "build"/u);
});

test('build "desconhecido" NAO passa, e manda reconstruir', () => {
  const r = avaliar({ status: 200, corpo: { build: 'desconhecido' }, shaEsperado: SHA });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /sem EVOLVIA_BUILD_SHA/u);
});

test('build divergente NAO passa, e diz os dois valores', () => {
  const outro = '371a8afe27a96a5e5da994f92454fe5bac8bbfe7';
  const r = avaliar({ status: 200, corpo: { build: outro }, shaEsperado: SHA });
  assert.equal(r.ok, false);
  assert.ok(r.motivo.includes(outro) && r.motivo.includes(SHA),
    'a mensagem tem de carregar o servido E o esperado, senao nao da para agir');
});

test('prefixo parcial nao e aceito como igualdade ao contrario', () => {
  // Esperar o SHA longo e receber o curto NAO pode passar: o servidor e quem
  // tem de ser especifico, nao o verificador.
  const r = avaliar({ status: 200, corpo: { build: SHA.slice(0, 12) }, shaEsperado: SHA });
  assert.equal(r.ok, false);
});

test('status diferente de 200 e corpo nao-JSON nao passam', () => {
  assert.equal(avaliar({ status: 503, corpo: { build: SHA }, shaEsperado: SHA }).ok, false);
  assert.equal(avaliar({ status: 200, corpo: null, shaEsperado: SHA }).ok, false);
  assert.equal(avaliar({ status: 200, corpo: 'texto', shaEsperado: SHA }).ok, false);
});

// --------------------------------------------------------------- a CLI

test('executar devolve 0 e informa o alvo quando confere', async () => {
  const saida = [];
  const erro = [];
  const codigo = await executar(['--url', URL_BASE, '--sha', SHA],
    (t) => saida.push(t), (t) => erro.push(t),
    async () => resposta(200, { status: 'ready', build: SHA }));
  assert.equal(codigo, 0);
  assert.equal(erro.length, 0);
  assert.ok(saida[0].includes(SHA) && saida[0].includes(CAMINHO_PADRAO));
});

test('executar devolve 1 quando o build diverge, sem escrever na saida padrao', async () => {
  const saida = [];
  const erro = [];
  const codigo = await executar(['--url', URL_BASE, '--sha', SHA],
    (t) => saida.push(t), (t) => erro.push(t),
    async () => resposta(200, { build: '0'.repeat(40) }));
  assert.equal(codigo, 1);
  assert.equal(saida.length, 0, 'nao pode dizer nada na saida padrao numa recusa');
  assert.match(erro[0], /Build servido/u);
});

test('executar devolve 1 quando a rede falha, dizendo o alvo', async () => {
  const erro = [];
  const codigo = await executar(['--url', URL_BASE, '--sha', SHA],
    () => {}, (t) => erro.push(t),
    async () => { throw new Error('getaddrinfo ENOTFOUND'); });
  assert.equal(codigo, 1);
  assert.match(erro[0], /Nao foi possivel alcancar/u);
  assert.match(erro[0], /ENOTFOUND/u);
});

test('executar busca exatamente a URL decidida, uma vez', async () => {
  const alvos = [];
  await executar(['--url', URL_BASE, '--sha', SHA], () => {}, () => {},
    async (alvo) => { alvos.push(alvo); return resposta(200, { build: SHA }); });
  assert.deepEqual(alvos, [`${URL_BASE}${CAMINHO_PADRAO}`]);
});

test('entrada recusada nao chega a buscar nada', async () => {
  let buscou = false;
  const codigo = await executar(['--url', 'nao-e-url', '--sha', SHA], () => {}, () => {},
    async () => { buscou = true; return resposta(200, {}); });
  assert.equal(codigo, 1);
  assert.equal(buscou, false, 'recusa de entrada nao pode tocar a rede');
});
