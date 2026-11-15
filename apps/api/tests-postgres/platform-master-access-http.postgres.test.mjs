// Disposable CI PostgreSQL only. Unique fixture data is preserved, never deleted.
//
// Prova HTTP real do primeiro acesso à Área Master (#665): sobe a aplicação
// Nest de verdade, com AuthGuard, PlatformSessionGuard, PlatformMasterGuard,
// ValidationPipe e GlobalExceptionFilter como main.ts monta, e bate nas rotas
// por fetch. O que se mede é o código HTTP e o que ficou no banco.
//
// O que este arquivo NÃO cobre, e é melhor dizer do que deixar parecer coberto:
// o caminho criptográfico de SUCESSO da WebAuthn. Produzir uma assertion válida
// exige um autenticador — de hardware ou um de software que eu teria de
// escrever em CBOR e não consigo conferir nesta sessão, porque `node_modules`
// não está disponível. Então aqui ficam as RECUSAS da cerimônia, que acontecem
// antes de qualquer assinatura e são o que a ordem pediu (desafio vencido,
// reutilizado e apresentado em outra sessão), mais o acesso autorizado com
// sessão sintética criada como o serviço a cria. A assinatura em si é assunto
// do ensaio em homologação com chave real.
//
// Sem @nestjs/testing e sem supertest: não existem no package.json, e
// acrescentar dependência exigiria lockfile novo.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

process.env.JWT_SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32
  ? process.env.JWT_SECRET
  : `evolvia-ci-platform-master-${'x'.repeat(16)}`;

const { NestFactory } = await import('@nestjs/core');
const { ValidationPipe } = await import('@nestjs/common');
const { AppModule } = await import('../dist/app.module.js');
const { GlobalExceptionFilter } = await import('../dist/global-exception.filter.js');
const { configureHttpBodyParsers } = await import('../dist/http-body-policy.js');
const { validationExceptionFactory } = await import('../dist/validation-errors.js');
const { JANELA_DO_DESAFIO_MS } = await import('../dist/platform-ceremony-policy.js');
const { JANELA_DA_SESSAO_MS } = await import('../dist/platform-session-policy.js');

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

function chamar(caminho, token, { master, ...opcoes } = {}) {
  return fetch(`${base}${caminho}`, {
    ...opcoes,
    headers: {
      authorization: `Bearer ${token}`,
      ...(master ? { 'x-evolvia-master-session': master } : {}),
      ...(opcoes.body ? { 'content-type': 'application/json' } : {}),
      ...(opcoes.headers ?? {}),
    },
  });
}

const sha256 = (valor) => createHash('sha256').update(valor).digest('hex');

/** Cria usuário sintético. Nunca uma conta real, nunca um e-mail que exista. */
async function pessoa(rotulo) {
  const chave = randomUUID();
  return prisma.user.create({
    data: {
      name: `PG master ${rotulo}`,
      email: `master-${rotulo}-${chave}@evolvia-ci.local`,
      passwordHash: 'fixture',
    },
  });
}

async function identidade(userId, role) {
  return prisma.platformMasterIdentity.create({
    data: { userId, role, provisionedByNote: `Fixture de CI (${role}).` },
  });
}

/**
 * Abre sessão Master do mesmo jeito que o serviço abre: token aleatório, só o
 * sha256 no banco. Isto é o que a autenticação PRODUZ; o que não está coberto
 * aqui é a verificação da assinatura que antecede.
 */
async function sessao(identityId, { segundoFatorEm = Date.now(), reforcoEm = Date.now() } = {}) {
  const token = randomBytes(32).toString('base64url');
  await prisma.platformMasterSession.create({
    data: {
      identityId,
      tokenHash: sha256(token),
      secondFactorAt: new Date(segundoFatorEm),
      stepUpAt: reforcoEm === null ? null : new Date(reforcoEm),
      expiresAt: new Date(Date.now() + JANELA_DA_SESSAO_MS),
    },
  });
  return token;
}

