// Disposable CI PostgreSQL only. Nothing is written: este arquivo só lê o
// catálogo do banco.
//
// Gatilho de contrato nos enums que o código da Área Master interpreta.
//
// O PROBLEMA QUE ISTO PROTEGE
// ---------------------------
// `platform-master.repository.escopoDaLinha` traduz `scopeKind` assim:
//
//     if (tipo === 'ORGANIZACAO') return { tipo: 'ORGANIZACAO', organizationId };
//     if (tipo === 'EVENTO')      return { tipo: 'EVENTO', eventId };
//     return { tipo: 'GLOBAL' };
//
// Qualquer valor que não seja os dois primeiros vira GLOBAL — o alcance MAIS
// LARGO. É fail-open num campo de alcance.
//
// Hoje isso é latente, porque a coluna é enum e só aceita os três valores
// tratados. O risco é futuro e silencioso: no dia em que alguem acrescentar um
// valor ao enum — digamos `ORGANIZACOES`, para um alcance multi-organização —
// toda concessão daquele tipo passa a valer na plataforma inteira, sem erro,
// sem log e sem teste vermelho.
//
// Este arquivo fecha essa janela: exige que o enum tenha EXATAMENTE os valores
// que o código sabe tratar. Acrescentar um valor sem tratar a tradução passa a
// ser CI vermelho, e a mensagem diz onde consertar.
//
// Salvaguarda não é reparo, e eu não chamo uma de outra: o reparo é fazer
// `escopoDaLinha` falhar fechado, e sai em patch porque toca arquivo integrado.
//
// POR QUE O NOME DO TIPO NÃO ESTÁ ESCRITO AQUI
// --------------------------------------------
// O teste descobre o nome do tipo do enum pela própria coluna
// (`information_schema.columns.udt_name`) e só então consulta `pg_enum`. Fixar
// o nome de memória seria exatamente o tipo de suposição de schema que já me
// custou doze casos de CI nesta semana.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

