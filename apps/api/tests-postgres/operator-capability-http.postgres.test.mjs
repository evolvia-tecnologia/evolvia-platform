// Disposable CI PostgreSQL only. Unique fixture data is preserved, never deleted.
//
// Prova HTTP real do G10.10: sobe a aplicação Nest de verdade, com AuthGuard,
// OperatorCapabilityGuard, ValidationPipe e GlobalExceptionFilter exatamente
// como main.ts monta, e bate nas rotas do balcão por fetch. O que se mede é o
// código HTTP que um operador recebe, não a decisão de um módulo puro.
//
// Sem @nestjs/testing e sem supertest de propósito: não existem no
// package.json, e acrescentar dependência exigiria lockfile novo.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// jwtSecret() é avaliado na montagem do JwtModule, portanto no IMPORT do
// AppModule. O segredo tem de existir antes disso, e por isso os imports da
// aplicação são dinâmicos em vez de estáticos.
process.env.JWT_SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32
  ? process.env.JWT_SECRET
  : `evolvia-ci-operator-capability-${'x'.repeat(16)}`;

const { NestFactory } = await import('@nestjs/core');
const { ValidationPipe } = await import('@nestjs/common');
const { AppModule } = await import('../dist/app.module.js');
const { GlobalExceptionFilter } = await import('../dist/global-exception.filter.js');
const { configureHttpBodyParsers } = await import('../dist/http-body-policy.js');
const { validationExceptionFactory } = await import('../dist/validation-errors.js');

const prisma = new PrismaClient();
let app;
let base = '';

before(async () => {
  app = await NestFactory.create(AppModule, { bodyParser: false, logger: false });
  configureHttpBodyParsers(app);
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    exceptionFactory: validationExceptionFactory,
  }));
  await app.listen(0, '127.0.0.1');
  base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
});

after(async () => {
  await prisma.$disconnect();
  if (app) await app.close();
});

function crachar(sub, email) {
  const parte = (valor) => Buffer.from(JSON.stringify(valor)).toString('base64url');
  const agora = Math.floor(Date.now() / 1000);
  const cabeca = parte({ alg: 'HS256', typ: 'JWT' });
  const corpo = parte({ sub, email, iat: agora, exp: agora + 3600 });
  const assinatura = createHmac('sha256', process.env.JWT_SECRET).update(`${cabeca}.${corpo}`).digest('base64url');
  return `${cabeca}.${corpo}.${assinatura}`;
}

function chamar(caminho, token, opcoes = {}) {
  return fetch(`${base}${caminho}`, {
    ...opcoes,
    headers: {
      authorization: `Bearer ${token}`,
      ...(opcoes.body ? { 'content-type': 'application/json' } : {}),
      ...(opcoes.headers ?? {}),
    },
  });
}

/**
 * A forma de EventCapability não é suposta: tenta o formato mínimo e, se o
 * banco exigir organizationId, tenta com ele. Qualquer outra divergência estoura
 * nomeando o campo, em vez de seguir silenciosamente sem a capacidade ativa —
 * que produziria 200 por desenho aditivo e um verde falso.
 */
async function ativarEscopo(eventId, organizationId) {
  const tentativas = [
    { eventId, code: 'operator_scoped_access', status: 'ACTIVE' },
    { eventId, organizationId, code: 'operator_scoped_access', status: 'ACTIVE' },
  ];
  let ultimo = null;
  for (const data of tentativas) {
    try {
      await prisma.eventCapability.create({ data });
      return;
    } catch (erro) { ultimo = erro; }
  }
  throw ultimo;
}

/**
 * Liga uma capacidade OPERACIONAL do evento (`access_control`).
 *
 * Separada de `ativarEscopo` de propósito: são coisas diferentes.
 * `operator_scoped_access` liga o filtro de concessões; `access_control` é uma
 * capacidade de operação, e `requireOperational()` exige pelo menos uma delas
 * para o balcão responder.
 */