async function evento(rotulo, ownerId, organizationId, extra = {}) {
  const chave = randomUUID();
  return prisma.event.create({
    data: {
      ownerId,
      organizationId,
      name: `Evento master ${rotulo}`,
      slug: `master-${rotulo}-${chave}`,
      eventType: 'Congresso',
      format: 'IN_PERSON',
      registrationMode: 'FREE',
      ...extra,
    },
  });
}

async function organizacao(rotulo, createdById) {
  const chave = randomUUID();
  return prisma.organization.create({
    data: { name: `PG master ${rotulo}`, slug: `master-${rotulo}-${chave}`, createdById },
  });
}

const motivoValido = 'Verificacao de inconsistencia relatada pelo organizador';

// ------------------------------------------------- quem não é da Área Master

test('quem não tem identidade Master recebe 404, não 401 nem 403', { timeout: 120000 }, async () => {
  const fora = await pessoa('fora');
  const dono = await pessoa('fora-dono');
  const org = await organizacao('fora', dono.id);
  const ev = await evento('fora', dono.id, org.id);
  const token = crachar(fora.id, fora.email);

  for (const [caminho, opcoes] of [
    [`/platform/master/events/${ev.id}/summary`, {}],
    ['/platform/master/sessions/challenge', { method: 'POST' }],
    ['/platform/master/credentials/challenge', { method: 'POST' }],
  ]) {
    const r = await chamar(caminho, token, { ...opcoes, master: 'token-qualquer' });
    assert.equal(r.status, 404, `${caminho} deveria responder 404 e respondeu ${r.status}`);
  }
});

test('identidade existe mas sem sessão: 401, e não 403', { timeout: 120000 }, async () => {
  const titular = await pessoa('sem-sessao');
  await identidade(titular.id, 'OWNER');
  const dono = await pessoa('sem-sessao-dono');
  const org = await organizacao('sem-sessao', dono.id);
  const ev = await evento('sem-sessao', dono.id, org.id);
  const token = crachar(titular.id, titular.email);

  const semCabecalho = await chamar(`/platform/master/events/${ev.id}/summary`, token);
  assert.equal(semCabecalho.status, 401, 'sem cabeçalho de sessão');

  const tokenInventado = await chamar(`/platform/master/events/${ev.id}/summary`, token, { master: randomBytes(32).toString('base64url') });
  assert.equal(tokenInventado.status, 401, 'token que não existe');
  // 403 aqui mandaria a pessoa pedir permissão que ela já tem.
});

test('sessão de outra pessoa não vale, mesmo válida', { timeout: 120000 }, async () => {
  const a = await pessoa('cruz-a');
  const b = await pessoa('cruz-b');
  const ia = await identidade(a.id, 'OWNER');
  await identidade(b.id, 'OWNER');
  const tokenDeA = await sessao(ia.id);
  const dono = await pessoa('cruz-dono');
  const org = await organizacao('cruz', dono.id);
  const ev = await evento('cruz', dono.id, org.id);

  const r = await chamar(`/platform/master/events/${ev.id}/summary`, crachar(b.id, b.email), { master: tokenDeA });
  assert.equal(r.status, 401, 'B não pode usar a sessão de A');
});

test('sessão revogada e sessão vencida recusam com a sessão ainda em mãos', { timeout: 120000 }, async () => {
  const titular = await pessoa('revogada');
  const ident = await identidade(titular.id, 'OWNER');
  const token = crachar(titular.id, titular.email);
  const dono = await pessoa('revogada-dono');
  const org = await organizacao('revogada', dono.id);
  const ev = await evento('revogada', dono.id, org.id);

  const viva = await sessao(ident.id);
  assert.equal((await chamar(`/platform/master/events/${ev.id}/summary`, token, { master: viva })).status, 200, 'antes de revogar');

  await prisma.platformMasterSession.updateMany({ where: { tokenHash: sha256(viva) }, data: { revokedAt: new Date() } });
  assert.equal((await chamar(`/platform/master/events/${ev.id}/summary`, token, { master: viva })).status, 401, 'depois de revogar');

  const vencida = await sessao(ident.id);
  await prisma.platformMasterSession.updateMany({ where: { tokenHash: sha256(vencida) }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await chamar(`/platform/master/events/${ev.id}/summary`, token, { master: vencida })).status, 401, 'vencida');
});

