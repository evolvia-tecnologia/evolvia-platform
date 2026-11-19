// Somente PostgreSQL descartável com migrations aplicadas (DATABASE_URL). Dados
// de fixture são únicos e preservados, nunca apagados.
//
// Prova HTTP real da confirmação de impressão (G10.10 / #642, item 4 da ordem
// do Work). Sobe a aplicação Nest de verdade, como main.ts monta, e bate na
// rota por fetch: o que se mede é o código HTTP que um operador recebe e o que
// ficou gravado no banco depois.
//
// Por que isto existe separado dos testes de serviço: aqueles usam prisma
// falso e provam a decisão; este prova a SERIALIZAÇÃO. `FOR UPDATE` só tem
// efeito contra um PostgreSQL de verdade, e asserção textual de SQL não é
// prova de banco.
//
// Sem @nestjs/testing e sem supertest de propósito: não existem no
// package.json, e acrescentar dependência exigiria lockfile novo.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// jwtSecret() é avaliado na montagem do JwtModule, portanto no IMPORT do
// AppModule. O segredo tem de existir antes disso, e por isso os imports da
// aplicação são dinâmicos em vez de estáticos.
process.env.JWT_SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32
  ? process.env.JWT_SECRET
  : `evolvia-ci-credential-print-${'x'.repeat(16)}`;

const { NestFactory } = await import('@nestjs/core');
const { ValidationPipe } = await import('@nestjs/common');
const { AppModule } = await import('../dist/app.module.js');
const { GlobalExceptionFilter } = await import('../dist/global-exception.filter.js');
const { configureHttpBodyParsers } = await import('../dist/http-body-policy.js');
const { validationExceptionFactory } = await import('../dist/validation-errors.js');

const db = new PrismaClient();
const hash = (texto) => createHash('sha256').update(texto).digest('hex');
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
  await db.$disconnect();
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
 * Corpo de resposta se lê UMA vez: `Response.text()` consome o fluxo, e a
 * mensagem de um `assert` é avaliada sempre, mesmo quando a asserção passa.
 * Ler duas vezes estoura "Body is unusable", e o teste falharia por motivo
 * errado. Então toda resposta vira este objeto, com texto e json já prontos.
 */
async function lida(promessa) {
  const resposta = await promessa;
  const texto = await resposta.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { json = null; }
  return { status: resposta.status, ok: resposta.ok, texto, json };
}

/**
 * A forma de EventCapability não é suposta: tenta o formato mínimo e, se o
 * banco exigir organizationId, tenta com ele. Qualquer outra divergência
 * estoura nomeando o erro, em vez de seguir sem a capacidade — o que produziria
 * 200 por desenho aditivo e verde falso.
 */
async function ativarCapacidade(eventId, organizationId, code) {
  const tentativas = [
    { eventId, code, status: 'ACTIVE' },
    { eventId, organizationId, code, status: 'ACTIVE' },
  ];
  let ultimo = null;
  for (const data of tentativas) {
    try {
      await db.eventCapability.create({ data });
      return;
    } catch (erro) { ultimo = erro; }
  }
  throw ultimo;
}

/**
 * Cenário completo: organização, evento escopado, dono, operador, e uma
 * inscrição de verdade com catálogo, categoria e lote — a cadeia que as chaves
 * estrangeiras compostas exigem.
 *
 * As linhas `ISSUED` são criadas direto pelo Prisma, com a mesma forma que
 * `registrarTentativaDeImpressao` grava. É a emissão, provada em outro lugar;
 * aqui o objeto da prova é a CONFIRMAÇÃO, e declaro isso em vez de fingir que
 * este arquivo também exercita o balcão.
 */
