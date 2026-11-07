// Somente PostgreSQL descartável com migrations aplicadas (DATABASE_URL). Dados
// de fixture são únicos e preservados, nunca apagados.
//
// CL-R2.3 — separação de permissões na entrega de material e no kit.
//
// POR QUE ESTE ARQUIVO EXISTE, E POR QUE NÃO REESCREVE ESTOQUE
//
// A ordem manda medir antes de escrever e encerrar com prova o que já estiver
// correto. Medi: `kit-stock.postgres.test.mjs` (34 KB, 9 testes) já prova, com
// duas conexões PostgreSQL de verdade e `FOR UPDATE`, o lado de estoque —
// "preferência não reserva estoque e a última camisa não fica negativa",
// "troca de tamanho exige confirmação e o estorno devolve o estoque uma vez",
// "remover tamanho com entrega ativa retorna conflito e preserva configuração
// e auditoria" e "primeira configuração serializa duas conexões mesmo sem
// tamanhos existentes".
//
// Então primeira retirada, repetição, reversão, baixa atômica, auditoria e
// corrida sem saldo negativo NÃO são lacuna, e reescrevê-las seria duplicar
// trabalho correto de outra frente.
//
// A lacuna medida é outra: naquele arquivo não há uma única menção a
// `material_entregar`, `material_reverter`, `kit_ler` ou `kit_relatorio`. O
// estoque está provado; QUEM PODE MEXER NELE não está. É isso que se prova
// aqui, e só isso — este arquivo não afirma nada sobre saldo.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// jwtSecret() é avaliado na montagem do JwtModule, portanto no IMPORT do
// AppModule. O segredo tem de existir antes disso, e por isso os imports da
// aplicação são dinâmicos em vez de estáticos.
process.env.JWT_SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32
  ? process.env.JWT_SECRET
  : `evolvia-ci-material-capability-${'x'.repeat(16)}`;

const { NestFactory } = await import('@nestjs/core');
const { ValidationPipe } = await import('@nestjs/common');
const { AppModule } = await import('../dist/app.module.js');
const { GlobalExceptionFilter } = await import('../dist/global-exception.filter.js');
const { configureHttpBodyParsers } = await import('../dist/http-body-policy.js');
const { validationExceptionFactory } = await import('../dist/validation-errors.js');

const db = new PrismaClient();
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

/** Corpo se lê UMA vez: `Response.text()` consome o fluxo, e a mensagem de um
 * `assert` é avaliada sempre, inclusive quando passa. */
async function lida(promessa) {
  const resposta = await promessa;
  const texto = await resposta.text();
  return { status: resposta.status, ok: resposta.ok, texto };
}

function chamar(caminho, token, opcoes = {}) {
  return lida(fetch(`${base}${caminho}`, {
    ...opcoes,
    headers: {
      authorization: `Bearer ${token}`,
      ...(opcoes.body ? { 'content-type': 'application/json' } : {}),
      ...(opcoes.headers ?? {}),
    },
  }));
}

/**
 * A forma de EventCapability não é suposta: tenta o formato mínimo e, se o
 * banco exigir organizationId, tenta com ele. Qualquer outra divergência
 * estoura nomeando o erro, em vez de seguir sem a capacidade — o que
 * produziria 200 por desenho aditivo e verde falso.
 */
async function ativarCapacidade(eventId, organizationId, code) {
  const tentativas = [
    { eventId, code, status: 'ACTIVE' },
    { eventId, organizationId, code, status: 'ACTIVE' },
  ];
  let ultimo = null;
  for (const data of tentativas) {
    try { await db.eventCapability.create({ data }); return; } catch (erro) { ultimo = erro; }
  }
  throw ultimo;
}