test('identidade suspensa recusa mesmo com sessão viva', { timeout: 120000 }, async () => {
  const titular = await pessoa('suspensa');
  const ident = await identidade(titular.id, 'OWNER');
  const token = await sessao(ident.id);
  const dono = await pessoa('suspensa-dono');
  const org = await organizacao('suspensa', dono.id);
  const ev = await evento('suspensa', dono.id, org.id);
  const jwt = crachar(titular.id, titular.email);

  assert.equal((await chamar(`/platform/master/events/${ev.id}/summary`, jwt, { master: token })).status, 200);
  await prisma.platformMasterIdentity.update({ where: { id: ident.id }, data: { status: 'SUSPENDED' } });
  assert.equal((await chamar(`/platform/master/events/${ev.id}/summary`, jwt, { master: token })).status, 401);
});

// ------------------------------------------------------- primeiro acesso: OWNER

test('proprietário com sessão válida consulta o evento pela rota real', { timeout: 120000 }, async () => {
  const titular = await pessoa('owner-ok');
  const ident = await identidade(titular.id, 'OWNER');
  const master = await sessao(ident.id);
  const dono = await pessoa('owner-ok-dono');
  const org = await organizacao('owner-ok', dono.id);
  const ev = await evento('owner-ok', dono.id, org.id);

  const r = await chamar(`/platform/master/events/${ev.id}/summary`, crachar(titular.id, titular.email), { master });
  const texto = await r.text();
  assert.equal(r.status, 200, texto);
  const corpo = JSON.parse(texto);
  assert.equal(corpo.id, ev.id);
  assert.equal(corpo.name, ev.name);
});

test('proprietário com segundo fator velho é recusado, e a recusa entra na trilha', { timeout: 120000 }, async () => {
  const titular = await pessoa('fator-velho');
  const ident = await identidade(titular.id, 'OWNER');
  // Treze horas: a janela do segundo fator é de doze.
  const master = await sessao(ident.id, { segundoFatorEm: Date.now() - 13 * 60 * 60 * 1000 });
  const dono = await pessoa('fator-velho-dono');
  const org = await organizacao('fator-velho', dono.id);
  const ev = await evento('fator-velho', dono.id, org.id);

  const antes = await prisma.platformAuditLog.count({ where: { actorUserId: titular.id } });
  const r = await chamar(`/platform/master/events/${ev.id}/summary`, crachar(titular.id, titular.email), { master });
  assert.equal(r.status, 403, 'sessão vale, mas o segundo fator envelheceu');

  const depois = await prisma.platformAuditLog.findMany({
    where: { actorUserId: titular.id }, select: { result: true, action: true },
  });
  assert.equal(depois.length, antes + 1, 'negar sem rastro é como não ter negado');
  assert.equal(depois[depois.length - 1].result, 'DENIED');
  assert.match(depois[depois.length - 1].action, /SEM_SEGUNDO_FATOR/);
});

// --------------------------------------------- cerimônia: as três recusas

test('abrir a cerimônia grava o DIGEST, nunca o desafio cru', { timeout: 120000 }, async () => {
  const titular = await pessoa('digest');
  const ident = await identidade(titular.id, 'OWNER');
  const master = await sessao(ident.id);

  const r = await chamar('/platform/master/credentials/challenge', crachar(titular.id, titular.email), { method: 'POST', master });
  const texto = await r.text();
  assert.equal(r.status, 201, texto);
  const opcoes = JSON.parse(texto);
  assert.ok(typeof opcoes.challenge === 'string' && opcoes.challenge.length >= 43, 'a biblioteca devolve o desafio');

  const linha = await prisma.platformMasterIdentity.findUnique({
    where: { id: ident.id },
    select: { pendingChallenge: true, pendingChallengeKind: true, pendingChallengeExpires: true },
  });
  assert.notEqual(linha.pendingChallenge, opcoes.challenge, 'guardar o cru deixaria qualquer um concluir');
  assert.equal(linha.pendingChallenge.length, 64, 'é um sha256 em hexadecimal');
  assert.match(linha.pendingChallenge, /^[0-9a-f]{64}$/);
  assert.equal(linha.pendingChallenge, sha256(`${opcoes.challenge}:${sha256(master)}`), 'digest vinculado à sessão');
  assert.equal(linha.pendingChallengeKind, 'REGISTRATION');
  assert.ok(linha.pendingChallengeExpires.getTime() > Date.now(), 'com prazo no futuro');
});

