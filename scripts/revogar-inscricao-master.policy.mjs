/**
 * Revogacao de janela de inscricao da Area Master (#571, achado A3).
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * ---------------------------
 * `PlatformMasterEnrollmentWindow.revokedAt` era honrado na LEITURA em cinco
 * lugares — quatro no servico e um no SQL de abertura — e nao era escrito por
 * nenhum caminho de producao. A unica escrita no repositorio estava numa
 * fixture de teste. Medido em 26/11 sobre o HEAD 02514d0b da #740.
 *
 * O efeito pratico: operador que abriu janela para a pessoa errada, com a nota
 * errada, ou depois de descobrir que o canal de entrega do segredo vazou, nao
 * tinha operacao para cancela-la. Restava esperar o vencimento — ate 60 minutos
 * com um segredo valido em transito — ou escrever UPDATE a mao em producao, que
 * e exatamente o que os scripts desta familia existem para evitar.
 *
 * Revogacao aplicada e revogacao nao operavel nao sao a mesma coisa.
 *
 * O QUE ELE FAZ, E O QUE NAO FAZ
 * ------------------------------
 * NAO escreve no banco. Imprime SQL, para o operador LER antes de executar —
 * mesma escolha de `provisionar-proprietario-master.mjs` e
 * `recuperar-acesso-master.mjs`, e mesma razao: script que se conecta ao banco
 * precisa de credencial, e credencial em script e o que o fundador proibiu.
 *
 * NAO apaga credencial, NAO encerra sessao, NAO toca identidade. Ele fecha a
 * autorizacao pendente e mais nada. Confundir revogar janela com recuperar
 * acesso foi a razao de separar os dois comandos: recuperar APAGA
 * autenticadores, e ninguem deve chegar nesse efeito querendo cancelar um
 * convite.
 *
 * DUAS DIFERENCAS DELIBERADAS EM RELACAO A ABERTURA
 * -------------------------------------------------
 *  1. Identidade SUSPENDED tambem pode ter janela revogada. Abrir para
 *     identidade suspensa devolveria acesso por via indireta e por isso e
 *     recusado la; FECHAR uma autorizacao pendente e sempre seguro, e exigir
 *     ACTIVE aqui deixaria sem recurso justamente o caso em que alguem
 *     suspendeu a identidade por suspeita.
 *  2. Nao recebe `--finalidade`. A intencao do operador e "cancele o que esta
 *     em aberto", e o digest que liga segredo a finalidade nao esta disponivel
 *     para ele. A guarda de janela unica da abertura ja faz desse conjunto, na
 *     pratica, uma linha so; o SQL devolve a contagem em vez de supor.
 */

import { randomInt } from 'node:crypto';
import { hostDoBanco, pareceProducao } from './recuperar-acesso-master.policy.mjs';

/** Marca de dollar-quoting deste bloco. Nenhum valor pode conte-la. */
const MARCA = '$evolvia_revogacao_master$';

/** Ator desta operacao na trilha. Reusa o namespace da politica irma. */
export { ATOR_DA_INSCRICAO } from './recuperar-acesso-master.policy.mjs';
import { ATOR_DA_INSCRICAO } from './recuperar-acesso-master.policy.mjs';

export const MOTIVOS = Object.freeze({
  sem_banco:
    'Recusado: DATABASE_URL ausente ou sem host. Nao ha o que confirmar.',
  producao:
    'Recusado: producao. Esta etapa e de homologacao, e o fundador bloqueou execucao em producao aqui.',
  ambiente_nao_declarado:
    'Recusado: defina EVOLVIA_AMBIENTE=homologacao antes de revogar.',
  host_nao_confirmado:
    'Recusado: --confirmar-host precisa repetir exatamente o host do DATABASE_URL. E a guarda que impede rodar no banco errado.',
  confirmacao_ausente:
    'Recusado: falta --confirmar-revogacao. Fechar autorizacao pendente e ato deliberado, nao efeito colateral de um comando digitado pela metade.',
  confirmacao_com_valor:
    'Recusado: --confirmar-revogacao nao aceita valor. Escreva a flag sozinha. `--confirmar-revogacao=false` era lido como SIM, porque o valor apos o = era descartado — quem escreveu false autorizava. Agora e recusado, e nao reinterpretado.',
  email_invalido:
    'Recusado: informe --email do titular, em forma valida e com ate 254 caracteres.',
  identidade_invalida:
    'Recusado: informe --identidade com o id da identidade Master do titular. O SQL exige que ela pertenca a este e-mail.',
  nota_invalida:
    'Recusado: informe --nota com o registro de quem autorizou e por que, de 1 a 200 caracteres.',
  correlacao_invalida:
    'Recusado: --correlacao aceita de 1 a 64 caracteres [A-Za-z0-9_-]. E a chave que liga esta operacao a trilha.',
  valor_com_marca:
    'Recusado: valor contem a marca de delimitacao do bloco SQL.',
  valor_com_nulo:
    'Recusado: valor contem byte nulo.',
});

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;
const CORRELACAO = /^[A-Za-z0-9_-]{1,64}$/u;
const IDENTIDADE = /^[A-Za-z0-9_-]{1,64}$/u;

