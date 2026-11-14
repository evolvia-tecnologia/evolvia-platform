// Disposable CI PostgreSQL only. Unique fixture data is preserved, never deleted.
//
// Prova HTTP real do relatório da trilha de auditoria por escopo (#665).
//
// A regra em prova: **o escopo vem da rota, o filtro vem do corpo, e o filtro
// só pode estreitar.** `platform-audit-report.test.mjs` prova isso na função
// pura, com 32 casos e mutação. Aqui se prova o que aquele arquivo NÃO pode
// provar: que os decorators compõem, que o guard confere a concessão para a
// rota certa, e que o escopo que chega ao relatório é o mesmo que foi
// autorizado. O Node não parseia decorators; isto só se mede subindo a
// aplicação.
//
// ISOLAMENTO: cada teste cria o próprio ator sintético e filtra o relatório por
// `actorUserId`. O banco de CI acumula linhas de outras execuções; sem o filtro,
// elas empurrariam as linhas do teste fora da página e o resultado passaria a
// depender da ordem de execução. O filtro é parte do que se mede, não um atalho:
// ele estreita, e o escopo continua decidindo o que pode ser visto.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { randomBytes } from 'node:crypto';
import {
  chamar, crachar, derrubarApp, evento, identidade, motivoValido,
  organizacao, pessoa, prisma, sessao, subirApp, trilha,
} from './master-fixtures.mjs';

before(async () => { await subirApp(); });
after(async () => { await derrubarApp(); });

/** Monta proprietário, delegado, organização e dois eventos. */
async function cenario(rotulo) {
  const proprietario = await pessoa(`${rotulo}-owner`);
  const delegado = await pessoa(`${rotulo}-deleg`);
  const ator = await pessoa(`${rotulo}-ator`);
  const identOwner = await identidade(proprietario.id, 'OWNER');
  const identDeleg = await identidade(delegado.id, 'DELEGADO');
  const dono = await pessoa(`${rotulo}-dono`);
  const org = await organizacao(rotulo, dono.id);
  return {
    proprietario,
    delegado,
    ator,
    jwtOwner: crachar(proprietario.id, proprietario.email),
    jwtDeleg: crachar(delegado.id, delegado.email),
    masterOwner: await sessao(identOwner.id),
    masterDeleg: await sessao(identDeleg.id),
    org,
    eventoA: await evento(`${rotulo}-a`, dono.id, org.id),
    eventoB: await evento(`${rotulo}-b`, dono.id, org.id),
  };
}

async function conceder(c, acoes, escopo) {
  const r = await chamar('/platform/master/grants', c.jwtOwner, {
    method: 'POST', master: c.masterOwner,
    body: JSON.stringify({ pessoas: [c.delegado.id], acoes, escopo, motivo: motivoValido }),
  });
  assert.ok(r.ok, `concessão falhou: ${r.status} ${await r.text()}`);
}

const relatorio = async (caminho, jwt, master, filtro) => {
  const r = await chamar(caminho, jwt, { method: 'POST', master, body: JSON.stringify(filtro) });
  return { status: r.status, corpo: r.ok ? await r.json() : await r.text() };
};

// ------------------------------------------------- a plataforma inteira

test('o proprietário lê a trilha da plataforma, com as linhas dos dois eventos e a global', { timeout: 120000 }, async () => {
  const c = await cenario('aud-plat');
  await trilha({ actorUserId: c.ator.id, action: 'consultar', scopeKind: 'EVENTO', organizationId: c.org.id, eventId: c.eventoA.id, correlationId: 'plat-a' });
  await trilha({ actorUserId: c.ator.id, action: 'consultar', scopeKind: 'EVENTO', organizationId: c.org.id, eventId: c.eventoB.id, correlationId: 'plat-b' });
  await trilha({ actorUserId: c.ator.id, action: 'conceder', scopeKind: 'GLOBAL', correlationId: 'plat-g' });

  const { status, corpo } = await relatorio('/platform/master/audit', c.jwtOwner, c.masterOwner, { actorUserId: c.ator.id });
  assert.equal(status, 201, corpo);
  assert.deepEqual(corpo.escopo, { tipo: 'PLATAFORMA' });
  assert.equal(corpo.mostrados, 3);
  assert.deepEqual([...corpo.itens.map((i) => i.correlacao)].sort(), ['plat-a', 'plat-b', 'plat-g']);
  assert.equal(corpo.truncado, false);
  assert.equal(corpo.agregadosSobre, 'tudo');
});