async function cenario(rotulo, { tentativas = [1] } = {}) {
  const run = randomBytes(8).toString('hex');
  const dono = await db.user.create({
    data: { name: `PG ${rotulo} dono`, email: `print-${rotulo}-dono-${run}@evolvia-ci.local`, passwordHash: 'fixture' },
  });
  const operador = await db.user.create({
    data: { name: `PG ${rotulo} operador`, email: `print-${rotulo}-op-${run}@evolvia-ci.local`, passwordHash: 'fixture' },
  });
  const organizacao = await db.organization.create({
    data: { name: `PG ${rotulo}`, slug: `print-${rotulo}-${run}`, createdById: dono.id },
  });
  const evento = await db.event.create({
    data: {
      ownerId: dono.id, organizationId: organizacao.id, name: `Evento ${rotulo}`, slug: `print-${rotulo}-${run}`,
      eventType: 'Congresso', format: 'IN_PERSON', registrationMode: 'FREE',
    },
  });
  const escopo = { eventId: evento.id, organizationId: organizacao.id };
  for (const [userId, role] of [[dono.id, 'OWNER'], [operador.id, 'OPERATOR']]) {
    await db.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: organizacao.id, userId } },
      update: { role, status: 'ACTIVE' },
      create: { organizationId: organizacao.id, userId, role, status: 'ACTIVE' },
    });
  }

  // `credential` é a capacidade que as duas ações de impressão exigem;
  // `operator_scoped_access` é a que LIGA o filtro de concessões. Sem as duas,
  // a recusa seria inverificável.
  for (const code of ['credential', 'operator_scoped_access']) {
    await ativarCapacidade(evento.id, organizacao.id, code);
  }
  const conferida = await db.event.findUnique({
    where: { id: evento.id },
    select: { capabilities: { where: { status: 'ACTIVE' }, select: { code: true } } },
  });
  const ativas = conferida.capabilities.map((c) => c.code).sort();
  assert.deepEqual(ativas, ['credential', 'operator_scoped_access'], 'as duas capacidades precisam estar ACTIVE');

  const catalogo = await db.eventRegistrationCatalog.create({ data: escopo });
  const categoria = await db.eventRegistrationCategory.create({
    data: { ...escopo, catalogId: catalogo.id, code: 'PADRAO', name: 'Padrão', capacity: null },
  });
  const lote = await db.eventRegistrationLot.create({
    data: {
      ...escopo, categoryId: categoria.id, code: 'LOT-PADRAO', name: 'Lote único', quantity: null,
      startsAt: new Date('2026-01-01T00:00:00Z'), endsAt: new Date('2027-01-01T00:00:00Z'), priceCents: 10000,
    },
  });
  const inscricao = await db.eventRegistrationReservation.create({
    data: {
      ...escopo, categoryId: categoria.id, lotId: lote.id,
      protocol: `EVO-${hash(run).slice(0, 16).toUpperCase()}`,
      idempotencyKeyHash: hash(`id-${run}`), payloadHash: hash(`payload-${run}`),
      identityHash: hash(`identity-${run}`), emailHash: hash(`email-${run}`),
      registrationData: { registration_type: categoria.id, full_name: 'Participante de teste' },
      basePriceCents: 10000, discountPercent: 0, finalPriceCents: 10000,
      status: 'CONFIRMED', confirmedAt: new Date(),
    },
  });
  for (const sequence of tentativas) {
    await db.eventCredentialPrint.create({
      data: { ...escopo, reservationId: inscricao.id, kind: 'ISSUED', sequence, actorUserId: operador.id },
    });
  }

  const conceder = (acoes, token = crachar(dono.id, dono.email)) => lida(chamar(
    `/events/${evento.id}/operators/${operador.id}/grants`,
    token,
    { method: 'POST', body: JSON.stringify({ motivo: `prova HTTP ${rotulo}`, acoes }) },
  ));
  const revogar = (acoes) => lida(chamar(
    `/events/${evento.id}/operators/${operador.id}/grants/revoke`,
    crachar(dono.id, dono.email),
    { method: 'POST', body: JSON.stringify({ motivo: `revogação HTTP ${rotulo}`, acoes }) },
  ));
  const confirmar = (token, corpo) => lida(chamar(
    `/events/${evento.id}/credential-prints/confirm`,
    token,
    { method: 'POST', body: JSON.stringify(corpo) },
  ));

  return {
    ...escopo,
    dono,
    operador,
    tokenDono: crachar(dono.id, dono.email),
    tokenOperador: crachar(operador.id, operador.email),
    reservationId: inscricao.id,
    conceder,
    revogar,
    confirmar,
    confirmadas: () => db.eventCredentialPrint.findMany({
      where: { eventId: evento.id, reservationId: inscricao.id, kind: 'CONFIRMED' },
      select: { sequence: true, actorUserId: true, organizationId: true },
      orderBy: { sequence: 'asc' },
    }),
  };
}

