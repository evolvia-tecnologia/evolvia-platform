// Somente PostgreSQL descartável com migrations aplicadas (DATABASE_URL). Dados
// de fixture são únicos e preservados, nunca apagados.
//
// CL02 — jornada do operador restrito. Prova HTTP de que a lista que o operador
// recebe é a MESMA decisão que o balcão aplica.
//
// Por que isto importa mais do que parece: a lista não é controle de acesso, é
// a interface não mentindo. Se ela prometer uma ação que o balcão recusa, o
// operador descobre no meio do evento, com fila esperando. Se ela esconder uma
// ação que a pessoa tem, o organizador concedeu em vão. Os dois casos são
// testados aqui CONTRA A ROTA DO BALCÃO, e não contra a própria lista — uma
// lista conferida consigo mesma não prova nada.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// jwtSecret() é avaliado na montagem do JwtModule, portanto no IMPORT do
// AppModule. O segredo tem de existir antes disso, e por isso os imports da
// aplicação são dinâmicos em vez de estáticos.
process.env.JWT_SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32
  ? process.env.JWT_SECRET
  : `evolvia-ci-operator-self-service-${'x'.repeat(16)}`;

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
  let json = null;
  try { json = JSON.parse(texto); } catch { json = null; }
  return { status: resposta.status, ok: resposta.ok, texto, json };
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

