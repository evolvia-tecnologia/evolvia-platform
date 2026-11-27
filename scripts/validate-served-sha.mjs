#!/usr/bin/env node
/**
 * Confere QUAL build a homologacao esta servindo (#571).
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * ---------------------------
 * Ate 26/11 nao havia como, de fora do host, saber qual SHA estava servido.
 * `/health` respondia `version: '0.2.0-alpha.3'`, uma constante de codigo, e
 * `validate-readiness-contract.mjs` nao exigia campo de build. O SHA implantado
 * ficava apenas no nome do diretorio de backup que `apply-staging-nginx.sh`
 * cria no host — legivel por quem tem o host, por mais ninguem.
 *
 * A consequencia nao era de diagnostico, era de ACEITE: sem identificar o build
 * servido, nenhum ensaio e atribuivel a um commit. A evidencia diz "funcionou",
 * e nao diz contra o que. E aceite nao atribuivel nao fecha critério.
 *
 * O Dockerfile passou a assar `EVOLVIA_BUILD_SHA` na imagem e o
 * `health.controller` a responde-lo em `build`. Este script e o verificador.
 *
 * O QUE ELE NAO FAZ
 * -----------------
 * Nao prova que o deploy aconteceu, nao prova que o CI passou e nao prova
 * aceite. Prova uma coisa so, e e a que faltava: o processo que atende naquela
 * URL foi construido a partir daquele commit.
 *
 * Uso:
 *   node scripts/validate-served-sha.mjs \
 *     --url https://homologacao.evolviatecnologia.com \
 *     --sha ab02d8d859f29061ff45ec0ebfc27f17aa0ffe3a
 *
 * No CI, com o SHA da propria execucao:
 *   node scripts/validate-served-sha.mjs --url "$HOMOLOGATION_URL" --sha "$GITHUB_SHA"
 */

import { parseArgs } from 'node:util';
import { chamadoDiretamente } from './lib/execucao-direta.mjs';

/** Caminho publico da rota de saude atras do proxy. */
export const CAMINHO_PADRAO = '/api/health/ready';

/** Minimo de uma abreviacao de SHA que ainda identifica um commit sem ambiguidade
 *  pratica num repositorio deste tamanho. O diretorio de backup do Nginx usa 12. */
export const MINIMO_DO_SHA = 7;

const SHA = /^[0-9a-f]{7,40}$/u;

export const MOTIVOS = Object.freeze({
  url_invalida:
    'Recusado: informe --url com a URL base publica, por exemplo https://homologacao.evolviatecnologia.com.',
  sha_invalido:
    `Recusado: informe --sha com de ${MINIMO_DO_SHA} a 40 caracteres hexadecimais minusculos.`,
});

export function lerArgumentos(argv) {
  try {
    const { values } = parseArgs({ args: argv, strict: true, allowPositionals: false,
      options: { url: { type: 'string' }, sha: { type: 'string' }, caminho: { type: 'string' } } });
    return { url: values.url ?? null, sha: values.sha ?? null, caminho: values.caminho ?? CAMINHO_PADRAO };
  } catch {
    return { url: null, sha: null, caminho: CAMINHO_PADRAO };
  }
}

export function decidirEntrada(entrada) {
  let base;
  try {
    base = new URL(entrada.url);
  } catch {
    return { autorizado: false, motivo: MOTIVOS.url_invalida };
  }
  if (base.protocol !== 'https:' && base.protocol !== 'http:') {
    return { autorizado: false, motivo: MOTIVOS.url_invalida };
  }
  // Minusculas de proposito: `git rev-parse` devolve minusculo, e aceitar
  // maiuscula faria a comparacao falhar por caixa num caso que esta correto.
  const sha = typeof entrada.sha === 'string' ? entrada.sha.trim().toLowerCase() : '';
  if (!SHA.test(sha)) return { autorizado: false, motivo: MOTIVOS.sha_invalido };
  if (base.username || base.password || base.search || base.hash) return { autorizado: false, motivo: MOTIVOS.url_invalida };
  const caminho = typeof entrada.caminho === 'string' && entrada.caminho.startsWith('/')
    ? entrada.caminho
    : CAMINHO_PADRAO;
  let alvo;
  try { alvo = new URL(caminho, base); } catch { return { autorizado: false, motivo: MOTIVOS.url_invalida }; }
  if (alvo.origin !== base.origin || alvo.username || alvo.password || alvo.search || alvo.hash) {
    return { autorizado: false, motivo: MOTIVOS.url_invalida };
  }
  return { autorizado: true, alvo: alvo.toString(), sha };
}