const LIMITE = { timeout: 120000 };

test('operador sem concessão recebe 403 e nada é gravado', LIMITE, async () => {
  const c = await cenario('nega');
  const resposta = await c.confirmar(c.tokenOperador, { reservationId: c.reservationId, sequence: 1 });
  assert.equal(resposta.status, 403, resposta.texto);
  assert.deepEqual(await c.confirmadas(), [], 'recusa não pode gravar conclusão');
});

test('com credencial_imprimir a rota confirma e grava CONFIRMED uma vez', LIMITE, async () => {
  const c = await cenario('primeira');
  const concedida = await c.conceder(['credencial_imprimir']);
  assert.ok(concedida.ok, `concessão falhou: ${concedida.status} ${concedida.texto}`);

  const resposta = await c.confirmar(c.tokenOperador, { reservationId: c.reservationId, sequence: 1 });
  assert.equal(resposta.status, 201, resposta.texto);
  assert.deepEqual(resposta.json, {
    sequence: 1, acaoExigida: 'credencial_imprimir', concluida: true, repetida: false,
  });

  const linhas = await c.confirmadas();
  assert.equal(linhas.length, 1);
  // O ator gravado é o do TOKEN, não um campo do corpo: identidade não se pede.
  assert.equal(linhas[0].actorUserId, c.operador.id);
  assert.equal(linhas[0].organizationId, c.organizationId);
});

test('organizador confirma sem precisar de concessão', LIMITE, async () => {
  const c = await cenario('dono');
  const resposta = await c.confirmar(c.tokenDono, { reservationId: c.reservationId, sequence: 1 });
  assert.equal(resposta.status, 201, resposta.texto);
  const linhas = await c.confirmadas();
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].actorUserId, c.dono.id);
});

test('revogar fecha a rota de novo, sem gravar nada no caminho', LIMITE, async () => {
  const c = await cenario('ciclo', { tentativas: [1, 2] });
  assert.ok((await c.conceder(['credencial_imprimir'])).ok);
  assert.equal((await c.confirmar(c.tokenOperador, { reservationId: c.reservationId, sequence: 1 })).status, 201);

  const revogada = await c.revogar(['credencial_imprimir']);
  assert.ok(revogada.ok, `revogação falhou: ${revogada.status} ${revogada.texto}`);

  const depois = await c.confirmar(c.tokenOperador, { reservationId: c.reservationId, sequence: 2 });
  assert.equal(depois.status, 403, depois.texto);
  assert.deepEqual((await c.confirmadas()).map((l) => l.sequence), [1], 'só a conclusão anterior permanece');
});

test('reenviar a mesma sequência é idempotente: nenhuma linha nova', LIMITE, async () => {
  const c = await cenario('idem');
  assert.ok((await c.conceder(['credencial_imprimir'])).ok);
  const corpo = { reservationId: c.reservationId, sequence: 1 };
  assert.equal((await c.confirmar(c.tokenOperador, corpo)).status, 201);

  const repetida = await c.confirmar(c.tokenOperador, corpo);
  assert.equal(repetida.status, 201, repetida.texto);
  assert.deepEqual(repetida.json, {
    sequence: 1, acaoExigida: 'credencial_imprimir', concluida: true, repetida: true,
  });
  assert.equal((await c.confirmadas()).length, 1, 'reenvio de rede não é segunda via');
});