async function ativarCapacidadeOperacional(eventId, organizationId) {
  const tentativas = [
    { eventId, code: 'access_control', status: 'ACTIVE' },
    { eventId, organizationId, code: 'access_control', status: 'ACTIVE' },
  ];
  let ultimo = null;
  for (const data of tentativas) {
    try { await prisma.eventCapability.create({ data }); return; } catch (erro) { ultimo = erro; }
  }
  throw ultimo;
}

async function cenario(rotulo, { escopado = true } = {}) {
  const chave = randomUUID();
  const dono = await prisma.user.create({
    data: { name: `PG ${rotulo} dono`, email: `oper-${rotulo}-dono-${chave}@evolvia-ci.local`, passwordHash: 'fixture' },
  });
  const operador = await prisma.user.create({
    data: { name: `PG ${rotulo} operador`, email: `oper-${rotulo}-op-${chave}@evolvia-ci.local`, passwordHash: 'fixture' },
  });
  const organizacao = await prisma.organization.create({
    data: { name: `PG ${rotulo}`, slug: `oper-${rotulo}-${chave}`, createdById: dono.id },
  });
  const evento = await prisma.event.create({
    data: {
      ownerId: dono.id,
      organizationId: organizacao.id,
      name: `Evento ${rotulo}`,
      slug: `oper-${rotulo}-${chave}`,
      eventType: 'Congresso',
      format: 'IN_PERSON',
      registrationMode: 'FREE',
    },
  });
  for (const [userId, role] of [[dono.id, 'OWNER'], [operador.id, 'OPERATOR']]) {
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: organizacao.id, userId } },
      update: { role, status: 'ACTIVE' },
      create: { organizationId: organizacao.id, userId, role, status: 'ACTIVE' },
    });
  }
  // Uma capacidade OPERACIONAL, sempre. `EventDeskService.report()` chama
  // `requireOperational()`, que lança `NotFoundException` quando o evento não
  // tem nenhuma capacidade operacional ativa — e `operator_scoped_access` não
  // é operacional, é o interruptor do filtro de concessões.
  //
  // Sem isto, o balcão respondia 404 por falta de capacidade operacional, e os
  // testes que exigem "o organizador NÃO é barrado" reprovavam. Pior: os que
  // só pediam `notEqual(403)` passavam com 404, ou seja passavam pelo motivo
  // errado. Era defeito meu de fixture, não do guard.
  //
  // `access_control` também é a capacidade que `checkin_reverter` exige, e por
  // isso a separação entre fazer e reverter passa a ser testada pela
  // CONCESSÃO, que é o assunto, e não pela capacidade do evento.
  await ativarCapacidadeOperacional(evento.id, organizacao.id);
  if (escopado) await ativarEscopo(evento.id, organizacao.id);

  // A capacidade tem de estar no estado pedido pelo MESMO caminho que o
  // repositório lê. Sem isso o desenho é aditivo e tudo responderia 200: o 403
  // seria inverificável, o que é verde falso e não prova.
  const conferida = await prisma.event.findUnique({
    where: { id: evento.id },
    select: { capabilities: { where: { status: 'ACTIVE' }, select: { code: true } } },
  });
  const ativas = conferida.capabilities.map((c) => c.code);
  assert.ok(
    ativas.includes('access_control'),
    'o cenário precisa de uma capacidade operacional ativa, ou o balcão responde 404 por outro motivo',
  );
  assert.equal(
    ativas.includes('operator_scoped_access'),
    escopado,
    `operator_scoped_access deveria estar ${escopado ? 'ACTIVE' : 'ausente'} neste cenário`,
  );

  return {
    organizationId: organizacao.id,
    eventId: evento.id,
    dono,
    operador,
    tokenDono: crachar(dono.id, dono.email),
    tokenOperador: crachar(operador.id, operador.email),
    ativarProtecao: () => ativarEscopo(evento.id, organizacao.id),
    relatorio: `/events/${evento.id}/desk/report`,
    grants: (userId) => `/events/${evento.id}/operators/${userId}/grants`,
  };
}

const concessoes = (eventId, targetUserId) =>
  prisma.eventOperatorGrant.count({ where: { eventId, targetUserId } });

