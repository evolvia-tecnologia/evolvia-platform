// Executa contra um PostgreSQL descartável com as migrations aplicadas (DATABASE_URL).
// No CI roda dentro do contêiner da API, depois do smoke; localmente, após `npm run build`.
//
// C-04 (#663) pela ROTA AUTENTICADA: `PUT /events/:eventId/registration-commercial`.
//
// O teste unitário `registration-catalog-removal.test.mjs` prova as funções
// puras. O que ele NÃO alcança, e é o motivo deste arquivo:
//
//  1. As TRÊS tabelas de verdade. O defeito que o Work apontou foi eu conferir
//     só inscrições: lote preso apenas por PEDIDO ou apenas por FILA passava e
//     caía no 500 do banco. Função pura não prova que a consulta encosta nas
//     três tabelas — só o banco prova.
//  2. Que a revisão NÃO é queimada numa recusa. A conferência roda antes de
//     `updateMany` avançar a revisão, e isso só se mede lendo a linha depois.
//  3. Que o `Restrict` do banco realmente recusaria — ou seja, que a
//     antecipação está evitando um 500 real, e não cuidando de um perigo
//     imaginário.
//
// Fixtures derivadas de arquivos que já rodam contra banco real:
// `registration-waitlist.postgres.test.mjs` (fila, CPF, formulário) e
// `registration-order-atomic.postgres.test.mjs` (pedido agrupado). Nada de
// forma de tabela inventada por mim.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// jwtSecret() é avaliado na montagem do JwtModule, portanto no IMPORT do
// AppModule. O segredo tem de existir antes disso, e por isso os imports da
// aplicação são dinâmicos em vez de estáticos.
process.env.JWT_SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32
  ? process.env.JWT_SECRET
  : `evolvia-ci-catalog-removal-${'x'.repeat(16)}`;

const { NestFactory } = await import('@nestjs/core');
const { ValidationPipe } = await import('@nestjs/common');
const { AppModule } = await import('../dist/app.module.js');
const { GlobalExceptionFilter } = await import('../dist/global-exception.filter.js');
const { configureHttpBodyParsers } = await import('../dist/http-body-policy.js');
const { validationExceptionFactory } = await import('../dist/validation-errors.js');
const { AuthorizationService } = await import('../dist/authorization.service.js');
const { RegistrationReservationsService } = await import('../dist/registration-reservations.service.js');
const { RegistrationWaitlistService } = await import('../dist/registration-waitlist.service.js');
const { RegistrationRefundService } = await import('../dist/registration-refund.service.js');

const db = new PrismaClient();
const refunds = new RegistrationRefundService(db, {});
const reservations = new RegistrationReservationsService(
  db,
  { isConfigured: () => false },
  { notifyRegistrationConfirmed: async () => {} },
  refunds,
);
const waitlist = new RegistrationWaitlistService(db, new AuthorizationService(db), reservations);

const run = randomBytes(5).toString('hex');
const token = `PGlotes${run}`;
const HORA = 3_600_000;
const DIA = 86_400_000;

let app;
let base = '';