// O ponto central do G10.10: a segunda via é permissão separada.
test('segunda conclusão exige reimpressão e só passa com a concessão própria', LIMITE, async () => {
  const c = await cenario('segunda', { tentativas: [1, 2] });
  assert.ok((await c.conceder(['credencial_imprimir'])).ok);
  assert.equal((await c.confirmar(c.tokenOperador, { reservationId: c.reservationId, sequence: 1 })).status, 201);

  const barrada = await c.confirmar(c.tokenOperador, { reservationId: c.reservationId, sequence: 2 });
  assert.equal(barrada.status, 403, barrada.texto);
  // Se esta linha reprovar, a causa provável não é a autorização: é o
  // GlobalExceptionFilter escondendo a mensagem. Seria defeito a corrigir lá,
  // não asserção a afrouxar aqui — sem o motivo, quem está no balcão vê uma
  // recusa muda e não sabe que precisa chamar quem pode reimprimir.
  assert.match(barrada.texto.toLowerCase(), /reimpress/u, 'a recusa tem de explicar o motivo');
  assert.equal((await c.confirmadas()).length, 1, 'recusa não grava');

  assert.ok((await c.conceder(['credencial_reimprimir'])).ok);
  const liberada = await c.confirmar(c.tokenOperador, { reservationId: c.reservationId, sequence: 2 });
  assert.equal(liberada.status, 201, liberada.texto);
  assert.equal(liberada.json.acaoExigida, 'credencial_reimprimir');
  assert.deepEqual((await c.confirmadas()).map((l) => l.sequence), [1, 2]);
});

// ESTE é o teste que o harness com prisma falso não consegue fazer. Sem o
// `FOR UPDATE` na inscrição, as duas transações leem zero conclusões, as duas
// se declaram "primeira impressão" e a segunda vira conclusão sem nunca ter
// precisado de `credencial_reimprimir`.
test('duas confirmações simultâneas: só uma é primeira impressão', LIMITE, async () => {
  const c = await cenario('corrida', { tentativas: [1, 2] });
  assert.ok((await c.conceder(['credencial_imprimir'])).ok);

  const [uma, outra] = await Promise.all([
    c.confirmar(c.tokenOperador, { reservationId: c.reservationId, sequence: 1 }),
    c.confirmar(c.tokenOperador, { reservationId: c.reservationId, sequence: 2 }),
  ]);
  const codigos = [uma.status, outra.status].sort();
  assert.deepEqual(codigos, [201, 403], `esperado uma conclusão e uma recusa, veio ${codigos.join('/')}`);

  const linhas = await c.confirmadas();
  assert.equal(linhas.length, 1, 'quem só tem credencial_imprimir não pode terminar com duas conclusões');

  // E a recusada é recusada pelo motivo certo, não por acidente.
  const recusada = uma.status === 403 ? uma : outra;
  assert.match(recusada.texto.toLowerCase(), /reimpress/u);
});

test('inscrição de outro evento ou organização não é alcançada', LIMITE, async () => {
  const [a, b] = [await cenario('isoa'), await cenario('isob')];
  assert.ok((await a.conceder(['credencial_imprimir'])).ok);
  assert.ok((await b.conceder(['credencial_imprimir'])).ok);

  // Ator de A pedindo no evento de B: nem membro é, logo o evento não existe
  // para ele.
  const foraDaOrganizacao = await b.confirmar(a.tokenOperador, { reservationId: a.reservationId, sequence: 1 });
  assert.equal(foraDaOrganizacao.status, 404, foraDaOrganizacao.texto);

  // Ator de B, no evento de B, pedindo a inscrição de A: o lock é escopado, e
  // não encontra.
  const inscricaoAlheia = await b.confirmar(b.tokenOperador, { reservationId: a.reservationId, sequence: 1 });
  assert.equal(inscricaoAlheia.status, 404, inscricaoAlheia.texto);

  assert.deepEqual(await a.confirmadas(), [], 'nada escrito no evento A');
  assert.deepEqual(await b.confirmadas(), [], 'nada escrito no evento B');
});

test('emissão inexistente não pode ser confirmada', LIMITE, async () => {
  const c = await cenario('semtentativa', { tentativas: [] });
  assert.ok((await c.conceder(['credencial_imprimir'])).ok);
  const resposta = await c.confirmar(c.tokenOperador, { reservationId: c.reservationId, sequence: 1 });
  assert.equal(resposta.status, 404, resposta.texto);
  assert.deepEqual(await c.confirmadas(), []);
});