test('desafio VENCIDO é recusado pela rota', { timeout: 120000 }, async () => {
  const titular = await pessoa('vencido');
  const ident = await identidade(titular.id, 'OWNER');
  const master = await sessao(ident.id);
  const jwt = crachar(titular.id, titular.email);

  const abertura = await (await chamar('/platform/master/credentials/challenge', jwt, { method: 'POST', master })).json();
  await prisma.platformMasterIdentity.update({
    where: { id: ident.id },
    data: { pendingChallengeExpires: new Date(Date.now() - JANELA_DO_DESAFIO_MS) },
  });

  const r = await chamar('/platform/master/credentials', jwt, {
    method: 'POST', master,
    body: JSON.stringify({ desafio: abertura.challenge, resposta: { id: 'qualquer' } }),
  });
  assert.equal(r.status, 401, await r.text());
  assert.equal(
    await prisma.platformWebAuthnCredential.count({ where: { identityId: ident.id } }), 0,
    'recusa não pode registrar credencial',
  );
});

test('desafio REUTILIZADO é recusado: o consumo é uma vez só', { timeout: 120000 }, async () => {
  const titular = await pessoa('reuso');
  const ident = await identidade(titular.id, 'OWNER');
  const master = await sessao(ident.id);
  const jwt = crachar(titular.id, titular.email);

  const abertura = await (await chamar('/platform/master/credentials/challenge', jwt, { method: 'POST', master })).json();
  const corpo = JSON.stringify({ desafio: abertura.challenge, resposta: { id: 'qualquer' } });

  // A primeira tentativa é recusada na assinatura (não há autenticador), mas o
  // desafio JÁ foi consumido antes disso — é isto que se mede.
  const primeira = await chamar('/platform/master/credentials', jwt, { method: 'POST', master, body: corpo });
  assert.equal(primeira.status, 401);

  const depois = await prisma.platformMasterIdentity.findUnique({
    where: { id: ident.id }, select: { pendingChallenge: true, pendingChallengeKind: true },
  });
  assert.equal(depois.pendingChallenge, null, 'o desafio tem de sair da linha no consumo');
  assert.equal(depois.pendingChallengeKind, null);

  const segunda = await chamar('/platform/master/credentials', jwt, { method: 'POST', master, body: corpo });
  assert.equal(segunda.status, 401, 'o mesmo desafio não serve duas vezes');
});

test('desafio apresentado em OUTRA SESSÃO é recusado, correto e no prazo', { timeout: 120000 }, async () => {
  const titular = await pessoa('outra-sessao');
  const ident = await identidade(titular.id, 'OWNER');
  const jwt = crachar(titular.id, titular.email);
  const sessaoA = await sessao(ident.id);
  const sessaoB = await sessao(ident.id);

  const abertura = await (await chamar('/platform/master/credentials/challenge', jwt, { method: 'POST', master: sessaoA })).json();
  const linha = await prisma.platformMasterIdentity.findUnique({ where: { id: ident.id }, select: { pendingChallenge: true } });
  assert.equal(linha.pendingChallenge, sha256(`${abertura.challenge}:${sha256(sessaoA)}`), 'vinculado à sessão A');

  // A sessão B tem o desafio — é o caso de quem interceptou — e está no prazo.
  const comB = await chamar('/platform/master/credentials', jwt, {
    method: 'POST', master: sessaoB,
    body: JSON.stringify({ desafio: abertura.challenge, resposta: { id: 'qualquer' } }),
  });
  assert.equal(comB.status, 401, 'a sessão B não pode concluir a cerimônia da A');

  const aindaLa = await prisma.platformMasterIdentity.findUnique({ where: { id: ident.id }, select: { pendingChallenge: true } });
  assert.equal(aindaLa.pendingChallenge, linha.pendingChallenge, 'a tentativa da B não consome o desafio da A');
});

