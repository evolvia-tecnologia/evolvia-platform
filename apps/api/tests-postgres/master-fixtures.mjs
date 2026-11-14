// Disposable CI PostgreSQL only. Unique fixture data is preserved, never deleted.
//
// Scaffolding dos testes HTTP/PostgreSQL da Área Master (#665).
//
// Existe para que os arquivos novos não repitam o bootstrap pela terceira vez.
// `platform-master-access-http.postgres.test.mjs` continua com o seu próprio,
// de propósito: aquele arquivo está em revisão, e refatorá-lo agora trocaria o
// que foi revisado pelo que não foi.
//
// A ORDEM importa: `JWT_SECRET` tem de existir antes dos imports de `../dist/`,
// porque o módulo de autenticação o lê na carga. Por isso ele é definido aqui no
// topo e este módulo reexporta as janelas — um teste que importasse `dist` por
// conta própria poderia inverter a ordem sem que nada avisasse.
//
// Sem @nestjs/testing e sem supertest: não existem no package.json, e
// acrescentar dependência exigiria lockfile novo.
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
const { PlatformMasterRepository } = await import('../dist/platform-master.repository.js');

export const { JANELA_DO_DESAFIO_MS } = await import('../dist/platform-ceremony-policy.js');
export const { JANELA_DA_SESSAO_MS } = await import('../dist/platform-session-policy.js');
export { PlatformMasterRepository };

export const prisma = new PrismaClient();

let app;
let base = '';

/** Sobe a aplicação como `main.ts` a monta. Sem isso, o teste mede outra coisa. */
export async function subirApp() {
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
  return app;
}

export async function derrubarApp() {
  await prisma.$disconnect();
  if (app) await app.close();
}

/** O repositório REAL, pelo container. Reimplementar a consulta no teste provaria o teste. */
export function repositorio() {
  return app.get(PlatformMasterRepository);
}

export function crachar(sub, email) {
  const parte = (valor) => Buffer.from(JSON.stringify(valor)).toString('base64url');
  const agora = Math.floor(Date.now() / 1000);
  const cabeca = parte({ alg: 'HS256', typ: 'JWT' });
  const corpo = parte({ sub, email, iat: agora, exp: agora + 3600 });
  const assinatura = createHmac('sha256', process.env.JWT_SECRET).update(`${cabeca}.${corpo}`).digest('base64url');
  return `${cabeca}.${corpo}.${assinatura}`;
}

export function chamar(caminho, token, { master, ...opcoes } = {}) {
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

/**
 * Lê a resposta UMA vez, e devolve texto e objeto.
 *
 * Existe por causa de uma falha real de CI. `assert.equal(r.status, 200, await
 * r.text())` parece inofensivo e não é: o terceiro argumento do `assert` é
 * avaliado SEMPRE, inclusive quando a asserção passa. O corpo de uma `Response`
 * é stream de leitura única, então o `await r.json()` seguinte estoura com
 * "Body is unusable: Body has already been read".
 *
 * Lendo uma vez aqui, a classe inteira do erro desaparece em vez de ser
 * remendada em cada chamada — e o padrão errado deixa de ser o caminho mais
 * curto para quem acrescentar um caso amanhã.
 *
 * `corpo` fica `null` quando a resposta não é JSON. Quem precisa do corpo
 * confere o status primeiro, e a mensagem desse assert carrega o `texto` —
 * então uma resposta inesperada aparece como divergência de status com o corpo
 * à vista, que é o que ajuda a entender a falha.
 */
export async function ler(resposta) {
  const texto = await resposta.text();
  let corpo = null;
  if (texto.length > 0) {
    try {
      corpo = JSON.parse(texto);
    } catch {
      corpo = null;
    }
  }
  return { status: resposta.status, ok: resposta.ok, texto, corpo };
}

/** `chamar` seguido de `ler`, que é o que quase todo caso quer. */
export async function chamarELer(caminho, token, opcoes) {
  return ler(await chamar(caminho, token, opcoes));
}

export const sha256 = (valor) => createHash('sha256').update(valor).digest('hex');

/** Cria usuário sintético. Nunca uma conta real, nunca um e-mail que exista. */
export async function pessoa(rotulo) {
  const chave = randomUUID();
  return prisma.user.create({
    data: {
      name: `PG master ${rotulo}`,
      email: `master-${rotulo}-${chave}@evolvia-ci.local`,
      passwordHash: 'fixture',
    },
  });
}

export async function identidade(userId, role) {
  return prisma.platformMasterIdentity.create({
    data: { userId, role, provisionedByNote: `Fixture de CI (${role}).` },
  });
}

/**
 * Abre sessão Master como o serviço abre: token aleatório, só o sha256 no banco.
 *
 * `stepUpAt` recente porque conceder é ação do proprietário e portanto sensível:
 * sem verificação reforçada fresca, a própria montagem do cenário levaria 403 e
 * o teste mediria a janela, não o que ele quer medir.
 */
export async function sessao(identityId, { segundoFatorEm = Date.now(), reforcoEm = Date.now() } = {}) {
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

export async function organizacao(rotulo, createdById) {
  const chave = randomUUID();
  return prisma.organization.create({
    data: { name: `PG master ${rotulo}`, slug: `master-${rotulo}-${chave}`, createdById },
  });
}

export async function evento(rotulo, ownerId, organizationId, extra = {}) {
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

/**
 * Grava uma linha na trilha direto no banco.
 *
 * De propósito: o relatório é LEITURA, e o que se mede é o que ele deixa ver.
 * Fabricar as linhas pelas rotas que escrevem amarraria o teste do relatório ao
 * caminho de escrita, e uma falha ali apareceria aqui como se fosse do
 * relatório. A escrita tem os próprios testes.
 */
export async function trilha(dados) {
  return prisma.platformAuditLog.create({
    data: {
      actorUserId: dados.actorUserId,
      action: dados.action,
      scopeKind: dados.scopeKind ?? 'GLOBAL',
      organizationId: dados.organizationId ?? '',
      eventId: dados.eventId ?? '',
      targetUserId: dados.targetUserId ?? '',
      reason: dados.reason ?? 'Linha de fixture de CI.',
      result: dados.result ?? 'ALLOWED',
      correlationId: dados.correlationId ?? `fixture-${randomUUID()}`,
      occurredAt: dados.occurredAt ?? new Date(),
      ...(dados.changes === undefined ? {} : { changes: dados.changes }),
    },
  });
}

export const motivoValido = 'Verificacao de inconsistencia relatada pelo organizador';