// --------------------------------------- a fronteira entre dois eventos

test('delegado com auditar em UM evento lê aquele e recebe 403 no outro e na plataforma', { timeout: 120000 }, async () => {
  const c = await cenario('aud-fronteira');
  await conceder(c, ['auditar'], { tipo: 'EVENTOS', eventIds: [c.eventoA.id] });

  await trilha({ actorUserId: c.ator.id, action: 'consultar', scopeKind: 'EVENTO', organizationId: c.org.id, eventId: c.eventoA.id, correlationId: 'fr-a' });
  await trilha({ actorUserId: c.ator.id, action: 'suspender', scopeKind: 'EVENTO', organizationId: c.org.id, eventId: c.eventoB.id, correlationId: 'fr-b' });

  const doA = await relatorio(`/platform/master/events/${c.eventoA.id}/audit`, c.jwtDeleg, c.masterDeleg, { actorUserId: c.ator.id });
  assert.equal(doA.status, 201, doA.corpo);
  assert.deepEqual(doA.corpo.escopo, { tipo: 'EVENTO', eventId: c.eventoA.id });
  assert.equal(doA.corpo.mostrados, 1);
  assert.equal(doA.corpo.itens[0].correlacao, 'fr-a');
  assert.ok(
    !doA.corpo.itens.some((i) => i.correlacao === 'fr-b'),
    'a linha do outro evento NÃO pode aparecer — é isto que o arquivo existe para medir',
  );

  const doB = await relatorio(`/platform/master/events/${c.eventoB.id}/audit`, c.jwtDeleg, c.masterDeleg, {});
  assert.equal(doB.status, 403, 'a concessão de A não alcança B');

  const daPlataforma = await relatorio('/platform/master/audit', c.jwtDeleg, c.masterDeleg, {});
  assert.equal(daPlataforma.status, 403, 'o alvo da rota sem parâmetro é a plataforma, e exige alcance global');
});

test('ação de alcance GLOBAL não aparece no relatório de um evento', { timeout: 120000 }, async () => {
  // Limite declarado. A linha foi gravada sem eventId, e mostrá-la a quem
  // audita um evento contaria o que acontece no resto da plataforma.
  const c = await cenario('aud-global');
  await conceder(c, ['auditar'], { tipo: 'EVENTOS', eventIds: [c.eventoA.id] });
  await trilha({ actorUserId: c.ator.id, action: 'conceder', scopeKind: 'GLOBAL', correlationId: 'gl-g' });
  await trilha({ actorUserId: c.ator.id, action: 'consultar', scopeKind: 'EVENTO', organizationId: c.org.id, eventId: c.eventoA.id, correlationId: 'gl-a' });

  const doEvento = await relatorio(`/platform/master/events/${c.eventoA.id}/audit`, c.jwtDeleg, c.masterDeleg, { actorUserId: c.ator.id });
  assert.equal(doEvento.status, 201, doEvento.corpo);
  assert.deepEqual(doEvento.corpo.itens.map((i) => i.correlacao), ['gl-a']);

  // E para o proprietário, na plataforma, ela aparece.
  const daPlataforma = await relatorio('/platform/master/audit', c.jwtOwner, c.masterOwner, { actorUserId: c.ator.id });
  assert.equal(daPlataforma.status, 201, daPlataforma.corpo);
  assert.ok(daPlataforma.corpo.itens.some((i) => i.correlacao === 'gl-g'), 'a linha global existe e é legível por quem tem alcance global');
});

