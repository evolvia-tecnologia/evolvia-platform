/**
 * Inscricao de autenticador da Area Master: bootstrap e recuperacao (#690).
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * ---------------------------
 * A Area Master, como integrada em develop@ab02d8d8, nao tem como receber a
 * PRIMEIRA chave. A cadeia e circular e foi lida de ponta a ponta:
 *
 *   registrar credencial  -> exige PlatformSessionGuard (sessao Master)
 *   sessao                -> exige concluirAutenticacao
 *   autenticacao          -> `desafioDeAutenticacao` RECUSA com zero credenciais
 *
 * O provisionamento de #690 cria a identidade sem credencial, entao o
 * proprietario provisionado nao entra. O mesmo circulo prende quem perdeu o
 * autenticador. Um mecanismo resolve os dois casos, e e este.
 *
 * O QUE ESTE SCRIPT NAO FAZ, E ISSO E O PONTO
 * -------------------------------------------
 * Ele NAO cria credencial, NAO define senha, NAO gera sessao e NAO guarda
 * segredo recuperavel. Ele abre uma JANELA: uma autorizacao de uso unico, curta,
 * que permite ao titular executar a cerimonia WebAuthn normal no navegador
 * dele. A chave privada continua sendo a unica prova de quem e o titular; o
 * script so diz QUANDO e PARA QUEM a inscricao pode acontecer.
 *
 * Por isso as restricoes permanentes do fundador ficam de pe: sem senha mestra,
 * sem backdoor, sem usuario administrativo oculto, sem e-mail como fator unico,
 * e sem endpoint publico desprotegido.
 *
 * O segredo cru existe por alguns minutos, na tela do operador. O banco guarda
 * apenas `sha256(segredo:finalidade:identityId)`. Quem ler a tabela depois nao
 * consegue usar a janela: o digest nao volta a ser segredo. E porque a
 * finalidade e a identidade entram no digest, uma janela de BOOTSTRAP nao serve
 * para RECOVERY, e a janela de uma identidade nao serve para outra — mesmo que
 * o segredo vaze.
 *
 * SEM IMPORT RELATIVO, SEM PRISMA, SEM REDE
 * -----------------------------------------
 * Unico import e builtin, para o digest. O modulo roda e e testavel sozinho,
 * como `provisionar-proprietario-master.policy.mjs` — que e o padrao que o
 * fundador mandou reusar, e nao um padrao novo.
 *
 * Nomes de tabela e coluna foram LIDOS de `apps/api/prisma/platform-master-identity.prisma`
 * (blob de8dc35a) e `platform-master.prisma` (blob d2658e05) em develop@ab02d8d8.
 * Nao foram adivinhados. Dois achados dessa leitura mudaram o SQL:
 *
 *   - `PlatformWebAuthnCredential` NAO tem `revokedAt`. Revogar e DELETE.
 *   - `PlatformMasterSession` TEM `revokedAt`, e `lerSessao` o honra. Invalidar
 *     sessao e UPDATE, nao DELETE: assim a sessao invalidada continua auditavel.
 */

import { createHash, randomInt } from 'node:crypto';

/** As duas finalidades. Entram no digest, entao nao sao intercambiaveis. */
export const FINALIDADES = Object.freeze(['BOOTSTRAP', 'RECOVERY']);

/** Minimo do segredo cru, em caracteres base64url. 43 = 32 bytes. */
export const MINIMO_DO_SEGREDO = 43;

export const JANELA_PADRAO_MINUTOS = 15;
export const JANELA_MAXIMA_MINUTOS = 60;

/** Marca de dollar-quoting do bloco. Nenhum valor pode conte-la. */
const MARCA = '$evolvia_inscricao_master$';