async function cenario(rotulo, { escopado = true, capacidades = [] } = {}) {
  const chave = randomUUID();
  const dono = await db.user.create({
    data: { name: `PG ${rotulo} dono`, email: `self-${rotulo}-dono-${chave}@evolvia-ci.local`, passwordHash: 'fixture' },
  });
  const operador = await db.user.create({
    data: { name: `PG ${rotulo} operador`, email: `self-${rotulo}-op-${chave}@evolvia-ci.local`, passwordHash: 'fixture' },
  });
  const organizacao = await db.organization.create({
    data: { name: `PG ${rotulo}`, slug: `self-${rotulo}-${chave}`, createdById: dono.id },
  });
  const evento = await db.event.create({
    data: {
      ownerId: dono.id, organizationId: organizacao.id, name: `Evento ${rotulo}`, slug: `self-${rotulo}-${chave}`,
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

  // As capacidades têm de estar no estado pedido, pelo MESMO caminho que o
  // repositório lê. Sem esta conferência o desenho é aditivo, tudo passaria, e
  // a recusa seria inverificável.
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
  return {
    eventId: evento.id,
    organizationId: organizacao.id,
    dono,
    operador,
    tokenDono,
    tokenOperador,
    minhas: (token = tokenOperador) => chamar(`/events/${evento.id}/operators/me/capabilities`, token),
    conceder: (acoes) => chamar(`/events/${evento.id}/operators/${operador.id}/grants`, tokenDono, {
      method: 'POST', body: JSON.stringify({ motivo: `autoatendimento ${rotulo}`, acoes }),
    }),
    revogar: (acoes) => chamar(`/events/${evento.id}/operators/${operador.id}/grants/revoke`, tokenDono, {
      method: 'POST', body: JSON.stringify({ motivo: `revogação ${rotulo}`, acoes }),
    }),
    relatorio: (token = tokenOperador) => chamar(`/events/${evento.id}/desk/report`, token),
    checkin: (token = tokenOperador) => chamar(`/events/${evento.id}/desk/check-in`, token, {
      method: 'POST', body: JSON.stringify({ reservationId: randomUUID() }),
    }),
  };
}

/**
 * "Passou pelo guard", com rigor: não 403, não 404 e não 5xx. `notEqual(403)`
 * sozinho é satisfeito por um 500, e um erro de servidor passando por
 * aprovação é o verde falso que esta suíte existe para não produzir.
 */
function passouNoGuard(r, porque) {
  assert.ok(
    r.status !== 403 && r.status !== 404 && r.status < 500,
    `${porque} (status ${r.status}: ${r.texto})`,
  );
}

/**
 * Para o check-in, que é chamado com um `reservationId` sorteado: a inscrição
 * de fato não existe, então 404 é resposta legítima do negócio e não pode ser
 * proibida. Só o 403 e o 5xx são reprovados aqui.
 *
 * Não afirmo o código exato porque não conferi em código o que
 * `checkInReservation()` devolve para inscrição inexistente. Onde conferi —
 * `confirmedReservation()`, que devolve 400 — o teste afirma o código exato.
 */
function naoBarradoPeloGuard(r, porque) {
  assert.ok(r.status !== 403 && r.status < 500, `${porque} (status ${r.status}: ${r.texto})`);
}

const LIMITE = { timeout: 120000 };
const codigos = (resposta) => resposta.json.acoes.map((a) => a.acao).sort();

test('operador sem concessão vê lista vazia, com o papel para a tela explicar', LIMITE, async () => {
  const c = await cenario('vazio');
  const r = await c.minhas();
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.escopado, true);
  assert.equal(r.json.papel, 'OPERATOR');
  assert.deepEqual(r.json.acoes, [], 'deny-by-default: vazio, não o catálogo inteiro');
});

test('a lista acompanha concessão e revogação, e o balcão concorda com ela', LIMITE, async () => {
  // `access_control` ativa para o balcão ter capacidade operacional: sem ela,
  // `report()` responderia 404 por `requireOperational()` e a asserção abaixo
  // passaria pelo motivo errado, em vez de provar que a lista cumpriu. Com
  // `passouNoGuard`, esse 404 passou a reprovar de verdade.
  const c = await cenario('ciclo', { capacidades: ['access_control'] });
  assert.deepEqual(codigos(await c.minhas()), []);
  assert.equal((await c.relatorio()).status, 403, 'sem concessão o balcão recusa');

  assert.ok((await c.conceder(['relatorio'])).ok);
  assert.deepEqual(codigos(await c.minhas()), ['relatorio']);
  // A lista prometeu: o balcão tem de cumprir.
  passouNoGuard(await c.relatorio(), 'a lista prometeu uma ação que o balcão recusou');

  assert.ok((await c.revogar(['relatorio'])).ok);
  assert.deepEqual(codigos(await c.minhas()), [], 'revogação some da lista na hora');
  assert.equal((await c.relatorio()).status, 403, 'e o balcão volta a recusar');
});

// O caso que separa "lista honesta" de "lista bonita": a concessão existe, mas
// a capacidade do evento está desligada. Prometer aqui seria prometer 403.
test('concessão com capacidade do evento desligada não entra na lista nem no balcão', LIMITE, async () => {
  const c = await cenario('capacidade');
  assert.ok((await c.conceder(['checkin'])).ok, 'a concessão em si é válida');

  assert.deepEqual(
    codigos(await c.minhas()),
    [],
    'access_control está inativa no evento: a lista não pode prometer check-in',
  );
  // 404, não 403: o guard mapeia capacidade inativa para `NotFoundException`
  // para não revelar que o evento existe sem aquela capacidade. A lista vazia
  // e o 404 contam a mesma história — a ação não está disponível aqui.
  assert.equal((await c.checkin()).status, 404, 'e o balcão recusa, como a lista indicou');

  // Ligando a capacidade, a mesma concessão passa a valer nos dois lugares.
  await ativarCapacidade(c.eventId, c.organizationId, 'access_control');
  assert.deepEqual(codigos(await c.minhas()), ['checkin']);
  naoBarradoPeloGuard(await c.checkin(), 'com a capacidade ligada o balcão aceita');
});

test('cada entrada da lista traz a capacidade exigida e o aviso de ação sensível', LIMITE, async () => {
  const c = await cenario('forma');
  assert.ok((await c.conceder(['relatorio'])).ok);
  const r = await c.minhas();
  assert.deepEqual(r.json.acoes, [{ acao: 'relatorio', capacidade: null, sensivel: false }]);
});

test('ação sensível concedida vem marcada como sensível', LIMITE, async () => {
  const c = await cenario('sensivel', { capacidades: ['access_control'] });
  assert.ok((await c.conceder(['checkin', 'checkin_reverter'])).ok);
  const r = await c.minhas();
  const porAcao = Object.fromEntries(r.json.acoes.map((a) => [a.acao, a.sensivel]));
  assert.equal(porAcao.checkin, false);
  assert.equal(porAcao.checkin_reverter, true, 'reverter é sensível e a tela precisa poder avisar');
});

test('organizador recebe o catálogo filtrado pelas capacidades, sem concessão', LIMITE, async () => {
  const c = await cenario('dono', { capacidades: ['access_control'] });
  const r = await c.minhas(c.tokenDono);
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.papel, 'OWNER');
  const lista = codigos(r);
  assert.ok(lista.includes('checkin'), 'access_control está ativa');
  assert.ok(lista.includes('relatorio'), 'relatório não depende de capacidade');
  assert.ok(!lista.includes('credencial_imprimir'), 'credential está inativa: nem o dono pode prometer isso');
});

test('evento não escopado diz escopado=false, para a tela não insinuar concessão', LIMITE, async () => {
  // `access_control` ativa pelo mesmo motivo do teste do ciclo: sem capacidade
  // operacional, `report()` devolveria 404 e a asserção do fim passaria por
  // vacuidade. O CI não reprovava este caso — ele passava pelo motivo errado,
  // que é pior. A fixture fechou a causa; `passouNoGuard` fechou o sintoma.
  const c = await cenario('legado', { escopado: false, capacidades: ['access_control'] });
  const r = await c.minhas();
  assert.equal(r.json.escopado, false);
  assert.ok(codigos(r).includes('relatorio'), 'sem a capacidade, o comportamento de hoje é preservado');
  passouNoGuard(await c.relatorio(), 'e o balcão segue liberando, como sempre');
});

test('a rota não serve para descobrir evento de outra organização', LIMITE, async () => {
  const [a, b] = [await cenario('isoa'), await cenario('isob')];
  const r = await chamar(`/events/${b.eventId}/operators/me/capabilities`, a.tokenOperador);
  assert.equal(r.status, 404, r.texto);
  assert.match(r.texto, /não encontrado|nao encontrado/iu, 'mesma mensagem do balcão, sem vazar existência');
});

test('sem token, 401', LIMITE, async () => {
  const c = await cenario('semtoken');
  const r = await lida(fetch(`${base}/events/${c.eventId}/operators/me/capabilities`));
  assert.equal(r.status, 401, r.texto);
});

// Autoatendimento é sobre quem pergunta. Não pode virar consulta sobre outra
// pessoa, nem com a URL colaborando.
test('não existe caminho para consultar a lista de outra pessoa', LIMITE, async () => {
  const c = await cenario('alheia');
  assert.ok((await c.conceder(['relatorio'])).ok);
  const comoDono = await c.minhas(c.tokenDono);
  const comoOperador = await c.minhas(c.tokenOperador);
  assert.notDeepEqual(codigos(comoDono), codigos(comoOperador), 'as duas listas têm de ser diferentes aqui');

  // Tentar pendurar o id de outra pessoa na URL não muda nada: ou a rota não
  // existe, ou responde sobre quem pediu.
  const tentativa = await chamar(`/events/${c.eventId}/operators/${c.dono.id}/capabilities`, c.tokenOperador);
  if (tentativa.status === 200) {
    assert.deepEqual(
      tentativa.json.acoes.map((a) => a.acao).sort(),
      codigos(comoOperador),
      'se essa URL responder, tem de responder sobre o ator do token',
    );
  } else {
    assert.ok([404, 403].includes(tentativa.status), `esperado 404/403, veio ${tentativa.status}`);
  }
});
