// Executa contra um PostgreSQL descartável com as migrations aplicadas (DATABASE_URL).
// No CI roda dentro do contêiner da API, depois do smoke; localmente, após `npm run build`.
//
// C-05 (#666) pela ROTA AUTENTICADA: `PATCH /events/:eventId/schedule`.
//
// O teste unitário `event-schedule-policy.test.mjs` prova a decisão pura. O que
// ele NÃO alcança, e é o que esta fixture existe para cobrir:
//
//  1. DUAS ABAS DE VERDADE. A própria PR registrou que a rota não podia ser
//     considerada fechada sem isso. `expectedUpdatedAt` só significa algo
//     contra um `updatedAt` que o PostgreSQL gerou, e o 409 só vale se o
//     segundo PATCH realmente não gravar.
//  2. A INVARIANTE DO FUNDADOR: mudar data não prorroga nem toca lote,
//     inscrição ou financeiro. Isso não se prova com função pura — prova-se
//     comparando as linhas depois da escrita.
//  3. Que a recusa acontece ANTES de qualquer escrita, inclusive de auditoria.
//
// Padrão de bootstrap e de crachá copiado de
// `credential-emission-http.postgres.test.mjs`, e a fixture de catálogo/lote/
// inscrição também, para não inventar forma de tabela.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// jwtSecret() é avaliado na montagem do JwtModule, portanto no IMPORT do
// AppModule. O segredo tem de existir antes disso, e por isso os imports da
// aplicação são dinâmicos em vez de estáticos.
process.env.JWT_SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32
  ? process.env.JWT_SECRET
  : `evolvia-ci-event-schedule-${'x'.repeat(16)}`;

const { NestFactory } = await import('@nestjs/core');
const { ValidationPipe } = await import('@nestjs/common');
const { AppModule } = await import('../dist/app.module.js');
const { GlobalExceptionFilter } = await import('../dist/global-exception.filter.js');
const { configureHttpBodyParsers } = await import('../dist/http-body-policy.js');
const { validationExceptionFactory } = await import('../dist/validation-errors.js');

const db = new PrismaClient();
const sha = (valor) => createHash('sha256').update(valor).digest('hex');
const dia = (n) => `2026-12-${String(n).padStart(2, '0')}T12:00:00.000Z`;
const MOTIVO = 'Prorrogação pedida pelo cliente';

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
  // Restrições de FK e a trilha de auditoria impedem apagar. Os eventos criados
  // aqui são tirados do catálogo público para não alterar as provas visuais que
  // leem /eventos, como faz `subject-areas.postgres.test.mjs`.
  await db.event.updateMany({
    where: { name: { startsWith: 'PG agenda' }, status: 'PUBLISHED' },
    data: { status: 'CANCELLED' },
  });
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

/** Corpo se lê UMA vez: `Response.text()` consome o fluxo. */
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

/**
 * Evento PUBLICADO, presencial, com agenda completa, um lote e uma inscrição
 * confirmada.
 *
 * O lote e a inscrição existem para provar a invariante do fundador: alterar a
 * agenda não os toca. Sem eles, "não prorroga nada automaticamente" seria
 * afirmação, não medição.
 */
