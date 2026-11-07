// Somente PostgreSQL descartável com migrations aplicadas (DATABASE_URL). Dados
// de fixture são únicos e preservados, nunca apagados.
//
// CL-R2.3 — separação de permissões na entrega de material e no kit, agora com
// FIXTURE COMPLETA: sucesso explícito nos cenários positivos e prova de que a
// recusa não deixa efeito na tabela operacional.
//
// POR QUE ESTE ARQUIVO EXISTE, E POR QUE NÃO REESCREVE ESTOQUE
//
// `kit-stock.postgres.test.mjs` (34 KB, 9 testes) já prova, com duas conexões
// PostgreSQL de verdade e `FOR UPDATE`, o lado de estoque: "a última camisa
// não fica negativa", "o estorno devolve o estoque uma vez", "remover tamanho
// com entrega ativa retorna conflito e preserva configuração e auditoria" e
// "primeira configuração serializa duas conexões". Saldo, atomicidade,
// auditoria e corrida NÃO são lacuna, e reescrevê-las seria duplicar trabalho
// correto de outra frente.
//
// A lacuna é de PERMISSÃO: naquele arquivo não há menção a
// `material_entregar`, `material_reverter`, `kit_ler` nem `kit_relatorio`. O
// estoque está provado; quem pode mexer nele é o que se prova aqui.
//
// O que mudou nesta versão, e por que importa: a primeira versão afirmava
// apenas `notEqual(403)` nos cenários positivos, porque eu não havia montado a
// cadeia de fixture de kit. Isso provava que o guard deixou passar, e nada
// mais. Agora a cadeia existe, então o positivo é SUCESSO de verdade — com a
// linha gravada em `EventMaterialDelivery` — e o negativo prova AUSÊNCIA de
// efeito naquela mesma tabela. Recusa que grava é pior que recusa que não
// recusa.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
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
 * estoura nomeando o erro, em vez de seguir sem a capacidade — o que
 * produziria sucesso por desenho aditivo e verde falso.
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
 * Cenário com a cadeia inteira: organização, evento, dono, operador, kit com
 * camisa e estoque, e inscrições confirmadas de verdade.
 *
 * A cadeia catálogo → categoria → lote → inscrição é a que as chaves
 * estrangeiras compostas exigem, e o kit é criado pela ROTA do balcão, como o
 * organizador faria — não por inserção direta. Assim o estoque existe pelo
 * mesmo caminho que a aplicação usa.
 */
