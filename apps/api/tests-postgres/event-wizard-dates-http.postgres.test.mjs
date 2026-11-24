// Executa contra um PostgreSQL descartável com as migrations aplicadas (DATABASE_URL).
// No CI roda dentro do contêiner da API, depois do smoke; localmente, após `npm run build`.
//
// Complemento da #662 pela ROTA AUTENTICADA. O arquivo irmão
// `event-wizard-dates.postgres.test.mjs` chama o serviço direto; este sobe o
// AppModule numa porta efêmera e usa `PATCH /event-wizard/:eventId` com Bearer,
// que é o que o organizador realmente aciona. A diferença importa porque entre
// o cliente e a regra existem AuthGuard, ValidationPipe com
// `forbidNonWhitelisted` e GlobalExceptionFilter — nenhum deles exercitado pela
// chamada direta.
//
// Padrão de bootstrap e de crachá copiado de
// `credential-emission-http.postgres.test.mjs`, para não criar infraestrutura
// de fixture nova.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createHmac, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// jwtSecret() é avaliado na montagem do JwtModule, portanto no IMPORT do
// AppModule. O segredo tem de existir antes disso, e por isso os imports da
// aplicação são dinâmicos em vez de estáticos.
process.env.JWT_SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32
  ? process.env.JWT_SECRET
  : `evolvia-ci-wizard-dates-${'x'.repeat(16)}`;

const { NestFactory } = await import('@nestjs/core');
const { ValidationPipe } = await import('@nestjs/common');
const { AppModule } = await import('../dist/app.module.js');
const { GlobalExceptionFilter } = await import('../dist/global-exception.filter.js');
const { configureHttpBodyParsers } = await import('../dist/http-body-policy.js');
const { validationExceptionFactory } = await import('../dist/validation-errors.js');
const { AuthorizationService } = await import('../dist/authorization.service.js');
const { EventMutationPolicy } = await import('../dist/event-mutation-policy.service.js');
const { EventWizardService } = await import('../dist/event-wizard.service.js');

const db = new PrismaClient();
const wizard = new EventWizardService(db, new AuthorizationService(db), new EventMutationPolicy());

const EVENT_TYPE = 'Outro tipo de evento';
const ERRO = 'A data de término não pode ser anterior à data de início.';
const dia = (n) => `2026-12-${String(n).padStart(2, '0')}T12:00:00.000Z`;

let app;
let base = '';
let dono;
let operador;
let estranho;
let organizationId;

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

  const run = randomBytes(5).toString('hex');
  const pessoa = (papel) => db.user.create({
    data: { name: `PG datas ${papel}`, email: `datas-http-${papel}-${run}@evolvia-ci.local`, passwordHash: 'fixture' },
  });
  dono = await pessoa('dono');
  operador = await pessoa('operador');
  estranho = await pessoa('estranho');

  const organizacao = await db.organization.create({
    data: { name: `Org datas ${run}`, slug: `datas-http-${run}`, createdById: dono.id },
  });
  organizationId = organizacao.id;
  const outra = await db.organization.create({
    data: { name: `Org externa ${run}`, slug: `datas-http-ext-${run}`, createdById: estranho.id },
  });

  await db.organizationMembership.createMany({
    data: [
      { organizationId, userId: dono.id, role: 'OWNER' },
      { organizationId, userId: operador.id, role: 'OPERATOR' },
      { organizationId: outra.id, userId: estranho.id, role: 'OWNER' },
    ],
  });
});

after(async () => {
  // Restrições de FK e a trilha de auditoria impedem apagar. Os eventos criados
  // aqui ficam em DRAFT/SETUP, fora do catálogo público, então nada a limpar.
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
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(opcoes.body ? { 'content-type': 'application/json' } : {}),
      ...(opcoes.headers ?? {}),
    },
  }));
}

const patch = (eventId, token, corpo) => chamar(`/event-wizard/${eventId}`, token, {
  method: 'PATCH', body: JSON.stringify(corpo),
});

