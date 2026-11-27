#!/usr/bin/env node
/**
 * Fecha a janela de inscricao aberta de uma identidade Master (#571, achado A3).
 *
 * Nao executa SQL. Ele IMPRIME o SQL, e quem executa e o operador, com o
 * cliente dele. Mesma escolha de `provisionar-proprietario-master.mjs` e
 * `recuperar-acesso-master.mjs`.
 *
 * Nao ha segredo nenhum envolvido nesta operacao: revogar nao gera autorizacao,
 * so cancela a que esta pendente. Por isso a saida de erro aqui leva apenas o
 * resumo, e nao material sensivel.
 *
 * Uso:
 *   node scripts/revogar-inscricao-master.mjs \
 *     --email titular@exemplo.org \
 *     --identidade cmasteridentidade... \
 *     --nota "Canal de entrega do segredo comprometido, chamado CH-7" \
 *     --correlacao ch-7 \
 *     --confirmar-host homologacao-db \
 *     --confirmar-revogacao > revogacao.sql
 *   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f revogacao.sql
 *
 * Depois de revogar, abrir uma janela nova e o caminho normal:
 * `recuperar-acesso-master.mjs`. A guarda de janela unica da abertura passa a
 * deixar, porque nao ha mais autorizacao em aberto.
 */

import { chamadoDiretamente } from './lib/execucao-direta.mjs';
import { decidirEntrada, lerArgumentos, montarSql } from './revogar-inscricao-master.policy.mjs';

export function executar(argv, env, saida, erro) {
  const entrada = lerArgumentos(argv);
  const decisao = decidirEntrada(entrada, env);
  if (!decisao.autorizado) {
    erro(decisao.motivo);
    return 1;
  }

  saida(montarSql({
    email: entrada.email,
    identidade: entrada.identidade,
    nota: entrada.nota,
    correlacao: entrada.correlacao,
  }));

  erro('');
  erro('--------------------------------------------------------------------');
  erro(`Alvo conferido ...... host ${decisao.host}`);
  erro(`Titular ............. ${entrada.email}`);
  erro(`Identidade .......... ${entrada.identidade}`);
  erro('');
  erro('O SQL acima revoga as autorizacoes ABERTAS desta identidade e registra');
  erro('a trilha na mesma transacao. Se nao houver nenhuma aberta, ele FALHA em');
  erro('vez de sair em silencio — zero linhas afetadas nao e sucesso.');
  erro('');
  erro('Nao apaga credencial nem encerra sessao. Para isso, o comando e');
  erro('recuperar-acesso-master.mjs --finalidade recuperacao.');
  erro('--------------------------------------------------------------------');
  return 0;
}

if (chamadoDiretamente(import.meta.url, process.argv[1])) {
  // `process.exitCode`, nao `process.exit`: o SQL vai para a saida padrao, e
  // `process.exit` pode encerrar antes de o buffer esvaziar quando a saida e um
  // cano. SQL truncado que executa pela metade e pior que erro.
  process.exitCode = executar(
    process.argv.slice(2),
    process.env,
    (linha) => process.stdout.write(`${linha}\n`),
    (linha) => process.stderr.write(`${linha}\n`),
  );
}
