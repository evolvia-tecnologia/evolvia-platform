// Disposable CI PostgreSQL only. Unique fixture data is preserved, never deleted.
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
// A montagem vem de `master-fixtures.mjs`. Na primeira versão eu dupliquei os
// helpers e eles divergiram do schema — faltava `provisionedByNote` —, e os
// seis casos morreram na montagem sem medir nada.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import {
  PlatformMasterRepository, derrubarApp, evento, identidade, motivoValido,
  organizacao, pessoa, prisma, sessao,
} from './master-fixtures.mjs';

const { PlatformMasterGuard } = await import('../dist/platform-master.guard.js');

after(async () => { await derrubarApp(); });

const repositorio = new PlatformMasterRepository(prisma);

const guard = (acao) => new PlatformMasterGuard({ get: () => acao }, repositorio);

const contexto = (requisicao) => ({
  switchToHttp: () => ({ getRequest: () => requisicao }),
  getHandler: () => function manipulador() {},
});

const CABECALHO = 'x-evolvia-master-session';

const requisicao = (userId, token, params = {}, body = undefined) => ({
  user: { id: userId },
  params,
  body,
  headers: { [CABECALHO]: token },
});

/**
 * Grava a concessão DIRETO na tabela, sem passar pelo serviço.
 *
 * É o ponto do arquivo: reproduzir o estado que uma escrita direta no banco ou
 * uma migração malfeita deixaria, e não o estado que o serviço consegue
 * produzir — o serviço nem aceitaria `conceder` como ação concedida, porque ela
 * não está no catálogo do que se concede.
 */
const gravarConcessao = (proprietarioId, alvoId, acao, escopo) =>
  prisma.platformGrant.create({
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

async function recusa(executar) {
  try {
    await executar();
  } catch (erro) {
    return erro;
  }
  return null;
}

/**
 * Delegado com sessão fresca.
 *
 * `sessao()` deixa `stepUpAt` recente, e isso importa: sem verificação
 * reforçada fresca, toda ação sensível seria recusada por
 * `EXIGE_VERIFICACAO_RECENTE` e os casos negativos passariam pelo motivo errado
 * — provando que a janela funciona, e nada sobre elevação. O objetivo é dar a
 * esta sessão tudo o que ela pode ter legitimamente, e ainda assim ver a
 * elevação falhar.
 */
async function delegadoComSessao(rotulo) {
  const proprietario = await pessoa(`${rotulo}-owner`);
  const delegado = await pessoa(`${rotulo}-deleg`);
  const ident = await identidade(delegado.id, 'DELEGADO');
  return { proprietario, delegado, token: await sessao(ident.id) };
}

async function eventoDe(rotulo) {
  const dono = await pessoa(`${rotulo}-dono`);
  const org = await organizacao(rotulo, dono.id);
  return { org, evento: await evento(rotulo, dono.id, org.id) };
}

test('linha `conceder` gravada à mão com escopo GLOBAL NÃO eleva o delegado', { timeout: 120000 }, async () => {
  const c = await delegadoComSessao('elev-conceder');

  // O estado que escrita direta no banco ou migração malfeita produziria.
  await gravarConcessao(c.proprietario.id, c.delegado.id, 'conceder', GLOBAL);

  const req = requisicao(c.delegado.id, c.token);
  const erro = await recusa(() => guard('conceder').canActivate(contexto(req)));

  // Se alguém mover `conceder` para ACOES_CONCEDIVEIS para permitir
  // subdelegação, este caso fica vermelho e explica por quê.
  assert.ok(
    erro,
    'uma linha gravada na tabela de concessões elevou o delegado a conceder poderes: a tabela virou caminho de elevação',
  );
  assert.equal(erro.getStatus?.(), 403);
});

test('linha `ampliar` gravada à mão com escopo GLOBAL NÃO eleva o delegado', { timeout: 120000 }, async () => {
  const c = await delegadoComSessao('elev-ampliar');
  await gravarConcessao(c.proprietario.id, c.delegado.id, 'ampliar', GLOBAL);

  const req = requisicao(c.delegado.id, c.token);
  const erro = await recusa(() => guard('ampliar').canActivate(contexto(req)));

  assert.ok(erro, 'o delegado conseguiu ampliar a própria concessão');
  assert.equal(erro.getStatus?.(), 403);
});

test('alcance GLOBAL de consulta não modera nada', { timeout: 120000 }, async () => {
  const c = await delegadoComSessao('elev-consulta');
  const { evento: alvo } = await eventoDe('elev-consulta-ev');

  // Escopo o mais largo possível, ação a mais inofensiva. Ação e escopo são
  // independentes, e é isto que impede "global" de significar "tudo".
  await gravarConcessao(c.proprietario.id, c.delegado.id, 'consultar', GLOBAL);

  const req = requisicao(c.delegado.id, c.token, { eventId: alvo.id }, { motivo: motivoValido });
  const erro = await recusa(() => guard('suspender').canActivate(contexto(req)));

  assert.ok(erro, 'concessão global de consulta autorizou moderar: ação e escopo deixaram de ser independentes');
  assert.equal(erro.getStatus?.(), 403);
});

test('CONTROLE POSITIVO: o proprietário concede', { timeout: 120000 }, async () => {
  const proprietario = await pessoa('elev-owner-real');
  const ident = await identidade(proprietario.id, 'OWNER');
  const token = await sessao(ident.id);

  const req = requisicao(proprietario.id, token);
  const permitido = await guard('conceder').canActivate(contexto(req));

  // Sem este caso, os negativos acima poderiam estar passando por fixture
  // quebrado — papel trocado, sessão vencida, identidade ausente — e eu teria
  // um verde que não prova nada. Foi exatamente isso que aconteceu no run
  // anterior, e por isso o controle positivo não é luxo.
  assert.equal(permitido, true, 'o proprietário foi recusado: o fixture está quebrado e os negativos acima não valem');
});

test('CONTROLE POSITIVO: delegado com `suspender` no evento suspende, com motivo', { timeout: 120000 }, async () => {
  const c = await delegadoComSessao('elev-modera');
  const { evento: alvo } = await eventoDe('elev-modera-ev');

  await gravarConcessao(c.proprietario.id, c.delegado.id, 'suspender', { kind: 'EVENTO', eventId: alvo.id });

  const req = requisicao(c.delegado.id, c.token, { eventId: alvo.id }, { motivo: motivoValido });
  const permitido = await guard('suspender').canActivate(contexto(req));

  assert.equal(
    permitido,
    true,
    'a delegação legítima de moderar foi recusada: negação indiscriminada não é segurança, é área inutilizável',
  );
});

test('a mesma delegação SEM motivo no corpo é recusada', { timeout: 120000 }, async () => {
  const c = await delegadoComSessao('elev-sem-motivo');
  const { evento: alvo } = await eventoDe('elev-sem-motivo-ev');

  await gravarConcessao(c.proprietario.id, c.delegado.id, 'suspender', { kind: 'EVENTO', eventId: alvo.id });

  // Mesma concessão e mesmo evento do caso anterior. A ÚNICA diferença é o
  // motivo ausente — então o que falhar é por causa dele.
  const req = requisicao(c.delegado.id, c.token, { eventId: alvo.id }, {});
  const erro = await recusa(() => guard('suspender').canActivate(contexto(req)));

  assert.ok(erro, 'moderou sem motivo escrito: a trilha ficaria sem a justificativa da suspensão');
  assert.equal(erro.getStatus?.(), 403);
});
