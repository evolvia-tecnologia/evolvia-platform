// Disposable CI PostgreSQL only. Unique fixture data is preserved, never deleted.
//
// Dois proprietários principais não podem nascer ao mesmo tempo.
//
// A proteção é `pg_advisory_xact_lock(665, 1)` no SQL gerado, e ela existe por um
// motivo preciso: `PlatformMasterIdentity` tem ÍNDICE em (role, status), NÃO
// restrição de unicidade. Sob READ COMMITTED, duas transações concorrentes para
// usuários DIFERENTES passam as duas pelo `IF EXISTS` da guarda e inserem as
// duas. `userId @unique` barra o replay do mesmo usuário; não barra dois.
//
// Não existe teste de unidade que mostre isso: duas transações disputando só
// acontecem no banco. É a classe de garantia que mais se declara e menos se
// prova.
//
// ISOLAMENTO EM SCHEMA PRÓPRIO, e por necessidade, não por capricho
// ------------------------------------------------------------------
// A guarda é GLOBAL: "não existe proprietário Master ativo" olha a tabela
// inteira. O banco de CI é compartilhado e outras suítes criam identidades OWNER
// ativas — `platform-privilege-escalation`, entre elas. No schema `public` a
// guarda recusaria sempre, antes de qualquer concorrência, e o caso mediria a
// guarda em vez da serialização.
//
// A saída óbvia seria apagar linhas, que o cabeçalho destes arquivos proíbe e
// com razão: fixture compartilhada é de todos. Então cada execução cria um
// schema temporário com cópias vazias das três tabelas, roda o SQL GERADO sem
// alterar uma vírgula dele, e descarta o próprio schema no fim. Nada
// compartilhado é lido nem tocado.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { montarSql } from '../../../scripts/provisionar-proprietario-master.policy.mjs';

const prisma = new PrismaClient();
const criados = [];

after(async () => {
  // Descarta apenas os schemas que ESTE arquivo criou. Nenhuma linha de
  // fixture compartilhada é removida.
  for (const schema of criados) {
    try {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } catch {
      // Deixar um schema órfão num banco descartável é melhor que derrubar a
      // suíte na limpeza e esconder o resultado dos casos.
    }
  }
  await prisma.$disconnect();
});

const NOTA = 'Autorizado pelo fundador em canal privado, registro de CI.';

/**
 * Schema temporário com cópias VAZIAS das três tabelas que o SQL toca.
 *
 * `INCLUDING ALL` traz defaults e índices — inclusive o `userId` único, que é
 * parte do que se mede no terceiro caso. Chaves estrangeiras não são copiadas
 * por `LIKE`, e isso não faz falta: o SQL resolve o usuário por e-mail, dentro
 * do próprio schema.
 */
async function schemaIsolado() {
  const nome = `prov_${randomUUID().replaceAll('-', '')}`;
  criados.push(nome);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA "${nome}"`);
  for (const tabela of ['User', 'PlatformMasterIdentity', 'PlatformAuditLog']) {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE "${nome}"."${tabela}" (LIKE public."${tabela}" INCLUDING ALL)`,
    );
  }
  return nome;
}

/** Usuário com e-mail verificado dentro do schema isolado. */
async function usuarioVerificado(schema, rotulo) {
  const id = `c${randomUUID().replaceAll('-', '').slice(0, 24)}`;
  const email = `prov-${rotulo}-${randomUUID()}@evolvia-ci.local`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "${schema}"."User" ("id", "name", "email", "passwordHash", "emailVerifiedAt")
     VALUES ('${id}', 'PROV ${rotulo}', '${email}', 'fixture', now())`,
  );
  return { id, email };
}

/** Só o bloco `DO`: a transação fica com o Prisma, que é quem a abre aqui. */
function blocoDo(sql) {
  const inicio = sql.indexOf('DO $evolvia$');
  const fim = sql.lastIndexOf('$evolvia$;');
  assert.ok(inicio >= 0 && fim > inicio, 'o SQL gerado mudou de forma: não achei o bloco DO');
  return sql.slice(inicio, fim + '$evolvia$;'.length);
}

const INSERT_DA_IDENTIDADE = '  INSERT INTO "PlatformMasterIdentity"';
const LINHA_DA_TRAVA = '  PERFORM pg_advisory_xact_lock(665, 1);\n';

/**
 * Alarga a janela entre a guarda e o INSERT.
 *
 * A janela JÁ EXISTE — a espera não a cria, apenas a torna observável sem
 * depender de agendamento. Sem isso, um verde no caso com trava poderia ser
 * coincidência de o banco ter serializado por conta própria, e o teste não
 * significaria nada.
 *
 * Aplicada nos TRÊS casos, inclusive no que tem trava: a comparação só é justa
 * se o único fator diferente entre eles for a linha da trava.
 */
function comJanelaLarga(sql) {
  const novo = sql.replace(INSERT_DA_IDENTIDADE, `  PERFORM pg_sleep(0.4);\n${INSERT_DA_IDENTIDADE}`);
  assert.notEqual(novo, sql, 'a espera não foi inserida: o caso mediria o SQL original');
  return novo;
}

function semTrava(sql) {
  assert.ok(sql.includes(LINHA_DA_TRAVA), 'a trava não está no SQL gerado: não há o que remover');
  return sql.replace(LINHA_DA_TRAVA, '');
}

/** Roda o bloco no schema isolado, em transação própria. */
function provisionar(schema, sql) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`);
    await tx.$executeRawUnsafe(blocoDo(sql));
  }, { timeout: 20_000, maxWait: 20_000 });
}