/** Le os argumentos. Nao decide nada: so transporta o que foi pedido. */
export function lerArgumentos(argv) {
  const entrada = {
    email: null,
    identidade: null,
    nota: null,
    correlacao: null,
    confirmarHost: null,
    confirmouRevogacao: false,
    confirmacaoComValor: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const bruto = argv[i];
    const [chave, embutido] = bruto.startsWith('--') && bruto.includes('=')
      ? [bruto.slice(0, bruto.indexOf('=')), bruto.slice(bruto.indexOf('=') + 1)]
      : [bruto, null];
    const proximo = () => (embutido !== null ? embutido : argv[(i += 1)]);
    switch (chave) {
      case '--email': entrada.email = proximo(); break;
      case '--identidade': entrada.identidade = proximo(); break;
      case '--nota': entrada.nota = proximo(); break;
      case '--correlacao': entrada.correlacao = proximo(); break;
      case '--confirmar-host': entrada.confirmarHost = proximo(); break;
      // Flag booleana. Valor embutido nao e aceito NEM reinterpretado: antes
      // este case ignorava `embutido` e marcava true, entao
      // `--confirmar-revogacao=false` autorizava a revogacao. Marcar e deixar
      // `decidirEntrada` recusar, para a recusa sair com motivo proprio.
      case '--confirmar-revogacao':
        if (embutido !== null) entrada.confirmacaoComValor = true;
        else entrada.confirmouRevogacao = true;
        break;
      default: break;
    }
  }
  return entrada;
}

const recusa = (motivo) => ({ autorizado: false, motivo });

/**
 * Decide se a operacao pode ser montada.
 *
 * A ordem das recusas repete a da abertura, e por isso: producao e host ANTES
 * de qualquer validacao de conteudo. Um comando malformado apontado para
 * producao deve ser recusado por ser producao — senao o operador corrige o
 * formato e dispara no banco errado.
 */
export function decidirEntrada(entrada, env = {}) {
  const banco = env.DATABASE_URL;
  const host = hostDoBanco(banco);
  if (host === null) return recusa(MOTIVOS.sem_banco);
  if (pareceProducao(host, new URL(banco).pathname, env.NODE_ENV, env.EVOLVIA_AMBIENTE)) {
    return recusa(MOTIVOS.producao);
  }
  if (env.EVOLVIA_AMBIENTE !== 'homologacao') return recusa(MOTIVOS.ambiente_nao_declarado);
  if (entrada.confirmarHost !== host) return recusa(MOTIVOS.host_nao_confirmado);
  if (entrada.confirmacaoComValor === true) return recusa(MOTIVOS.confirmacao_com_valor);
  if (entrada.confirmouRevogacao !== true) return recusa(MOTIVOS.confirmacao_ausente);

  if (typeof entrada.email !== 'string' || entrada.email.length > 254 || !EMAIL.test(entrada.email)) {
    return recusa(MOTIVOS.email_invalido);
  }
  if (typeof entrada.identidade !== 'string' || !IDENTIDADE.test(entrada.identidade)) {
    return recusa(MOTIVOS.identidade_invalida);
  }
  if (typeof entrada.nota !== 'string' || entrada.nota.trim().length === 0 || entrada.nota.length > 200) {
    return recusa(MOTIVOS.nota_invalida);
  }
  if (typeof entrada.correlacao !== 'string' || !CORRELACAO.test(entrada.correlacao)) {
    return recusa(MOTIVOS.correlacao_invalida);
  }
  return { autorizado: true, host };
}

/**
 * Literal de texto para o PostgreSQL. Dobra a aspa simples.
 *
 * Copia de cinco linhas da politica irma, de proposito: a guarda confere a
 * marca DESTE bloco, e importar a de la checaria a marca errada — o que e pior
 * que duplicar, porque passaria desapercebido.
 */
function texto(valor) {
  if (typeof valor !== 'string') throw new Error(MOTIVOS.valor_com_nulo);
  if (valor.includes('\u0000')) throw new Error(MOTIVOS.valor_com_nulo);
  if (valor.includes(MARCA)) throw new Error(MOTIVOS.valor_com_marca);
  return `'${valor.replace(/'/gu, "''")}'`;
}

/**
 * Id no estilo cuid, so para a chave primaria da trilha. Nao e segredo.
 *
 * `randomInt` e nao `Math.random`: a politica irma ja gera este mesmo id com
 * `randomInt` (`recuperar-acesso-master.policy.mjs`, na funcao equivalente), e
 * duas familias de aleatoriedade para a mesma coisa no mesmo fluxo e divergencia
 * sem ganho. O efeito pratico de um id previsivel aqui e modesto mas real: quem
 * pudesse inserir a linha antes faria a PK colidir, o `RAISE` do bloco desfaria
 * TUDO, e a revogacao nao aconteceria — negacao de uma operacao de seguranca.
 * `sorteia` continua injetavel porque o teste precisa de id estavel.
 */