/**
 * Decide a partir da resposta. Puro, para ter teste sem rede.
 *
 * Cada recusa tem motivo proprio porque as acoes sao diferentes: build ausente
 * manda republicar com a imagem nova; `desconhecido` manda construir passando o
 * argumento; divergente manda investigar cache ou conteiner que nao reiniciou.
 * Uma mensagem unica obrigaria quem le a abrir o codigo para saber qual era.
 */
export function avaliar({ status, corpo, shaEsperado }) {
  if (status !== 200) {
    return { ok: false, motivo: `A rota respondeu ${status}, e nao 200. Nao da para afirmar o build servido.` };
  }
  if (corpo === null || typeof corpo !== 'object') {
    return { ok: false, motivo: 'A resposta nao e JSON de objeto. Nao da para afirmar o build servido.' };
  }
  const build = corpo.build;
  if (typeof build !== 'string' || build.length === 0) {
    // Campo ausente NAO passa. Um verificador que ignorasse a ausencia daria
    // verde justamente contra o build antigo, que e o caso que interessa pegar.
    return {
      ok: false,
      motivo: 'A resposta nao tem o campo "build". O que esta servido e anterior a exposicao do SHA, ou nao e esta API.',
    };
  }
  if (build === 'desconhecido') {
    return {
      ok: false,
      motivo: 'A imagem servida foi construida sem EVOLVIA_BUILD_SHA. Reconstrua passando o argumento de build.',
    };
  }
  if (build.length !== 40 || !/^[0-9a-f]{40}$/iu.test(build)) {
    return { ok: false, motivo: 'O build servido precisa conter um SHA completo de 40 caracteres hexadecimais.' };
  }
  if (!build.toLowerCase().startsWith(shaEsperado)) {
    return {
      ok: false,
      motivo: `Build servido ${build}, esperado ${shaEsperado}. Imagem do cache, conteiner nao reiniciado, ou deploy de outro commit.`,
    };
  }
  return { ok: true, build };
}

export async function executar(argv, saida, erro, buscar = fetch) {
  const decisao = decidirEntrada(lerArgumentos(argv));
  if (!decisao.autorizado) {
    erro(decisao.motivo);
    return 1;
  }

  let status;
  let corpo = null;
  try {
    const resposta = await buscar(decisao.alvo, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { accept: 'application/json' } });
    status = resposta.status;
    const texto = await resposta.text();
    try {
      corpo = JSON.parse(texto);
    } catch {
      corpo = null;
    }
  } catch (causa) {
    erro(`Nao foi possivel alcancar ${decisao.alvo}: ${causa instanceof Error ? causa.message : String(causa)}`);
    return 1;
  }

  const veredito = avaliar({ status, corpo, shaEsperado: decisao.sha });
  if (!veredito.ok) {
    erro(veredito.motivo);
    return 1;
  }
  saida(`Build servido conferido em ${decisao.alvo}: ${veredito.build}`);
  return 0;
}

if (chamadoDiretamente(import.meta.url, process.argv[1])) {
  process.exitCode = await executar(
    process.argv.slice(2),
    (linha) => process.stdout.write(`${linha}\n`),
    (linha) => process.stderr.write(`${linha}\n`),
  );
}