async function cenario(rotulo, { capacidades = ['material_delivery'], escopado = true, inscricoes = 1 } = {}) {
  const run = randomBytes(5).toString('hex');
  const dono = await db.user.create({
    data: { name: `PG ${rotulo} dono`, email: `mat-${rotulo}-dono-${run}@evolvia-ci.local`, passwordHash: 'fixture' },
  });
  const operador = await db.user.create({
    data: { name: `PG ${rotulo} operador`, email: `mat-${rotulo}-op-${run}@evolvia-ci.local`, passwordHash: 'fixture' },
  });
  const organizacao = await db.organization.create({
    data: { name: `PG ${rotulo}`, slug: `mat-${rotulo}-${run}`, createdById: dono.id },
  });
  const evento = await db.event.create({
    data: {
      ownerId: dono.id, organizationId: organizacao.id, name: `Evento ${rotulo}`, slug: `mat-${rotulo}-${run}`,
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

  const tokenDono = crachar(dono.id, dono.email);
  const tokenOperador = crachar(operador.id, operador.email);
  const desk = `/events/${evento.id}/desk`;

  // O kit vem pela rota, como o organizador criaria. Estoque alto de propósito:
  // este arquivo não é sobre saldo, e saldo curto faria um teste de permissão
  // falhar por motivo de estoque.
  const kitSalvo = await chamar(`${desk}/kit`, tokenDono, {
    method: 'POST',
    body: JSON.stringify({ name: `Kit ${rotulo}`, shirtsEnabled: true, sizes: [{ label: 'M', stockQuantity: 50 }] }),
  });
  assert.ok(kitSalvo.ok, `fixture: salvar kit falhou ${kitSalvo.status}: ${kitSalvo.texto}`);
  const tamanho = (kitSalvo.json?.sizes ?? []).find((s) => s.label === 'M');
  assert.ok(tamanho?.id, `fixture: não achei o tamanho M no kit salvo: ${kitSalvo.texto}`);

  const pessoas = [];
  for (let i = 0; i < inscricoes; i += 1) {
    const nome = `Pessoa ${i + 1} ${rotulo}`;
    pessoas.push(await db.eventRegistrationReservation.create({
      data: {
        ...escopo, categoryId: categoria.id, lotId: lote.id,
        protocol: `MAT-${randomBytes(6).toString('hex').toUpperCase()}`,
        idempotencyKeyHash: sha(`idem-${run}-${i}`), payloadHash: sha(`payload-${run}-${i}`),
        identityHash: sha(`identidade-${run}-${i}`), emailHash: sha(`email-${run}-${i}`),
        registrationData: { full_name: nome, preferred_name: nome, shirt_size: tamanho.id },
        basePriceCents: 0, discountPercent: 0, finalPriceCents: 0,
        status: 'CONFIRMED', confirmedAt: new Date(),
      },
    }));
  }

  const entregasDe = (reservationId) => db.eventMaterialDelivery.findMany({
    where: { reservationId },
    select: { reservationId: true, sizeId: true, reversedAt: true },
  });

  return {
    eventId: evento.id,
    organizationId: organizacao.id,
    dono,
    operador,
    tokenDono,
    tokenOperador,
    sizeId: tamanho.id,
    pessoas,
    conceder: (acoes) => chamar(`/events/${evento.id}/operators/${operador.id}/grants`, tokenDono, {
      method: 'POST', body: JSON.stringify({ motivo: `material ${rotulo}`, acoes }),
    }),
    revogar: (acoes) => chamar(`/events/${evento.id}/operators/${operador.id}/grants/revoke`, tokenDono, {
      method: 'POST', body: JSON.stringify({ motivo: `revogação material ${rotulo}`, acoes }),
    }),
    entregar: (pessoa, token = tokenOperador) => chamar(`${desk}/material`, token, {
      method: 'POST', body: JSON.stringify({ reservationId: pessoa.id, sizeId: tamanho.id }),
    }),
    reverter: (pessoa, token = tokenOperador) => chamar(`${desk}/material/reverse`, token, {
      method: 'POST', body: JSON.stringify({ reservationId: pessoa.id, reason: 'prova de permissão' }),
    }),
    verKit: (token = tokenOperador) => chamar(`${desk}/kit`, token),
    relatorioDeKit: (token = tokenOperador) => chamar(`${desk}/kit/report`, token),
    entregasDe,
    semEntrega: async (pessoa, porque) => {
      assert.deepEqual(await entregasDe(pessoa.id), [], `recusa gravou em EventMaterialDelivery: ${porque}`);
    },
    entregaViva: async (pessoa, porque) => {
      const linhas = await entregasDe(pessoa.id);
      assert.equal(linhas.length, 1, `esperava uma entrega: ${porque}`);
      assert.equal(linhas[0].sizeId, tamanho.id);
      assert.equal(linhas[0].reversedAt, null, `a entrega não deveria estar revertida: ${porque}`);
      return linhas[0];
    },
  };
}

const LIMITE = { timeout: 180000 };

test('sem concessão, as quatro rotas recusam e nada é gravado na tabela operacional', LIMITE, async () => {
  const c = await cenario('nega');
  const [pessoa] = c.pessoas;

  for (const [nome, chamada] of [
    ['entregar', () => c.entregar(pessoa)],
    ['reverter', () => c.reverter(pessoa)],
    ['ver kit', () => c.verKit()],
    ['relatório de kit', () => c.relatorioDeKit()],
  ]) {
    const r = await chamada();
    assert.equal(r.status, 403, `${nome} deveria ser 403, veio ${r.status}: ${r.texto}`);
  }
  await c.semEntrega(pessoa, 'quatro recusas seguidas');
});

// O coração do corte: entregar e reverter são permissões SEPARADAS.
test('quem pode entregar material entrega de fato, e não consegue reverter', LIMITE, async () => {
  const c = await cenario('separa');
  const [pessoa] = c.pessoas;
  assert.ok((await c.conceder(['material_entregar'])).ok);

  const entrega = await c.entregar(pessoa);
  assert.ok(entrega.ok, `entrega deveria ter sucesso: ${entrega.status} ${entrega.texto}`);
  const gravada = await c.entregaViva(pessoa, 'entrega autorizada');

  const reversao = await c.reverter(pessoa);
  assert.equal(reversao.status, 403, `reverter é concessão separada, veio ${reversao.status}: ${reversao.texto}`);

  // E a recusa não encostou na linha: `reversedAt` continua nulo. Recusa que
  // grava seria pior que recusa que não recusa.
  const depois = await c.entregaViva(pessoa, 'depois da reversão recusada');
  assert.equal(depois.reversedAt, null);
  assert.equal(depois.sizeId, gravada.sizeId);
});

test('quem pode reverter reverte de fato, e não ganha a entrega por isso', LIMITE, async () => {
  const c = await cenario('inverso', { inscricoes: 2 });
  const [entregue, outra] = c.pessoas;

  // O organizador entrega sem concessão; é o operador que vai só reverter.
  assert.ok((await c.entregar(entregue, c.tokenDono)).ok);
  await c.entregaViva(entregue, 'entrega feita pelo organizador');
  assert.ok((await c.conceder(['material_reverter'])).ok);

  const reversao = await c.reverter(entregue);
  assert.ok(reversao.ok, `reversão deveria ter sucesso: ${reversao.status} ${reversao.texto}`);
  const [linha] = await c.entregasDe(entregue.id);
  assert.ok(linha.reversedAt, 'a reversão autorizada tem de marcar reversedAt');

  const entrega = await c.entregar(outra);
  assert.equal(entrega.status, 403, 'a direção inversa também tem de ser separada');
  await c.semEntrega(outra, 'entrega recusada a quem só pode reverter');
});

test('ver kit não dá relatório de kit, nem entrega', LIMITE, async () => {
  const c = await cenario('leitura');
  const [pessoa] = c.pessoas;
  assert.ok((await c.conceder(['kit_ler'])).ok);

  const kit = await c.verKit();
  assert.ok(kit.ok, `ver kit deveria ter sucesso: ${kit.status} ${kit.texto}`);
  assert.ok(Array.isArray(kit.json?.sizes), 'a leitura autorizada tem de devolver os tamanhos');

  assert.equal((await c.relatorioDeKit()).status, 403, 'relatório é concessão própria');
  assert.equal((await c.entregar(pessoa)).status, 403, 'leitura não dá escrita');
  assert.equal((await c.reverter(pessoa)).status, 403);
  await c.semEntrega(pessoa, 'só com kit_ler');
});

test('as quatro concessões juntas liberam as quatro rotas, e só elas', LIMITE, async () => {
  const c = await cenario('todas');
  const [pessoa] = c.pessoas;
  assert.ok((await c.conceder(['material_entregar', 'material_reverter', 'kit_ler', 'kit_relatorio'])).ok);

  assert.ok((await c.verKit()).ok);
  assert.ok((await c.relatorioDeKit()).ok);
  assert.ok((await c.entregar(pessoa)).ok);
  await c.entregaViva(pessoa, 'com as quatro concessões');
  assert.ok((await c.reverter(pessoa)).ok);
  assert.ok((await c.entregasDe(pessoa.id))[0].reversedAt, 'reversão autorizada marca a linha');

  // E não vazou para ação de outra área: check-in continua recusado.
  const checkin = await chamar(`/events/${c.eventId}/desk/check-in`, c.tokenOperador, {
    method: 'POST', body: JSON.stringify({ reservationId: randomUUID() }),
  });
  assert.equal(checkin.status, 403, 'concessão de material não pode abrir o check-in');
});

// A capacidade do evento continua compondo com E, não com OU.
test('capacidade material_delivery inativa recusa tudo, mesmo com as quatro concessões', LIMITE, async () => {
  const c = await cenario('capacidade', { capacidades: ['material_delivery'] });
  const [pessoa] = c.pessoas;
  assert.ok((await c.conceder(['material_entregar', 'material_reverter', 'kit_ler', 'kit_relatorio'])).ok);

  // Desligar a capacidade DEPOIS de montar a fixture: o kit precisou dela para
  // ser criado, e o que se mede aqui é a autorização, não a criação.
  //
  // Removo a linha em vez de gravar um status 'INACTIVE' que eu não li no
  // enum. Para a política dá no mesmo — ela só considera `status: 'ACTIVE'` —
  // e assim o teste não depende de um palpite meu sobre o nome do valor.
  await db.eventCapability.deleteMany({ where: { eventId: c.eventId, code: 'material_delivery' } });
  const conferida = await db.event.findUnique({
    where: { id: c.eventId },
    select: { capabilities: { where: { status: 'ACTIVE' }, select: { code: true } } },
  });
  assert.deepEqual(
    conferida.capabilities.map((x) => x.code),
    ['operator_scoped_access'],
    'a capacidade tinha de ficar inativa para a recusa ser verificável',
  );

  for (const [nome, chamada] of [
    ['entregar', () => c.entregar(pessoa)],
    ['reverter', () => c.reverter(pessoa)],
    ['ver kit', () => c.verKit()],
    ['relatório de kit', () => c.relatorioDeKit()],
  ]) {
    assert.equal((await chamada()).status, 403, `${nome} não pode passar sem a capacidade do evento`);
  }
  await c.semEntrega(pessoa, 'capacidade do evento inativa');

  // Religando, as MESMAS concessões voltam a valer: prova que a recusa acima
  // era da capacidade, e não de concessão ausente.
  await ativarCapacidade(c.eventId, c.organizationId, 'material_delivery');
  assert.ok((await c.entregar(pessoa)).ok);
  await c.entregaViva(pessoa, 'capacidade religada');
});

test('revogar fecha a entrega na hora, e a recusa não grava', LIMITE, async () => {
  const c = await cenario('revoga', { inscricoes: 2 });
  const [primeira, segunda] = c.pessoas;
  assert.ok((await c.conceder(['material_entregar'])).ok);
  assert.ok((await c.entregar(primeira)).ok);
  await c.entregaViva(primeira, 'antes da revogação');

  assert.ok((await c.revogar(['material_entregar'])).ok);

  assert.equal((await c.entregar(segunda)).status, 403, 'revogação vale na hora');
  await c.semEntrega(segunda, 'depois da revogação');
  // A entrega anterior permanece: revogar permissão não desfaz o que foi feito.
  await c.entregaViva(primeira, 'histórico preservado após revogação');
});

test('organizador entrega e reverte sem concessão', LIMITE, async () => {
  const c = await cenario('dono');
  const [pessoa] = c.pessoas;
  assert.ok((await c.entregar(pessoa, c.tokenDono)).ok);
  await c.entregaViva(pessoa, 'entrega do organizador');
  assert.ok((await c.reverter(pessoa, c.tokenDono)).ok);
  assert.ok((await c.entregasDe(pessoa.id))[0].reversedAt);
});

// Compatibilidade: evento que ainda não ativou o escopo não muda de
// comportamento. Expandir → migrar → validar → restringir.
test('evento sem operator_scoped_access mantém o comportamento de hoje', LIMITE, async () => {
  const c = await cenario('legado', { escopado: false, inscricoes: 2 });
  const [antes, depois] = c.pessoas;

  assert.ok((await c.entregar(antes)).ok, 'sem o escopo, o operador segue como sempre foi');
  await c.entregaViva(antes, 'evento legado');

  await ativarCapacidade(c.eventId, c.organizationId, 'operator_scoped_access');
  assert.equal((await c.entregar(depois)).status, 403, 'ativar o escopo passa a exigir concessão');
  await c.semEntrega(depois, 'escopo recém-ativado, sem concessão');
  // Ativar a proteção não desfaz entrega anterior nem concede nada por padrão.
  await c.entregaViva(antes, 'entrega anterior preservada ao ativar o escopo');
});

test('concessão de material de um evento não alcança outro evento nem outra organização', LIMITE, async () => {
  const [a, b] = [await cenario('isoa'), await cenario('isob')];
  const [pessoaA] = a.pessoas;
  const [pessoaB] = b.pessoas;
  assert.ok((await a.conceder(['material_entregar'])).ok);

  assert.ok((await a.entregar(pessoaA)).ok, 'no evento A passa');
  await a.entregaViva(pessoaA, 'evento A');

  // Operador de A, no evento de B: nem membro é, logo o evento não existe.
  const foraDaOrganizacao = await chamar(`/events/${b.eventId}/desk/material`, a.tokenOperador, {
    method: 'POST', body: JSON.stringify({ reservationId: pessoaB.id, sizeId: b.sizeId }),
  });
  assert.equal(foraDaOrganizacao.status, 404, foraDaOrganizacao.texto);
  await b.semEntrega(pessoaB, 'evento B intacto');
});