const contar = async (schema, sql) => {
  const linhas = await prisma.$queryRawUnsafe(sql.replaceAll('{s}', schema));
  return Number(linhas[0].total);
};

const proprietariosAtivos = (schema) => contar(
  schema,
  `SELECT count(*)::int AS total FROM "{s}"."PlatformMasterIdentity" WHERE role = 'OWNER' AND status = 'ACTIVE'`,
);

const linhasDaTrilha = (schema) => contar(
  schema,
  `SELECT count(*)::int AS total FROM "{s}"."PlatformAuditLog" WHERE action = 'platform.master_identity_provisioned'`,
);

/** Dispara as duas ANTES de esperar qualquer uma: do contrário não há corrida. */
const correndo = (a, b) => Promise.allSettled([a, b]);

const venceram = (resultados) => resultados.filter((r) => r.status === 'fulfilled').length;

test('COM a trava: duas provisões concorrentes produzem UM proprietário', { timeout: 120000 }, async () => {
  const schema = await schemaIsolado();
  const um = await usuarioVerificado(schema, 'a');
  const outro = await usuarioVerificado(schema, 'b');

  assert.equal(await proprietariosAtivos(schema), 0, 'o schema isolado não nasceu vazio');

  const sqlUm = comJanelaLarga(montarSql({ email: um.email, nota: NOTA, correlacao: `prov-${randomUUID()}` }));
  const sqlOutro = comJanelaLarga(montarSql({ email: outro.email, nota: NOTA, correlacao: `prov-${randomUUID()}` }));

  const resultados = await correndo(provisionar(schema, sqlUm), provisionar(schema, sqlOutro));

  assert.equal(venceram(resultados), 1, 'as duas provisões concorrentes deveriam dar exatamente uma vencedora');
  const recusada = resultados.find((r) => r.status === 'rejected');
  assert.match(
    String(recusada.reason?.message ?? recusada.reason),
    /Ja existe proprietario Master ativo/u,
    'a perdedora falhou por outro motivo: a guarda não foi o que a barrou',
  );

  assert.equal(
    await proprietariosAtivos(schema), 1,
    'nasceram dois proprietários ativos: a trava não serializou o nascimento',
  );
  assert.equal(
    await linhasDaTrilha(schema), 1,
    'a trilha não acompanhou: a transação desfeita deixou registro, ou a vencedora não deixou',
  );
});

test('SEM a trava, o MESMO cenário produz DOIS proprietários', { timeout: 120000 }, async () => {
  // Este caso exige que a versão desprotegida FALHE em proteger. Sem ele, o
  // caso anterior poderia estar verde porque o banco serializou sozinho, e a
  // trava poderia ser removida sem ninguém notar.
  const schema = await schemaIsolado();
  const um = await usuarioVerificado(schema, 'c');
  const outro = await usuarioVerificado(schema, 'd');

  const sqlUm = comJanelaLarga(semTrava(montarSql({ email: um.email, nota: NOTA, correlacao: `prov-${randomUUID()}` })));
  const sqlOutro = comJanelaLarga(semTrava(montarSql({ email: outro.email, nota: NOTA, correlacao: `prov-${randomUUID()}` })));

  await correndo(provisionar(schema, sqlUm), provisionar(schema, sqlOutro));

  assert.equal(
    await proprietariosAtivos(schema), 2,
    'sem a trava deveriam nascer DOIS: se nasceu um, a corrida não aconteceu e o caso anterior não prova a trava',
  );
});

test('o MESMO usuário duas vezes é barrado pela unicidade de userId', { timeout: 120000 }, async () => {
  // A parte que o esquema já cobre, e que a trava NÃO precisa cobrir. Separar
  // os dois mecanismos importa: se um dia alguem trocar a trava por
  // "já há unicidade", este caso continua verde e o primeiro fica vermelho.
  const schema = await schemaIsolado();
  const unico = await usuarioVerificado(schema, 'e');

  const sql = comJanelaLarga(montarSql({ email: unico.email, nota: NOTA, correlacao: `prov-${randomUUID()}` }));

  const resultados = await correndo(provisionar(schema, sql), provisionar(schema, sql));

  assert.equal(venceram(resultados), 1, 'o replay do mesmo usuário deveria dar exatamente uma vencedora');
  assert.equal(await proprietariosAtivos(schema), 1);

  // Terceira vez, agora em série: o SQL é idempotente e informa em vez de
  // falhar, porque a identidade já existe para aquele usuário.
  await provisionar(schema, sql);
  assert.equal(
    await proprietariosAtivos(schema), 1,
    'a terceira execução criou outra identidade: o RETURN idempotente não segurou',
  );
  assert.equal(await linhasDaTrilha(schema), 1, 'a execução idempotente gravou trilha de uma mudança que não houve');
});