test('a recusa que o guard grava é legível pela mesma rota que ela protege', { timeout: 120000 }, async () => {
  // Fecha o circuito: tentar ler o que não alcança deixa rastro, e o rastro
  // aparece no relatório. Negar sem registrar é como não ter negado.
  const c = await cenario('aud-recusa');
  await conceder(c, ['auditar'], { tipo: 'EVENTOS', eventIds: [c.eventoA.id] });

  const antes = await prisma.platformAuditLog.count({ where: { actorUserId: c.delegado.id } });
  const tentativa = await relatorio(`/platform/master/events/${c.eventoB.id}/audit`, c.jwtDeleg, c.masterDeleg, {});
  assert.equal(tentativa.status, 403);
  assert.equal(
    await prisma.platformAuditLog.count({ where: { actorUserId: c.delegado.id } }), antes + 1,
    'a recusa tem de entrar na trilha',
  );

  const visto = await relatorio('/platform/master/audit', c.jwtOwner, c.masterOwner, { actorUserId: c.delegado.id });
  assert.equal(visto.status, 201, visto.corpo);
  const recusa = visto.corpo.itens.find((i) => i.acao.startsWith('auditar:'));
  assert.ok(recusa, `nenhuma linha de recusa em ${JSON.stringify(visto.corpo.itens.map((i) => i.acao))}`);
  assert.equal(recusa.resultado, 'DENIED');
  assert.equal(recusa.acao, 'auditar:FORA_DO_ESCOPO');
  assert.equal(recusa.eventId, c.eventoB.id, 'contra o evento que ela tentou alcançar');
});

// -------------------------------------------- o corpo não amplia o escopo

test('mandar escopo no corpo é 400, e não um relatório de outro evento', { timeout: 120000 }, async () => {
  // O DTO não tem campo de escopo, e o ValidationPipe roda com
  // forbidNonWhitelisted. Entre recusar e ignorar em silencio, recusar é
  // melhor: quem mandou acha que pediu uma coisa e receberia outra.
  const c = await cenario('aud-corpo');
  await conceder(c, ['auditar'], { tipo: 'EVENTOS', eventIds: [c.eventoA.id] });

  for (const corpo of [{ eventId: c.eventoB.id }, { escopo: { tipo: 'PLATAFORMA' } }, { organizationId: c.org.id }]) {
    const r = await relatorio(`/platform/master/events/${c.eventoA.id}/audit`, c.jwtDeleg, c.masterDeleg, corpo);
    assert.equal(r.status, 400, `${JSON.stringify(corpo)} deveria ser recusado e deu ${r.status}`);
  }
});

test('o filtro do corpo estreita dentro do escopo, e nunca além dele', { timeout: 120000 }, async () => {
  const c = await cenario('aud-estreita');
  await conceder(c, ['auditar'], { tipo: 'EVENTOS', eventIds: [c.eventoA.id] });
  const outro = await pessoa('aud-estreita-outro');

  await trilha({ actorUserId: c.ator.id, action: 'consultar', scopeKind: 'EVENTO', organizationId: c.org.id, eventId: c.eventoA.id, result: 'ALLOWED', correlationId: 'es-1' });
  await trilha({ actorUserId: c.ator.id, action: 'suspender', scopeKind: 'EVENTO', organizationId: c.org.id, eventId: c.eventoA.id, result: 'DENIED', correlationId: 'es-2' });
  await trilha({ actorUserId: outro.id, action: 'consultar', scopeKind: 'EVENTO', organizationId: c.org.id, eventId: c.eventoA.id, correlationId: 'es-3' });

  const porAtor = await relatorio(`/platform/master/events/${c.eventoA.id}/audit`, c.jwtDeleg, c.masterDeleg, { actorUserId: c.ator.id });
  assert.equal(porAtor.status, 201, porAtor.corpo);
  assert.deepEqual([...porAtor.corpo.itens.map((i) => i.correlacao)].sort(), ['es-1', 'es-2']);

  const porAcao = await relatorio(`/platform/master/events/${c.eventoA.id}/audit`, c.jwtDeleg, c.masterDeleg, { actorUserId: c.ator.id, acoes: ['suspender'] });
  assert.deepEqual(porAcao.corpo.itens.map((i) => i.correlacao), ['es-2']);

  const porResultado = await relatorio(`/platform/master/events/${c.eventoA.id}/audit`, c.jwtDeleg, c.masterDeleg, { actorUserId: c.ator.id, resultados: ['DENIED'] });
  assert.deepEqual(porResultado.corpo.itens.map((i) => i.correlacao), ['es-2']);
  assert.equal(porResultado.corpo.porResultado.DENIED, 1);
  assert.equal(porResultado.corpo.porResultado.ALLOWED, 0, 'resultado sem ocorrência é zero, não ausente');
});

