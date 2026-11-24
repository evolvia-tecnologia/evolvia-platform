// Somente PostgreSQL descartável com migrations aplicadas (DATABASE_URL). Dados
// de fixture são únicos e preservados, nunca apagados.
//
// LIGAÇÃO EMISSÃO → CONFIRMAÇÃO, ponta a ponta, pela rota do balcão.
//
// POR QUE ESTE ARQUIVO EXISTE: ELE É GUARDA DE RECONCILIAÇÃO
//
// `badge()` grava a TENTATIVA (`ISSUED`) e devolve `emissao.sequence`. A
// confirmação, em `POST /credential-prints/confirm`, grava `CONFIRMED`. Só
// `CONFIRMED` conta para decidir se já houve impressão, e é por isso que uma
// prévia fechada não gasta a primeira impressão de ninguém.
//
// O risco concreto que este arquivo foi escrito para impedir, e o que
// aconteceu com ele: em develop, o #647 acrescentou um SEGUNDO ponto de
// retorno em `badge()` — `if (!template) return credential;` — para preservar
// etiqueta histórica de categoria sem template salvo. O gancho de emissão
// tinha sido escrito quando havia um único retorno. Numa reconciliação
// mecânica, o git resolveria o hunk do retorno final e deixaria o retorno novo
// intacto, SEM `emissao`.
//
// O efeito seria silencioso e grave: toda categoria sem template salvo
// imprimiria etiqueta sem registrar tentativa, a confirmação não teria o que
// confirmar, e a separação entre primeira via e reimpressão desapareceria
// exatamente nesse caminho — sem nenhum teste reprovando.
//
// ESTADO ATUAL: a reconciliação foi feita em `45c74fd9`, resolvendo `badge()`
// nos DOIS retornos. O risco descrito acima não está aberto. O teste continua
// valendo porque ele é o que reprova se o segundo retorno voltar a perder
// `emissao` numa reconciliação futura — que é o cenário provável, já que esse
// hunk tende a reaparecer a cada merge com develop.
//
// Por isso o caso "categoria SEM template" é testado aqui explicitamente, e
// não como variação acessória.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// jwtSecret() é avaliado na montagem do JwtModule, portanto no IMPORT do
// AppModule. O segredo tem de existir antes disso, e por isso os imports da
// aplicação são dinâmicos em vez de estáticos.
process.env.JWT_SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32
  ? process.env.JWT_SECRET
  : `evolvia-ci-credential-emission-${'x'.repeat(16)}`;

const { NestFactory } = await import('@nestjs/core');
const { ValidationPipe } = await import('@nestjs/common');
const { AppModule } = await import('../dist/app.module.js');
const { GlobalExceptionFilter } = await import('../dist/global-exception.filter.js');
const { configureHttpBodyParsers } = await import('../dist/http-body-policy.js');
const { validationExceptionFactory } = await import('../dist/validation-errors.js');

const db = new PrismaClient();
const sha = (valor) => createHash('sha256').update(valor).digest('hex');
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
 * estoura nomeando o erro, em vez de seguir sem a capacidade.
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

/**
 * Evento PUBLICADO com a capacidade `credential`, e inscrições confirmadas.
 *
 * Nenhum template de categoria é salvo de propósito: é justamente o caminho
 * que o `if (!template)` de develop atende, e o que esta fixture precisa
 * exercitar.
 */
