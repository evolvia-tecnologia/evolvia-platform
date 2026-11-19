// Disposable CI database only; fixture rows are preserved.
//
// Elevação de privilégio na Área Master, exercitada contra banco real.
//
// A defesa aqui não é uma checagem: `conceder`, `revogar`, `ampliar` e
// `administrar_equipe` estão em `ACOES_DO_PROPRIETARIO` e FORA de
// `ACOES_CONCEDIVEIS`, e `decidir` recusa `SOMENTE_PROPRIETARIO` antes de olhar
// concessão nenhuma. Em teoria, portanto, não existe linha de concessão capaz
// de elevar.
//
// "Em teoria" é o motivo deste arquivo. A garantia atravessa três camadas —
// linha no banco, mapeamento do repositório, política pura — e um teste com
// cliente falso só exercita a terceira. Quem responde se a corrente inteira
// aguenta é o PostgreSQL, com a linha de verdade gravada.
//
// Importação do `dist` porque o guard carrega decorators, que o Node com type
// stripping não parseia.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PlatformMasterRepository } from '../dist/platform-master.repository.js';
import { PlatformMasterGuard } from '../dist/platform-master.guard.js';

const db = new PrismaClient();
after(() => db.$disconnect());

const repositorio = new PlatformMasterRepository(db);

const guard = (acao) => new PlatformMasterGuard({ get: () => acao }, repositorio);

const contexto = (requisicao) => ({
  switchToHttp: () => ({ getRequest: () => requisicao }),
  getHandler: () => function manipulador() {},
});

const CABECALHO = 'x-evolvia-master-session';
const hash = (token) => createHash('sha256').update(token).digest('hex');

const MOTIVO = 'suspensao por infracao confirmada pela auditoria';

const pessoa = (rotulo) => db.user.create({
  data: { name: rotulo, email: `elevacao-${randomUUID()}@evolvia-ci.local`, passwordHash: 'fixture' },
});

/**
 * Identidade Master ativa com sessão fresca.
 *
 * `stepUpAt` recente de propósito: sem ele, toda ação sensível seria recusada
 * por `EXIGE_VERIFICACAO_RECENTE` e os casos negativos passariam pelo motivo
 * errado — provando que a verificação reforçada funciona, e nada sobre
 * elevação. O objetivo é dar a esta sessão tudo o que ela pode ter
 * legitimamente, e ainda assim ver a elevação falhar.
 */
async function comSessao(userId, papel) {
  const identidade = await db.platformMasterIdentity.create({
    data: { userId, role: papel, status: 'ACTIVE' },
    select: { id: true },
  });
  const token = randomUUID();
  const agora = new Date();
  await db.platformMasterSession.create({
    data: {
      identityId: identidade.id,
      tokenHash: hash(token),
      secondFactorAt: agora,
      stepUpAt: agora,
      expiresAt: new Date(agora.getTime() + 3600_000),
    },
  });
  return token;
}

async function eventoDe(proprietarioId) {
  const organizacao = await db.organization.create({
    data: { name: `ELEV org ${randomUUID()}`, slug: `elev-org-${randomUUID()}`, createdById: proprietarioId },
  });
  const evento = await db.event.create({
    data: {
      ownerId: proprietarioId,
      organizationId: organizacao.id,
      name: 'ELEV evento',
      slug: `elev-evento-${randomUUID()}`,
      eventType: 'CONGRESSO',
      format: 'IN_PERSON',
      registrationMode: 'FREE',
    },
  });
  return { organizacao, evento };
}

/**
 * Grava a concessão DIRETO na tabela, sem passar pelo serviço.
 *
 * É o ponto do arquivo: reproduzir o estado que uma escrita direta no banco ou
 * uma migração malfeita deixaria, e não o estado que o serviço consegue
 * produzir. O serviço nem aceitaria `conceder` como ação concedida.
 */
const gravarConcessao = (proprietarioId, alvoId, acao, escopo) =>
  db.platformGrant.create({
    data: {
      targetUserId: alvoId,
      action: acao,
      scopeKind: escopo.kind,
      organizationId: escopo.organizationId ?? '',
      eventId: escopo.eventId ?? '',
      grantedByUserId: proprietarioId,
      expiresAt: new Date(Date.now() + 30 * 86400_000),
    },
  });

const GLOBAL = { kind: 'GLOBAL' };

const requisicao = (userId, token, params = {}, body = undefined) => ({
  user: { id: userId },
  params,
  body,
  headers: { [CABECALHO]: token },
});

async function recusa(executar) {
  try {
    await executar();
  } catch (erro) {
    return erro;
  }
  return null;
}

