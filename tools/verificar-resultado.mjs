#!/usr/bin/env node
/**
 * Guarda de resultado em nivel de PROCESSO.
 *
 * Por que isto existe
 * -------------------
 * A revisao independente registrada na issue #571 (comentario de 16h BRT de
 * 03/11/2026) apontou: "corrigir reporter Playwright (retorno de onEnd nao
 * define exit code)".
 *
 * Fui medir, em vez de discutir. Com o Playwright **1.63.0** instalado nesta
 * maquina, devolver `{ status: 'failed' }` de `onEnd` DEFINE o exit code: um
 * caso que passa termina com exit 1 e a saida ainda diz "1 passed". Testei
 * quatro cenarios, inclusive com o relator declarado depois do `list`, e o
 * comportamento nao muda com a ordem.
 *
 * MAS a critica pode estar certa para a versao que importa: o
 * tests/e2e/package.json fixa `@playwright/test` em **1.49.1**, e eu nao
 * consegui instalar essa versao para testar -- npm esta inacessivel neste
 * ambiente por DNS (bloqueio B1, registrado na #571). Ou seja: provei 1.63.0,
 * NAO provei 1.49.1.
 *
 * Diante disso, a resposta correta nao e defender o mecanismo nem reescrever o
 * relator no escuro: e **remover a dependencia da pergunta**. Este guarda roda
 * como processo separado, le o resultados.json e sai com codigo != 0 pelas
 * mesmas duas regras do relator. Funciona em qualquer versao, porque nao usa
 * API de relator nenhuma.
 *
 * O relator continua fazendo a leitura humana e a conversao de SKIP; este
 * arquivo garante que a CONSEQUENCIA aconteca. Cinto e suspensorio, de
 * proposito: o relator explica, o guarda reprova.
 *
 * Um risco que a medicao revelou, e que vale registrar
 * ----------------------------------------------------
 * A sobreposicao de `onEnd` e BIDIRECIONAL. Um relator que devolvesse
 * `{ status: 'passed' }` mascararia falha real: medi, e um caso que FALHA
 * termina com exit 0. Por isso o relator nunca deve devolver 'passed' -- e
 * por isso este guarda e independente dele.
 *
 * Uso
 * ---
 *   node tools/verificar-resultado.mjs [caminho/do/resultados.json]
 *
 * Saida 0 = evidencia aceitavel. Saida 1 = execucao reprovada, com motivo.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');
const CAMINHO_PADRAO = join(RAIZ, 'tests', 'e2e', 'resultados.json');
const CAMINHO_GATES = join(RAIZ, 'tests', 'e2e', 'support', 'gates.ts');

/**
 * Copia da lista de gates obrigatorios. A FONTE e support/gates.ts; esta copia
 * existe porque este arquivo e .mjs e nao importa TypeScript.
 *
 * Para que a copia nao se desatualize em silencio -- que seria o mesmo defeito
 * de verde falso que a suite inteira combate -- a funcao conferirSincronia()
 * abaixo le o gates.ts como TEXTO e compara as duas listas. Divergencia
 * REPROVA, com os dois conjuntos impressos.
 */
const GATES_OBRIGATORIOS = [
  '@gate-etiqueta',
  '@gate-compra',
  '@gate-consentimento',
  '@gate-permissao',
];

const problemas = [];
const avisos = [];

function conferirSincronia() {
  if (!existsSync(CAMINHO_GATES)) {
    problemas.push(`nao encontrei ${CAMINHO_GATES}; nao e seguro validar gates sem a fonte de verdade`);
    return;
  }
  const texto = readFileSync(CAMINHO_GATES, 'utf8');
  const bloco = texto.match(/GATES_OBRIGATORIOS\s*=\s*\[([\s\S]*?)\]/u);
  if (!bloco) {
    problemas.push('nao consegui extrair GATES_OBRIGATORIOS de gates.ts; validacao recusada para evitar falso verde');
    return;
  }
  const naFonte = [...bloco[1].matchAll(/'(@gate-[a-z-]+)'/gu)].map((m) => m[1]);
  const faltando = naFonte.filter((g) => !GATES_OBRIGATORIOS.includes(g));
  const sobrando = GATES_OBRIGATORIOS.filter((g) => !naFonte.includes(g));
  if (faltando.length || sobrando.length) {
    problemas.push(
      'a lista de gates deste guarda divergiu de support/gates.ts.\n'
      + `    em gates.ts e nao aqui: ${faltando.join(', ') || '(nenhum)'}\n`
      + `    aqui e nao em gates.ts: ${sobrando.join(', ') || '(nenhum)'}\n`
      + '    Sincronize as duas listas. Divergencia silenciosa deixaria um gate '
      + 'obrigatorio passar sem consequencia.',
    );
  }
}

