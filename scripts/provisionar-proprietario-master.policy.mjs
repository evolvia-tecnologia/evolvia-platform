/**
 * Provisionamento da primeira identidade Master (#665): decisões e SQL.
 *
 * Por que não existe rota HTTP equivalente: rota que cria o próprio poder é
 * porta aberta. O nascimento do primeiro proprietário exige acesso ao banco,
 * privilégio que já não se obtém pela aplicação.
 *
 * Divisão deliberada de responsabilidade:
 *
 *  - **Aqui, em JS:** só o que se sabe SEM banco — ambiente, host confirmado,
 *    formato do e-mail e tamanho da nota.
 *  - **No SQL gerado:** as condições de DADOS — usuário existe, e-mail
 *    verificado, não há identidade para ele, não há proprietário ativo.
 *
 * As condições de dados ficam só no SQL de propósito. Repeti-las em JS criaria
 * uma segunda regra sobre o mesmo fato, e duas regras divergem — além de que a
 * checagem em JS aconteceria ANTES da escrita, numa conexão diferente, deixando
 * janela para o estado mudar entre conferir e gravar. No SQL elas são
 * verificadas e aplicadas na MESMA transação.
 *
 * `deny-by-default`: entrada inesperada nega.
 */

/** Limite da coluna `provisionedByNote` em `PlatformMasterIdentity`. */
export const LIMITE_DA_NOTA = 200;

/**
 * Namespace dos atores que NÃO são pessoas.
 *
 * O relatório de auditoria precisa separar ação humana de ação sistêmica, e
 * comparar com uma string solta espalharia a mesma literal por cada consulta.
 * Um prefixo resolve melhor que um valor único: a próxima ação sistêmica que
 * aparecer — reconciliação, rotina agendada, webhook — cabe aqui sem alterar o
 * predicado.
 *
 * O prefixo não pode colidir com id de pessoa: `User.id` é `cuid()`, que é
 * alfanumérico e não contém dois-pontos. Há teste prendendo isso.
 */
export const PREFIXO_DE_ATOR_SISTEMICO = 'sistema:';

/** Ator desta operação de bootstrap. */
export const ATOR_DO_BOOTSTRAP = `${PREFIXO_DE_ATOR_SISTEMICO}bootstrap-master`;

/**
 * Para o relatório decidir se a linha foi ação de pessoa ou do sistema, sem
 * reimplementar a comparação em cada consulta.
 */
export function ehAtorSistemico(actorUserId) {
  return typeof actorUserId === 'string' && actorUserId.startsWith(PREFIXO_DE_ATOR_SISTEMICO);
}

/** Conservador de propósito: recusar um e-mail válido raro é barato; aceitar
 *  um que leve caractere de controle para dentro de SQL não é. */
const EMAIL_ACEITO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/u;
/** Nota: texto imprimível de uma linha. Sem controle, sem quebra. */
const NOTA_ACEITA = /^[^\p{Cc}\p{Cf}]+$/u;

export const MOTIVOS = {
  ambiente_de_producao: 'Recusado: NODE_ENV é produção. Este script não provisiona poder em produção.',
  host_ausente: 'Recusado: não foi possível ler o host do DATABASE_URL.',
  host_nao_confirmado:
    'Recusado: o host confirmado não corresponde ao host do DATABASE_URL. Informe --confirmar-host com o host exato do banco de destino.',
  email_invalido: 'Recusado: informe --email com o endereço da conta que será proprietária.',
  nota_obrigatoria: 'Recusado: informe --nota com quem autorizou este provisionamento.',
  nota_muito_longa: `Recusado: a nota deve ter no máximo ${LIMITE_DA_NOTA} caracteres.`,
  nota_com_controle: 'Recusado: a nota deve ser texto imprimível de uma linha.',
};

const texto = (v) => (typeof v === 'string' ? v.trim() : '');

/** Host do DATABASE_URL, ou null quando não der para ler. */
export function hostDoBanco(databaseUrl) {
  if (typeof databaseUrl !== 'string' || databaseUrl === '') return null;
  try {
    const host = new URL(databaseUrl).hostname;
    return host === '' ? null : host;
  } catch {
    return null;
  }
}

/**
 * Decide se vale gerar o SQL. A ordem é deliberada: o que protege o alvo vem
 * antes do que valida o conteúdo, para que um erro de banco de destino seja
 * recusado antes de qualquer outra coisa.
 */