test('entrada malformada é 400 e não grava', LIMITE, async () => {
  const c = await cenario('malformada');
  assert.ok((await c.conceder(['credencial_imprimir'])).ok);
  const ruins = [
    {},
    { sequence: 1 },
    { reservationId: '', sequence: 1 },
    { reservationId: c.reservationId },
    { reservationId: c.reservationId, sequence: 0 },
    { reservationId: c.reservationId, sequence: 1.5 },
    { reservationId: c.reservationId, sequence: '1' },
  ];
  for (const corpo of ruins) {
    const resposta = await c.confirmar(c.tokenOperador, corpo);
    assert.equal(resposta.status, 400, `${JSON.stringify(corpo)} -> ${resposta.status} ${resposta.texto}`);
  }
  assert.deepEqual(await c.confirmadas(), []);
});

test('sem token a rota não responde nada de útil', LIMITE, async () => {
  const c = await cenario('semtoken');
  const resposta = await lida(fetch(`${base}/events/${c.eventId}/credential-prints/confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reservationId: c.reservationId, sequence: 1 }),
  }));
  assert.equal(resposta.status, 401, resposta.texto);
  assert.deepEqual(await c.confirmadas(), []);
});

test('token assinado com outro segredo é recusado', LIMITE, async () => {
  const c = await cenario('segredo');
  const parte = (valor) => Buffer.from(JSON.stringify(valor)).toString('base64url');
  const agora = Math.floor(Date.now() / 1000);
  const cabeca = parte({ alg: 'HS256', typ: 'JWT' });
  const corpo = parte({ sub: c.operador.id, email: c.operador.email, iat: agora, exp: agora + 3600 });
  const falso = `${cabeca}.${corpo}.${createHmac('sha256', `outro-segredo-${'y'.repeat(32)}`).update(`${cabeca}.${corpo}`).digest('base64url')}`;
  const resposta = await c.confirmar(falso, { reservationId: c.reservationId, sequence: 1 });
  assert.equal(resposta.status, 401, resposta.texto);
  assert.deepEqual(await c.confirmadas(), []);
});

// Histórico append-only imposto pelo BANCO, não por convenção do código.
test('a conclusão gravada não admite UPDATE nem DELETE', LIMITE, async () => {
  const c = await cenario('imutavel');
  assert.ok((await c.conceder(['credencial_imprimir'])).ok);
  assert.equal((await c.confirmar(c.tokenOperador, { reservationId: c.reservationId, sequence: 1 })).status, 201);
  const linha = await db.eventCredentialPrint.findFirst({
    where: { eventId: c.eventId, reservationId: c.reservationId, kind: 'CONFIRMED' },
  });
  assert.ok(linha, 'a conclusão tem de existir para o teste significar algo');
  await assert.rejects(
    () => db.eventCredentialPrint.update({ where: { id: linha.id }, data: { sequence: 99 } }),
    /imutavel|imutável/iu,
  );
  await assert.rejects(
    () => db.eventCredentialPrint.delete({ where: { id: linha.id } }),
    /imutavel|imutável/iu,
  );
  assert.equal((await c.confirmadas()).length, 1, 'a linha continua lá, intacta');
});

// Dependência explícita: a rota tem de estar registrada no app.module. Sem
// isso, todos os 403/404 acima virariam 404 de rota inexistente e o arquivo
// passaria por motivo errado.
test('a rota existe de fato: um 404 de rota não se confunde com um 404 de regra', LIMITE, async () => {
  const c = await cenario('rota');
  const valida = await c.confirmar(c.tokenDono, { reservationId: c.reservationId, sequence: 1 });
  assert.equal(valida.status, 201, `confirmação válida do dono não pode falhar: ${valida.texto}`);
  const outraRota = await lida(chamar(`/events/${c.eventId}/credential-prints/rota-que-nao-existe`, c.tokenDono, {
    method: 'POST', body: JSON.stringify({}),
  }));
  assert.equal(outraRota.status, 404, 'rota inexistente continua 404, por contraste');
});
