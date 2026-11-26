// Disposable CI PostgreSQL only. Unique fixture data is preserved, never deleted.
//
// Abertura de janela de inscrição da Área Master: UMA por identidade, mesmo com
// dois operadores ao mesmo tempo (#571, achado A2).
//
// Por que este arquivo existe: a guarda de janela única vivia sem teste. Medido
// em 26/11 sobre o HEAD 02514d0b — trocando no SQL gerado
//
//     IF janela_vence IS NOT NULL THEN   ->   IF false THEN
//
// as 22 asserções de `recuperar-acesso-master.test.mjs` continuavam verdes.
// Teste que fica verde depois de uma mudança de comportamento não cobre aquele
// comportamento. Duas janelas abertas ao mesmo tempo significam dois segredos
// válidos para o mesmo primeiro acesso, que é exatamente o que a guarda existe
// para impedir.
//
// Não sobe a aplicação de propósito: o que se mede aqui é o bloco SQL e a
// serialização que o PostgreSQL faz dele. Subir o Nest acrescentaria o módulo
// inteiro como dependência de um teste que não chama rota nenhuma.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { montarSql } from '../../../scripts/recuperar-acesso-master.policy.mjs';

const prisma = new PrismaClient();
const criados = [];

after(async () => {
  for (const schema of criados) {
    try {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } catch {
      // Schema órfão em banco descartável é melhor que derrubar a suíte na
      // limpeza e esconder o resultado dos casos.
    }
  }
  await prisma.$disconnect();
});

const NOTA = 'Autorizado pelo fundador, chamado de CI.';
const MARCA = '$evolvia_inscricao_master$';
const INSERT_DA_JANELA = '  INSERT INTO "PlatformMasterEnrollmentWindow"';
const GUARDA = '  IF janela_vence IS NOT NULL THEN';

/** Cinco tabelas porque são as cinco que o bloco toca. */
const TABELAS = [
  'User',
  'PlatformMasterIdentity',
  'PlatformMasterEnrollmentWindow',
  'PlatformWebAuthnCredential',
  'PlatformAuditLog',
];

/**
 * Schema temporário com cópias VAZIAS das tabelas que o SQL toca.
 *
 * Mesmo padrão de `platform-owner-provisioning.postgres.test.mjs`:
 * `INCLUDING ALL` traz defaults e índices — inclusive o único de `secretDigest`
 * e o de `userId`. Chaves estrangeiras não são copiadas por `LIKE`, e isso não
 * faz falta: o bloco resolve usuário e identidade dentro do próprio schema.
 */
async function schemaIsolado() {
  const nome = `insc_${randomUUID().replaceAll('-', '')}`;
  criados.push(nome);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA "${nome}"`);
  for (const tabela of TABELAS) {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE "${nome}"."${tabela}" (LIKE public."${tabela}" INCLUDING ALL)`,
    );
  }
  return nome;
}

const idEstiloCuid = () => `c${randomUUID().replaceAll('-', '').slice(0, 24)}`;

/**
 * Titular com identidade OWNER ativa, dentro do schema isolado.
 *
 * `"updatedAt"` de `User` é explícito, e tem de ser: é `@updatedAt` no Prisma,
 * preenchido pelo CLIENTE, e a coluna nasce `NOT NULL` sem default — foi o que
 * derrubou os casos do arquivo vizinho no CI de 19/11. `PlatformMasterIdentity`
 * tem a mesma armadilha em `id`: `@default(cuid())` também é do cliente, então
 * o INSERT cru é obrigado a fornecê-lo.
 */
async function titularComIdentidade(schema) {
  const userId = idEstiloCuid();
  const identityId = idEstiloCuid();
  const email = `insc-${randomUUID()}@evolvia-ci.local`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "${schema}"."User" ("id", "name", "email", "passwordHash", "emailVerifiedAt", "updatedAt")
     VALUES ('${userId}', 'INSC titular', '${email}', 'fixture', now(), now())`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "${schema}"."PlatformMasterIdentity" ("id", "userId", "role", "status", "provisionedByNote")
     VALUES ('${identityId}', '${userId}', 'OWNER', 'ACTIVE', 'Fixture de CI (OWNER).')`,
  );
  return { userId, identityId, email };
}

/** Só o bloco `DO`: a transação fica com o Prisma, que é quem a abre aqui. */
function blocoDo(sql) {
  const inicio = sql.indexOf(`DO ${MARCA}`);
  const fim = sql.lastIndexOf(`${MARCA};`);
  assert.ok(inicio >= 0 && fim > inicio, 'o SQL gerado mudou de forma: não achei o bloco DO');
  return sql.slice(inicio, fim + `${MARCA};`.length);
}

/**
 * Alarga a janela entre a guarda e o INSERT.
 *
 * A corrida JÁ EXISTE; a espera só a torna observável sem depender do
 * agendador. Aplicada nos DOIS casos, com e sem guarda: a comparação só é justa
 * se o único fator diferente entre eles for a guarda.
 */
function comEsperaAntesDoInsert(sql) {
  const novo = sql.replace(INSERT_DA_JANELA, `  PERFORM pg_sleep(0.4);\n${INSERT_DA_JANELA}`);
  assert.notEqual(novo, sql, 'a espera não foi inserida: o caso mediria o SQL original');
  return novo;
}

/** O mutante que ficou verde na suíte pura, aplicado aqui de propósito. */
function semGuardaDeJanelaUnica(sql) {
  assert.ok(sql.includes(GUARDA), 'a guarda não está no SQL gerado: não há o que remover');
  return sql.replace(GUARDA, '  IF false THEN');
}