/** Só o que precisa ficar igual depois de uma recusa. */
async function estado(eventId) {
  const [event, session] = await Promise.all([
    db.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { startDate: true, endDate: true, name: true, subjectAreas: true, status: true, updatedAt: true },
    }),
    db.eventWizardSession.findFirstOrThrow({
      where: { eventId },
      select: { revision: true, answers: true, lastSavedAt: true, currentStep: true },
    }),
  ]);
  return { event, session };
}

function mensagens(resposta) {
  const corpo = resposta.json ?? {};
  const envelope = corpo.error && typeof corpo.error === 'object' ? corpo.error : corpo;
  const bruto = envelope.fields
    ?? envelope.message
    ?? corpo.message
    ?? corpo.errors
    ?? corpo.detail
    ?? resposta.texto;
  return Array.isArray(bruto) ? bruto.map(String) : [String(bruto)];
}

/**
 * Evento com intervalo válido gravado: 10/12 a 12/12.
 *
 * A semeadura usa o SERVIÇO de propósito. `SaveEventWizardDto` exige
 * `revision >= 1`, e a revisão inicial da sessão é detalhe do schema que este
 * teste não deve presumir: um `save` aceito incrementa, então a revisão que vai
 * para a rota é >= 1 sob qualquer default. O que está sob prova aqui é o PATCH,
 * não a semeadura.
 */
async function eventoComIntervalo() {
  const started = await wizard.start(dono.id, { organizationId, eventType: EVENT_TYPE });
  const eventId = started.event.id;
  const salvo = await wizard.save(dono.id, eventId, {
    currentStep: 'identity',
    revision: started.session.revision,
    answers: {
      eventType: EVENT_TYPE,
      name: 'Intervalo pela rota',
      format: 'IN_PERSON',
      registrationMode: 'FREE',
      timeZone: 'America/Sao_Paulo',
      startDate: dia(10),
      endDate: dia(12),
      subjectAreas: ['tecnologia'],
    },
  });
  const revision = salvo.session.revision;
  assert.ok(revision >= 1, `a revisão enviada à rota precisa satisfazer @Min(1), veio ${revision}`);
  const row = await db.event.findUniqueOrThrow({ where: { id: eventId } });
  assert.equal(row.startDate.toISOString(), dia(10), 'pré-condição: início gravado');
  assert.equal(row.endDate.toISOString(), dia(12), 'pré-condição: término gravado');
  return { eventId, revision, token: crachar(dono.id, dono.email) };
}

const LIMITE = { timeout: 180000 };

test('PATCH com só o término anterior ao início gravado responde 400 e não altera o evento', LIMITE, async () => {
  const { eventId, revision, token } = await eventoComIntervalo();
  const antes = await estado(eventId);

  const resposta = await patch(eventId, token, {
    currentStep: 'identity',
    revision,
    answers: { eventType: EVENT_TYPE, endDate: dia(1) },
  });

  assert.equal(resposta.status, 400, `esperava 400, veio ${resposta.status}: ${resposta.texto}`);
  assert.ok(
    mensagens(resposta).includes(ERRO),
    `a recusa precisa dizer o motivo ao organizador. Recebido: ${resposta.texto}`,
  );
  assert.deepEqual(await estado(eventId), antes, 'nem o evento nem a sessão podem ter se movido');
});

test('PATCH com só o início posterior ao término gravado responde 400 e não altera o evento', LIMITE, async () => {
  const { eventId, revision, token } = await eventoComIntervalo();
  const antes = await estado(eventId);

  const resposta = await patch(eventId, token, {
    currentStep: 'identity',
    revision,
    answers: { eventType: EVENT_TYPE, startDate: dia(20) },
  });

  assert.equal(resposta.status, 400, `esperava 400, veio ${resposta.status}: ${resposta.texto}`);
  assert.ok(mensagens(resposta).includes(ERRO), resposta.texto);
  assert.deepEqual(await estado(eventId), antes, 'o outro sentido também não grava nada');
});

