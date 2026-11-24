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

import { randomInt } from 'node:crypto';

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
  host_de_socket_unix:
    'Recusado: o DATABASE_URL aponta para socket Unix, que não tem host para confirmar. Use a URL TCP do mesmo banco, com host e porta: --confirmar-host é a única guarda contra executar no banco errado.',
  host_nao_confirmado:
    'Recusado: o host confirmado não corresponde ao host do DATABASE_URL. Informe --confirmar-host com o host exato do banco de destino.',
  email_invalido: 'Recusado: informe --email com o endereço da conta que será proprietária.',
  nota_obrigatoria: 'Recusado: informe --nota com quem autorizou este provisionamento.',
  nota_muito_longa: `Recusado: a nota deve ter no máximo ${LIMITE_DA_NOTA} caracteres.`,
  nota_com_controle: 'Recusado: a nota deve ser texto imprimível de uma linha.',
  segundo_proprietario_por_script:
    'Recusado: --permitir-segundo-proprietario foi REMOVIDO. Ele desligava por completo a guarda de proprietário único, que é a única coisa que este script existe para garantir — com a flag, nasciam dois OWNER ativos. Nomear um segundo proprietário é prerrogativa do proprietário principal, pela Área Master, com trilha de auditoria e autoria preservada. Não há caminho por script para isso.',
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
 * URL de conexão por socket Unix: `postgresql:///banco`, ou host no parâmetro
 * `host=`. O `hostname` vem vazio nos dois casos, e por isso `hostDoBanco`
 * devolve `null` — o mesmo `null` de uma URL ilegível, que é coisa bem
 * diferente. Separar os dois casos é o que permite dizer ao operador o que
 * fazer, em vez de mandá-lo conferir um DATABASE_URL que está correto.
 *
 * A recusa permanece, e é deliberada: `--confirmar-host` é a única guarda
 * contra executar no banco errado, e socket Unix não tem host para confirmar.
 * Aceitar host vazio removeria a guarda exatamente no caso em que o operador
 * não tem como perceber o alvo errado.
 */
export function ehUrlDeSocketUnix(databaseUrl) {
  if (typeof databaseUrl !== 'string' || databaseUrl === '') return false;
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    return false;
  }
  if (!/^postgres(ql)?:$/u.test(url.protocol)) return false;
  if (url.hostname !== '') return false;
  // `postgresql://` sozinho não nomeia banco nenhum: é URL incompleta, não
  // socket. Socket nomeia o banco no caminho, ou o diretório em `host=`.
  return url.pathname.replace(/^\//u, '') !== '' || (url.searchParams.get('host') ?? '') !== '';
}

/**
 * Decide se vale gerar o SQL. A ordem é deliberada: o que protege o alvo vem
 * antes do que valida o conteúdo, para que um erro de banco de destino seja
 * recusado antes de qualquer outra coisa.
 */