test('operador sem concessão recebe 403 na rota real e nada é escrito', { timeout: 120000 }, async () => {
  const c = await cenario('nega');
  const resposta = await chamar(c.relatorio, c.tokenOperador);
  assert.equal(resposta.status, 403, await resposta.text());
  assert.equal(await concessoes(c.eventId, c.operador.id), 0, 'recusa não pode gravar concessão');
  assert.equal(
    await prisma.eventOperatorGrantEvent.count({ where: { eventId: c.eventId } }),
    0,
    'recusa não pode gravar histórico',
  );
});

test('organizador legítimo não é barrado pelo guard', { timeout: 120000 }, async () => {
  const c = await cenario('dono');
  const resposta = await chamar(c.relatorio, c.tokenDono);
  assert.notEqual(resposta.status, 403, 'OWNER não pode receber 403 no próprio evento');
  assert.notEqual(resposta.status, 404, 'OWNER não pode receber 404 no próprio evento');
});

test('conceder libera a rota e revogar fecha de novo, na mesma URL', { timeout: 120000 }, async () => {
  const c = await cenario('ciclo');
  assert.equal((await chamar(c.relatorio, c.tokenOperador)).status, 403);

  const concedida = await chamar(c.grants(c.operador.id), c.tokenDono, {
    method: 'POST',
    body: JSON.stringify({ motivo: 'prova HTTP de concessão', acoes: ['relatorio'] }),
  });
  assert.ok(concedida.ok, `concessão falhou: ${concedida.status} ${await concedida.text()}`);
  assert.equal(await concessoes(c.eventId, c.operador.id), 1);

  assert.notEqual((await chamar(c.relatorio, c.tokenOperador)).status, 403, 'com concessão não pode dar 403');

  const revogada = await chamar(`${c.grants(c.operador.id)}/revoke`, c.tokenDono, {
    method: 'POST',
    body: JSON.stringify({ motivo: 'prova HTTP de revogação', acoes: ['relatorio'] }),
  });
  assert.ok(revogada.ok, `revogação falhou: ${revogada.status} ${await revogada.text()}`);
  assert.equal(await concessoes(c.eventId, c.operador.id), 0, 'revogação remove a projeção');

  assert.equal((await chamar(c.relatorio, c.tokenOperador)).status, 403, 'revogação invalida na hora');

  const razao = await prisma.eventOperatorGrantEvent.findMany({
    where: { eventId: c.eventId, targetUserId: c.operador.id },
    select: { kind: true, reason: true },
    orderBy: { occurredAt: 'asc' },
  });
  assert.deepEqual(razao.map((r) => r.kind), ['GRANTED', 'REVOKED'], 'histórico é append-only');
  assert.deepEqual(razao.map((r) => r.reason), ['prova HTTP de concessão', 'prova HTTP de revogação']);
});

test('concessão de um evento não alcança outro evento nem outra organização', { timeout: 120000 }, async () => {
  const [a, b] = [await cenario('isoa'), await cenario('isob')];
  const concedida = await chamar(a.grants(a.operador.id), a.tokenDono, {
    method: 'POST',
    body: JSON.stringify({ motivo: 'concessão só do evento A', acoes: ['relatorio'] }),
  });
  assert.ok(concedida.ok, await concedida.text());

  assert.notEqual((await chamar(a.relatorio, a.tokenOperador)).status, 403, 'no evento A deve passar');
  assert.equal(
    (await chamar(b.relatorio, a.tokenOperador)).status,
    404,
    'fora da organização o evento nem existe para esta pessoa',
  );
  assert.equal(await concessoes(b.eventId, a.operador.id), 0);
});

test('duas concessões simultâneas não duplicam linha nem histórico', { timeout: 120000 }, async () => {
  const c = await cenario('corrida');
  const corpo = JSON.stringify({ motivo: 'duas chamadas ao mesmo tempo', acoes: ['relatorio'] });
  const [uma, outra] = await Promise.all([
    chamar(c.grants(c.operador.id), c.tokenDono, { method: 'POST', body: corpo }),
    chamar(c.grants(c.operador.id), c.tokenDono, { method: 'POST', body: corpo }),
  ]);
  assert.ok(uma.ok && outra.ok, `as duas devem responder sem erro: ${uma.status}/${outra.status}`);
  assert.equal(await concessoes(c.eventId, c.operador.id), 1, 'unicidade impede concessão equivalente duplicada');
  assert.equal(
    await prisma.eventOperatorGrantEvent.count({ where: { eventId: c.eventId, targetUserId: c.operador.id, kind: 'GRANTED' } }),
    1,
    'uma concessão efetiva, um registro no histórico',
  );
  assert.notEqual((await chamar(c.relatorio, c.tokenOperador)).status, 403);
});

