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
import { decidirEntrada, montarSql } from './provisionar-proprietario-master.policy.mjs';

export function lerArgumentos(argv) {
  const lido = { permitirSegundoProprietario: false };
  for (let i = 0; i < argv.length; i += 1) {
    const atual = argv[i];
    if (atual === '--permitir-segundo-proprietario') { lido.permitirSegundoProprietario = true; continue; }
    const par = /^--([a-z-]+)=(.*)$/u.exec(atual ?? '');
    const chave = par ? par[1] : (atual ?? '').replace(/^--/u, '');
    const valor = par ? par[2] : argv[i + 1];
    if (!par && atual?.startsWith('--')) i += 1;
    if (chave === 'email') lido.email = valor;
    else if (chave === 'nota') lido.nota = valor;
    else if (chave === 'confirmar-host') lido.hostConfirmado = valor;
  }
  return lido;
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

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = executar(
    process.argv.slice(2),
    process.env,
    (t) => process.stdout.write(t),
    (t) => process.stderr.write(t),
  );
}