export const MOTIVOS = Object.freeze({
  finalidade_invalida:
    'Recusado: informe --finalidade bootstrap (primeira chave) ou --finalidade recuperacao (chave perdida).',
  host_nao_confirmado:
    'Recusado: --confirmar-host precisa repetir exatamente o host do DATABASE_URL. E a guarda que impede rodar no banco errado.',
  sem_banco:
    'Recusado: DATABASE_URL ausente ou sem host. Nao ha o que confirmar.',
  producao:
    'Recusado: producao. Esta etapa e de homologacao, e o fundador bloqueou execucao em producao aqui.',
  confirmacao_ausente:
    'Recusado: falta a confirmacao explicita desta finalidade (--confirmar-bootstrap ou --confirmar-recuperacao). A confirmacao e por finalidade de proposito: assim um comando de bootstrap nunca revoga credencial por engano.',
  confirmacao_divergente:
    'Recusado: a confirmacao informada nao e a desta finalidade. Nao assumo qual das duas voce quis.',
  email_invalido:
    'Recusado: informe --email do titular, em forma valida e com até 254 caracteres.',
  identidade_invalida:
    'Recusado: informe --identidade com o id da identidade Master do titular. O SQL exige que ela pertenca a este e-mail.',
  segredo_curto:
    `Recusado: o segredo precisa de ao menos ${MINIMO_DO_SEGREDO} caracteres base64url. Gere com randomBytes(32).toString('base64url').`,
  segredo_nao_base64url:
    'Recusado: o segredo tem caractere fora de base64url. Isso quebraria a comparacao no navegador.',
  janela_invalida:
    `Recusado: --minutos precisa ser inteiro de 1 a ${JANELA_MAXIMA_MINUTOS}. Janela longa e janela aberta.`,
  nota_invalida:
    'Recusado: informe --nota com o registro de quem autorizou e por que, de 1 a 200 caracteres.',
  correlacao_invalida:
    'Recusado: --correlacao aceita de 1 a 64 caracteres [A-Za-z0-9_-]. E a chave que liga esta operacao a trilha.',
  transferencia_de_titularidade:
    'Recusado: este script NAO transfere titularidade. Ele abre inscricao de autenticador para o titular que JA consta na identidade. Nenhum delegado assume a propriedade da Evolvia por aqui.',
  valor_com_marca:
    'Recusado: valor contem a marca de delimitacao do bloco SQL.',
  valor_com_nulo:
    'Recusado: valor contem byte nulo.',
});

/** Marcadores de producao. Prefixo conta: `prod` casa `producao` e `prod-db`. */
const MARCAS_DE_PRODUCAO = Object.freeze(['prod', 'production', 'producao', 'live']);

const BASE64URL = /^[A-Za-z0-9_-]+$/u;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;
const CORRELACAO = /^[A-Za-z0-9_-]{1,64}$/u;
const IDENTIDADE = /^[A-Za-z0-9_-]{1,64}$/u;

/**
 * O digest que vai para o banco.
 *
 * Liga o segredo a finalidade E a identidade. Sem a finalidade, uma janela
 * aberta para bootstrap serviria para recuperacao, que revoga credenciais —
 * efeitos muito diferentes sob a mesma autorizacao. Sem a identidade, um
 * segredo vazado valeria em qualquer identidade Master.
 */
export function digestDaInscricao(segredo, finalidade, identityId) {
  if (typeof segredo !== 'string' || segredo.length < MINIMO_DO_SEGREDO) {
    throw new Error(MOTIVOS.segredo_curto);
  }
  if (!FINALIDADES.includes(finalidade)) throw new Error(MOTIVOS.finalidade_invalida);
  if (typeof identityId !== 'string' || !IDENTIDADE.test(identityId)) {
    throw new Error(MOTIVOS.identidade_invalida);
  }
  return createHash('sha256').update(`${segredo}:${finalidade}:${identityId}`).digest('hex');
}

/** Host do DATABASE_URL, ou null. Socket Unix nao tem host e cai em null. */
export function hostDoBanco(databaseUrl) {
  if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) return null;
  let url;
  try { url = new URL(databaseUrl); } catch { return null; }
  const host = url.hostname;
  return host.length === 0 ? null : host;
}

function pareceProducao(...valores) {
  for (const valor of valores) {
    if (typeof valor !== 'string') continue;
    const baixo = valor.toLowerCase();
    for (const marca of MARCAS_DE_PRODUCAO) {
      // Prefixo e nao igualdade: `prod-db-01` e producao, e `producao` tambem.
      if (baixo.split(/[^a-z]+/u).some((parte) => parte.startsWith(marca))) return true;
    }
  }
  return false;
}