async function cenario(rotulo, { format = 'IN_PERSON' } = {}) {
  const run = randomBytes(5).toString('hex');
  const pessoa = (papel) => db.user.create({
    data: { name: `PG agenda ${papel}`, email: `agenda-${rotulo}-${papel}-${run}@evolvia-ci.local`, passwordHash: 'fixture' },
  });
  const dono = await pessoa('dono');
  const operador = await pessoa('operador');
  const leitor = await pessoa('leitor');
  const externo = await pessoa('externo');

  const organizacao = await db.organization.create({
    data: { name: `PG agenda ${rotulo}`, slug: `agenda-${rotulo}-${run}`, createdById: dono.id },
  });
  const outra = await db.organization.create({
    data: { name: `PG agenda ext ${rotulo}`, slug: `agenda-ext-${rotulo}-${run}`, createdById: externo.id },
  });
  await db.organizationMembership.createMany({
    data: [
      { organizationId: organizacao.id, userId: dono.id, role: 'OWNER' },
      { organizationId: organizacao.id, userId: operador.id, role: 'OPERATOR' },
      { organizationId: organizacao.id, userId: leitor.id, role: 'VIEWER' },
      { organizationId: outra.id, userId: externo.id, role: 'OWNER' },
    ],
  });

  const evento = await db.event.create({
    data: {
      ownerId: dono.id,
      organizationId: organizacao.id,
      name: `PG agenda ${rotulo}`,
      slug: `agenda-${rotulo}-${run}`,
      eventType: 'Outro tipo de evento',
      format,
      registrationMode: 'FREE',
      status: 'PUBLISHED',
      startDate: new Date(dia(10)),
      endDate: new Date(dia(12)),
      timeZone: 'America/Sao_Paulo',
      venue: 'Centro de Convenções',
    },
  });

  const escopo = { organizationId: organizacao.id, eventId: evento.id };
  const catalogo = await db.eventRegistrationCatalog.create({ data: escopo });
  const categoria = await db.eventRegistrationCategory.create({
    data: { ...escopo, catalogId: catalogo.id, code: 'GERAL', name: 'Geral' },
  });
  const lote = await db.eventRegistrationLot.create({
    data: {
      ...escopo, categoryId: categoria.id, code: 'LOTE', name: 'Lote',
      startsAt: new Date(Date.now() - 3_600_000), endsAt: new Date(Date.now() + 86_400_000),
      quantity: 50, priceCents: 0,
    },
  });
  const inscricao = await db.eventRegistrationReservation.create({
    data: {
      ...escopo, categoryId: categoria.id, lotId: lote.id,
      protocol: `AGE-${randomBytes(6).toString('hex').toUpperCase()}`,
      idempotencyKeyHash: sha(`idem-${run}`), payloadHash: sha(`payload-${run}`),
      identityHash: sha(`identidade-${run}`), emailHash: sha(`email-${run}`),
      registrationData: { full_name: 'Pessoa Inscrita', preferred_name: 'Pessoa' },
      basePriceCents: 0, discountPercent: 0, finalPriceCents: 0,
      status: 'CONFIRMED', confirmedAt: new Date(),
    },
  });

  const rota = `/events/${evento.id}/schedule`;
  const token = crachar(dono.id, dono.email);

  const estado = async () => {
    const [row, auditorias, loteAgora, inscricaoAgora] = await Promise.all([
      db.event.findUniqueOrThrow({
        where: { id: evento.id },
        select: { status: true, startDate: true, endDate: true, timeZone: true, venue: true, name: true, updatedAt: true },
      }),
      db.auditLog.count({ where: { eventId: evento.id, action: 'event.schedule_updated' } }),
      db.eventRegistrationLot.findUniqueOrThrow({ where: { id: lote.id } }),
      db.eventRegistrationReservation.findUniqueOrThrow({ where: { id: inscricao.id } }),
    ]);
    return { row, auditorias, lote: loteAgora, inscricao: inscricaoAgora };
  };

  const atual = await estado();
  return {
    eventId: evento.id,
    organizationId: organizacao.id,
    dono, operador, leitor, externo,
    token,
    rota,
    estado,
    esperado: atual.row.updatedAt.toISOString(),
    patch: (corpo, comToken = token) => chamar(rota, comToken, { method: 'PATCH', body: JSON.stringify(corpo) }),
  };
}

const LIMITE = { timeout: 180000 };