// --------------------------------------------- delegação, alcance e revogação

test('delegado sem concessão recebe 403, e com concessão de evento alcança só aquele', { timeout: 120000 }, async () => {
  const proprietario = await pessoa('deleg-owner');
  const delegado = await pessoa('deleg');
  const identOwner = await identidade(proprietario.id, 'OWNER');
  const identDeleg = await identidade(delegado.id, 'DELEGADO');
  const masterOwner = await sessao(identOwner.id);
  const masterDeleg = await sessao(identDeleg.id);
  const jwtOwner = crachar(proprietario.id, proprietario.email);
  const jwtDeleg = crachar(delegado.id, delegado.email);

  const dono = await pessoa('deleg-dono');
  const org = await organizacao('deleg', dono.id);
  const alvo = await evento('deleg-alvo', dono.id, org.id);
  const outro = await evento('deleg-outro', dono.id, org.id);

  assert.equal((await chamar(`/platform/master/events/${alvo.id}/summary`, jwtDeleg, { master: masterDeleg })).status, 403, 'sem concessão');

  const concedida = await chamar('/platform/master/grants', jwtOwner, {
    method: 'POST', master: masterOwner,
    body: JSON.stringify({
      pessoas: [delegado.id], acoes: ['consultar'],
      escopo: { tipo: 'EVENTOS', eventIds: [alvo.id] }, motivo: motivoValido,
    }),
  });
  assert.ok(concedida.ok, `concessão falhou: ${concedida.status} ${await concedida.text()}`);
  assert.equal(await prisma.platformGrant.count({ where: { targetUserId: delegado.id } }), 1);

  assert.equal((await chamar(`/platform/master/events/${alvo.id}/summary`, jwtDeleg, { master: masterDeleg })).status, 200, 'no evento concedido passa');
  assert.equal((await chamar(`/platform/master/events/${outro.id}/summary`, jwtDeleg, { master: masterDeleg })).status, 403, 'o outro evento fica fora do alcance');

  // Revogação com a sessão do delegado AINDA ABERTA.
  const revogada = await chamar('/platform/master/grants/revoke', jwtOwner, {
    method: 'POST', master: masterOwner,
    body: JSON.stringify({
      pessoas: [delegado.id], acoes: ['consultar'],
      escopo: { tipo: 'EVENTOS', eventIds: [alvo.id] }, motivo: motivoValido,
    }),
  });
  assert.ok(revogada.ok, `revogação falhou: ${revogada.status} ${await revogada.text()}`);
  assert.equal(await prisma.platformGrant.count({ where: { targetUserId: delegado.id } }), 0);

  assert.equal(
    (await chamar(`/platform/master/events/${alvo.id}/summary`, jwtDeleg, { master: masterDeleg })).status, 403,
    'a operação seguinte é recusada sem precisar encerrar a sessão',
  );

  const historico = await prisma.platformGrantEvent.findMany({
    where: { targetUserId: delegado.id }, select: { kind: true, reason: true }, orderBy: { occurredAt: 'asc' },
  });
  assert.deepEqual(historico.map((h) => h.kind), ['GRANTED', 'REVOKED'], 'histórico append-only');
});

test('concessão GLOBAL alcança evento criado DEPOIS da concessão', { timeout: 120000 }, async () => {
  const proprietario = await pessoa('glob-owner');
  const delegado = await pessoa('glob-deleg');
  const identOwner = await identidade(proprietario.id, 'OWNER');
  const identDeleg = await identidade(delegado.id, 'DELEGADO');
  const masterOwner = await sessao(identOwner.id);
  const masterDeleg = await sessao(identDeleg.id);

  const concedida = await chamar('/platform/master/grants', crachar(proprietario.id, proprietario.email), {
    method: 'POST', master: masterOwner,
    body: JSON.stringify({
      pessoas: [delegado.id], acoes: ['consultar'],
      escopo: { tipo: 'GLOBAL' }, motivo: motivoValido,
    }),
  });
  assert.ok(concedida.ok, await concedida.text());

  // Só agora o evento nasce.
  const dono = await pessoa('glob-dono');
  const org = await organizacao('glob', dono.id);
  const futuro = await evento('glob-futuro', dono.id, org.id);

  const r = await chamar(`/platform/master/events/${futuro.id}/summary`, crachar(delegado.id, delegado.email), { master: masterDeleg });
  assert.equal(r.status, 200, `a concessão global tem de alcançar o que nasceu depois: ${await r.text()}`);
});