function sqlDeAbertura(titular, { minutos = 15 } = {}) {
  return montarSql({
    finalidade: 'BOOTSTRAP',
    email: titular.email,
    identidade: titular.identityId,
    nota: NOTA,
    correlacao: randomUUID(),
    minutos,
    segredo: randomBytes(32).toString('base64url'),
  });
}

function abrir(schema, sql) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`);
    await tx.$executeRawUnsafe(blocoDo(sql));
  }, { timeout: 20_000, maxWait: 20_000 });
}

const contar = async (schema, onde) => {
  const linhas = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS total FROM "${schema}"."PlatformMasterEnrollmentWindow" ${onde}`,
  );
  return Number(linhas[0].total);
};

const janelasAbertas = (schema) => contar(schema, `WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt" > now()`);
const janelasTotais = (schema) => contar(schema, '');

const linhasDaTrilha = async (schema) => {
  const linhas = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS total FROM "${schema}"."PlatformAuditLog"
      WHERE action = 'bootstrap_autenticador_master'`,
  );
  return Number(linhas[0].total);
};

test('duas aberturas concorrentes deixam UMA janela, UMA trilha e UMA recusa', { timeout: 60000 }, async () => {
  const schema = await schemaIsolado();
  const titular = await titularComIdentidade(schema);

  const disputas = await Promise.allSettled([
    abrir(schema, comEsperaAntesDoInsert(sqlDeAbertura(titular))),
    abrir(schema, comEsperaAntesDoInsert(sqlDeAbertura(titular))),
  ]);

  const aceitas = disputas.filter((r) => r.status === 'fulfilled');
  const recusadas = disputas.filter((r) => r.status === 'rejected');
  assert.equal(aceitas.length, 1, 'mais de uma abertura foi aceita');
  assert.equal(recusadas.length, 1);
  // A recusa tem de DIZER o que aconteceu. Zero linhas afetadas em silêncio
  // seria lido como sucesso pelo operador.
  assert.match(String(recusadas[0].reason), /autorizacao aberta/i);

  assert.equal(await janelasTotais(schema), 1, 'nasceram duas janelas');
  assert.equal(await janelasAbertas(schema), 1);
  // A trilha acompanha a janela: a abertura recusada desfez tudo, inclusive a
  // própria linha, porque o bloco é uma transação só.
  assert.equal(await linhasDaTrilha(schema), 1);
});

test('sem a guarda, as mesmas duas aberturas deixam DUAS janelas', { timeout: 60000 }, async () => {
  // Este caso é o que dá sentido ao anterior. Sem ele, um verde acima poderia
  // ser o banco serializando por conta própria, e não a guarda funcionando.
  const schema = await schemaIsolado();
  const titular = await titularComIdentidade(schema);

  const disputas = await Promise.allSettled([
    abrir(schema, semGuardaDeJanelaUnica(comEsperaAntesDoInsert(sqlDeAbertura(titular)))),
    abrir(schema, semGuardaDeJanelaUnica(comEsperaAntesDoInsert(sqlDeAbertura(titular)))),
  ]);

  assert.equal(disputas.filter((r) => r.status === 'fulfilled').length, 2,
    'o cenário sem guarda não chegou a inserir duas vezes: o caso com guarda não prova nada');
  assert.equal(await janelasTotais(schema), 2);
  assert.equal(await janelasAbertas(schema), 2, 'dois segredos válidos ao mesmo tempo');
});

test('a segunda abertura em sequência também é recusada, e não altera a primeira', async () => {
  const schema = await schemaIsolado();
  const titular = await titularComIdentidade(schema);

  await abrir(schema, sqlDeAbertura(titular));
  const antes = await prisma.$queryRawUnsafe(
    `SELECT "secretDigest", "expiresAt" FROM "${schema}"."PlatformMasterEnrollmentWindow"`,
  );
  assert.equal(antes.length, 1);

  await assert.rejects(() => abrir(schema, sqlDeAbertura(titular)), /autorizacao aberta/i);

  const depois = await prisma.$queryRawUnsafe(
    `SELECT "secretDigest", "expiresAt" FROM "${schema}"."PlatformMasterEnrollmentWindow"`,
  );
  assert.equal(depois.length, 1);
  assert.equal(depois[0].secretDigest, antes[0].secretDigest, 'a janela existente foi trocada');
  assert.equal(await linhasDaTrilha(schema), 1);
});

test('janela vencida não bloqueia a abertura seguinte', async () => {
  // A guarda é sobre janela ABERTA, não sobre histórico. Se bloqueasse por
  // existência, uma tentativa abandonada deixaria o titular travado até alguém
  // apagar linha à mão — e o ponto da janela curta é justamente poder repetir.
  const schema = await schemaIsolado();
  const titular = await titularComIdentidade(schema);

  await abrir(schema, sqlDeAbertura(titular, { minutos: 1 }));
  await prisma.$executeRawUnsafe(
    `UPDATE "${schema}"."PlatformMasterEnrollmentWindow" SET "expiresAt" = now() - interval '1 second'`,
  );

  await abrir(schema, sqlDeAbertura(titular));
  assert.equal(await janelasTotais(schema), 2, 'a janela vencida devia ter dado lugar a uma nova');
  assert.equal(await janelasAbertas(schema), 1);
  assert.equal(await linhasDaTrilha(schema), 2);
});
