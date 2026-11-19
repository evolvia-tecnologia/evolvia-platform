#!/usr/bin/env node
// Gera o SQL que faz nascer o primeiro proprietário da Área Master (#665).
//
// NÃO escreve no banco. A saída é SQL, para que o operador LEIA antes de
// executar — provisionamento de poder não deve acontecer por efeito colateral
// de um comando que ninguém inspecionou.
//
// Uso:
//   node scripts/provisionar-proprietario-master.mjs \
//     --email rosberg@exemplo.com \
//     --nota "Autorizado pelo proprietário do CNPJ em 18/11/2026" \
//     --confirmar-host db.homologacao.interno > /tmp/master.sql
//   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/master.sql
//
// `--confirmar-host` tem de ser igual ao host do DATABASE_URL em uso. É o que
// impede rodar contra o banco errado por engano.
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { decidirEntrada, montarSql } from './provisionar-proprietario-master.policy.mjs';

/** Opções desta linha de comando, declaradas uma vez. */
const OPCOES = {
  email: { type: 'string' },
  nota: { type: 'string' },
  'confirmar-host': { type: 'string' },
  'permitir-segundo-proprietario': { type: 'boolean' },
};

/**
 * `parseArgs` de `node:util` em vez de laço próprio: `--chave valor` e
 * `--chave=valor` passam a ser tratados pela biblioteca, não por regex local.
 *
 * `strict: false` de propósito — argumento desconhecido não derruba o processo
 * aqui; quem decide o que falta é `decidirEntrada`, com mensagem em português,
 * e não um erro de parser.
 *
 * A coerção para texto não é enfeite: medi o comportamento e `--email` sem
 * valor devolve o BOOLEANO `true`, não string. Repassar isso adiante colocaria
 * um booleano onde o resto do módulo espera texto. Só string sobrevive; o resto
 * vira `undefined` e é recusado como ausente, que é o `deny-by-default` do
 * módulo.
 */
const soTexto = (v) => (typeof v === 'string' ? v : undefined);

export function lerArgumentos(argv) {
  const { values } = parseArgs({ args: argv, options: OPCOES, strict: false });
  return {
    email: soTexto(values.email),
    nota: soTexto(values.nota),
    hostConfirmado: soTexto(values['confirmar-host']),
    permitirSegundoProprietario: values['permitir-segundo-proprietario'] === true,
  };
}

/** Identificador da operação na trilha. Sem relógio no nome do arquivo para
 *  não sugerir que duas execuções no mesmo minuto sejam a mesma operação. */
export function correlacaoDe(agora = new Date(), aleatorio = Math.random) {
  const dia = agora.toISOString().slice(0, 10).replaceAll('-', '');
  const sufixo = Math.floor(aleatorio() * 1e6).toString().padStart(6, '0');
  return `bootstrap-master-${dia}-${sufixo}`;
}

export function executar(argv, env, saida, erro) {
  const args = lerArgumentos(argv);
  const decisao = decidirEntrada({
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    hostConfirmado: args.hostConfirmado,
    email: args.email,
    nota: args.nota,
  });

  if (!decisao.permitido) {
    erro(`${decisao.mensagem}\n`);
    return 1;
  }

  saida(montarSql({
    email: decisao.email,
    nota: decisao.nota,
    permitirSegundoProprietario: args.permitirSegundoProprietario,
    correlacao: correlacaoDe(),
  }));
  // Para stderr, de propósito: assim `> arquivo.sql` recebe só o SQL.
  erro(`\n-- Alvo conferido: host ${decisao.host}. Revise o SQL acima antes de executar.\n`);
  return 0;
}

/**
 * Executado diretamente? Comparar `import.meta.url` com `file://${argv[1]}`
 * montado à mão erra no Windows, onde o caminho usa `\\` e a URL de arquivo
 * leva letra de unidade — a igualdade simplesmente nunca dá certo, e o script
 * não roda. `fileURLToPath` faz a conversão na direção certa, e `resolve`
 * cobre a invocação por caminho relativo, em que `argv[1]` não vem absoluto.
 */
export function chamadoDiretamente(urlDoModulo, caminhoDoArgv) {
  if (typeof caminhoDoArgv !== 'string' || caminhoDoArgv === '') return false;
  try {
    return fileURLToPath(urlDoModulo) === resolve(caminhoDoArgv);
  } catch {
    return false;
  }
}

if (chamadoDiretamente(import.meta.url, process.argv[1])) {
  process.exitCode = executar(
    process.argv.slice(2),
    process.env,
    (t) => process.stdout.write(t),
    (t) => process.stderr.write(t),
  );
}