/** Le os argumentos. Nao decide nada: so transporta o que foi pedido. */
export function lerArgumentos(argv) {
  const entrada = {
    finalidade: null,
    email: null,
    identidade: null,
    nota: null,
    correlacao: null,
    minutos: JANELA_PADRAO_MINUTOS,
    confirmarHost: null,
    confirmouBootstrap: false,
    confirmouRecuperacao: false,
    /**
     * LIDA DE PROPOSITO, SO PARA SER RECUSADA.
     *
     * Ignorar em silencio seria seguro — o SQL nunca troca o titular — mas
     * deixaria um runbook antigo convencido de ter transferido a titularidade.
     * Mesma licao do `--permitir-segundo-proprietario` em #690.
     */
    transferenciaPedida: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const bruto = argv[i];
    const [chave, embutido] = bruto.startsWith('--') && bruto.includes('=')
      ? [bruto.slice(0, bruto.indexOf('=')), bruto.slice(bruto.indexOf('=') + 1)]
      : [bruto, null];
    const proximo = () => (embutido !== null ? embutido : argv[(i += 1)]);
    switch (chave) {
      case '--finalidade': {
        const valor = proximo();
        entrada.finalidade = typeof valor === 'string' ? valor.trim().toUpperCase() : valor;
        break;
      }
      case '--email': entrada.email = proximo(); break;
      case '--identidade': entrada.identidade = proximo(); break;
      case '--nota': entrada.nota = proximo(); break;
      case '--correlacao': entrada.correlacao = proximo(); break;
      case '--minutos': entrada.minutos = Number(proximo()); break;
      case '--confirmar-host': entrada.confirmarHost = proximo(); break;
      case '--confirmar-bootstrap': entrada.confirmouBootstrap = true; break;
      case '--confirmar-recuperacao': entrada.confirmouRecuperacao = true; break;
      case '--transferir-titularidade': entrada.transferenciaPedida = true; break;
      default: break;
    }
  }
  return entrada;
}

const recusa = (motivo) => ({ autorizado: false, motivo });

/**
 * Decide se a operacao pode ser montada.
 *
 * A ordem das recusas e deliberada: producao e host ANTES de qualquer validacao
 * de conteudo. Um comando malformado apontado para producao deve ser recusado
 * por ser producao, nao por estar malformado — senao o operador corrige o
 * formato e dispara no banco errado.
 */
export function decidirEntrada(entrada, env = {}) {
  const banco = env.DATABASE_URL;
  const host = hostDoBanco(banco);
  if (host === null) return recusa(MOTIVOS.sem_banco);
  if (pareceProducao(host, new URL(banco).pathname, env.NODE_ENV, env.EVOLVIA_AMBIENTE)) return recusa(MOTIVOS.producao);
  if (env.EVOLVIA_AMBIENTE !== 'homologacao') return recusa('Defina o ambiente autorizado de homologação antes de abrir a janela.');
  if (entrada.confirmarHost !== host) return recusa(MOTIVOS.host_nao_confirmado);

  // Lida para ser recusada, antes de qualquer sucesso possivel.
  if (entrada.transferenciaPedida === true) return recusa(MOTIVOS.transferencia_de_titularidade);

  if (!FINALIDADES.includes(entrada.finalidade)) return recusa(MOTIVOS.finalidade_invalida);

  const confirmou = entrada.finalidade === 'BOOTSTRAP'
    ? entrada.confirmouBootstrap
    : entrada.confirmouRecuperacao;
  const confirmouAOutra = entrada.finalidade === 'BOOTSTRAP'
    ? entrada.confirmouRecuperacao
    : entrada.confirmouBootstrap;
  if (!confirmou) {
    return recusa(confirmouAOutra ? MOTIVOS.confirmacao_divergente : MOTIVOS.confirmacao_ausente);
  }

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
  if (!Number.isSafeInteger(entrada.minutos) || entrada.minutos < 1 || entrada.minutos > JANELA_MAXIMA_MINUTOS) {
    return recusa(MOTIVOS.janela_invalida);
  }
  return { autorizado: true, host };
}

