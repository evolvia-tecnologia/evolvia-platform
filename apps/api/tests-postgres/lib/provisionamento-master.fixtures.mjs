// Fixtures do provisionamento Master, em UM lugar só.
//
// Disposable CI PostgreSQL only. Nada de fixture compartilhada é apagado: cada
// caso trabalha num schema temporário próprio e descarta o schema no fim.
//
// POR QUE ESTE MÓDULO EXISTE
// --------------------------
// `platform-owner-provisioning.postgres.test.mjs` carrega sua própria cópia
// destes auxiliares. Duas cópias da mesma fixture divergem, e essa divergência
// já custou caro nesta frente: onze casos de CI morreram em 23502 porque uma
// fixture duplicada omitia `User.updatedAt`. Então o arquivo novo NÃO repete os
// auxiliares — importa daqui.
//
// PENDÊNCIA DECLARADA: o arquivo antigo continua com a cópia embutida. Migrá-lo
// para este módulo é o passo seguinte, e enquanto não acontecer existem duas
// cópias — exatamente a classe de risco que este módulo nasceu para encerrar.
// Registro em vez de silenciar.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export const NOTA = 'Autorizado pelo fundador em canal privado, registro de CI.';

/** As três tabelas que o SQL gerado toca. */
const TABELAS = ['User', 'PlatformMasterIdentity', 'PlatformAuditLog'];

/**
 * Schema temporário com cópias VAZIAS das três tabelas.
 *
 * Necessário, e não capricho: a guarda do script é GLOBAL — "não existe
 * proprietário Master ativo" olha a tabela inteira. O banco de CI é
 * compartilhado e outras suítes criam OWNER ativos, então no `public` a guarda
 * recusaria sempre, antes de qualquer concorrência, e o caso mediria a guarda
 * em vez do que pretende medir.
 *
 * `INCLUDING ALL` traz defaults e índices, inclusive o único de `userId`.
 * Chaves estrangeiras não são copiadas por `LIKE`, e não fazem falta: o SQL
 * resolve o usuário por e-mail dentro do próprio schema.
 */
export async function schemaIsolado(prisma, criados) {
  const nome = `prov_${randomUUID().replaceAll('-', '')}`;
  criados.push(nome);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA "${nome}"`);
  for (const tabela of TABELAS) {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE "${nome}"."${tabela}" (LIKE public."${tabela}" INCLUDING ALL)`,
    );
  }
  return nome;
}

export async function descartarSchemas(prisma, criados) {
  for (const schema of criados) {
    try {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } catch {
      // Schema órfão em banco descartável é melhor que derrubar a suíte na
      // limpeza e esconder o resultado dos casos.
    }
  }
}

/**
 * Usuário com e-mail verificado DENTRO do schema isolado.
 *
 * `"updatedAt"` é explícito, e tem de ser: `User.updatedAt` é `@updatedAt` no
 * Prisma, preenchido pelo CLIENTE, e a migration cria a coluna como
 * `TIMESTAMP(3) NOT NULL` SEM DEFAULT. `LIKE ... INCLUDING ALL` copia a
 * restrição e a ausência de default, então INSERT cru que omita a coluna leva
 * 23502. Foi o que derrubou onze casos no CI de 19/11.
 *
 * `createdAt` e `credentialVersion` ficam de fora de propósito: as duas têm
 * default na mesma migration.
 *
 * O caminho normal da suíte é `prisma.user.create`, que preenche sozinho. Aqui
 * não serve: o usuário tem de nascer no schema isolado, e o cliente Prisma
 * escreve no `search_path` da conexão.
 *
 * `passwordHash` recebe um valor DISTINTO e rastreável, para que a prova de
 * não-vazamento na trilha procure por algo que de fato existe no banco — e não
 * pela palavra "senha", que nunca estaria lá de todo modo.
 */
export async function usuarioVerificado(prisma, schema, rotulo, extra = {}) {
  const id = `c${randomUUID().replaceAll('-', '').slice(0, 24)}`;
  const email = `prov-${rotulo}-${randomUUID()}@evolvia-ci.local`;
  const hash = `hash-sintetico-${randomUUID()}`;
  const verificado = extra.verificado === false ? 'NULL' : 'now()';
  await prisma.$executeRawUnsafe(
    `INSERT INTO "${schema}"."User" ("id", "name", "email", "passwordHash", "emailVerifiedAt", "updatedAt")
     VALUES ('${id}', 'PROV ${rotulo}', '${email}', '${hash}', ${verificado}, now())`,
  );
  return { id, email, hash };
}

/** Identidade Master pré-existente, para medir o replay incompatível. */
export async function identidadePrevia(prisma, schema, userId, papel, situacao) {
  const id = `c${randomUUID().replaceAll('-', '').slice(0, 24)}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "${schema}"."PlatformMasterIdentity"
       ("id", "userId", "role", "status", "provisionedByNote", "provisionedAt")
     VALUES ('${id}', '${userId}', '${papel}', '${situacao}', 'identidade previa de CI', now())`,
  );
  return id;
}

/** Só o bloco `DO`: a transação fica com o Prisma, que é quem a abre aqui. */
export function blocoDo(sql) {
  const inicio = sql.indexOf('DO $evolvia$');
  const fim = sql.lastIndexOf('$evolvia$;');
  assert.ok(inicio >= 0 && fim > inicio, 'o SQL gerado mudou de forma: não achei o bloco DO');
  return sql.slice(inicio, fim + '$evolvia$;'.length);
}

/** Roda o bloco no schema isolado, em transação própria. */
export function provisionar(prisma, schema, sql) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`);
    await tx.$executeRawUnsafe(blocoDo(sql));
  }, { timeout: 20_000, maxWait: 20_000 });
}

const contar = async (prisma, schema, sql) => {
  const linhas = await prisma.$queryRawUnsafe(sql.replaceAll('{s}', schema));
  return Number(linhas[0].total);
};

export const proprietariosAtivos = (prisma, schema) => contar(
  prisma, schema,
  `SELECT count(*)::int AS total FROM "{s}"."PlatformMasterIdentity" WHERE role = 'OWNER' AND status = 'ACTIVE'`,
);

export const identidades = (prisma, schema) => contar(
  prisma, schema,
  `SELECT count(*)::int AS total FROM "{s}"."PlatformMasterIdentity"`,
);

export const linhasDaTrilha = (prisma, schema) => contar(
  prisma, schema,
  `SELECT count(*)::int AS total FROM "{s}"."PlatformAuditLog" WHERE action = 'platform.master_identity_provisioned'`,
);

export const mensagemDe = (resultado) => String(resultado.reason?.message ?? resultado.reason ?? '');