async function cenario(rotulo, { capacidades = ['material_delivery'], escopado = true } = {}) {
  const chave = randomUUID();
  const dono = await db.user.create({
    data: { name: `PG ${rotulo} dono`, email: `mat-${rotulo}-dono-${chave}@evolvia-ci.local`, passwordHash: 'fixture' },
  });
  const operador = await db.user.create({
    data: { name: `PG ${rotulo} operador`, email: `mat-${rotulo}-op-${chave}@evolvia-ci.local`, passwordHash: 'fixture' },
  });
  const organizacao = await db.organization.create({
    data: { name: `PG ${rotulo}`, slug: `mat-${rotulo}-${chave}`, createdById: dono.id },
  });
  const evento = await db.event.create({
    data: {
      ownerId: dono.id, organizationId: organizacao.id, name: `Evento ${rotulo}`, slug: `mat-${rotulo}-${chave}`,
      eventType: 'Congresso', format: 'IN_PERSON', registrationMode: 'FREE',
    },
  });
  for (const [userId, role] of [[dono.id, 'OWNER'], [operador.id, 'OPERATOR']]) {
    await db.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: organizacao.id, userId } },
      update: { role, status: 'ACTIVE' },
      create: { organizationId: organizacao.id, userId, role, status: 'ACTIVE' },
    });
  }
  const pedidas = [...capacidades, ...(escopado ? ['operator_scoped_access'] : [])];
  for (const code of pedidas) await ativarCapacidade(evento.id, organizacao.id, code);

  const conferida = await db.event.findUnique({
    where: { id: evento.id },
    select: { capabilities: { where: { status: 'ACTIVE' }, select: { code: true } } },
  });
  assert.deepEqual(
    conferida.capabilities.map((c) => c.code).sort(),
    [...pedidas].sort(),
    'as capacidades ativas do evento divergiram do cenário pedido',
  );

  const tokenDono = crachar(dono.id, dono.email);
  const tokenOperador = crachar(operador.id, operador.email);
  const desk = `/events/${evento.id}/desk`;
  return {
    eventId: evento.id,
    organizationId: organizacao.id,
    operador,
    tokenDono,
    tokenOperador,
    conceder: (acoes) => chamar(`/events/${evento.id}/operators/${operador.id}/grants`, tokenDono, {
      method: 'POST', body: JSON.stringify({ motivo: `material ${rotulo}`, acoes }),
    }),
    revogar: (acoes) => chamar(`/events/${evento.id}/operators/${operador.id}/grants/revoke`, tokenDono, {
      method: 'POST', body: JSON.stringify({ motivo: `revogação material ${rotulo}`, acoes }),
    }),
    entregar: (token = tokenOperador) => chamar(`${desk}/material`, token, {
      method: 'POST', body: JSON.stringify({ reservationId: randomUUID() }),
    }),
    reverter: (token = tokenOperador) => chamar(`${desk}/material/reverse`, token, {
      method: 'POST', body: JSON.stringify({ reservationId: randomUUID() }),
    }),
    verKit: (token = tokenOperador) => chamar(`${desk}/kit`, token),
    relatorioDeKit: (token = tokenOperador) => chamar(`${desk}/kit/report`, token),
  };
}

const LIMITE = { timeout: 120000 };

/**
 * Nota de leitura das asserções positivas: `notEqual(403)` é o que se pode
 * afirmar sem montar a cadeia de fixture de kit inteira. A inscrição enviada é
 * um uuid inexistente de propósito, então o esperado para quem TEM permissão é
 * um 404 do serviço — o que prova justamente o que importa aqui: o guard
 * deixou passar e a recusa deixou de ser de permissão. Saldo e atomicidade
 * ficam com `kit-stock.postgres.test.mjs`, que já os prova.
 */

test('sem concessão, nenhuma das quatro rotas de material responde', LIMITE, async () => {
  const c = await cenario('nega');
  for (const [nome, chamada] of [
    ['entregar', c.entregar], ['reverter', c.reverter], ['ver kit', c.verKit], ['relatório de kit', c.relatorioDeKit],
  ]) {
    const r = await chamada();
    assert.equal(r.status, 403, `${nome} deveria ser 403, veio ${r.status}: ${r.texto}`);
  }
});

// O coração do corte: entregar e reverter são permissões SEPARADAS.
test('quem pode entregar material não pode reverter entrega', LIMITE, async () => {
  const c = await cenario('separa');
  assert.ok((await c.conceder(['material_entregar'])).ok);

  assert.notEqual((await c.entregar()).status, 403, 'com a concessão, entregar não pode ser recusado por permissão');
  const reversao = await c.reverter();
  assert.equal(reversao.status, 403, `reverter é concessão separada, veio ${reversao.status}: ${reversao.texto}`);
});

test('quem pode reverter não ganha a entrega por isso', LIMITE, async () => {
  const c = await cenario('inverso');
  assert.ok((await c.conceder(['material_reverter'])).ok);

  assert.notEqual((await c.reverter()).status, 403);
  assert.equal((await c.entregar()).status, 403, 'a direção inversa também tem de ser separada');
});