test('operador autorizado numa ação não ganha a ação sensível de reverter', { timeout: 120000 }, async () => {
  const c = await cenario('sep');
  const concedida = await chamar(c.grants(c.operador.id), c.tokenDono, {
    method: 'POST',
    body: JSON.stringify({ motivo: 'apenas check-in direto', acoes: ['checkin'] }),
  });
  assert.ok(concedida.ok, await concedida.text());
  const reverter = await chamar(`/events/${c.eventId}/desk/check-in/reverse`, c.tokenOperador, {
    method: 'POST',
    body: JSON.stringify({ reservationId: randomUUID(), reason: 'tentativa sem permissão' }),
  });
  // 403, e não 404: a capacidade `access_control` ESTÁ ativa no cenário, então
  // a recusa é por falta da concessão `checkin_reverter` — que é o assunto do
  // teste. Com a capacidade inativa a resposta seria 404, e o teste passaria
  // pelo motivo errado.
  assert.equal(reverter.status, 403, 'reverter é concessão separada de fazer');
});

// CL01 — aceite: "operador não administra grants".
test('operador não administra concessões, nem as próprias', { timeout: 120000 }, async () => {
  const c = await cenario('adm');
  for (const alvo of [c.operador.id, c.dono.id]) {
    const resposta = await chamar(c.grants(alvo), c.tokenOperador, {
      method: 'POST',
      body: JSON.stringify({ motivo: 'tentativa de autoconcessão', acoes: ['relatorio'] }),
    });
    assert.equal(resposta.status, 403, `operador não pode conceder para ${alvo}`);
  }
  assert.equal(await concessoes(c.eventId, c.operador.id), 0, 'tentativa recusada não grava');
  assert.equal(await prisma.eventOperatorGrantEvent.count({ where: { eventId: c.eventId } }), 0);
});

// CL01 — aceite: "ação desconhecida negada".
test('ação desconhecida é recusada mesmo pedida pelo organizador', { timeout: 120000 }, async () => {
  const c = await cenario('desc');
  for (const acoes of [['acao_que_nao_existe'], ['relatorio', 'acao_que_nao_existe'], []]) {
    const resposta = await chamar(c.grants(c.operador.id), c.tokenDono, {
      method: 'POST',
      body: JSON.stringify({ motivo: 'pedido com ação inválida', acoes }),
    });
    assert.equal(resposta.status, 403, `deveria recusar ${JSON.stringify(acoes)}`);
  }
  // Recusa parcial nunca aplica a parte válida: é tudo ou nada.
  assert.equal(await concessoes(c.eventId, c.operador.id), 0, 'nem a ação válida do lote é aplicada');
  assert.equal(await prisma.eventOperatorGrantEvent.count({ where: { eventId: c.eventId } }), 0);
});

// CL01 — aceite: "compatibilidade legada e ativação da proteção comprovadas".
test('evento legado segue liberado e passa a exigir permissão ao ativar a proteção', { timeout: 120000 }, async () => {
  const c = await cenario('legado', { escopado: false });
  const antes = await chamar(c.relatorio, c.tokenOperador);
  assert.notEqual(antes.status, 403, 'sem a capacidade o comportamento de hoje é preservado');
  assert.notEqual(antes.status, 404, 'operador segue membro ativo da organização');

  await c.ativarProtecao();

  assert.equal(
    (await chamar(c.relatorio, c.tokenOperador)).status,
    403,
    'ativar a capacidade passa a exigir concessão, sem migração de dados',
  );
  assert.equal(await concessoes(c.eventId, c.operador.id), 0, 'ativar proteção não concede nada por padrão');
});