export function idEstiloCuid(sorteia) {
  const alfabeto = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const pega = sorteia ?? ((limite) => randomInt(limite));
  let saida = 'c';
  for (let i = 0; i < 24; i += 1) saida += alfabeto[pega(alfabeto.length)];
  return saida;
}

/**
 * Monta o SQL. Um bloco, uma transacao.
 *
 * `DO` roda em transacao implicita: qualquer `RAISE EXCEPTION` desfaz TUDO —
 * revogacao e trilha. Entao nao existe estado em que as janelas foram fechadas
 * e o registro de quem fechou nao existe.
 *
 * A trilha e o ULTIMO INSERT, como na abertura: se ela falhar, o bloco cai e
 * nada aconteceu. Mudanca privilegiada sem auditoria e desfeita — decisao da
 * #665, que vale aqui como vale para conceder.
 */
export function montarSql(pedido) {
  const {
    email, identidade, nota, correlacao,
    atorUserId = ATOR_DA_INSCRICAO, auditoriaId = idEstiloCuid(),
  } = pedido;
  if (typeof identidade !== 'string' || !IDENTIDADE.test(identidade)) {
    throw new Error(MOTIVOS.identidade_invalida);
  }
  if (typeof correlacao !== 'string' || !CORRELACAO.test(correlacao)) {
    throw new Error(MOTIVOS.correlacao_invalida);
  }

  return `DO ${MARCA}
DECLARE
  alvo_id    text;
  ident_id   text;
  revogadas  integer;
BEGIN
  -- O titular, pelo e-mail. Case-insensitive porque e-mail nao distingue caixa.
  SELECT u."id" INTO alvo_id FROM "User" u WHERE lower(u."email") = lower(${texto(email)});
  IF alvo_id IS NULL THEN
    RAISE EXCEPTION 'Nao existe usuario com este e-mail. Nada foi alterado.';
  END IF;

  -- Mesma ordem de travas da abertura e do consumo: identidade antes da janela.
  -- Sem isto, revogar e abrir ao mesmo tempo poderiam se cruzar e deixar uma
  -- janela nova revogada, ou uma antiga aberta.
  SELECT i."id" INTO ident_id
    FROM "PlatformMasterIdentity" i
   WHERE i."userId" = alvo_id FOR UPDATE;
  IF ident_id IS NULL THEN
    RAISE EXCEPTION 'Este usuario nao tem identidade Master. Nao ha janela a revogar.';
  END IF;

  -- A identidade informada tem de ser a DESTE e-mail. A mesma guarda da
  -- abertura: nao ha como agir na identidade de A apresentando o e-mail de B.
  IF ident_id <> ${texto(identidade)} THEN
    RAISE EXCEPTION 'A identidade informada (%) nao pertence a este e-mail (identidade real: %).', ${texto(identidade)}, ident_id;
  END IF;

  -- Status NAO e conferido aqui, de proposito. Fechar autorizacao pendente e
  -- seguro em identidade suspensa, e exigir ACTIVE deixaria sem recurso o caso
  -- em que a suspeita foi justamente o motivo da suspensao.

  -- UPDATE e nao DELETE: a janela revogada continua auditavel, e o servico ja
  -- honra "revokedAt" nas quatro leituras. "challengeHash" vai a NULL junto
  -- porque desafio gravado nao tem mais uso e e material a menos numa linha que
  -- permanece no banco.
  UPDATE "PlatformMasterEnrollmentWindow"
     SET "revokedAt" = now(), "challengeHash" = NULL
   WHERE "identityId" = ident_id
     AND "consumedAt" IS NULL
     AND "revokedAt" IS NULL
     AND "expiresAt" > now();
  GET DIAGNOSTICS revogadas = ROW_COUNT;

  -- Zero linhas afetadas NAO pode sair como sucesso. O operador que revoga
  -- quer saber se havia o que revogar: ler silencio como "fechado" e como ele
  -- deixaria de procurar um segredo que continua valido em outro lugar.
  IF revogadas = 0 THEN
    RAISE EXCEPTION 'Nao havia autorizacao aberta para esta identidade. Nada foi alterado. Se o segredo ja foi usado, a credencial existe e o caminho e a recuperacao.';
  END IF;

  -- Janela consumida e historico e NAO e tocada: marcar revogacao nela diria
  -- que o registro do autenticador foi desfeito, e nao foi.

  -- A trilha, por ultimo. Se ela falhar, o bloco cai e nada aconteceu.
  INSERT INTO "PlatformAuditLog"
    ("id", "actorUserId", "action", "scopeKind", "organizationId", "eventId", "targetUserId",
     "reason", "result", "changes", "correlationId")
  VALUES
    (${texto(auditoriaId)}, ${texto(atorUserId)}, 'revogar_inscricao_master', 'GLOBAL', '', '', alvo_id,
     ${texto(nota)}, 'ALLOWED',
     jsonb_build_object(
       'janelasRevogadas', revogadas,
       'identityId', ident_id
     ),
     ${texto(correlacao)});

  RAISE NOTICE 'Revogada(s) % autorizacao(oes) de % (identidade %).', revogadas, ${texto(email)}, ident_id;
END
${MARCA};
`;
}