test('PATCH de prorrogação válida responde 200, e o GET devolve o término novo', LIMITE, async () => {
  const { eventId, revision, token } = await eventoComIntervalo();

  const resposta = await patch(eventId, token, {
    currentStep: 'identity',
    revision,
    answers: { eventType: EVENT_TYPE, endDate: dia(20) },
  });
  assert.equal(resposta.status, 200, `esperava 200, veio ${resposta.status}: ${resposta.texto}`);
  assert.equal(resposta.json.answers.endDate, dia(20), 'a própria resposta do PATCH já traz o término novo');
  assert.equal(resposta.json.session.revision, revision + 1, 'o salvamento aceito avança a revisão');

  // Recarregar pela rota, que é o que a tela faz ao reabrir o Wizard.
  const recarregado = await chamar(`/event-wizard/${eventId}`, token);
  assert.equal(recarregado.status, 200, recarregado.texto);
  assert.equal(recarregado.json.answers.endDate, dia(20), 'o término prorrogado sobrevive ao recarregamento');
  assert.equal(recarregado.json.answers.startDate, dia(10), 'o início não pedido foi preservado');

  // E na linha do banco, sem passar pela aplicação.
  const row = await db.event.findUniqueOrThrow({ where: { id: eventId } });
  assert.equal(row.endDate.toISOString(), dia(20));
  assert.equal(row.startDate.toISOString(), dia(10), 'prorrogar não mexe no início');
  assert.equal(row.name, 'Intervalo pela rota', 'e não mexe em campo que o corpo não trouxe');
  assert.deepEqual(row.subjectAreas, ['tecnologia'], 'C-02: corpo parcial não apaga as áreas');
});

test('PATCH sem token não valida nem grava', LIMITE, async () => {
  const { eventId, revision } = await eventoComIntervalo();
  const antes = await estado(eventId);

  const resposta = await patch(eventId, null, {
    currentStep: 'identity',
    revision,
    answers: { eventType: EVENT_TYPE, endDate: dia(20) },
  });

  assert.equal(resposta.status, 401, `esperava 401, veio ${resposta.status}: ${resposta.texto}`);
  assert.deepEqual(await estado(eventId), antes);
});

test('operador e ator de outra organização recebem 404 e nada é gravado', LIMITE, async () => {
  const { eventId, revision } = await eventoComIntervalo();
  const antes = await estado(eventId);

  for (const [papel, pessoa] of [['operador', operador], ['externo', estranho]]) {
    // Recusa por ausência de papel editor. `requireRole` lança NotFoundException
    // de propósito: 404 e não 403, para não confirmar a existência do evento a
    // quem não pode vê-lo. Contrato verificado em código, registrado aqui.
    const token = crachar(pessoa.id, pessoa.email);
    const valido = await patch(eventId, token, {
      currentStep: 'identity', revision, answers: { eventType: EVENT_TYPE, endDate: dia(20) },
    });
    assert.equal(valido.status, 404, `${papel} com corpo válido: esperava 404, veio ${valido.status}: ${valido.texto}`);

    const invalido = await patch(eventId, token, {
      currentStep: 'identity', revision, answers: { eventType: EVENT_TYPE, endDate: dia(1) },
    });
    assert.equal(invalido.status, 404, `${papel} com corpo inválido: a autorização vem ANTES da validação da data`);

    const leitura = await chamar(`/event-wizard/${eventId}`, token);
    assert.equal(leitura.status, 404, `${papel} também não lê o rascunho`);
  }

  assert.deepEqual(await estado(eventId), antes, 'nenhuma das seis tentativas tocou no evento');
});

test('corpo com propriedade a mais é recusado pelo ValidationPipe, sem chegar à regra', LIMITE, async () => {
  const { eventId, revision, token } = await eventoComIntervalo();
  const antes = await estado(eventId);

  const resposta = await patch(eventId, token, {
    currentStep: 'identity',
    revision,
    answers: { eventType: EVENT_TYPE, endDate: dia(20) },
    status: 'PUBLISHED',
  });

  assert.equal(resposta.status, 400, `esperava 400, veio ${resposta.status}: ${resposta.texto}`);
  assert.equal(
    mensagens(resposta).includes(ERRO),
    false,
    'a recusa é de forma do corpo, não da regra de datas',
  );
  assert.deepEqual(await estado(eventId), antes, 'campo forjado no navegador não publica nem grava nada');
});