test('delegado não concede nem revoga, nem para si mesmo', { timeout: 120000 }, async () => {
  const delegado = await pessoa('deleg-adm');
  const ident = await identidade(delegado.id, 'DELEGADO');
  const master = await sessao(ident.id);
  const jwt = crachar(delegado.id, delegado.email);

  for (const caminho of ['/platform/master/grants', '/platform/master/grants/revoke']) {
    const r = await chamar(caminho, jwt, {
      method: 'POST', master,
      body: JSON.stringify({
        pessoas: [delegado.id], acoes: ['consultar'],
        escopo: { tipo: 'GLOBAL' }, motivo: motivoValido,
      }),
    });
    assert.equal(r.status, 403, `${caminho} é exclusivo do proprietário`);
  }
  assert.equal(await prisma.platformGrant.count({ where: { targetUserId: delegado.id } }), 0, 'tentativa recusada não grava');
});

// ------------------------------------- a auditoria desfaz a mudança privilegiada

test('se a auditoria não gravar, a concessão é desfeita na mesma transação', { timeout: 120000 }, async () => {
  const proprietario = await pessoa('rollback-owner');
  const delegado = await pessoa('rollback-deleg');
  const identOwner = await identidade(proprietario.id, 'OWNER');
  await identidade(delegado.id, 'DELEGADO');
  const masterOwner = await sessao(identOwner.id);

  const corpo = JSON.stringify({
    pessoas: [delegado.id], acoes: ['consultar'],
    escopo: { tipo: 'GLOBAL' }, motivo: motivoValido,
  });

  // Força a gravação da auditoria a falhar no PostgreSQL de verdade. `NOT VALID`
  // não revalida as linhas existentes, mas vale para toda inserção nova — é a
  // forma mais limpa de provar a reversão sem mexer em mais nada. O `finally`
  // devolve a tabela ao estado anterior mesmo se o teste falhar no meio.
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "PlatformAuditLog" ADD CONSTRAINT "ci_forca_falha_na_auditoria" CHECK (false) NOT VALID',
  );
  try {
    const r = await chamar('/platform/master/grants', crachar(proprietario.id, proprietario.email), {
      method: 'POST', master: masterOwner, body: corpo,
    });
    // 503 e não 500: a reversão é mapeada para uma resposta que explica que
    // nada foi alterado e que repetir é seguro. Afirmar o código exato aqui é o
    // que impede a regressão de voltar a ser um 500 sem explicação.
    assert.equal(r.status, 503, `a operação não pode ser concluída sem auditoria: ${await r.text()}`);
    assert.equal(
      await prisma.platformGrant.count({ where: { targetUserId: delegado.id } }), 0,
      'a concessão TEM de ter sido revertida junto com a auditoria',
    );
    assert.equal(
      await prisma.platformGrantEvent.count({ where: { targetUserId: delegado.id } }), 0,
      'e o histórico também, porque estava na mesma transação',
    );
  } finally {
    await prisma.$executeRawUnsafe('ALTER TABLE "PlatformAuditLog" DROP CONSTRAINT "ci_forca_falha_na_auditoria"');
  }

  // Com a auditoria funcionando de novo, a mesma chamada conclui — o que prova
  // que a recusa acima foi da auditoria e não do pedido.
  const agora = await chamar('/platform/master/grants', crachar(proprietario.id, proprietario.email), {
    method: 'POST', master: masterOwner, body: corpo,
  });
  assert.ok(agora.ok, `${agora.status} ${await agora.text()}`);
  assert.equal(await prisma.platformGrant.count({ where: { targetUserId: delegado.id } }), 1);
  assert.equal(
    await prisma.platformAuditLog.count({ where: { actorUserId: proprietario.id, action: 'conceder', result: 'ALLOWED' } }),
    1,
    'uma concessão efetiva, um registro ALLOWED',
  );
});