async function cenario(rotulo, { escopado = true, inscricoes = 1 } = {}) {
  const run = randomBytes(5).toString('hex');
  const dono = await db.user.create({
    data: { name: `PG ${rotulo} dono`, email: `emi-${rotulo}-dono-${run}@evolvia-ci.local`, passwordHash: 'fixture' },
  });
  const operador = await db.user.create({
    data: { name: `PG ${rotulo} operador`, email: `emi-${rotulo}-op-${run}@evolvia-ci.local`, passwordHash: 'fixture' },
  });
  const organizacao = await db.organization.create({
    data: { name: `PG ${rotulo}`, slug: `emi-${rotulo}-${run}`, createdById: dono.id },
  });
  const evento = await db.event.create({
    data: {
      ownerId: dono.id, organizationId: organizacao.id, name: `Evento ${rotulo}`, slug: `emi-${rotulo}-${run}`,
      eventType: 'Outro tipo de evento', format: 'IN_PERSON', registrationMode: 'FREE', status: 'PUBLISHED',
    },
  });
  for (const [userId, role] of [[dono.id, 'OWNER'], [operador.id, 'OPERATOR']]) {
    await db.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: organizacao.id, userId } },
      update: { role, status: 'ACTIVE' },
      create: { organizationId: organizacao.id, userId, role, status: 'ACTIVE' },
    });
  }
  const pedidas = ['credential', ...(escopado ? ['operator_scoped_access'] : [])];
  for (const code of pedidas) await ativarCapacidade(evento.id, organizacao.id, code);

  const conferida = await db.event.findUnique({
    where: { id: evento.id },
    select: { status: true, capabilities: { where: { status: 'ACTIVE' }, select: { code: true } } },
  });
  assert.equal(conferida.status, 'PUBLISHED', 'o balcão exige evento publicado');
  assert.deepEqual(
    conferida.capabilities.map((c) => c.code).sort(),
    [...pedidas].sort(),
    'as capacidades ativas do evento divergiram do cenário pedido',
  );

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

  const pessoas = [];
  for (let i = 0; i < inscricoes; i += 1) {
    const nome = `Pessoa ${i + 1} ${rotulo}`;
    pessoas.push(await db.eventRegistrationReservation.create({
      data: {
        ...escopo, categoryId: categoria.id, lotId: lote.id,
        protocol: `EMI-${randomBytes(6).toString('hex').toUpperCase()}`,
        idempotencyKeyHash: sha(`idem-${run}-${i}`), payloadHash: sha(`payload-${run}-${i}`),
        identityHash: sha(`identidade-${run}-${i}`), emailHash: sha(`email-${run}-${i}`),
        registrationData: { full_name: nome, preferred_name: nome },
        basePriceCents: 0, discountPercent: 0, finalPriceCents: 0,
        status: 'CONFIRMED', confirmedAt: new Date(),
      },
    }));
  }

  const tokenDono = crachar(dono.id, dono.email);
  const tokenOperador = crachar(operador.id, operador.email);
  const desk = `/events/${evento.id}/desk`;

  const registros = (reservationId, kind) => db.eventCredentialPrint.findMany({
    where: { eventId: evento.id, reservationId, ...(kind ? { kind } : {}) },
    select: { kind: true, sequence: true, actorUserId: true, organizationId: true },
    orderBy: [{ kind: 'asc' }, { sequence: 'asc' }],
  });

  return {
    eventId: evento.id,
    organizationId: organizacao.id,
    categoriaId: categoria.id,
    dono,
    operador,
    tokenDono,
    tokenOperador,
    pessoas,
    conceder: (acoes) => chamar(`/events/${evento.id}/operators/${operador.id}/grants`, tokenDono, {
      method: 'POST', body: JSON.stringify({ motivo: `emissão ${rotulo}`, acoes }),
    }),
    emitir: (pessoa, token = tokenDono) => chamar(`${desk}/badge`, token, {
      method: 'POST', body: JSON.stringify({ reservationId: pessoa.id }),
    }),
    confirmar: (pessoa, sequence, token = tokenDono) => chamar(
      `/events/${evento.id}/credential-prints/confirm`,
      token,
      { method: 'POST', body: JSON.stringify({ reservationId: pessoa.id, sequence }) },
    ),
    registros,
    tentativas: (pessoa) => registros(pessoa.id, 'ISSUED'),
    conclusoes: (pessoa) => registros(pessoa.id, 'CONFIRMED'),
  };
}

const LIMITE = { timeout: 180000 };

// ESTE É O GUARDA DE RECONCILIAÇÃO. Se o `emissao` faltar no caminho sem
// template, este teste reprova — e é o único lugar que reprovaria.
test('emitir etiqueta de categoria SEM template salvo devolve emissao e grava ISSUED', LIMITE, async () => {
  const c = await cenario('semtemplate');
  const [pessoa] = c.pessoas;

  const emissao = await c.emitir(pessoa);
  assert.ok(emissao.ok, `emitir deveria ter sucesso: ${emissao.status} ${emissao.texto}`);
  assert.ok(
    emissao.json?.emissao,
    'a resposta do badge TEM de trazer `emissao` mesmo sem template de categoria. '
    + 'Se isto reprovou depois de uma reconciliação, o gancho de emissão ficou só no retorno final '
    + 'e o retorno `if (!template) return credential;` passou sem registrar a tentativa.',
  );
  assert.equal(emissao.json.emissao.sequence, 1, 'a primeira tentativa é a sequência 1');
  assert.equal(emissao.json.emissao.concluida, false, 'emitir não conclui nada');

  const tentativas = await c.tentativas(pessoa);
  assert.equal(tentativas.length, 1, 'uma tentativa gravada');
  assert.equal(tentativas[0].sequence, 1);
  assert.equal(tentativas[0].actorUserId, c.dono.id, 'o ator vem do token');
  assert.equal(tentativas[0].organizationId, c.organizationId);
});