export function decidirEntrada(entrada) {
  const { nodeEnv, databaseUrl, hostConfirmado, email, nota } = entrada ?? {};

  if (texto(nodeEnv).toLowerCase() === 'production') return recusa('ambiente_de_producao');

  const host = hostDoBanco(databaseUrl);
  if (host === null) return recusa('host_ausente');
  if (texto(hostConfirmado) !== host) return recusa('host_nao_confirmado');

  const emailLimpo = texto(email).toLowerCase();
  if (!EMAIL_ACEITO.test(emailLimpo)) return recusa('email_invalido');

  const notaLimpa = texto(nota);
  if (notaLimpa === '') return recusa('nota_obrigatoria');
  if (notaLimpa.length > LIMITE_DA_NOTA) return recusa('nota_muito_longa');
  if (!NOTA_ACEITA.test(notaLimpa)) return recusa('nota_com_controle');

  return { permitido: true, motivo: null, mensagem: null, email: emailLimpo, nota: notaLimpa, host };
}

function recusa(motivo) {
  return { permitido: false, motivo, mensagem: MOTIVOS[motivo], email: '', nota: '', host: null };
}

/** Literal SQL. Só é chamada depois de `decidirEntrada`, que já restringiu o
 *  conjunto de caracteres; a duplicação da apóstrofe é a segunda barreira. */
export function literal(valor) {
  return `'${String(valor).replaceAll("'", "''")}'`;
}

/**
 * SQL idempotente, em UMA transação, com as condições de dados verificadas
 * dentro dela.
 *
 * Propriedades que o texto gerado tem de ter, e que o teste prende:
 *
 *  - uma transação só: ou nasce a identidade e a trilha, ou nada;
 *  - `RAISE EXCEPTION` para cada condição de dados, em vez de `INSERT` que
 *    simplesmente não casa — mensagem explícita vale mais que zero linhas
 *    afetadas, que o operador pode ler como sucesso;
 *  - idempotente: rodar de novo informa e não altera;
 *  - nenhuma senha, hash ou token aparece;
 *  - a trilha é gravada na mesma transação, com as colunas reais do modelo.
 */
export function montarSql({ email, nota, permitirSegundoProprietario = false, correlacao }) {
  const e = literal(email);
  const n = literal(nota);
  const c = literal(correlacao);
  const guardaDeProprietario = permitirSegundoProprietario
    ? '  -- Segundo proprietario autorizado explicitamente na linha de comando.'
    : `  IF EXISTS (SELECT 1 FROM "PlatformMasterIdentity" WHERE role = 'OWNER' AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'Ja existe proprietario Master ativo. Nomear outro e prerrogativa do proprietario principal, pela area, nao por script.';
  END IF;`;

  return `-- Nascimento do primeiro proprietario da Area Master (#665).
-- Gerado por scripts/provisionar-proprietario-master.mjs. Revise antes de executar.
-- Executar com: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <este arquivo>
BEGIN;

DO $evolvia$
DECLARE
  alvo_id text;
  ja_existe text;
BEGIN
  SELECT id INTO alvo_id FROM "User" WHERE lower(email) = ${e};
  IF alvo_id IS NULL THEN
    RAISE EXCEPTION 'Nao existe usuario com esse e-mail. O proprietario precisa ja ter conta na plataforma.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "User" WHERE id = alvo_id AND "emailVerifiedAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'O usuario existe mas nao tem e-mail verificado.';
  END IF;

  SELECT id INTO ja_existe FROM "PlatformMasterIdentity" WHERE "userId" = alvo_id;
  IF ja_existe IS NOT NULL THEN
    RAISE NOTICE 'Nada a fazer: este usuario ja possui identidade Master (%).', ja_existe;
    RETURN;
  END IF;

${guardaDeProprietario}

  INSERT INTO "PlatformMasterIdentity" ("id", "userId", "role", "status", "provisionedByNote", "provisionedAt")
  VALUES (gen_random_uuid()::text, alvo_id, 'OWNER', 'ACTIVE', ${n}, now());

  -- actorUserId recebe o ator sistemico, nao o id do novo proprietario:
  -- registrar o proprio alvo como ator afirmaria que ele se autoconcedeu poder
  -- pela aplicacao, o que nao aconteceu. Quem autorizou esta em "reason".
  -- O prefixo "sistema:" permite ao relatorio separar acao sistemica de acao
  -- humana por predicado, sem comparar literal espalhada por cada consulta, e
  -- nao colide com id de pessoa porque cuid nao contem dois-pontos.
  INSERT INTO "PlatformAuditLog"
    ("id", "actorUserId", "action", "scopeKind", "organizationId", "eventId",
     "targetUserId", "reason", "result", "correlationId", "occurredAt")
  VALUES (gen_random_uuid()::text, ${literal(ATOR_DO_BOOTSTRAP)},
     'platform.master_identity_provisioned', 'GLOBAL', '', '',
     alvo_id, ${n}, 'ALLOWED', ${c}, now());

  RAISE NOTICE 'Identidade Master OWNER criada para %.', ${e};
END
$evolvia$;

COMMIT;
`;
}