// CPF válido, do gerador de `registration-waitlist.postgres.test.mjs`: o
// formulário de inscrição valida dígito verificador.
let cpfSeed = 100_000_000 + Math.floor(Math.random() * 800_000_000);
function cpf() {
  cpfSeed += 1;
  const digitos = String(cpfSeed).padStart(9, '0').split('').map(Number);
  for (const tamanho of [9, 10]) {
    const soma = digitos.slice(0, tamanho).reduce((total, digito, i) => total + digito * (tamanho + 1 - i), 0);
    const resto = (soma * 10) % 11;
    digitos.push(resto === 10 ? 0 : resto);
  }
  return digitos.join('');
}

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
  await db.event.updateMany({
    where: { name: { startsWith: token }, status: 'PUBLISHED' },
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

function chamar(caminho, tok, opcoes = {}) {
  return lida(fetch(`${base}${caminho}`, {
    ...opcoes,
    headers: {
      ...(tok ? { authorization: `Bearer ${tok}` } : {}),
      ...(opcoes.body ? { 'content-type': 'application/json' } : {}),
      ...(opcoes.headers ?? {}),
    },
  }));
}

async function pessoa(rotulo, verificado = true) {
  const criada = await db.user.create({
    data: {
      name: `${token} ${rotulo}`,
      email: `lotes-${rotulo}-${randomBytes(4).toString('hex')}-${run}@evolvia-ci.local`,
      passwordHash: 'fixture',
      emailVerifiedAt: verificado ? new Date() : null,
    },
  });
  criada.document = cpf();
  return criada;
}

/**
 * Dois lotes na MESMA categoria, com períodos que não se sobrepõem, códigos em
 * minúsculas e preço zero.
 *
 * Os três detalhes não são estéticos. `CODE_PATTERN` da política só aceita
 * `^[a-z][a-z0-9_]{1,59}$`, e a reconciliação casa por `code`: lote gravado
 * como `LOTE1` nunca casaria com `lote1` no corpo, e o salvamento tentaria
 * REMOVER o lote em uso por engano — o teste passaria pelo motivo errado.
 * Períodos sobrepostos na mesma categoria são recusados pela política, e
 * evento FREE só aceita lote com preço zero.
 *
 * `capacity: 1` na categoria é o que torna o segundo lote lotado sem ter
 * nenhuma inscrição própria: é assim que se consegue um lote preso SÓ pela
 * fila de espera.
 */
async function cenario(rotulo, { mode = 'FREE', priceCents = 0, capacity = 1 } = {}) {
  const sufixo = randomBytes(4).toString('hex');
  const dono = await pessoa(`${rotulo}-dono`);
  const operador = await pessoa(`${rotulo}-operador`);
  const externo = await pessoa(`${rotulo}-externo`);

  const organizacao = await db.organization.create({
    data: { name: `${token} ${rotulo}`, slug: `lotes-${rotulo}-${sufixo}`, createdById: dono.id },
  });
  const outra = await db.organization.create({
    data: { name: `${token} ext ${rotulo}`, slug: `lotes-ext-${rotulo}-${sufixo}`, createdById: externo.id },
  });
  await db.organizationMembership.createMany({
    data: [
      { organizationId: organizacao.id, userId: dono.id, role: 'OWNER' },
      { organizationId: organizacao.id, userId: operador.id, role: 'OPERATOR' },
      { organizationId: outra.id, userId: externo.id, role: 'OWNER' },
    ],
  });

  // Publicado para os vínculos poderem nascer. O salvamento do catálogo exige
  // estado mutável, então os testes voltam para SETUP antes do PUT — que é
  // exatamente a jornada real de quem despublica para reeditar.
  const evento = await db.event.create({
    data: {
      ownerId: dono.id, organizationId: organizacao.id,
      name: `${token} ${rotulo}`, slug: `lotes-${rotulo}-${sufixo}`,
      eventType: 'Outro tipo de evento', format: 'IN_PERSON',
      registrationMode: mode, status: 'PUBLISHED',
    },
  });

  const escopo = { organizationId: organizacao.id, eventId: evento.id };
  const catalogo = await db.eventRegistrationCatalog.create({ data: escopo });
  const categoria = await db.eventRegistrationCategory.create({
    data: { ...escopo, catalogId: catalogo.id, code: 'geral', name: 'Geral', capacity },
  });
  const lote1 = await db.eventRegistrationLot.create({
    data: {
      ...escopo, categoryId: categoria.id, code: 'lote1', name: 'Lote 1',
      startsAt: new Date(Date.now() - HORA), endsAt: new Date(Date.now() + DIA),
      quantity: 1, priceCents,
    },
  });
  const lote2 = await db.eventRegistrationLot.create({
    data: {
      ...escopo, categoryId: categoria.id, code: 'lote2', name: 'Lote 2',
      startsAt: new Date(Date.now() + 2 * DIA), endsAt: new Date(Date.now() + 3 * DIA),
      quantity: 1, priceCents,
    },
  });
  await db.eventRegistrationTermsDocument.create({
    data: {
      ...escopo, storageKey: `terms/${token}/${sufixo}.pdf`, fileName: 'termos.pdf',
      byteSize: 10, checksumSha256: 'a'.repeat(64), version: 1, createdByUserId: dono.id,
    },
  });

  const rota = `/events/${evento.id}/registration-commercial`;

  /** Corpo do PUT com os lotes informados. Omitir um lote é pedir sua remoção. */
  const corpoCom = (revision, codigos) => ({
    expectedRevision: revision,
    categories: [{
      code: 'geral',
      name: 'Geral',
      capacity,
      lots: [lote1, lote2]
        .filter((lote) => codigos.includes(lote.code))
        .map((lote, i) => ({
          code: lote.code,
          name: lote.name,
          startsAt: lote.startsAt.toISOString(),
          endsAt: lote.endsAt.toISOString(),
          quantity: lote.quantity,
          priceCents: lote.priceCents,
          sortOrder: i,
        })),
    }],
  });

  const estado = async () => {
    const [cat, lotes, auditorias] = await Promise.all([
      db.eventRegistrationCatalog.findUniqueOrThrow({
        where: { id: catalogo.id }, select: { revision: true },
      }),
      db.eventRegistrationLot.findMany({
        where: { eventId: evento.id }, select: { code: true, name: true }, orderBy: { code: 'asc' },
      }),
      db.auditLog.count({ where: { eventId: evento.id, action: 'registration.commercial_catalog_saved' } }),
    ]);
    return { revision: cat.revision, lotes, auditorias };
  };

  const ficha = (ctx, quem) => ({
    categoryId: categoria.id,
    lotId: ctx.id,
    answers: {
      full_name: `Pessoa ${quem.name}`, preferred_name: 'Pessoa',
      identity_document: quem.document, email: quem.email, phone: '81999990000',
      terms_acceptance: true, registration_type: categoria.id,
    },
  });

  return {
    evento, organizacao, categoria, catalogo, lote1, lote2,
    dono, operador, externo,
    rota,
    token: crachar(dono.id, dono.email),
    estado,
    corpoCom,
    ficha,
    paraSetup: () => db.event.update({ where: { id: evento.id }, data: { status: 'SETUP' } }),
    salvar: (corpo, tok) => chamar(rota, tok ?? crachar(dono.id, dono.email), {
      method: 'PUT', body: JSON.stringify(corpo),
    }),
  };
}

const LIMITE = { timeout: 180000 };

test('lote sem vínculo é removido, e a revisão avança', LIMITE, async () => {
  const c = await cenario('livre');
  await c.paraSetup();
  const antes = await c.estado();

  const r = await c.salvar(c.corpoCom(antes.revision, ['lote1']));
  assert.equal(r.status, 200, `esperava 200, veio ${r.status}: ${r.texto}`);

  const depois = await c.estado();
  assert.deepEqual(depois.lotes.map((l) => l.code), ['lote1'], 'lote2 saiu, porque ninguém o usava');
  assert.equal(depois.revision, antes.revision + 1, 'salvamento aceito avança a revisão');
  assert.equal(depois.auditorias, antes.auditorias + 1);
});

test('lote preso por INSCRIÇÃO não é removido, e a revisão não é queimada', LIMITE, async () => {
  const c = await cenario('inscricao');
  const participante = await pessoa('inscricao-part');
  await reservations.reserve(c.evento.slug, c.ficha(c.lote1, participante), randomUUID());
  await c.paraSetup();
  const antes = await c.estado();

  const r = await c.salvar(c.corpoCom(antes.revision, ['lote2']));
  assert.equal(r.status, 409, `esperava 409, veio ${r.status}: ${r.texto}`);
  assert.match(r.texto, /lote1 \(inscrição\)/u, 'a recusa nomeia o lote e o motivo');
  assert.match(r.texto, /Desative o lote/u, 'e orienta o caminho possível');

  const depois = await c.estado();
  assert.deepEqual(depois, antes, 'nem lote removido, nem revisão avançada, nem auditoria');
});

// ESTE É O CASO QUE A VERSÃO ANTERIOR DEIXAVA PASSAR.
//
// Com a categoria limitada a uma vaga e o lote1 ocupado, o lote2 fica lotado
// SEM ter inscrição nenhuma própria. Então a fila de espera nasce no lote2 e
// ele fica preso apenas por ela. Uma conferência que olhasse só inscrições
// liberaria a remoção e cairia no `Restrict` do banco — 500 no meio do
// salvamento, sem dizer qual lote travou.
test('lote preso SÓ pela FILA DE ESPERA não é removido', LIMITE, async () => {
  const c = await cenario('fila');
  const ocupante = await pessoa('fila-ocupante');
  await reservations.reserve(c.evento.slug, c.ficha(c.lote1, ocupante), randomUUID());

  await waitlist.configure(c.dono.id, c.evento.id, c.lote2.id, { enabled: true, offerMinutes: 30 });
  const naFila = await pessoa('fila-espera');
  await waitlist.join(naFila.id, c.evento.slug, { lotId: c.lote2.id, identityDocument: naFila.document });

  // A pré-condição que dá sentido ao caso: o lote2 tem fila e NENHUMA inscrição.
  assert.equal(await db.eventRegistrationWaitlistEntry.count({ where: { lotId: c.lote2.id } }), 1);
  assert.equal(await db.eventRegistrationReservation.count({ where: { lotId: c.lote2.id } }), 0,
    'o lote2 não pode ter inscrição, senão o caso vira o anterior');

  await c.paraSetup();
  const antes = await c.estado();

  const r = await c.salvar(c.corpoCom(antes.revision, ['lote1']));
  assert.equal(r.status, 409, `esperava 409, veio ${r.status}: ${r.texto}`);
  assert.match(r.texto, /lote2 \(fila de espera\)/u, 'a fila sozinha impede, e é nomeada');
  assert.doesNotMatch(r.texto, /lote2 \(inscrição/u, 'e não inventa vínculo que não existe');

  assert.deepEqual(await c.estado(), antes);
});

test('lote preso por PEDIDO agrupado não é removido, e o pedido é nomeado', LIMITE, async () => {
  // Pedido agrupado existe só em evento pago e com política de reembolso
  // publicada. Fixture derivada de `registration-order-atomic.postgres.test.mjs`.
  const c = await cenario('pedido', { mode: 'PAID', priceCents: 3000, capacity: 2 });
  await db.eventRegistrationLot.update({ where: { id: c.lote1.id }, data: { quantity: 2 } });
  await db.eventRefundPolicy.create({
    data: {
      organizationId: c.organizacao.id, eventId: c.evento.id,
      window: 'ANYTIME', version: 1, updatedByUserId: c.dono.id,
      versions: { create: { version: 1, window: 'ANYTIME' } },
    },
  });

  const compradores = [await pessoa('pedido-a'), await pessoa('pedido-b')];
  const entries = compradores.map((quem) => ({
    categoryId: c.categoria.id,
    lotId: c.lote1.id,
    answers: {
      full_name: `Pessoa ${quem.name}`, preferred_name: 'Pessoa',
      identity_document: quem.document, email: quem.email, phone: '81999990000',
      terms_acceptance: true, registration_type: c.categoria.id,
      refund_policy_acceptance: true, refund_policy_version: 1,
    },
  }));
  const pagador = {
    kind: 'PERSON', name: entries[0].answers.full_name,
    document: entries[0].answers.identity_document, email: entries[0].answers.email,
  };
  await reservations.reserveOrder(
    c.evento.slug,
    { entries, billing: { payer: pagador, recipient: pagador } },
    randomUUID(),
  );

  assert.ok(
    await db.eventRegistrationOrderEntry.count({ where: { lotId: c.lote1.id } }) > 0,
    'pré-condição: o lote1 tem entrada de pedido',
  );

  await c.paraSetup();
  const antes = await c.estado();
  const r = await c.salvar(c.corpoCom(antes.revision, ['lote2']));

  assert.equal(r.status, 409, `esperava 409, veio ${r.status}: ${r.texto}`);
  assert.match(r.texto, /pedido/u, 'o pedido tem de aparecer: é a segunda tabela que eu não consultava');
  assert.match(r.texto, /lote1/u);
  assert.deepEqual(await c.estado(), antes);
});

test('remover a CATEGORIA inteira com lote em uso também é recusado', LIMITE, async () => {
  const c = await cenario('categoria');
  const participante = await pessoa('categoria-part');
  await reservations.reserve(c.evento.slug, c.ficha(c.lote1, participante), randomUUID());
  await c.paraSetup();
  const antes = await c.estado();

  // Categoria nova no lugar da antiga: a `geral` sai inteira, e com ela os dois
  // lotes. O corpo precisa de ao menos uma categoria com ao menos um lote.
  const r = await c.salvar({
    expectedRevision: antes.revision,
    categories: [{
      code: 'outra',
      name: 'Outra',
      lots: [{
        code: 'novo', name: 'Lote novo',
        startsAt: new Date(Date.now() + 5 * DIA).toISOString(),
        endsAt: new Date(Date.now() + 6 * DIA).toISOString(),
        quantity: 1, priceCents: 0,
      }],
    }],
  });

  assert.equal(r.status, 409, `esperava 409, veio ${r.status}: ${r.texto}`);
  assert.match(r.texto, /lote1 \(inscrição\)/u);
  const depois = await c.estado();
  assert.deepEqual(depois, antes, 'categoria antiga intacta e nenhuma categoria nova criada');
});

test('revisão velha é conflito, e não remove nada', LIMITE, async () => {
  const c = await cenario('revisao');
  await c.paraSetup();
  const antes = await c.estado();

  const r = await c.salvar(c.corpoCom(antes.revision + 7, ['lote1']));
  assert.equal(r.status, 409, `esperava 409, veio ${r.status}: ${r.texto}`);
  assert.match(r.texto, /outra sessão/u);
  assert.deepEqual(await c.estado(), antes);
});

test('evento publicado não tem catálogo editável por esta rota', LIMITE, async () => {
  const c = await cenario('publicado');
  const antes = await c.estado();
  // Sem voltar para SETUP de propósito: `assertFoundationMutable` tem de barrar.
  const r = await c.salvar(c.corpoCom(antes.revision, ['lote1']));
  assert.ok(r.status === 409 || r.status === 400, `esperava recusa de estado, veio ${r.status}: ${r.texto}`);
  assert.deepEqual(await c.estado(), antes);
});

test('operador, ator externo e sem token não removem lote nenhum', LIMITE, async () => {
  const c = await cenario('autorizacao');
  await c.paraSetup();
  const antes = await c.estado();

  for (const [papel, quem] of [['operador', c.operador], ['externo', c.externo]]) {
    const tok = crachar(quem.id, quem.email);
    // 404 e não 403: contrato de não-enumeração do módulo.
    const r = await c.salvar(c.corpoCom(antes.revision, ['lote1']), tok);
    assert.equal(r.status, 404, `${papel}: esperava 404, veio ${r.status}: ${r.texto}`);
  }
  const semToken = await chamar(c.rota, null, {
    method: 'PUT', body: JSON.stringify(c.corpoCom(antes.revision, ['lote1'])),
  });
  assert.equal(semToken.status, 401, `sem token: ${semToken.status} ${semToken.texto}`);

  assert.deepEqual(await c.estado(), antes, 'nenhuma das três tentativas mexeu no catálogo');
});

test('o Restrict do banco recusaria mesmo: a antecipação evita um 500 real', LIMITE, async () => {
  // Prova que a conferência antecipada não cuida de perigo imaginário. Tentar o
  // DELETE direto, por fora do serviço, tem de falhar com violação de chave
  // estrangeira — que é o 500 que o organizador recebia.
  const c = await cenario('restrict');
  const participante = await pessoa('restrict-part');
  await reservations.reserve(c.evento.slug, c.ficha(c.lote1, participante), randomUUID());

  await assert.rejects(
    () => db.eventRegistrationLot.delete({ where: { id: c.lote1.id } }),
    (erro) => {
      assert.equal(erro.code, 'P2003', `esperava P2003 do Restrict, veio ${erro.code}: ${erro.message}`);
      return true;
    },
  );
  assert.ok(await db.eventRegistrationLot.findUnique({ where: { id: c.lote1.id } }), 'o lote continua lá');
});