test('prorrogação válida grava, audita e devolve o novo updatedAt', LIMITE, async () => {
  const c = await cenario('feliz');
  const antes = await c.estado();

  const r = await c.patch({ expectedUpdatedAt: c.esperado, motivo: MOTIVO, endDate: dia(20) });
  assert.equal(r.status, 200, `esperava 200, veio ${r.status}: ${r.texto}`);
  assert.deepEqual(r.json.alterados, ['endDate']);
  assert.equal(r.json.endDate, dia(20));
  assert.equal(r.json.startDate, dia(10), 'campo não pedido volta inalterado');
  assert.notEqual(r.json.updatedAt, c.esperado, 'o novo updatedAt serve de expectedUpdatedAt da próxima vez');

  const depois = await c.estado();
  assert.equal(depois.row.endDate.toISOString(), dia(20));
  assert.equal(depois.row.startDate.toISOString(), dia(10));
  assert.equal(depois.row.timeZone, 'America/Sao_Paulo');
  assert.equal(depois.row.venue, 'Centro de Convenções');
  assert.equal(depois.row.updatedAt.toISOString(), r.json.updatedAt, 'o updatedAt devolvido é o que está no banco');
  assert.equal(depois.auditorias, antes.auditorias + 1, 'uma auditoria, nem zero nem duas');

  // Sem `orderBy`: o evento é novo e a asserção acima já fixou que existe
  // exatamente uma linha desta ação. Ordenar exigiria presumir o nome de uma
  // coluna de AuditLog que eu não conferi no schema.
  const trilha = await db.auditLog.findFirstOrThrow({
    where: { eventId: c.eventId, action: 'event.schedule_updated' },
  });
  assert.equal(trilha.organizationId, c.organizationId);
  assert.equal(trilha.actorUserId, c.dono.id, 'o ator vem do token');
  assert.equal(trilha.metadata.motivo, MOTIVO, 'a auditoria guarda o porquê');
  assert.deepEqual(trilha.metadata.alterados, ['endDate']);
  assert.equal(trilha.metadata.antes.endDate, dia(12), 'antes e depois, para reconstruir a mudança');
  assert.equal(trilha.metadata.depois.endDate, dia(20));
});

test('mudar a agenda NÃO toca lote nem inscrição', LIMITE, async () => {
  const c = await cenario('invariante');
  const antes = await c.estado();

  const r = await c.patch({ expectedUpdatedAt: c.esperado, motivo: MOTIVO, endDate: dia(25), venue: 'Novo Centro' });
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json.alterados, ['endDate', 'venue']);

  const depois = await c.estado();
  assert.deepEqual(depois.lote, antes.lote, 'o lote não foi prorrogado junto');
  assert.deepEqual(depois.inscricao, antes.inscricao, 'a inscrição confirmada não foi tocada');
  assert.equal(depois.row.status, 'PUBLISHED', 'o estado do evento não muda por alteração de agenda');
});

test('limpar término/local sincroniza a sessão do Wizard (não ressuscita no GET)', LIMITE, async () => {
  // ONLINE permite venue null; presencial publicado recusa limpar o local.
  const c = await cenario('wizard-sync', { format: 'ONLINE' });
  await db.eventWizardSession.create({
    data: {
      eventId: c.eventId,
      flowVersion: 'v2',
      currentStep: 'review',
      revision: 3,
      status: 'COMPLETED',
      answers: {
        startDate: dia(10),
        endDate: dia(12),
        timeZone: 'America/Sao_Paulo',
        venue: 'Centro de Convenções',
      },
    },
  });

  const r = await c.patch({
    expectedUpdatedAt: c.esperado,
    motivo: MOTIVO,
    endDate: null,
    venue: null,
  });
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json.alterados, ['endDate', 'venue']);
  assert.equal(r.json.endDate, null);
  assert.equal(r.json.venue, null);
  assert.equal(r.json.wizardRevision, 4);

  const sessao = await db.eventWizardSession.findUniqueOrThrow({
    where: { eventId_flowVersion: { eventId: c.eventId, flowVersion: 'v2' } },
  });
  assert.equal(sessao.revision, 4);
  assert.equal(sessao.answers.endDate, null, 'null gravado evita ?? ressuscitar o término antigo');
  assert.equal(sessao.answers.venue, null, 'null gravado evita ?? ressuscitar o local antigo');
  assert.equal(sessao.answers.startDate, dia(10));
  assert.equal(sessao.answers.timeZone, 'America/Sao_Paulo');
});

test('duas abas: o segundo PATCH com o updatedAt velho recebe 409 e não grava', LIMITE, async () => {
  const c = await cenario('duasabas');
  const velho = c.esperado;

  const primeira = await c.patch({ expectedUpdatedAt: velho, motivo: 'Primeira aba', endDate: dia(20) });
  assert.equal(primeira.status, 200, primeira.texto);
  const depoisDaPrimeira = await c.estado();

  // A segunda aba foi carregada antes e ainda segura o updatedAt antigo.
  const segunda = await c.patch({ expectedUpdatedAt: velho, motivo: 'Segunda aba', endDate: dia(28) });
  assert.equal(segunda.status, 409, `esperava 409, veio ${segunda.status}: ${segunda.texto}`);
  assert.match(segunda.texto, /VERSION_CONFLICT/u, 'a tela precisa distinguir conflito de erro genérico');

  const depoisDaSegunda = await c.estado();
  assert.deepEqual(depoisDaSegunda, depoisDaPrimeira, 'a segunda aba não gravou nada, nem auditoria');
  assert.equal(depoisDaSegunda.row.endDate.toISOString(), dia(20), 'quem venceu foi a primeira');

  // E com o updatedAt novo, a segunda aba consegue salvar.
  const retomada = await c.patch({
    expectedUpdatedAt: depoisDaPrimeira.row.updatedAt.toISOString(),
    motivo: 'Segunda aba, após recarregar',
    endDate: dia(28),
  });
  assert.equal(retomada.status, 200, retomada.texto);
  assert.equal((await c.estado()).row.endDate.toISOString(), dia(28));
});

