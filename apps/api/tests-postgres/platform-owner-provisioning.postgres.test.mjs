// Disposable CI PostgreSQL only. Unique fixture data is preserved, never deleted.
//
// Dois proprietários principais não podem nascer ao mesmo tempo.
//
// A proteção é `pg_advisory_xact_lock(665, 1)` no SQL gerado, e ela existe por um
// motivo preciso: `PlatformMasterIdentity` tem ÍNDICE em (role, status), NÃO
// restrição de unicidade. Sob READ COMMITTED, duas transações concorrentes para
// usuários DIFERENTES passam as duas pelo `IF EXISTS` da guarda e inserem as
// duas. `userId @unique` barra o replay do mesmo usuário; não barra dois — e
// com a trava no lugar o replay nem chega à restrição: a segunda transação
// espera, encontra a identidade já criada e retorna sem escrever.
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
 * parte do que se mede no último caso. Chaves estrangeiras não são copiadas
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

/**
 * Usuário com e-mail verificado dentro do schema isolado.
 *
 * `"updatedAt"` é explícito, e tem de ser. `User.updatedAt` é `@updatedAt` no
 * Prisma, e `@updatedAt` é preenchido pelo CLIENTE: a migration
 * `202608040001_init` cria a coluna como `TIMESTAMP(3) NOT NULL` SEM DEFAULT.
 * `CREATE TABLE ... (LIKE ... INCLUDING ALL)` copia a restrição e a ausência de
 * default, então um INSERT cru que omita a coluna leva 23502 —
 * `null value in column "updatedAt" ... violates not-null constraint`. Foi o que
 * derrubou os três casos deste arquivo no CI de 19/11.
 *
 * `createdAt` fica de fora de propósito: essa tem `DEFAULT CURRENT_TIMESTAMP` na
 * mesma migration. `credentialVersion` também: `DEFAULT 0`. Das oito colunas de
 * `User`, `updatedAt` é a única NOT NULL sem default que esta fixture não
 * fornecia.
 *
 * O caminho normal da suíte é `prisma.user.create`, que preenche a coluna
 * sozinho — ver `master-fixtures.mjs`. Aqui não serve: o usuário tem de nascer
 * DENTRO do schema isolado, e o cliente Prisma escreve no `search_path` da
 * conexão, não no schema que este arquivo acabou de criar.
 */