// --------------------------------------------- truncamento e limites

test('truncar nunca é silencioso pela rota', { timeout: 120000 }, async () => {
  const c = await cenario('aud-trunca');
  const agora = Date.now();
  for (let i = 0; i < 3; i += 1) {
    await trilha({
      actorUserId: c.ator.id, action: 'consultar', scopeKind: 'EVENTO',
      organizationId: c.org.id, eventId: c.eventoA.id,
      correlationId: `tr-${i}`, occurredAt: new Date(agora - i * 1000),
    });
  }

  const cortado = await relatorio('/platform/master/audit', c.jwtOwner, c.masterOwner, { actorUserId: c.ator.id, limite: 2 });
  assert.equal(cortado.status, 201, cortado.corpo);
  assert.equal(cortado.corpo.mostrados, 2);
  assert.equal(cortado.corpo.truncado, true);
  assert.equal(cortado.corpo.agregadosSobre, 'pagina', 'agregado de página não pode se passar por total');
  assert.deepEqual(cortado.corpo.itens.map((i) => i.correlacao), ['tr-0', 'tr-1'], 'corta as mais antigas, não as recentes');

  const inteiro = await relatorio('/platform/master/audit', c.jwtOwner, c.masterOwner, { actorUserId: c.ator.id, limite: 3 });
  assert.equal(inteiro.corpo.truncado, false);
  assert.equal(inteiro.corpo.agregadosSobre, 'tudo');
});

test('filtro inválido é 400 com explicação, nunca um relatório vazio', { timeout: 120000 }, async () => {
  // Vazio por filtro errado é indistinguível de vazio de verdade, e quem audita
  // concluiria que não houve nada.
  const c = await cenario('aud-ruim');
  for (const corpo of [
    { limite: 0 },
    { limite: 501 },
    { limite: 1.5 },
    { de: '2026-03-31T00:00:00.000Z', ate: '2026-03-01T00:00:00.000Z' },
    { acoes: ['CONSULTAR'] },
    { resultados: ['NEGADO'] },
    { actorUserId: 'curto' },
  ]) {
    const r = await relatorio('/platform/master/audit', c.jwtOwner, c.masterOwner, corpo);
    assert.equal(r.status, 400, `${JSON.stringify(corpo)} deveria ser 400 e deu ${r.status}: ${r.corpo}`);
  }
});

test('o período estreita pela rota', { timeout: 120000 }, async () => {
  const c = await cenario('aud-periodo');
  const agora = Date.now();
  await trilha({ actorUserId: c.ator.id, action: 'consultar', correlationId: 'pe-velha', occurredAt: new Date(agora - 72 * 3600 * 1000) });
  await trilha({ actorUserId: c.ator.id, action: 'consultar', correlationId: 'pe-nova', occurredAt: new Date(agora - 60 * 1000) });

  const r = await relatorio('/platform/master/audit', c.jwtOwner, c.masterOwner, {
    actorUserId: c.ator.id, de: new Date(agora - 3600 * 1000).toISOString(),
  });
  assert.equal(r.status, 201, r.corpo);
  assert.deepEqual(r.corpo.itens.map((i) => i.correlacao), ['pe-nova']);
});

// --------------------------------------------- revogação com sessão aberta