// ----------------------------------------------- resumo antes de confirmar

test('o resumo da concessão vem do servidor e destaca eventos futuros', { timeout: 120000 }, async () => {
  const proprietario = await pessoa('resumo-owner');
  const delegado = await pessoa('resumo-deleg');
  const ident = await identidade(proprietario.id, 'OWNER');
  const master = await sessao(ident.id);

  const r = await chamar('/platform/master/grants/review', crachar(proprietario.id, proprietario.email), {
    method: 'POST', master,
    body: JSON.stringify({
      pessoas: [delegado.id], acoes: ['consultar', 'suspender'],
      escopo: { tipo: 'GLOBAL' }, motivo: motivoValido,
    }),
  });
  const texto = await r.text();
  assert.equal(r.status, 201, texto);
  const { resumo } = JSON.parse(texto);
  assert.equal(resumo.alcancaEventosFuturos, true);
  assert.ok(resumo.destaques.some((d) => /eventos criados depois/.test(d)), 'tem de avisar sobre eventos futuros');
  assert.ok(resumo.destaques.some((d) => /sensí|sensi/.test(d)), 'tem de destacar a ação sensível');
  assert.equal(await prisma.platformGrant.count({ where: { targetUserId: delegado.id } }), 0, 'revisar não concede');
});

// ----------------------------------------------------- encerrar a sessão

test('encerrar a sessão não depende de concessão, e invalida na operação seguinte', { timeout: 120000 }, async () => {
  const delegado = await pessoa('logout');
  const ident = await identidade(delegado.id, 'DELEGADO');
  const master = await sessao(ident.id);
  const jwt = crachar(delegado.id, delegado.email);

  // Delegado sem concessão nenhuma: se encerrar dependesse de concessão, ele
  // não conseguiria nem sair.
  const saida = await chamar('/platform/master/sessions', jwt, { method: 'DELETE', master });
  assert.equal(saida.status, 200, await saida.text());

  const depois = await chamar('/platform/master/sessions', jwt, { method: 'DELETE', master });
  assert.equal(depois.status, 401, 'a sessão encerrada não serve mais');
});

// --------------------------------------------- visão geral sobre o persistido

test('visão geral: evento com duas áreas entra nos dois filtros e conta uma vez', { timeout: 120000 }, async () => {
  const titular = await pessoa('visao');
  const ident = await identidade(titular.id, 'OWNER');
  const master = await sessao(ident.id);
  const jwt = crachar(titular.id, titular.email);

  const dono = await pessoa('visao-dono');
  const org = await organizacao('visao', dono.id);
  // O recorte por organização isola estes eventos do resto do banco, para que
  // o teste meça o que criou e não o acúmulo de outras execuções.
  const duasAreas = await evento('visao-duas', dono.id, org.id, { subjectAreas: ['saude', 'educacao'] });
  const umaArea = await evento('visao-uma', dono.id, org.id, { subjectAreas: ['saude'] });

  const r = await chamar('/platform/master/overview', jwt, {
    method: 'POST', master, body: JSON.stringify({ organizationIds: [org.id] }),
  });
  const texto = await r.text();
  assert.equal(r.status, 201, texto);
  const visao = JSON.parse(texto);

  assert.equal(visao.totais.criados, 2, 'dois eventos distintos no recorte');
  assert.deepEqual([...visao.composicao.criados].sort(), [duasAreas.id, umaArea.id].sort());

  const porArea = Object.fromEntries(visao.porArea.map((b) => [b.chave, b]));
  assert.ok(porArea.saude, 'a área saúde tem de aparecer');
  assert.ok(porArea.educacao, 'a área educação tem de aparecer');

  // O evento de duas áreas aparece NAS DUAS consultas.
  assert.ok(porArea.saude.eventIds.includes(duasAreas.id), 'em saúde');
  assert.ok(porArea.educacao.eventIds.includes(duasAreas.id), 'em educação');
  assert.equal(porArea.saude.total, 2);
  assert.equal(porArea.educacao.total, 1);

  // E conta UMA vez no total geral. A soma dos baldes é 3; o total é 2.
  const somaDosBaldes = visao.porArea.reduce((acumulado, b) => acumulado + b.total, 0);
  assert.equal(somaDosBaldes, 3, 'a soma por área conta o multiárea duas vezes, e é assim mesmo');
  assert.equal(visao.totais.criados, 2, 'o total geral conta eventos distintos, não somas de baldes');

  // O número é a lista, nos dois lados.
  assert.equal(porArea.saude.total, porArea.saude.eventIds.length);
  assert.equal(visao.totais.criados, visao.composicao.criados.length);
});