/** O nome do tipo do enum por trás de uma coluna, perguntado ao banco. */
async function tipoDaColuna(tabela, coluna) {
  const linhas = await prisma.$queryRawUnsafe(
    `SELECT data_type, udt_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    tabela,
    coluna,
  );
  assert.equal(
    linhas.length, 1,
    `a coluna "${tabela}"."${coluna}" não existe no schema atual: o contrato que este teste confere mudou de lugar`,
  );
  assert.equal(
    String(linhas[0].data_type), 'USER-DEFINED',
    `"${tabela}"."${coluna}" deixou de ser enum (agora ${linhas[0].data_type}).`
      + ' Se virou texto livre, a tradução no código passa a receber qualquer valor e este teste não basta mais.',
  );
  return String(linhas[0].udt_name);
}

/** Os rótulos do enum, em ordem alfabética para não depender da declaração. */
async function rotulosDoEnum(tipo) {
  const linhas = await prisma.$queryRawUnsafe(
    `SELECT e.enumlabel AS rotulo FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = $1`,
    tipo,
  );
  return linhas.map((linha) => String(linha.rotulo)).sort();
}

test('o alcance de concessão tem exatamente os três valores que o código traduz', { timeout: 120000 }, async () => {
  const tipo = await tipoDaColuna('PlatformGrant', 'scopeKind');
  const rotulos = await rotulosDoEnum(tipo);

  // Estes três são os que `escopoDaLinha` e `escopoAlcanca` sabem tratar.
  const tratados = ['EVENTO', 'GLOBAL', 'ORGANIZACAO'];

  assert.deepEqual(
    rotulos, tratados,
    `O enum "${tipo}" tem ${JSON.stringify(rotulos)} e o código trata ${JSON.stringify(tratados)}.\n\n`
      + 'ISTO NÃO É UM TESTE FRÁGIL — é o ponto dele. `escopoDaLinha` em\n'
      + '`platform-master.repository.ts` converte QUALQUER valor fora de\n'
      + 'ORGANIZACAO/EVENTO em `{ tipo: "GLOBAL" }`, que é o alcance mais largo.\n'
      + 'Um valor novo no enum, sem tratamento lá, faz toda concessão daquele\n'
      + 'tipo valer na plataforma inteira, em silêncio.\n\n'
      + 'Antes de acrescentar o valor: trate-o em `escopoDaLinha` e em\n'
      + '`escopoAlcanca` (platform-grant-policy.ts), decida se ele alcança o alvo\n'
      + 'PLATAFORMA, e só então atualize a lista deste teste.',
  );
});

test('o estado de moderação tem exatamente os três estados da política', { timeout: 120000 }, async () => {
  // Contrato OPOSTO ao de cima, e a diferença importa para quem for ler um
  // vermelho destes.
  //
  // A moderação falha FECHADO: `estadoDe` devolve INDETERMINADO para valor que
  // não reconhece, e `permite()` nega. Um estado novo no enum, sem tratamento,
  // não vira poder — vira bloqueio de tudo naquele estado, inclusive das
  // operações que deveriam seguir liberadas.
  //
  // Então este gatilho é INFORMATIVO, não protetivo: ele avisa que falta
  // tratamento, mas o pior caso de não ter o aviso é um evento travado, não um
  // acesso indevido. Chamar os dois de "a mesma proteção" seria apagar
  // justamente a distinção que decide a urgência de cada um.
  const tipo = await tipoDaColuna('PlatformEventModeration', 'state');
  const rotulos = await rotulosDoEnum(tipo);

  assert.deepEqual(
    rotulos, ['ATIVO', 'REMOVIDO', 'SUSPENSO'],
    `O enum "${tipo}" tem ${JSON.stringify(rotulos)}.\n\n`
      + 'A política (`platform-moderation-policy.ESTADOS`) e a porta de consumo\n'
      + '(`platform-moderation-enforcement.estadoDe`) conhecem três estados. Um\n'
      + 'estado novo falha FECHADO — nega tudo —, o que é seguro mas trava o\n'
      + 'evento por inteiro, inclusive leitura administrativa e auditoria, que\n'
      + 'nunca deveriam ser barradas.\n\n'
      + 'Antes de acrescentar: declare o estado em ESTADOS, decida seus efeitos\n'
      + 'na tabela de `permite()`, e atualize a lista deste teste.',
  );
});

test('a ação de concessão é texto, e por isso o catálogo fechado vive no código', { timeout: 120000 }, async () => {
  // Registro de uma assimetria deliberada, para que ninguém "corrija" a coluna
  // para enum sem perceber o que isso quebra.
  //
  // `PlatformGrant.action` é texto, não enum, e `platform-grant-policy.ts` diz
  // por quê: o banco pode conter uma ação que o código não conhece mais —
  // catálogo antigo, migração parcial, linha escrita à mão — e tipar como
  // união faria o compilador presumir que isso não acontece. Sendo texto, o
  // valor desconhecido é comparado contra `ACOES_CONCEDIVEIS` em tempo de
  // execução e NEGA.
  //
  // Ou seja: aqui o catálogo fechado no código é que faz a segurança, e
  // transformar a coluna em enum moveria a decisão para a migration sem
  // melhorar nada — piorando, porque uma linha fora do catálogo passaria a ser
  // impossível de gravar e, portanto, impossível de auditar.
  const linhas = await prisma.$queryRawUnsafe(
    `SELECT data_type FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'PlatformGrant' AND column_name = 'action'`,
  );
  assert.equal(linhas.length, 1, 'a coluna "PlatformGrant"."action" não existe');
  assert.notEqual(
    String(linhas[0].data_type), 'USER-DEFINED',
    'A coluna "action" virou enum. Isso parece um endurecimento e não é:\n'
      + '`platform-grant-policy.ts` tipa `Concessao.acao` como `string` DE PROPÓSITO,\n'
      + 'para que valor fora de `ACOES_CONCEDIVEIS` seja comparado em execução e\n'
      + 'NEGUE, em vez de o compilador presumir que não existe. Com enum, uma\n'
      + 'linha fora do catálogo fica impossível de gravar e, com isso, impossível\n'
      + 'de auditar — e o catálogo passa a viver em dois lugares.',
  );
});