async function delegadoComSessao() {
  const proprietario = await pessoa('ELEV proprietário');
  const delegado = await pessoa('ELEV delegado');
  const token = await comSessao(delegado.id, 'DELEGADO');
  return { proprietario, delegado, token };
}

test('linha `conceder` gravada à mão com escopo GLOBAL NÃO eleva o delegado', async () => {
  const { proprietario, delegado, token } = await delegadoComSessao();

  // O estado que escrita direta no banco ou migração malfeita produziria.
  await gravarConcessao(proprietario.id, delegado.id, 'conceder', GLOBAL);

  const req = requisicao(delegado.id, token);
  const erro = await recusa(() => guard('conceder').canActivate(contexto(req)));

  // Se alguém mover `conceder` para ACOES_CONCEDIVEIS \"para permitir
  // subdelegação\", este caso fica vermelho e explica por quê.
  assert.ok(
    erro,
    'uma linha gravada na tabela de concessões elevou o delegado a conceder poderes: a tabela virou caminho de elevação',
  );
  assert.equal(erro.getStatus?.(), 403);
});

test('linha `ampliar` gravada à mão com escopo GLOBAL NÃO eleva o delegado', async () => {
  const { proprietario, delegado, token } = await delegadoComSessao();
  await gravarConcessao(proprietario.id, delegado.id, 'ampliar', GLOBAL);

  const req = requisicao(delegado.id, token);
  const erro = await recusa(() => guard('ampliar').canActivate(contexto(req)));

  assert.ok(erro, 'o delegado conseguiu ampliar a própria concessão');
  assert.equal(erro.getStatus?.(), 403);
});

test('alcance GLOBAL de consulta não modera nada', async () => {
  const { proprietario, delegado, token } = await delegadoComSessao();
  const { evento } = await eventoDe(proprietario.id);

  // Escopo o mais largo possível, ação a mais inofensiva. Ação e escopo são
  // independentes, e é isto que impede \"global\" de significar \"tudo\".
  await gravarConcessao(proprietario.id, delegado.id, 'consultar', GLOBAL);

  const req = requisicao(delegado.id, token, { eventId: evento.id }, { motivo: MOTIVO });
  const erro = await recusa(() => guard('suspender').canActivate(contexto(req)));

  assert.ok(erro, 'concessão global de consulta autorizou moderar: ação e escopo deixaram de ser independentes');
  assert.equal(erro.getStatus?.(), 403);
});

test('CONTROLE POSITIVO: o proprietário concede', async () => {
  const proprietario = await pessoa('ELEV proprietário real');
  const token = await comSessao(proprietario.id, 'OWNER');

  const req = requisicao(proprietario.id, token);
  const permitido = await guard('conceder').canActivate(contexto(req));

  // Sem este caso, os negativos acima poderiam estar passando por fixture
  // quebrado — papel trocado, sessão vencida, identidade ausente — e eu teria
  // um verde que não prova nada.
  assert.equal(permitido, true, 'o proprietário foi recusado: o fixture está quebrado e os negativos acima não valem');
});

test('CONTROLE POSITIVO: delegado com `suspender` no evento suspende, com motivo', async () => {
  const { proprietario, delegado, token } = await delegadoComSessao();
  const { evento } = await eventoDe(proprietario.id);

  await gravarConcessao(proprietario.id, delegado.id, 'suspender', { kind: 'EVENTO', eventId: evento.id });

  const req = requisicao(delegado.id, token, { eventId: evento.id }, { motivo: MOTIVO });
  const permitido = await guard('suspender').canActivate(contexto(req));

  assert.equal(
    permitido,
    true,
    'a delegação legítima de moderar foi recusada: negação indiscriminada não é segurança, é área inutilizável',
  );
});

test('a mesma delegação SEM motivo no corpo é recusada', async () => {
  const { proprietario, delegado, token } = await delegadoComSessao();
  const { evento } = await eventoDe(proprietario.id);

  await gravarConcessao(proprietario.id, delegado.id, 'suspender', { kind: 'EVENTO', eventId: evento.id });

  // Mesma pessoa, mesma concessão, mesmo evento do caso anterior. A ÚNICA
  // diferença é o motivo ausente — então o que falhar é por causa dele.
  const req = requisicao(delegado.id, token, { eventId: evento.id }, {});
  const erro = await recusa(() => guard('suspender').canActivate(contexto(req)));

  assert.ok(erro, 'moderou sem motivo escrito: a trilha ficaria sem a justificativa da suspensão');
  assert.equal(erro.getStatus?.(), 403);
});