test('revogar auditar vale na operação seguinte, com a sessão do delegado aberta', { timeout: 120000 }, async () => {
  const c = await cenario('aud-revoga');
  await conceder(c, ['auditar'], { tipo: 'EVENTOS', eventIds: [c.eventoA.id] });
  const caminho = `/platform/master/events/${c.eventoA.id}/audit`;

  assert.equal((await relatorio(caminho, c.jwtDeleg, c.masterDeleg, {})).status, 201, 'antes de revogar');

  const revogada = await chamar('/platform/master/grants/revoke', c.jwtOwner, {
    method: 'POST', master: c.masterOwner,
    body: JSON.stringify({
      pessoas: [c.delegado.id], acoes: ['auditar'],
      escopo: { tipo: 'EVENTOS', eventIds: [c.eventoA.id] }, motivo: motivoValido,
    }),
  });
  assert.ok(revogada.ok, await revogada.text());

  assert.equal(
    (await relatorio(caminho, c.jwtDeleg, c.masterDeleg, {})).status, 403,
    'sem encerrar a sessão e sem esperar cache: o guard reconsulta a concessão',
  );
});

// ------------------------------------------------ a rota da organização

test('o relatório da organização não mostra linha de outra organização', { timeout: 120000 }, async () => {
  const c = await cenario('aud-org');
  const outroDono = await pessoa('aud-org-outro-dono');
  const outraOrg = await organizacao('aud-org-outra', outroDono.id);

  await trilha({ actorUserId: c.ator.id, action: 'suspender', scopeKind: 'ORGANIZACAO', organizationId: c.org.id, correlationId: 'or-dentro' });
  await trilha({ actorUserId: c.ator.id, action: 'suspender', scopeKind: 'ORGANIZACAO', organizationId: outraOrg.id, correlationId: 'or-fora' });

  const r = await relatorio(`/platform/master/organizations/${c.org.id}/audit`, c.jwtOwner, c.masterOwner, { actorUserId: c.ator.id });
  assert.equal(r.status, 201, r.corpo);
  assert.deepEqual(r.corpo.escopo, { tipo: 'ORGANIZACAO', organizationId: c.org.id });
  assert.deepEqual(r.corpo.itens.map((i) => i.correlacao), ['or-dentro']);
});

test('LIMITAÇÃO DECLARADA: concessão de organização não alcança a rota de evento', { timeout: 120000 }, async () => {
  // O alvo sai dos parâmetros da rota, e `/events/:eventId/audit` não carrega
  // organizationId — então o alvo fica com organizationId vazio e
  // `escopoAlcanca` recusa. Quem tem `auditar` na organização usa a rota da
  // organização.
  //
  // Isto é discutível, e o teste fixa o comportamento ATUAL de propósito: é o
  // mesmo de `/events/:eventId/summary`, que já era assim antes desta demanda.
  // A correção — o guard resolver a organização do evento no banco antes de
  // decidir — muda a forma de um guard compartilhado e foi para o Work como
  // pergunta. Se a decisão for corrigir, é ESTE teste que muda, e de propósito.
  const c = await cenario('aud-org-evento');
  await conceder(c, ['auditar'], { tipo: 'ORGANIZACAO', organizationId: c.org.id });

  const naOrg = await relatorio(`/platform/master/organizations/${c.org.id}/audit`, c.jwtDeleg, c.masterDeleg, {});
  assert.equal(naOrg.status, 201, `na rota da organização passa: ${naOrg.corpo}`);

  const noEvento = await relatorio(`/platform/master/events/${c.eventoA.id}/audit`, c.jwtDeleg, c.masterDeleg, {});
  assert.equal(noEvento.status, 403, 'comportamento atual, medido e declarado');
});

// --------------------------------------------------- sessão e identidade

test('sem sessão Master é 401, e sem identidade Master é 404', { timeout: 120000 }, async () => {
  const c = await cenario('aud-sessao');

  const semCabecalho = await chamar('/platform/master/audit', c.jwtOwner, { method: 'POST', body: '{}' });
  assert.equal(semCabecalho.status, 401, 'sem cabeçalho de sessão');

  const tokenInventado = await chamar('/platform/master/audit', c.jwtOwner, {
    method: 'POST', master: randomBytes(32).toString('base64url'), body: '{}',
  });
  assert.equal(tokenInventado.status, 401, 'token que não existe');

  const fora = await pessoa('aud-sessao-fora');
  const r = await chamar('/platform/master/audit', crachar(fora.id, fora.email), {
    method: 'POST', master: 'token-qualquer', body: '{}',
  });
  assert.equal(r.status, 404, 'para quem não é da Master, a rota não existe');
});