/** Percorre a arvore de suites do relator json e devolve os casos achatados. */
function casosDo(relatorio) {
  const casos = [];
  const andar = (suite) => {
    for (const filha of suite.suites ?? []) andar(filha);
    for (const spec of suite.specs ?? []) {
      for (const teste of spec.tests ?? []) {
        const ultimo = teste.results?.[teste.results.length - 1];
        casos.push({
          titulo: spec.title ?? '(sem titulo)',
          etiquetas: `${suite.title ?? ''} ${spec.title ?? ''}`,
          status: ultimo?.status ?? 'sem-resultado',
          motivo: (ultimo?.annotations ?? teste.annotations ?? [])
            .find((a) => a.type === 'skip')?.description ?? '',
          projeto: teste.projectName || '-',
        });
      }
    }
  };
  for (const suite of relatorio.suites ?? []) andar(suite);
  return casos;
}

function main() {
  const caminho = process.argv[2] ? resolve(process.argv[2]) : CAMINHO_PADRAO;

  conferirSincronia();

  if (!existsSync(caminho)) {
    problemas.push(
      `nao existe ${caminho}.\n`
      + '    Uma execucao que nao produz resultados.json nao produziu evidencia. '
      + 'Causas usuais: o processo morreu antes do relator json, ou o '
      + 'outputFile do config nao e este caminho.',
    );
    return relatar(null);
  }

  let relatorio;
  try {
    relatorio = JSON.parse(readFileSync(caminho, 'utf8'));
  } catch (erro) {
    problemas.push(`${caminho} nao e JSON valido: ${erro.message}`);
    return relatar(null);
  }

  const casos = casosDo(relatorio);

  // Regra 1: suite vazia nao e suite verde.
  if (casos.length === 0) {
    problemas.push(
      'NENHUM caso executado.\n'
      + '    Zero teste nao e evidencia de conformidade. Causas usuais: erro de '
      + 'compilacao num spec ou em support/, --grep sem correspondencia, ou '
      + 'testDir errado.',
    );
  }

  // Regra 2: SKIP em gate obrigatorio e falha.
  const gatesPulados = casos.filter((c) => c.status === 'skipped'
    && GATES_OBRIGATORIOS.some((gate) => c.etiquetas.includes(gate)));
  if (gatesPulados.length) {
    problemas.push(
      `${gatesPulados.length} caso(s) de GATE OBRIGATORIO terminaram em SKIP:\n`
      + gatesPulados.map((c) => `      - [${c.projeto}] ${c.titulo}\n          ${c.motivo || 'motivo nao declarado'}`).join('\n')
      + '\n    Um gate obrigatorio sem execucao nao e evidencia de conformidade. '
      + 'Forneca a fixture ou retire a etiqueta, com justificativa na issue #571.',
    );
  }

  // Nao e problema deste guarda, mas precisa aparecer: falhas reais.
  const falhas = casos.filter((c) => c.status !== 'passed' && c.status !== 'skipped');
  if (falhas.length) {
    avisos.push(`${falhas.length} caso(s) falharam na execucao; o Playwright ja reprova por isso`);
  }
  const pulados = casos.filter((c) => c.status === 'skipped').length - gatesPulados.length;

  relatar({
    total: casos.length,
    passaram: casos.filter((c) => c.status === 'passed').length,
    falhas: falhas.length,
    pulados,
    gatesPulados: gatesPulados.length,
  });
}

function relatar(resumo) {
  const linha = '-'.repeat(60);
  console.log(`\n${linha}\n[Evolvia QA] guarda de resultado (independente do relator)\n${linha}`);
  if (resumo) {
    console.log(`  casos: ${resumo.total}   passaram: ${resumo.passaram}   falharam: ${resumo.falhas}`);
    console.log(`  pulados declarados: ${resumo.pulados}   em gate obrigatorio: ${resumo.gatesPulados}`);
  }
  for (const aviso of avisos) console.log(`  aviso: ${aviso}`);
  if (problemas.length) {
    console.log('\n  REPROVADO:');
    for (const p of problemas) console.log(`    - ${p}`);
    console.log(`${linha}\n`);
    process.exit(1);
  }
  console.log('\n  Evidencia aceitavel pelas regras deste guarda.');
  console.log(`${linha}\n`);
  process.exit(0);
}

main();