async function usuarioVerificado(schema, rotulo) {
  const id = `c${randomUUID().replaceAll('-', '').slice(0, 24)}`;
  const email = `prov-${rotulo}-${randomUUID()}@evolvia-ci.local`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "${schema}"."User" ("id", "name", "email", "passwordHash", "emailVerifiedAt", "updatedAt")
     VALUES ('${id}', 'PROV ${rotulo}', '${email}', 'fixture', now(), now())`,
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
 * Aplicada nos QUATRO casos, inclusive nos que têm trava: a comparação só é
 * justa se o único fator diferente entre eles for a linha da trava.
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

/** Texto novo a cada chamada: `identidadeId` e `auditoriaId` DISTINTOS. */
const gerado = (email) => comJanelaLarga(
  montarSql({ email, nota: NOTA, correlacao: `prov-${randomUUID()}` }),
);

test('o MESMO usuário duas vezes: COM a trava o replay é idempotente', { timeout: 120000 }, async () => {
  // Este caso afirmava uma vencedora só, e estava errado sobre o SQL que mede.
  // Com a trava, a segunda transação ESPERA, e quando entra já encontra a
  // identidade criada: cai no `RAISE NOTICE` + `RETURN`, que é caminho de
  // sucesso. As duas terminam bem, e é esse o comportamento desejado — replay
  // do mesmo usuário informa, não explode. O que precisa continuar verdadeiro é
  // o ESTADO: um proprietário e uma linha de trilha, nunca dois.
  //
  // Medido em PostgreSQL 16.15 com o SQL gerado deste módulo: duas vencedoras,
  // um proprietário, uma linha de trilha.
  const schema = await schemaIsolado();
  const unico = await usuarioVerificado(schema, 'e');

  const resultados = await correndo(
    provisionar(schema, gerado(unico.email)),
    provisionar(schema, gerado(unico.email)),
  );

  assert.equal(
    venceram(resultados), 2,
    'com a trava, o replay concorrente não deveria falhar: a segunda encontra a identidade e RETORNA',
  );
  assert.equal(
    await proprietariosAtivos(schema), 1,
    'o replay criou uma segunda identidade para o mesmo usuário',
  );
  assert.equal(
    await linhasDaTrilha(schema), 1,
    'a trilha registrou duas vezes uma criação que aconteceu uma',
  );

  // Terceira vez, agora em série: o SQL é idempotente e informa em vez de
  // falhar, porque a identidade já existe para aquele usuário.
  await provisionar(schema, gerado(unico.email));
  assert.equal(
    await proprietariosAtivos(schema), 1,
    'a terceira execução criou outra identidade: o RETURN idempotente não segurou',
  );
  assert.equal(await linhasDaTrilha(schema), 1, 'a execução idempotente gravou trilha de uma mudança que não houve');
});

/**
 * A chave que o banco apontou numa violação de unicidade, ou `null` se o erro
 * não foi violação de unicidade nenhuma.
 *
 * Esta asserção já afirmou o NOME da restrição, e foi isso que a derrubou no CI
 * 44731311856 — único erro de 253 casos PostgreSQL. O
 * `PrismaClientKnownRequestError` P2010 entrega o SQLSTATE e o DETAIL do
 * PostgreSQL, não a mensagem primária: chega `Code: 23505` mais
 * `Key ("userId")=(...) already exists`, e o nome da restrição que a regex
 * exigia não vem. O banco barrou o que devia; a asserção é que olhava para o
 * lugar errado.
 *
 * E o nome não serviria nem fora do Prisma. Medido em PostgreSQL 16.15: o
 * `CREATE TABLE ... (LIKE ... INCLUDING ALL)` deste arquivo NÃO preserva o nome
 * do índice único — `PlatformMasterIdentity_userId_key` reaparece no schema
 * isolado como `PlatformMasterIdentity_userId_idx`, porque `LIKE` copia o índice
 * e deixa o banco escolher o nome. Nome de índice copiado é detalhe de quem
 * copiou; coluna em conflito é fato do dado.
 *
 * O DETAIL cita a coluna como o PostgreSQL a escreveria, e a diferença entre os
 * dois erros possíveis aqui está justamente nela — medido, não suposto:
 *
 *     unicidade de userId -> DETAIL:  Key ("userId")=(c2048...) already exists.
 *     chave primária      -> DETAIL:  Key (id)=(c8yky...) already exists.
 *
 * Com aspas no primeiro porque `userId` precisa delas e sem aspas no segundo
 * porque `id` não. Normalizar as aspas e comparar a coluna, então, aceita a
 * violação que este caso existe para provar e recusa a colisão de chave
 * primária — que é o defeito concreto que a versão anterior deste caso tinha, e
 * o motivo de ele não medir a unicidade que nomeava.
 *
 * O nome da restrição fica como segunda via, para quando o erro chegar sem o
 * embrulho do Prisma: `psql` imprime a mensagem primária junto do DETAIL, e o
 * harness local que mediu os quatro casos vê exatamente essa forma. As duas vias
 * respondem a mesma pergunta — qual coluna colidiu — e nenhuma delas afirma CI.
 *
 * Exigir a unicidade antes de ler a coluna não é zelo decorativo, e isto também
 * foi medido: a violação de chave ESTRANGEIRA em `userId` traz
 * `DETAIL:  Key (userId)=(...) is not present in table "User".` — mesmo campo,
 * outro defeito, e sem aspas porque esse caminho do PostgreSQL não cita
 * identificador. Sem o SQLSTATE 23505 à frente, falta de linha em `User` passaria
 * por prova de unicidade. Daí também a normalização das aspas: o caminho da
 * unicidade cita o identificador quando ele precisa (`Key ("userId")=`), o da
 * chave estrangeira não, e a coluna é a mesma nos dois.
 */
const SQLSTATE_DE_UNICIDADE = /(?<![0-9])23505(?![0-9])/u;
const TEXTO_DE_UNICIDADE = /duplicate key value violates unique constraint/u;
const CHAVE_DO_DETALHE = /Key \((?<colunas>[^)]+)\)=/u;
const COLUNA_NO_NOME_DO_INDICE = /unique constraint "PlatformMasterIdentity_(?<coluna>[A-Za-z]+)_(?:key|idx)"/u;

function chaveDaViolacaoDeUnicidade(texto) {
  const ehUnicidade = SQLSTATE_DE_UNICIDADE.test(texto) || TEXTO_DE_UNICIDADE.test(texto);
  if (!ehUnicidade) return null;
  const detalhe = CHAVE_DO_DETALHE.exec(texto);
  if (detalhe) return detalhe.groups.colunas.replaceAll('"', '').trim();
  return COLUNA_NO_NOME_DO_INDICE.exec(texto)?.groups?.coluna ?? null;
}

test('SEM a trava, o replay do MESMO usuário cai na unicidade de userId', { timeout: 120000 }, async () => {
  // O mecanismo que o caso anterior ATRIBUÍA a si e não exercia: sem a trava as
  // duas transações passam pela guarda e as duas tentam inserir, e aí sim
  // `userId @unique` barra a segunda. Separar os dois importa: se alguém trocar
  // a trava por "já há unicidade", este caso continua verde e os dois primeiros
  // ficam vermelhos, que é exatamente o sinal certo.
  //
  // Dois textos GERADOS SEPARADAMENTE de propósito. Reusar um só faria a
  // perdedora colidir antes na chave primária — foi o que o caso antigo fazia,
  // e por isso ele não media a unicidade que nomeava.
  const schema = await schemaIsolado();
  const unico = await usuarioVerificado(schema, 'f');

  const resultados = await correndo(
    provisionar(schema, semTrava(gerado(unico.email))),
    provisionar(schema, semTrava(gerado(unico.email))),
  );

  assert.equal(venceram(resultados), 1, 'sem a trava o replay deveria dar exatamente uma vencedora');
  const recusada = resultados.find((r) => r.status === 'rejected');
  const erro = String(recusada.reason?.message ?? recusada.reason);
  assert.equal(
    chaveDaViolacaoDeUnicidade(erro), 'userId',
    `a perdedora não foi barrada pela unicidade de userId. Erro recebido: ${erro}`,
  );
  assert.equal(
    await proprietariosAtivos(schema), 1,
    'nasceram duas identidades para o mesmo usuário: a unicidade de userId não segurou',
  );
});