// Item 8, agora ponta a ponta e não só por desenho de tabela.
test('emitir NÃO conclui impressão: nenhuma linha CONFIRMED aparece', LIMITE, async () => {
  const c = await cenario('previa');
  const [pessoa] = c.pessoas;

  await c.emitir(pessoa);
  await c.emitir(pessoa);
  await c.emitir(pessoa);

  assert.equal((await c.tentativas(pessoa)).length, 3, 'três prévias, três tentativas');
  assert.deepEqual(await c.conclusoes(pessoa), [], 'prévia nunca vira impressão concluída');
});

test('as sequências crescem e não se repetem', LIMITE, async () => {
  const c = await cenario('sequencia');
  const [pessoa] = c.pessoas;

  const primeira = await c.emitir(pessoa);
  const segunda = await c.emitir(pessoa);
  assert.equal(primeira.json.emissao.sequence, 1);
  assert.deepEqual([primeira.json.widthMm, primeira.json.heightMm], [80, 30]);
  const { emissao: primeiraTentativa, ...primeiroModelo } = primeira.json;
  const { emissao: segundaTentativa, ...segundoModelo } = segunda.json;
  assert.deepEqual(segundoModelo, primeiroModelo);
  assert.equal(primeiraTentativa.sequence, 1);
  assert.equal(segundaTentativa.sequence, 2);
  assert.deepEqual((await c.tentativas(pessoa)).map((t) => t.sequence), [1, 2]);
});

// A ligação que a ordem pediu: a sequência que a emissão devolveu é a que a
// confirmação aceita.
test('a sequência devolvida pela emissão é a que a confirmação conclui', LIMITE, async () => {
  const c = await cenario('ligacao');
  const [pessoa] = c.pessoas;

  const emissao = await c.emitir(pessoa);
  const sequence = emissao.json.emissao.sequence;

  const confirmacao = await c.confirmar(pessoa, sequence);
  assert.ok(confirmacao.ok, `confirmar deveria ter sucesso: ${confirmacao.status} ${confirmacao.texto}`);
  assert.deepEqual(confirmacao.json, {
    sequence, acaoExigida: 'credencial_imprimir', concluida: true, repetida: false,
  });

  assert.deepEqual((await c.conclusoes(pessoa)).map((r) => r.sequence), [sequence]);
  assert.equal((await c.tentativas(pessoa)).length, 1, 'confirmar não cria tentativa nova');
});

test('confirmar sequência que a emissão nunca devolveu é 404', LIMITE, async () => {
  const c = await cenario('inexistente');
  const [pessoa] = c.pessoas;
  await c.emitir(pessoa);

  const resposta = await c.confirmar(pessoa, 99);
  assert.equal(resposta.status, 404, resposta.texto);
  assert.deepEqual(await c.conclusoes(pessoa), [], 'nada concluído');
});

// Emitir de novo depois de concluir é a segunda via, e ela tem permissão
// própria. Aqui com o organizador, que não depende de concessão.
test('segunda via: emitir depois de concluir exige reimpressão na confirmação', LIMITE, async () => {
  const c = await cenario('segundavia');
  const [pessoa] = c.pessoas;

  const primeira = await c.emitir(pessoa);
  assert.ok((await c.confirmar(pessoa, primeira.json.emissao.sequence)).ok);

  const segunda = await c.emitir(pessoa);
  assert.equal(segunda.json.emissao.sequence, 2, 'a segunda tentativa é uma sequência nova');

  const confirmacao = await c.confirmar(pessoa, 2);
  assert.ok(confirmacao.ok, confirmacao.texto);
  assert.equal(
    confirmacao.json.acaoExigida,
    'credencial_reimprimir',
    'a segunda conclusão tem de exigir reimpressão, não impressão',
  );
  assert.deepEqual((await c.conclusoes(pessoa)).map((r) => r.sequence), [1, 2]);
});

// Autorização da EMISSÃO, separada da confirmação.
test('operador sem concessão não emite, e nada é gravado', LIMITE, async () => {
  const c = await cenario('negaemissao');
  const [pessoa] = c.pessoas;

  const resposta = await c.emitir(pessoa, c.tokenOperador);
  assert.equal(resposta.status, 403, `esperava 403, veio ${resposta.status}: ${resposta.texto}`);
  assert.deepEqual(await c.tentativas(pessoa), [], 'recusa não grava tentativa');
});