export function decidirEntrada(entrada) {
  const { nodeEnv, databaseUrl, hostConfirmado, email, nota, segundoProprietarioPedido } = entrada ?? {};

  if (texto(nodeEnv).toLowerCase() === 'production') return recusa('ambiente_de_producao');

  // Logo depois da recusa de produção, e antes de qualquer validação de
  // conteúdo: pedir a antiga flag é pedir para desligar a proteção, e isso é
  // recusado de saída. A recusa é EXPLÍCITA, e não um silêncio: ignorar o
  // argumento deixaria o operador com um runbook antigo acreditando que
  // conseguiu o comportamento de antes, quando o SQL gerado seria outro.
  if (segundoProprietarioPedido === true) return recusa('segundo_proprietario_por_script');

  const host = hostDoBanco(databaseUrl);
  if (host === null) return recusa(ehUrlDeSocketUnix(databaseUrl) ? 'host_de_socket_unix' : 'host_ausente');
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

/** Alfabeto do cuid do Prisma: base36 minúsculo. */
const ALFABETO_CUID = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** Comprimento do cuid do Prisma, contando o `c` inicial. */
export const TAMANHO_DO_CUID = 25;
/** A forma que a coluna exige, e a que este módulo tem de produzir. */
export const FORMA_DO_CUID = /^c[a-z0-9]{24}$/u;

/**
 * Id com a FORMA de cuid, gerado aqui porque o SQL não pode inventá-lo.
 *
 * `PlatformMasterIdentity.id` e `PlatformAuditLog.id` são `@default(cuid())`.
 * Em Prisma, `cuid()` é gerado no cliente, não pelo banco: a coluna não tem
 * DEFAULT no PostgreSQL, então o INSERT é obrigado a fornecer o id. O script
 * fornecia `gen_random_uuid()::text`, que é um UUID — tem hífen, tem 36
 * caracteres e não começa com `c`. Nenhuma validação de forma de cuid aceita
 * isso, e o id ficaria diferente de todos os outros da mesma coluna.
 *
 * Isto reproduz a FORMA (prefixo, alfabeto, comprimento), não as entranhas do
 * cuid — não há contador monotônico nem impressão de máquina, porque nada aqui
 * depende de ordenação por id. A aleatoriedade vem de `node:crypto`, não de
 * `Math.random`, já que o valor identifica uma concessão de poder.
 */
export function idEstiloCuid(sorteia = (limite) => randomInt(limite)) {
  let id = 'c';
  while (id.length < TAMANHO_DO_CUID) id += ALFABETO_CUID[sorteia(ALFABETO_CUID.length)];
  return id;
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
 *  - a trilha é gravada na mesma transação, com as colunas reais do modelo;
 *  - o nascimento é serializado por trava, porque o esquema não o serializa.
 */
export function montarSql({
  email, nota, correlacao,
  identidadeId = idEstiloCuid(), auditoriaId = idEstiloCuid(),
  ...resto
}) {
  // Defesa em profundidade para quem chama o módulo por código, não pela CLI.
  // Silenciosamente ignorar a chave seria FECHADO e portanto seguro, mas
  // deixaria um chamador convencido de que obteve o SQL sem guarda. Lançar diz
  // a verdade na hora.
  if ('permitirSegundoProprietario' in resto) {
    throw new Error(MOTIVOS.segundo_proprietario_por_script);
  }
  const e = literal(email);
  const n = literal(nota);
  const c = literal(correlacao);
  const idIdentidade = literal(identidadeId);
  const idAuditoria = literal(auditoriaId);

  return `-- Nascimento do primeiro proprietario da Area Master (#665).
-- Gerado por scripts/provisionar-proprietario-master.mjs. Revise antes de executar.
-- Executar com: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <este arquivo>
BEGIN;

DO $evolvia$
DECLARE
  alvo_id text;
  ja_existe text;
  papel_existente text;
  situacao_existente text;
BEGIN
  -- Trava antes de qualquer leitura de estado, e e ela que torna a guarda de
  -- proprietario confiavel. "PlatformMasterIdentity" tem indice em
  -- (role, status), NAO restricao de unicidade: sob READ COMMITTED, duas
  -- transacoes concorrentes para DOIS usuarios diferentes passariam as duas
  -- pelo IF EXISTS abaixo, e as duas inseririam: nasceriam dois OWNER
  -- ativos, que e exatamente o que este script existe para impedir.
  -- O replay do MESMO usuario ja e barrado por "userId" @unique: a segunda
  -- transacao falha na unicidade e desfaz tudo. A trava cobre o caso que o
  -- indice nao cobre. Advisory lock de transacao: liberada quando a transacao
  -- termina, com sucesso ou com erro, sem tocar no esquema e sem bloquear
  -- leitura de ninguem.
  PERFORM pg_advisory_xact_lock(665, 1);

  SELECT id INTO alvo_id FROM "User" WHERE lower(email) = ${e};
  IF alvo_id IS NULL THEN
    RAISE EXCEPTION 'Nao existe usuario com esse e-mail. O proprietario precisa ja ter conta na plataforma.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "User" WHERE id = alvo_id AND "emailVerifiedAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'O usuario existe mas nao tem e-mail verificado.';
  END IF;

  -- Idempotencia SO para a mesma identidade OWNER ATIVA. Ler apenas o id e
  -- dar RETURN para QUALQUER identidade existente era falso sucesso: um
  -- DELEGADO, ou um OWNER suspenso, faziam o script sair com codigo 0 dizendo
  -- "nada a fazer" sem criar proprietario nenhum e sem gravar trilha. O
  -- operador le sucesso e conclui que a area tem titular; nao tem.
  -- Qualquer outra situacao RECUSA, e a recusa desfaz a transacao: este script
  -- faz NASCER o primeiro proprietario, e nao promove papel, nao reativa
  -- identidade suspensa e nao altera identidade existente. Promover ou
  -- reativar sao atos do proprietario, pela area, com autoria registrada.
  SELECT id, role::text, status::text
    INTO ja_existe, papel_existente, situacao_existente
    FROM "PlatformMasterIdentity" WHERE "userId" = alvo_id;
  IF ja_existe IS NOT NULL THEN
    IF papel_existente = 'OWNER' AND situacao_existente = 'ACTIVE' THEN
      RAISE NOTICE 'Nada a fazer: este usuario ja e proprietario Master ativo (%).', ja_existe;
      RETURN;
    END IF;
    RAISE EXCEPTION 'Este usuario ja possui identidade Master % / % (%). Este script faz nascer o PRIMEIRO proprietario; ele nao promove papel, nao reativa identidade suspensa e nao altera identidade existente. Trate pela area, com trilha e autoria.',
      papel_existente, situacao_existente, ja_existe;
  END IF;

  IF EXISTS (SELECT 1 FROM "PlatformMasterIdentity" WHERE role = 'OWNER' AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'Ja existe proprietario Master ativo. Nomear outro e prerrogativa do proprietario principal, pela area, nao por script.';
  END IF;

  INSERT INTO "PlatformMasterIdentity" ("id", "userId", "role", "status", "provisionedByNote", "provisionedAt")
  VALUES (${idIdentidade}, alvo_id, 'OWNER', 'ACTIVE', ${n}, now());

  -- actorUserId recebe o ator sistemico, nao o id do novo proprietario:
  -- registrar o proprio alvo como ator afirmaria que ele se autoconcedeu poder
  -- pela aplicacao, o que nao aconteceu. Quem autorizou esta em "reason".
  -- O prefixo "sistema:" permite ao relatorio separar acao sistemica de acao
  -- humana por predicado, sem comparar literal espalhada por cada consulta, e
  -- nao colide com id de pessoa porque cuid nao contem dois-pontos.
  INSERT INTO "PlatformAuditLog"
    ("id", "actorUserId", "action", "scopeKind", "organizationId", "eventId",
     "targetUserId", "reason", "result", "correlationId", "occurredAt")
  VALUES (${idAuditoria}, ${literal(ATOR_DO_BOOTSTRAP)},
     'platform.master_identity_provisioned', 'GLOBAL', '', '',
     alvo_id, ${n}, 'ALLOWED', ${c}, now());

  RAISE NOTICE 'Identidade Master OWNER criada para %.', ${e};
END
$evolvia$;

COMMIT;
`;
}