test('visão geral: filtrar por uma área traz o multiárea, e o total continua distinto', { timeout: 120000 }, async () => {
  const titular = await pessoa('visao-filtro');
  const ident = await identidade(titular.id, 'OWNER');
  const master = await sessao(ident.id);
  const jwt = crachar(titular.id, titular.email);

  const dono = await pessoa('visao-filtro-dono');
  const org = await organizacao('visao-filtro', dono.id);
  const duasAreas = await evento('vf-duas', dono.id, org.id, { subjectAreas: ['saude', 'educacao'] });
  await evento('vf-outra', dono.id, org.id, { subjectAreas: ['cultura'] });

  for (const area of ['saude', 'educacao']) {
    const r = await chamar('/platform/master/overview', jwt, {
      method: 'POST', master, body: JSON.stringify({ organizationIds: [org.id], areas: [area] }),
    });
    const texto = await r.text();
    assert.equal(r.status, 201, texto);
    const visao = JSON.parse(texto);
    assert.equal(visao.totais.criados, 1, `filtrando por ${area}`);
    assert.deepEqual(visao.composicao.criados, [duasAreas.id], `o multiárea aparece em ${area}`);
  }
});

test('visão geral: filtro inválido é recusado com explicação, não com zero', { timeout: 120000 }, async () => {
  const titular = await pessoa('visao-ruim');
  const ident = await identidade(titular.id, 'OWNER');
  const master = await sessao(ident.id);
  const jwt = crachar(titular.id, titular.email);

  // Zero por filtro errado é indistinguível de zero de verdade. Tem de ser 400.
  const r = await chamar('/platform/master/overview', jwt, {
    method: 'POST', master, body: JSON.stringify({ formatos: ['PRESENCIAL'] }),
  });
  assert.equal(r.status, 400, await r.text());
});

test('visão geral da plataforma não abre para quem só tem concessão de um evento', { timeout: 120000 }, async () => {
  const proprietario = await pessoa('visao-escopo-owner');
  const delegado = await pessoa('visao-escopo-deleg');
  const identOwner = await identidade(proprietario.id, 'OWNER');
  const identDeleg = await identidade(delegado.id, 'DELEGADO');
  const masterOwner = await sessao(identOwner.id);
  const masterDeleg = await sessao(identDeleg.id);

  const dono = await pessoa('visao-escopo-dono');
  const org = await organizacao('visao-escopo', dono.id);
  const ev = await evento('visao-escopo', dono.id, org.id);

  const concedida = await chamar('/platform/master/grants', crachar(proprietario.id, proprietario.email), {
    method: 'POST', master: masterOwner,
    body: JSON.stringify({
      pessoas: [delegado.id], acoes: ['consultar'],
      escopo: { tipo: 'EVENTOS', eventIds: [ev.id] }, motivo: motivoValido,
    }),
  });
  assert.ok(concedida.ok, await concedida.text());

  const jwtDeleg = crachar(delegado.id, delegado.email);
  assert.equal(
    (await chamar(`/platform/master/events/${ev.id}/summary`, jwtDeleg, { master: masterDeleg })).status, 200,
    'no evento concedido ele passa',
  );
  assert.equal(
    (await chamar('/platform/master/overview', jwtDeleg, { method: 'POST', master: masterDeleg, body: '{}' })).status, 403,
    'mas o painel da plataforma inteira seria vazamento pela soma',
  );
});