/** Literal de texto para o PostgreSQL. Dobra a aspa simples. */
function texto(valor) {
  if (typeof valor !== 'string') throw new Error(MOTIVOS.valor_com_nulo);
  if (valor.includes('\u0000')) throw new Error(MOTIVOS.valor_com_nulo);
  if (valor.includes(MARCA)) throw new Error(MOTIVOS.valor_com_marca);
  return `'${valor.replace(/'/gu, "''")}'`;
}

/**
 * Monta o SQL. Um bloco, uma transacao.
 *
 * `DO` roda em transacao implicita: qualquer `RAISE EXCEPTION` desfaz TUDO —
 * revogacao, invalidacao de sessao, janela e trilha. Entao nao existe estado
 * intermediario onde as credenciais foram apagadas e a janela nao abriu, que
 * seria o pior resultado possivel: titular sem chave e sem autorizacao para
 * registrar outra.
 *
 * A trilha e o ULTIMO INSERT de proposito. Se ela falhar, o bloco inteiro cai e
 * nada aconteceu — a decisao da #665, de que mudanca privilegiada sem auditoria
 * e desfeita, vale aqui como vale para conceder.
 */
export function montarSql(pedido) {
  const { finalidade, email, identidade, nota, correlacao, minutos, segredo, atorUserId = 'sistema-operacional' } = pedido;
  if (!FINALIDADES.includes(finalidade)) throw new Error(MOTIVOS.finalidade_invalida);
  if (typeof segredo !== 'string' || segredo.length < MINIMO_DO_SEGREDO) throw new Error(MOTIVOS.segredo_curto);
  if (!BASE64URL.test(segredo)) throw new Error(MOTIVOS.segredo_nao_base64url);
  if (!Number.isSafeInteger(minutos) || minutos < 1 || minutos > JANELA_MAXIMA_MINUTOS) {
    throw new Error(MOTIVOS.janela_invalida);
  }
  if ('transferirTitularidade' in pedido) throw new Error(MOTIVOS.transferencia_de_titularidade);

  const digest = digestDaInscricao(segredo, finalidade, identidade);
  const ehRecuperacao = finalidade === 'RECOVERY';
  const acao = ehRecuperacao ? 'recuperar_acesso_master' : 'bootstrap_autenticador_master';

  const revogacao = ehRecuperacao
    ? `
  -- Revoga os autenticadores comprometidos. DELETE porque a tabela nao tem
  -- revokedAt; a trilha abaixo guarda quantos eram.
  DELETE FROM "PlatformWebAuthnCredential" WHERE "identityId" = ident_id;

  -- Invalida as sessoes anteriores. UPDATE e nao DELETE: lerSessao honra
  -- revokedAt, e a sessao invalidada continua auditavel.
  UPDATE "PlatformMasterSession"
     SET "revokedAt" = now()
   WHERE "identityId" = ident_id AND "revokedAt" IS NULL;
`
    : '';

  return `DO ${MARCA}
DECLARE
  alvo_id        text;
  ident_id       text;
  ident_role     text;
  ident_status   text;
  credenciais    integer;
  janela_vence   timestamptz;
BEGIN
  -- O titular, pelo e-mail. Case-insensitive porque e-mail nao distingue caixa.
  SELECT u."id" INTO alvo_id FROM "User" u WHERE lower(u."email") = lower(${texto(email)});
  IF alvo_id IS NULL THEN
    RAISE EXCEPTION 'Nao existe usuario com este e-mail. Nada foi alterado.';
  END IF;

  SELECT i."id", i."role"::text, i."status"::text
    INTO ident_id, ident_role, ident_status
    FROM "PlatformMasterIdentity" i
   WHERE i."userId" = alvo_id FOR UPDATE;
  IF ident_id IS NULL THEN
    RAISE EXCEPTION 'Este usuario nao tem identidade Master. Use o provisionamento do primeiro proprietario (#690); este script nao cria identidade.';
  END IF;

  -- A identidade informada tem de ser a DESTE e-mail. E esta guarda que impede
  -- transferencia de titularidade: nao ha como abrir inscricao da identidade de
  -- A apresentando o e-mail de B.
  IF ident_id <> ${texto(identidade)} THEN
    RAISE EXCEPTION 'A identidade informada (%) nao pertence a este e-mail (identidade real: %). Este script nao transfere titularidade.', ${texto(identidade)}, ident_id;
  END IF;

  IF ident_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Esta identidade Master esta % . Reative-a antes; abrir inscricao para identidade suspensa devolveria acesso por via indireta.', ident_status;
  END IF;

  SELECT count(*) INTO credenciais
    FROM "PlatformWebAuthnCredential" c WHERE c."identityId" = ident_id;

  -- Bootstrap SO quando nao ha autenticador ativo. Com credencial existente, o
  -- caminho normal (sessao + registro de chave de reserva) ja funciona, e abrir
  -- janela seria superficie desnecessaria.
  IF ${ehRecuperacao ? 'false' : 'true'} AND credenciais > 0 THEN
    RAISE EXCEPTION 'Esta identidade ja possui % autenticador(es). Bootstrap recusado: registre a chave de reserva pela Area Master, ou use --finalidade recuperacao se houve perda.', credenciais;
  END IF;

  -- Recuperacao exige que haja o que revogar. Sem isso, "recuperacao" seria um
  -- bootstrap disfarcado, sem a guarda de zero credenciais.
  IF ${ehRecuperacao ? 'true' : 'false'} AND credenciais = 0 THEN
    RAISE EXCEPTION 'Esta identidade nao possui autenticador. Nao ha o que revogar: use --finalidade bootstrap.';
  END IF;

  -- Repeticao: uma janela aberta e nao vencida por vez. Sem isto, duas
  -- execucoes deixariam dois segredos validos simultaneos.
  SELECT w."expiresAt" INTO janela_vence
    FROM "PlatformMasterEnrollmentWindow" w
   WHERE w."identityId" = ident_id AND w."consumedAt" IS NULL AND w."revokedAt" IS NULL AND w."expiresAt" > now()
   ORDER BY w."expiresAt" DESC
   LIMIT 1;
  IF janela_vence IS NOT NULL THEN
    RAISE EXCEPTION 'Ja existe autorizacao aberta para esta identidade, valida ate %. Aguarde o vencimento ou consuma-a; nao abro uma segunda.', janela_vence;
  END IF;
${revogacao}
  -- Limpa cerimonia pendente. Um desafio antigo sobrevivente permitiria
  -- concluir uma cerimonia aberta antes da revogacao.
  UPDATE "PlatformMasterIdentity"
     SET "pendingChallenge" = NULL, "pendingChallengeKind" = NULL, "pendingChallengeExpires" = NULL
   WHERE "id" = ident_id;

  -- A janela. Guarda o DIGEST, nunca o segredo.
  INSERT INTO "PlatformMasterEnrollmentWindow"
    ("id", "identityId", "secretDigest", "purpose", "openedByNote", "correlationId", "expiresAt")
  VALUES
    (${texto(pedido.janelaId ?? idEstiloCuid())}, ident_id, ${texto(digest)}, ${texto(finalidade)}::"PlatformEnrollmentPurpose",
     ${texto(nota)}, ${texto(correlacao)}, now() + interval '${minutos} minutes');

  -- A trilha, por ultimo. Se ela falhar, o bloco cai e nada aconteceu.
  INSERT INTO "PlatformAuditLog"
    ("id", "actorUserId", "action", "scopeKind", "organizationId", "eventId", "targetUserId",
     "reason", "result", "changes", "correlationId")
  VALUES
    (${texto(pedido.auditoriaId ?? idEstiloCuid())}, ${texto(atorUserId)}, ${texto(acao)}, 'GLOBAL', '', '', alvo_id,
     ${texto(nota)}, 'ALLOWED',
     jsonb_build_object(
       'finalidade', ${texto(finalidade)},
       'minutos', ${minutos},
       'credenciaisRevogadas', ${ehRecuperacao ? 'credenciais' : '0'},
       'identityId', ident_id
     ),
     ${texto(correlacao)});

  RAISE NOTICE 'Inscricao autorizada para % (identidade %), finalidade %, por % minuto(s).', ${texto(email)}, ident_id, ${texto(finalidade)}, ${minutos};
END
${MARCA};
`;
}

/** Id no estilo cuid, só para a chave primaria. Nao e segredo. */
export function idEstiloCuid() {
  const alfabeto = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let saida = 'c';
  for (let i = 0; i < 24; i += 1) saida += alfabeto[randomInt(alfabeto.length)];
  return saida;
}