test('dupla submissão do mesmo corpo não duplica efeito nem auditoria', LIMITE, async () => {
  const c = await cenario('duplo');
  const antes = await c.estado();
  const corpo = { expectedUpdatedAt: c.esperado, motivo: MOTIVO, endDate: dia(20) };

  const [a, b] = await Promise.all([c.patch(corpo), c.patch(corpo)]);
  const status = [a.status, b.status].sort();
  assert.deepEqual(status, [200, 409], `uma vence e a outra conflita; veio ${JSON.stringify(status)}: ${a.texto} | ${b.texto}`);

  const depois = await c.estado();
  assert.equal(depois.auditorias, antes.auditorias + 1, 'duas submissões, uma auditoria');
  assert.equal(depois.row.endDate.toISOString(), dia(20));
});

test('evento não publicado é recusado nomeando o estado, sem gravar', LIMITE, async () => {
  const c = await cenario('rascunho');
  await db.event.update({ where: { id: c.eventId }, data: { status: 'SETUP' } });
  const antes = await c.estado();

  const r = await c.patch({
    expectedUpdatedAt: antes.row.updatedAt.toISOString(),
    motivo: MOTIVO,
    endDate: dia(20),
  });
  assert.equal(r.status, 409, `esperava 409, veio ${r.status}: ${r.texto}`);
  assert.match(r.texto, /INVALID_EVENT_STATE/u);
  assert.match(r.texto, /SETUP/u, 'a resposta nomeia o estado em que o evento está');
  assert.deepEqual(await c.estado(), antes);
});

test('campo não aceito é recusado, e não muda o estado do evento', LIMITE, async () => {
  const c = await cenario('forjado');
  const antes = await c.estado();

  // O risco concreto: quem manda `status` junto e recebe 200 conclui que
  // despublicou o evento.
  const r = await c.patch({
    expectedUpdatedAt: c.esperado, motivo: MOTIVO, endDate: dia(20), status: 'DRAFT',
  });
  assert.equal(r.status, 400, `esperava 400, veio ${r.status}: ${r.texto}`);
  assert.match(r.texto, /status/u, 'a mensagem nomeia o campo recusado');

  const depois = await c.estado();
  assert.equal(depois.row.status, 'PUBLISHED', 'o evento continua publicado');
  assert.deepEqual(depois, antes, 'e nada mais foi gravado');
});

test('sem expectedUpdatedAt a rota recusa antes de qualquer escrita', LIMITE, async () => {
  const c = await cenario('semversao');
  const antes = await c.estado();

  for (const corpo of [
    { motivo: MOTIVO, endDate: dia(20) },
    { expectedUpdatedAt: null, motivo: MOTIVO, endDate: dia(20) },
    { expectedUpdatedAt: 12345, motivo: MOTIVO, endDate: dia(20) },
  ]) {
    const r = await c.patch(corpo);
    assert.equal(r.status, 400, `${JSON.stringify(corpo)} -> ${r.status}: ${r.texto}`);
  }
  assert.deepEqual(await c.estado(), antes);
});

test('intervalo invertido por PATCH de uma data só é recusado sem gravar', LIMITE, async () => {
  const c = await cenario('invertido');
  const antes = await c.estado();

  // Só o término, anterior ao início já gravado: é o C-04 visto por esta rota.
  const r = await c.patch({ expectedUpdatedAt: c.esperado, motivo: MOTIVO, endDate: dia(1) });
  assert.equal(r.status, 400, `esperava 400, veio ${r.status}: ${r.texto}`);
  assert.match(r.texto, /anterior à data de início/u);
  assert.deepEqual(await c.estado(), antes);

  // E o outro sentido.
  const inverso = await c.patch({ expectedUpdatedAt: c.esperado, motivo: MOTIVO, startDate: dia(20) });
  assert.equal(inverso.status, 400, inverso.texto);
  assert.deepEqual(await c.estado(), antes);
});

