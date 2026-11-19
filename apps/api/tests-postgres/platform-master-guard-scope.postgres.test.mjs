// Disposable CI database only; fixture rows are preserved.
//
// O escopo do guard nas rotas de evento só se prova com banco, porque o defeito
// era de RESOLUÇÃO: `events/:eventId/summary` e `events/:eventId/audit` não têm
// `:organizationId` na rota, então o alvo saía com `organizationId: ''` e
// nenhuma concessão de organização casava com string vazia. Descobrir a
// organização do evento exige o evento gravado — com cliente falso, a resposta
// é o que o dublê mandar, e o defeito desaparece.
//
// O guard carrega decorators, que o Node com type stripping não parseia. Por
// isso a importação vem do `dist`, como nos outros arquivos desta pasta.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PlatformMasterRepository } from '../dist/platform-master.repository.js';
import { PlatformMasterGuard, CABECALHO_DA_SESSAO } from '../dist/platform-master.guard.js';

const db = new PrismaClient();
after(() => db.$disconnect());

const repositorio = new PlatformMasterRepository(db);

// Dublê do Reflector: devolve sempre a ação declarada pela rota. O que está em
// prova aqui é o ESCOPO, não a leitura da metadata — e o caso de rota sem ação
// declarada já tem cobertura própria.
const reflector = (acao) => ({ get: () => acao });

const guard = (acao) => new PlatformMasterGuard(reflector(acao), repositorio);

const contexto = (requisicao) => ({
  switchToHttp: () => ({ getRequest: () => requisicao }),
  getHandler: () => function manipulador() {},
});

const hash = (token) => createHash('sha256').update(token).digest('hex');

const pessoa = (rotulo) => db.user.create({
  data: { name: rotulo, email: `guard-${randomUUID()}@evolvia-ci.local`, passwordHash: 'fixture' },
});

/** Identidade Master ativa com sessão fresca, e o token cru para o cabeçalho. */
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

async function organizacaoComEvento(proprietarioId, rotulo) {
  const organizacao = await db.organization.create({
    data: { name: `GUARD ${rotulo} ${randomUUID()}`, slug: `guard-${randomUUID()}`, createdById: proprietarioId },
  });
  const evento = await db.event.create({
    data: {
      ownerId: proprietarioId,
      organizationId: organizacao.id,
      name: `GUARD evento ${rotulo}`,
      slug: `guard-evento-${randomUUID()}`,
      eventType: 'CONGRESSO',
      format: 'IN_PERSON',
      registrationMode: 'FREE',
    },
  });
  return { organizacao, evento };
}

/** Concessão com escopo de ORGANIZAÇÃO, gravada direto. */
const concederNaOrganizacao = (proprietarioId, delegadoId, organizationId, acao) =>
  db.platformGrant.create({
    data: {
      targetUserId: delegadoId,
      action: acao,
      scopeKind: 'ORGANIZACAO',
      organizationId,
      eventId: '',
      grantedByUserId: proprietarioId,
      expiresAt: new Date(Date.now() + 30 * 86400_000),
    },
  });

const requisicao = (userId, token, params) => ({
  user: { id: userId },
  params,
  headers: { [CABECALHO_DA_SESSAO]: token },
});

/**
 * Devolve o erro em vez de deixá-lo subir, para que o caso confira o STATUS.
 *
 * A mensagem vem de `decidir`; prendê-la aqui faria melhoria de texto virar
 * teste vermelho sem proteger nada.
 */
async function recusa(executar) {
  try {
    await executar();
  } catch (erro) {
    return erro;
  }
  return null;
}

async function cenario() {
  const proprietario = await pessoa('GUARD proprietário');
  const delegado = await pessoa('GUARD delegado');
  const propria = await organizacaoComEvento(proprietario.id, 'própria');
  const alheia = await organizacaoComEvento(proprietario.id, 'alheia');
  const token = await comSessao(delegado.id, 'DELEGADO');
  await concederNaOrganizacao(proprietario.id, delegado.id, propria.organizacao.id, 'consultar');
  return { proprietario, delegado, token, propria, alheia };
}

test('delegado de organização ALCANÇA a rota do evento da sua organização', async () => {
  const { delegado, token, propria } = await cenario();

  // A rota real não traz `:organizationId` — é exatamente isto que produzia o
  // defeito, e por isso o parâmetro não aparece aqui.
  const req = requisicao(delegado.id, token, { eventId: propria.evento.id });

  const permitido = await guard('consultar').canActivate(contexto(req));

  assert.equal(
    permitido,
    true,
    'o delegado da organização foi recusado no evento dela: era este o defeito, e só o proprietário conseguia abrir',
  );
});

test('o alvo validado leva a organização PERSISTIDA para quem responde', async () => {
  const { delegado, token, propria } = await cenario();
  const req = requisicao(delegado.id, token, { eventId: propria.evento.id });

  await guard('consultar').canActivate(contexto(req));

  // Liberar a rota e entregar um alvo com organização vazia seria autorizar por
  // um recurso e aplicar a outro — o que a derivação única existe para impedir.
  assert.equal(req.master.alvo.tipo, 'EVENTO');
  assert.equal(req.master.alvo.eventId, propria.evento.id);
  assert.equal(
    req.master.alvo.organizationId,
    propria.organizacao.id,
    'o alvo validado não carregou a organização do evento',
  );
});

test('delegado de organização NÃO alcança evento de OUTRA organização', async () => {
  const { delegado, token, alheia } = await cenario();
  const req = requisicao(delegado.id, token, { eventId: alheia.evento.id });

  const erro = await recusa(() => guard('consultar').canActivate(contexto(req)));

  // A correção amplia acesso; sem este caso eu entregaria o alargamento sem o
  // limite que o torna aceitável.
  assert.ok(erro, 'o delegado alcançou um evento de organização onde não tem concessão');
  assert.equal(erro.getStatus?.(), 403, 'a recusa de escopo deveria ser 403');
});

test('o organizationId do parâmetro não amplia o alcance', async () => {
  const { delegado, token, propria, alheia } = await cenario();

  // A organização onde a pessoa TEM concessão, com um evento de outra. Se a
  // decisão aceitasse o parâmetro, isto passaria.
  const req = requisicao(delegado.id, token, {
    eventId: alheia.evento.id,
    organizationId: propria.organizacao.id,
  });

  const erro = await recusa(() => guard('consultar').canActivate(contexto(req)));

  assert.ok(erro, 'o parâmetro da rota ampliou o alcance: a autorização passou a depender do chamador');
  assert.equal(erro.getStatus?.(), 403);
  assert.equal(
    req.master.alvo.organizationId,
    alheia.organizacao.id,
    'o alvo ficou com a organização do parâmetro em vez da persistida',
  );
});

test('evento inexistente recusa com 403, e não com 404', async () => {
  const { delegado, token } = await cenario();
  const req = requisicao(delegado.id, token, { eventId: `inexistente-${randomUUID()}` });

  const erro = await recusa(() => guard('consultar').canActivate(contexto(req)));

  assert.ok(erro, 'evento inexistente foi liberado para o delegado');
  assert.equal(
    erro.getStatus?.(),
    403,
    'responder 404 aqui faria o par 404/403 contar quais ids de evento existem para quem não acessa nenhum',
  );
});
