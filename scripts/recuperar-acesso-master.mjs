#!/usr/bin/env node
/**
 * Abre inscricao de autenticador da Area Master: bootstrap ou recuperacao (#690).
 *
 * Nao executa SQL. Ele IMPRIME o SQL, e quem executa e o operador, com o
 * cliente dele. Mesma escolha de `provisionar-proprietario-master.mjs`: um
 * script que se conecta ao banco precisa de credencial, e credencial em script
 * e o que o fundador proibiu.
 *
 * O SQL vai para a SAIDA PADRAO; o segredo e as instrucoes vao para a SAIDA DE
 * ERRO. A separacao e deliberada e tem consequencia pratica: com
 *
 *     node scripts/recuperar-acesso-master.mjs ... > janela.sql
 *
 * o arquivo contem o SQL e NAO contem o segredo. Juntar os dois faria o segredo
 * ficar no arquivo, e provavelmente no histórico do shell e no backup.
 *
 * Uso:
 *   node scripts/recuperar-acesso-master.mjs \
 *     --finalidade bootstrap \
 *     --email titular@exemplo.org \
 *     --identidade cmasteridentidade... \
 *     --nota "Autorizado pelo fundador, chamado CH-1" \
 *     --correlacao ch-1 \
 *     --minutos 15 \
 *     --confirmar-host homologacao-db \
 *     --confirmar-bootstrap
 */

import { randomBytes } from 'node:crypto';
import { chamadoDiretamente } from './lib/execucao-direta.mjs';
import { decidirEntrada, lerArgumentos, montarSql } from './recuperar-acesso-master.policy.mjs';

/** 32 bytes. Em base64url da 43 caracteres, que e o minimo exigido. */
const gerarSegredo = () => randomBytes(32).toString('base64url');

export function executar(argv, env, saida, erro) {
  const entrada = lerArgumentos(argv);
  const decisao = decidirEntrada(entrada, env);
  if (!decisao.autorizado) {
    erro(decisao.motivo);
    return 1;
  }

  // `--finalidade recuperacao` em portugues, `RECOVERY` na coluna: a traducao
  // acontece aqui, uma vez, e nao espalhada pelo SQL.
  const finalidade = entrada.finalidade === 'RECUPERACAO' || entrada.finalidade === 'RECOVERY'
    ? 'RECOVERY'
    : 'BOOTSTRAP';

  const segredo = gerarSegredo();
  const sql = montarSql({
    finalidade,
    email: entrada.email,
    identidade: entrada.identidade,
    nota: entrada.nota,
    correlacao: entrada.correlacao,
    minutos: entrada.minutos,
    segredo,
  });

  saida(sql);

  erro('');
  erro('--------------------------------------------------------------------');
  erro(`Finalidade .......... ${finalidade}`);
  erro(`Titular ............. ${entrada.email}`);
  erro(`Identidade .......... ${entrada.identidade}`);
  erro(`Janela .............. ${entrada.minutos} minuto(s) a partir do COMMIT`);
  erro('');
  erro('SEGREDO DE INSCRICAO (aparece UMA vez; o banco guarda so o digest):');
  erro('');
  erro(`    ${segredo}`);
  erro('');
  erro('Entregue este segredo ao titular por canal fora de banda. Ele NAO esta');
  erro('no SQL acima, nao fica no banco e nao pode ser recuperado depois.');
  if (finalidade === 'RECOVERY') {
    erro('');
    erro('ATENCAO: ao executar, os autenticadores desta identidade serao');
    erro('APAGADOS e as sessoes abertas serao revogadas. Se o titular ainda tem');
    erro('acesso a alguma chave, prefira registrar a chave de reserva pela');
    erro('Area Master em vez de recuperar.');
  }
  erro('--------------------------------------------------------------------');
  return 0;
}

if (chamadoDiretamente(import.meta.url, process.argv[1])) {
  // `process.exitCode`, nao `process.exit`: o SQL vai para a saida padrao, e
  // `process.exit` pode encerrar antes de o buffer esvaziar quando a saida e um
  // cano (`| psql`). SQL truncado que executa pela metade e pior que erro.
  process.exitCode = executar(
    process.argv.slice(2),
    process.env,
    (linha) => process.stdout.write(`${linha}\n`),
    (linha) => process.stderr.write(`${linha}\n`),
  );
}