test('ver kit não dá relatório de kit, nem entrega', LIMITE, async () => {
  const c = await cenario('leitura');
  assert.ok((await c.conceder(['kit_ler'])).ok);

  assert.notEqual((await c.verKit()).status, 403);
  assert.equal((await c.relatorioDeKit()).status, 403, 'relatório é concessão própria');
  assert.equal((await c.entregar()).status, 403, 'leitura não dá escrita');
  assert.equal((await c.reverter()).status, 403);
});

test('as quatro concessões juntas liberam as quatro rotas, e só elas', LIMITE, async () => {
  const c = await cenario('todas');
  assert.ok((await c.conceder(['material_entregar', 'material_reverter', 'kit_ler', 'kit_relatorio'])).ok);

  for (const [nome, chamada] of [
    ['entregar', c.entregar], ['reverter', c.reverter], ['ver kit', c.verKit], ['relatório de kit', c.relatorioDeKit],
  ]) {
    assert.notEqual((await chamada()).status, 403, `${nome} deveria passar`);
  }
  // E não vazou para ação de outra área: check-in continua recusado.
  const checkin = await chamar(`/events/${c.eventId}/desk/check-in`, c.tokenOperador, {
    method: 'POST', body: JSON.stringify({ reservationId: randomUUID() }),
  });
  assert.equal(checkin.status, 403, 'concessão de material não pode abrir o check-in');
});

// A capacidade do evento continua compondo com E, não com OU.
test('capacidade material_delivery inativa recusa tudo, mesmo com as concessões', LIMITE, async () => {
  const c = await cenario('capacidade', { capacidades: [] });
  assert.ok((await c.conceder(['material_entregar', 'material_reverter', 'kit_ler', 'kit_relatorio'])).ok);

  for (const [nome, chamada] of [
    ['entregar', c.entregar], ['reverter', c.reverter], ['ver kit', c.verKit], ['relatório de kit', c.relatorioDeKit],
  ]) {
    assert.equal((await chamada()).status, 403, `${nome} não pode passar sem a capacidade do evento`);
  }

  // Ligando a capacidade, as MESMAS concessões passam a valer: prova que a
  // recusa acima era da capacidade, e não de concessão ausente.
  await ativarCapacidade(c.eventId, c.organizationId, 'material_delivery');
  assert.notEqual((await c.entregar()).status, 403);
  assert.notEqual((await c.reverter()).status, 403);
});

test('revogar fecha a entrega na hora, sem precisar de novo login', LIMITE, async () => {
  const c = await cenario('revoga');
  assert.ok((await c.conceder(['material_entregar'])).ok);
  assert.notEqual((await c.entregar()).status, 403);

  assert.ok((await c.revogar(['material_entregar'])).ok);
  assert.equal((await c.entregar()).status, 403, 'revogação vale na hora');
});

test('organizador entrega e reverte sem concessão', LIMITE, async () => {
  const c = await cenario('dono');
  assert.notEqual((await c.entregar(c.tokenDono)).status, 403);
  assert.notEqual((await c.reverter(c.tokenDono)).status, 403);
});

// Compatibilidade: evento que ainda não ativou o escopo não muda de
// comportamento. Expandir → migrar → validar → restringir.
test('evento sem operator_scoped_access mantém o comportamento de hoje', LIMITE, async () => {
  const c = await cenario('legado', { escopado: false });
  assert.notEqual((await c.entregar()).status, 403, 'sem o escopo, o operador segue como sempre foi');
  assert.notEqual((await c.reverter()).status, 403);

  await ativarCapacidade(c.eventId, c.organizationId, 'operator_scoped_access');
  assert.equal((await c.entregar()).status, 403, 'ativar o escopo passa a exigir concessão');
  assert.equal((await c.reverter()).status, 403);
});

test('concessão de material de um evento não alcança outro evento', LIMITE, async () => {
  const [a, b] = [await cenario('isoa'), await cenario('isob')];
  assert.ok((await a.conceder(['material_entregar'])).ok);

  assert.notEqual((await a.entregar()).status, 403, 'no evento A passa');
  // No evento B esta pessoa não é membro: o evento não existe para ela.
  const foraDaOrganizacao = await chamar(`/events/${b.eventId}/desk/material`, a.tokenOperador, {
    method: 'POST', body: JSON.stringify({ reservationId: randomUUID() }),
  });
  assert.equal(foraDaOrganizacao.status, 404, foraDaOrganizacao.texto);
});