test('motivo ausente recusa: a auditoria não pode ficar sem o porquê', LIMITE, async () => {
  const c = await cenario('semmotivo');
  const antes = await c.estado();

  for (const motivo of [undefined, '', '  ', 'ok']) {
    const r = await c.patch({ expectedUpdatedAt: c.esperado, motivo, endDate: dia(20) });
    assert.equal(r.status, 400, `motivo ${JSON.stringify(motivo)} -> ${r.status}: ${r.texto}`);
  }
  assert.deepEqual(await c.estado(), antes);
});

test('pedido que não altera nada é recusado, não é sucesso falso', LIMITE, async () => {
  const c = await cenario('nadamuda');
  const antes = await c.estado();

  const r = await c.patch({
    expectedUpdatedAt: c.esperado, motivo: MOTIVO, venue: 'Centro de Convenções',
  });
  assert.equal(r.status, 400, `esperava 400, veio ${r.status}: ${r.texto}`);
  assert.match(r.texto, /[Nn]enhuma altera/u);
  assert.deepEqual(await c.estado(), antes);
});

test('limpar o local recusa em presencial e aceita em online', LIMITE, async () => {
  const presencial = await cenario('presencial');
  const antes = await presencial.estado();
  const recusado = await presencial.patch({
    expectedUpdatedAt: presencial.esperado, motivo: MOTIVO, venue: null,
  });
  assert.equal(recusado.status, 400, recusado.texto);
  assert.match(recusado.texto, /sem local/u);
  assert.deepEqual(await presencial.estado(), antes);

  const online = await cenario('online', { format: 'ONLINE' });
  const aceito = await online.patch({ expectedUpdatedAt: online.esperado, motivo: MOTIVO, venue: null });
  assert.equal(aceito.status, 200, aceito.texto);
  assert.equal((await online.estado()).row.venue, null);
});

test('operador, leitor e ator de outra organização recebem 404 e nada é gravado', LIMITE, async () => {
  const c = await cenario('autorizacao');
  const antes = await c.estado();

  for (const [papel, pessoa] of [['operador', c.operador], ['leitor', c.leitor], ['externo', c.externo]]) {
    const token = crachar(pessoa.id, pessoa.email);
    // 404 e não 403: contrato de não-enumeração do módulo. Quem não pode editar
    // não descobre pela resposta que o evento existe.
    const valido = await c.patch({ expectedUpdatedAt: c.esperado, motivo: MOTIVO, endDate: dia(20) }, token);
    assert.equal(valido.status, 404, `${papel} com corpo válido: ${valido.status} ${valido.texto}`);

    const invalido = await c.patch({ expectedUpdatedAt: c.esperado, motivo: MOTIVO, endDate: dia(1) }, token);
    assert.equal(invalido.status, 404, `${papel}: a autorização vem ANTES da validação do corpo`);

    const forjado = await c.patch({ expectedUpdatedAt: c.esperado, motivo: MOTIVO, status: 'DRAFT' }, token);
    assert.equal(forjado.status, 404, `${papel}: nem o campo não aceito é revelado`);
  }

  const semToken = await c.patch({ expectedUpdatedAt: c.esperado, motivo: MOTIVO, endDate: dia(20) }, null);
  assert.equal(semToken.status, 401, `sem token: ${semToken.status} ${semToken.texto}`);

  assert.deepEqual(await c.estado(), antes, 'nenhuma das dez tentativas tocou no evento');
});

test('evento inexistente é 404 para quem não tem nada a ver com ele', LIMITE, async () => {
  const c = await cenario('inexistente');
  const r = await chamar(`/events/evento-que-nao-existe-${randomBytes(4).toString('hex')}/schedule`, c.token, {
    method: 'PATCH',
    body: JSON.stringify({ expectedUpdatedAt: c.esperado, motivo: MOTIVO, endDate: dia(20) }),
  });
  assert.equal(r.status, 404, `${r.status}: ${r.texto}`);
});