test('com credencial_imprimir o operador emite, e o ator gravado é ele', LIMITE, async () => {
  const c = await cenario('emiteoperador');
  const [pessoa] = c.pessoas;
  assert.ok((await c.conceder(['credencial_imprimir'])).ok);

  const resposta = await c.emitir(pessoa, c.tokenOperador);
  assert.ok(resposta.ok, `${resposta.status} ${resposta.texto}`);
  const [tentativa] = await c.tentativas(pessoa);
  assert.equal(tentativa.actorUserId, c.operador.id, 'o ator é o do token, não o dono do evento');
});

test('revogar fecha a emissão na hora, sem apagar a tentativa anterior', LIMITE, async () => {
  const c = await cenario('revogaemissao');
  const [pessoa] = c.pessoas;
  assert.ok((await c.conceder(['credencial_imprimir'])).ok);
  assert.ok((await c.emitir(pessoa, c.tokenOperador)).ok);

  const revogada = await chamar(
    `/events/${c.eventId}/operators/${c.operador.id}/grants/revoke`,
    c.tokenDono,
    { method: 'POST', body: JSON.stringify({ motivo: 'fim do turno', acoes: ['credencial_imprimir'] }) },
  );
  assert.ok(revogada.ok, revogada.texto);

  assert.equal((await c.emitir(pessoa, c.tokenOperador)).status, 403, 'revogação vale na hora');
  assert.equal((await c.tentativas(pessoa)).length, 1, 'a tentativa anterior permanece: histórico não se apaga');
});

// Histórico append-only imposto pelo BANCO, não por convenção.
test('a tentativa gravada não admite UPDATE nem DELETE', LIMITE, async () => {
  const c = await cenario('imutavel');
  const [pessoa] = c.pessoas;
  await c.emitir(pessoa);
  const linha = await db.eventCredentialPrint.findFirst({
    where: { eventId: c.eventId, reservationId: pessoa.id, kind: 'ISSUED' },
  });
  assert.ok(linha, 'a tentativa tem de existir para o teste significar algo');

  await assert.rejects(
    () => db.eventCredentialPrint.update({ where: { id: linha.id }, data: { sequence: 99 } }),
    /imutavel|imutável/iu,
  );
  await assert.rejects(
    () => db.eventCredentialPrint.delete({ where: { id: linha.id } }),
    /imutavel|imutável/iu,
  );
  assert.equal((await c.tentativas(pessoa)).length, 1);
});

test('inscrição de outro evento não é emitida nem deixa registro em evento nenhum', LIMITE, async () => {
  const [a, b] = [await cenario('isoa'), await cenario('isob')];
  const [pessoaA] = a.pessoas;

  // O ator é o DONO do evento B: ele passa pelo vínculo e pelo evento, então a
  // recusa não vem da autorização — vem de `confirmedReservation`, que não
  // encontra a inscrição NESTE evento e lança
  // `BadRequestException('A inscrição confirmada deste evento não foi encontrada.')`.
  //
  // Logo o código correto aqui é 400, não 404. Conferi na fonte do
  // `EventDeskService` em vez de deduzir: é a MESMA resposta que uma inscrição
  // não confirmada recebe, o que é desejável — não distingue "existe em outro
  // evento" de "não está confirmada", e portanto não vaza existência.
  //
  // Os 404 dos outros arquivos continuam certos porque vêm de outro lugar: ou
  // o ator não é membro da organização, ou é o meu próprio serviço de
  // confirmação, que lança `NotFoundException`.
  const resposta = await chamar(`/events/${b.eventId}/desk/badge`, b.tokenDono, {
    method: 'POST', body: JSON.stringify({ reservationId: pessoaA.id }),
  });
  assert.equal(resposta.status, 400, `esperava 400 de confirmedReservation, veio ${resposta.status}: ${resposta.texto}`);

  // A asserção que importa é esta, e a versão anterior deste teste a errava.
  //
  // Uma linha criada por engano teria `eventId` do evento B, porque B é o
  // evento da requisição. A consulta antiga era escopada no evento A, então
  // nunca veria essa linha: o teste não podia pegar o defeito que existe para
  // pegar. Aqui a busca é pela INSCRIÇÃO, sem escopo de evento, e por isso
  // acusa registro em qualquer evento.
  assert.deepEqual(
    await db.eventCredentialPrint.findMany({
      where: { reservationId: pessoaA.id },
      select: { kind: true, eventId: true, sequence: true },
    }),
    [],
    'nenhum registro para essa inscrição, em evento NENHUM',
  );
  assert.equal(
    await db.eventCredentialPrint.count({ where: { eventId: b.eventId } }),
    0,
    'o evento B não pode ter ganhado registro de impressão por causa desta tentativa',
  );
});
