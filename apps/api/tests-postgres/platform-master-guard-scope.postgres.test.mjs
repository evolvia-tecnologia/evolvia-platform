// Disposable CI PostgreSQL only. Unique fixture data is preserved, never deleted.
//
// O escopo do guard nas rotas de evento, exercitado contra banco real.
//
// O defeito que este arquivo fixa era de RESOLUÇÃO: `events/:eventId/summary` e
// `events/:eventId/audit` não têm `:organizationId` na rota, então o alvo saía
// com `organizationId: ''` e nenhuma concessão de organização casava com string
// vazia. Descobrir a organização do evento exige o evento gravado — com cliente
// falso a resposta é o que o dublê mandar, e o defeito desaparece.
//
// A montagem vem toda de `master-fixtures.mjs`. Na primeira versão eu escrevi
// helpers próprios e eles divergiram do schema — faltava
// `provisionedByNote` —, derrubando os cinco casos antes das asserções. Uma
// fonte só de fixture é o que impede isso de voltar.
//
// O guard carrega decorators, que o Node com type stripping não parseia; por
// isso ele vem do `dist`, pelo reexport do fixture.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import {
  PlatformMasterRepository, derrubarApp, evento, identidade,
  organizacao, pessoa, prisma, sessao,
} from './master-fixtures.mjs';

const { PlatformMasterGuard } = await import('../dist/platform-master.guard.js');

after(async () => { await derrubarApp(); });

const repositorio = new PlatformMasterRepository(prisma);

// Dublê do Reflector: devolve sempre a ação declarada pela rota. O que está em
// prova aqui é o ESCOPO, não a leitura da metadata — e rota sem ação declarada
// já tem cobertura própria.
const guard = (acao) => new PlatformMasterGuard({ get: () => acao }, repositorio);

const contexto = (requisicao) => ({
  switchToHttp: () => ({ getRequest: () => requisicao }),
  getHandler: () => function manipulador() {},
});

const CABECALHO = 'x-evolvia-master-session';

const requisicao = (userId, token, params) => ({
  user: { id: userId },
  params,
  headers: { [CABECALHO]: token },
});

/** Concessão com escopo de ORGANIZAÇÃO, gravada direto: o alvo é o guard. */
const concederNaOrganizacao = (proprietarioId, delegadoId, organizationId, acao) =>
  prisma.platformGrant.create({
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

/** Delegado com concessão de `consultar` na organização PRÓPRIA, e nada na alheia. */
async function cenario(rotulo) {
  const proprietario = await pessoa(`${rotulo}-owner`);
  const delegado = await pessoa(`${rotulo}-deleg`);
  const dono = await pessoa(`${rotulo}-dono`);

  const propria = await organizacao(`${rotulo}-propria`, dono.id);
  const alheia = await organizacao(`${rotulo}-alheia`, dono.id);
  const eventoProprio = await evento(`${rotulo}-proprio`, dono.id, propria.id);
  const eventoAlheio = await evento(`${rotulo}-alheio`, dono.id, alheia.id);

  const ident = await identidade(delegado.id, 'DELEGADO');
  const token = await sessao(ident.id);
  await concederNaOrganizacao(proprietario.id, delegado.id, propria.id, 'consultar');

  return { proprietario, delegado, token, propria, alheia, eventoProprio, eventoAlheio };
}

test('delegado de organização ALCANÇA a rota do evento da sua organização', { timeout: 120000 }, async () => {
  const c = await cenario('guard-alcanca');

  // A rota real não traz `:organizationId` — é exatamente isto que produzia o
  // defeito, e por isso o parâmetro não aparece aqui.
  const req = requisicao(c.delegado.id, c.token, { eventId: c.eventoProprio.id });

  const permitido = await guard('consultar').canActivate(contexto(req));

  assert.equal(
    permitido,
    true,
    'o delegado da organização foi recusado no evento dela: era este o defeito, e só o proprietário conseguia abrir',
  );
});

test('o alvo validado leva a organização PERSISTIDA para quem responde', { timeout: 120000 }, async () => {
  const c = await cenario('guard-alvo');
  const req = requisicao(c.delegado.id, c.token, { eventId: c.eventoProprio.id });

  await guard('consultar').canActivate(contexto(req));

  // Liberar a rota e entregar um alvo com organização vazia seria autorizar por
  // um recurso e aplicar a outro — o que a derivação única existe para impedir.
  assert.equal(req.master.alvo.tipo, 'EVENTO');
  assert.equal(req.master.alvo.eventId, c.eventoProprio.id);
  assert.equal(
    req.master.alvo.organizationId,
    c.propria.id,
    'o alvo validado não carregou a organização do evento',
  );
});

test('delegado de organização NÃO alcança evento de OUTRA organização', { timeout: 120000 }, async () => {
  const c = await cenario('guard-alheio');
  const req = requisicao(c.delegado.id, c.token, { eventId: c.eventoAlheio.id });

  const erro = await recusa(() => guard('consultar').canActivate(contexto(req)));

  // A correção amplia acesso; sem este caso eu entregaria o alargamento sem o
  // limite que o torna aceitável.
  assert.ok(erro, 'o delegado alcançou um evento de organização onde não tem concessão');
  assert.equal(erro.getStatus?.(), 403, 'a recusa de escopo deveria ser 403');
});

test('o organizationId do parâmetro não amplia o alcance', { timeout: 120000 }, async () => {
  const c = await cenario('guard-parametro');

  // A organização onde a pessoa TEM concessão, com um evento de outra. Se a
  // decisão aceitasse o parâmetro, isto passaria.
  const req = requisicao(c.delegado.id, c.token, {
    eventId: c.eventoAlheio.id,
    organizationId: c.propria.id,
  });

  const erro = await recusa(() => guard('consultar').canActivate(contexto(req)));

  assert.ok(erro, 'o parâmetro da rota ampliou o alcance: a autorização passou a depender do chamador');
  assert.equal(erro.getStatus?.(), 403);
  assert.equal(
    req.master.alvo.organizationId,
    c.alheia.id,
    'o alvo ficou com a organização do parâmetro em vez da persistida',
  );
});

test('evento inexistente recusa com 403, e não com 404', { timeout: 120000 }, async () => {
  const c = await cenario('guard-inexistente');
  const req = requisicao(c.delegado.id, c.token, { eventId: 'evento-que-nao-existe-no-banco' });

  const erro = await recusa(() => guard('consultar').canActivate(contexto(req)));

  assert.ok(erro, 'evento inexistente foi liberado para o delegado');
  assert.equal(
    erro.getStatus?.(),
    403,
    'responder 404 aqui faria o par 404/403 contar quais ids de evento existem para quem não acessa nenhum',
  );
});
