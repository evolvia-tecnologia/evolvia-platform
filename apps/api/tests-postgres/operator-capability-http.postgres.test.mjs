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

async function cenario(rotulo) {
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
  await ativarEscopo(evento.id, organizacao.id);

  // A capacidade tem de estar ativa pelo MESMO caminho que o repositório lê.
  // Sem isso o desenho é aditivo e tudo responderia 200: o 403 seria inverificável.
  const conferida = await prisma.event.findUnique({
    where: { id: evento.id },
    select: { capabilities: { where: { status: 'ACTIVE' }, select: { code: true } } },
  });
  assert.ok(
    conferida.capabilities.some((c) => c.code === 'operator_scoped_access'),
    'operator_scoped_access precisa estar ACTIVE, senão o 403 não é observável',
  );

  return {
    organizationId: organizacao.id,
    eventId: evento.id,
    dono,
    operador,
    tokenDono: crachar(dono.id, dono.email),
    tokenOperador: crachar(operador.id, operador.email),
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
  assert.equal(reverter.status, 403, 'reverter é concessão separada de fazer');
});
