// Disposable CI PostgreSQL only. Unique fixture data is preserved, never deleted.
//
// As provas de contrato do provisionamento Master que faltavam (#690).
//
// `platform-owner-provisioning.postgres.test.mjs` já prova a CONCORRÊNCIA: dois
// usuários disputando o primeiro OWNER, o replay idempotente do mesmo OWNER
// ativo, e as duas contraprovas sem trava. Este arquivo cobre as outras exigências
// do contrato, que são de política e de integridade, não de corrida:
//
//   - identidade prévia incompatível não produz elevação silenciosa;
//   - o parâmetro legado de segundo proprietário é rejeitado;
//   - falha tardia desfaz identidade E trilha juntas;
//   - host divergente e produção recusam ANTES de existir SQL;
//   - a trilha registra operação, quem autorizou, alvo e correlação, sem segredo.
//
// Separado em arquivo próprio de propósito: as fixtures vêm de
// `lib/provisionamento-master.fixtures.mjs`, para não haver uma segunda cópia
// delas. Duas cópias divergem, e essa divergência já matou onze casos nesta
// frente.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  ATOR_DO_BOOTSTRAP, decidirEntrada, montarSql,
} from '../../../scripts/provisionar-proprietario-master.policy.mjs';
import {
  NOTA, descartarSchemas, identidadePrevia, identidades, linhasDaTrilha,
  mensagemDe, proprietariosAtivos, provisionar, schemaIsolado, usuarioVerificado,
} from './lib/provisionamento-master.fixtures.mjs';

const prisma = new PrismaClient();
const criados = [];

after(async () => {
  await descartarSchemas(prisma, criados);
  await prisma.$disconnect();
});

const gerar = (email, nota = NOTA, correlacao = `prov-${randomUUID()}`) => montarSql({ email, nota, correlacao });

/**
 * Falha DEPOIS dos dois INSERT, para medir atomicidade de verdade.
 *
 * A pergunta que importa não é se um erro de validação impede a escrita — isso
 * acontece antes de qualquer INSERT. É se uma falha tardia deixa METADE: a
 * identidade gravada e a trilha não, ou o contrário. Um proprietário sem trilha
 * é poder sem origem registrada; uma trilha sem proprietário é registro de algo
 * que não aconteceu. As duas são piores que nenhuma.
 */
const ANCORA_FINAL = "  RAISE NOTICE 'Identidade Master OWNER criada para %.'";

function comFalhaTardia(sql) {
  const novo = sql.replace(ANCORA_FINAL, `  RAISE EXCEPTION 'falha sintetica tardia de CI';\n${ANCORA_FINAL}`);
  assert.notEqual(novo, sql, 'a falha não foi injetada: o caso mediria o SQL original e passaria por engano');
  assert.ok(
    novo.indexOf('falha sintetica tardia') > novo.indexOf('INSERT INTO "PlatformAuditLog"'),
    'a falha tem de vir DEPOIS dos dois INSERT, senão o caso não mede atomicidade',
  );
  return novo;
}

// ---------------------------------------------------------------------------
// 1. Identidade prévia incompatível: recusa explícita, sem escrita
// ---------------------------------------------------------------------------

/**
 * OS VALORES PEDIDOS NO CONTRATO NÃO EXISTEM NO SCHEMA, e isto é deliberado.
 *
 * O contrato pede casos com identidade `SUPPORT` e `REVOKED`. Li
 * `apps/api/prisma/platform-master-identity.prisma`:
 *
 *     enum PlatformMasterRole   { OWNER, DELEGADO }
 *     enum PlatformMasterStatus { ACTIVE, SUSPENDED }
 *
 * Não há `SUPPORT` nem `REVOKED`. Um INSERT com esses valores morreria em
 * `invalid input value for enum` e o caso não exerceria o buraco — seria um
 * teste verde-por-erro, do tipo que dá confiança no lugar errado.
 *
 * Então os casos usam o que o schema tem, cobrindo as DUAS dimensões que o
 * contrato quer: papel que não é proprietário (`DELEGADO`) e situação que não é
 * ativa (`SUSPENDED`), mais a combinação das duas.
 *
 * Se `SUPPORT` ou `REVOKED` forem acrescentados ao enum algum dia, o gatilho de
 * contrato em `platform-enum-contract.postgres.test.mjs` fica vermelho e manda
 * tratar o valor novo — inclusive aqui.
 */
const INCOMPATIVEIS = [
  ['DELEGADO', 'ACTIVE'],
  ['OWNER', 'SUSPENDED'],
  ['DELEGADO', 'SUSPENDED'],
];

for (const [papel, situacao] of INCOMPATIVEIS) {
  test(`identidade prévia ${papel}/${situacao}: recusa, sem escrita e sem alteração`, { timeout: 120000 }, async () => {
    // O DEFEITO QUE ISTO PRENDE era falso sucesso, e não elevação de papel.
    // O SQL lia só o `id` de qualquer identidade do alvo e dava `RETURN`, que é
    // caminho de SUCESSO: o script saía com código 0 dizendo "nada a fazer",
    // sem criar proprietário e sem gravar trilha. O operador lia 0 e concluía
    // que a área tinha titular. Não tinha, e ninguém era avisado.
    //
    // Falso sucesso é pior que erro porque apaga o próprio sinal de que falta
    // fazer algo.
    const schema = await schemaIsolado(prisma, criados);
    const alvo = await usuarioVerificado(prisma, schema, 'incompat');
    const idPrevio = await identidadePrevia(prisma, schema, alvo.id, papel, situacao);

    const antes = { identidades: await identidades(prisma, schema), trilha: await linhasDaTrilha(prisma, schema) };
    assert.equal(antes.identidades, 1, 'a identidade prévia não foi criada: o caso não tem o que medir');

    const resultado = await Promise.allSettled([provisionar(prisma, schema, gerar(alvo.email))]);
    const erro = mensagemDe(resultado[0]);

    assert.equal(
      resultado[0].status, 'rejected',
      'o script devolveu SUCESSO para identidade incompatível: é o falso sucesso que este caso existe para impedir',
    );
    // A mensagem tem de dizer o que encontrou, senão o operador não sabe o que fazer.
    assert.ok(erro.includes(papel), `a recusa não diz o papel encontrado. Erro: ${erro}`);
    assert.ok(erro.includes(situacao), `a recusa não diz a situação encontrada. Erro: ${erro}`);

    // NENHUMA elevação, NENHUMA reativação, NENHUMA escrita.
    assert.equal(await proprietariosAtivos(prisma, schema), 0, 'nasceu um proprietário ativo a partir de identidade incompatível');
    assert.equal(await identidades(prisma, schema), 1, 'o número de identidades mudou: houve escrita onde devia haver recusa');
    assert.equal(await linhasDaTrilha(prisma, schema), antes.trilha, 'gravou trilha de uma operação recusada');

    // E a identidade prévia ficou EXATAMENTE como estava: nem papel promovido,
    // nem situação reativada, nem id trocado.
    const [linha] = await prisma.$queryRawUnsafe(
      `SELECT id, role::text AS papel, status::text AS situacao
         FROM "${schema}"."PlatformMasterIdentity" WHERE "userId" = '${alvo.id}'`,
    );
    assert.equal(linha.id, idPrevio, 'a identidade prévia foi substituída');
    assert.equal(linha.papel, papel, 'o papel da identidade prévia foi alterado');
    assert.equal(linha.situacao, situacao, 'a situação da identidade prévia foi alterada');
  });
}

// ---------------------------------------------------------------------------
// 2. Parâmetro legado de segundo proprietário: rejeitado
// ---------------------------------------------------------------------------

test('o parâmetro legado de segundo proprietário é rejeitado, e nenhum SQL sem guarda existe', { timeout: 120000 }, async () => {
  // O DEFEITO: `permitirSegundoProprietario` transformava a guarda num
  // comentário. Medido em PostgreSQL 16.15 antes do reparo: DOIS OWNER ativos,
  // exatamente o que este script existe para impedir.
  //
  // Aqui a prova tem duas metades, e as duas são necessárias. A primeira é que
  // não existe texto SQL sem guarda para chegar ao banco. A segunda é que o
  // banco recusa o segundo proprietário de fato — porque "não há como gerar"
  // sem "o banco barra" seria confiar só na camada de cima.
  assert.throws(
    () => montarSql({ email: 'a@evolvia-ci.local', nota: NOTA, correlacao: 'c', permitirSegundoProprietario: true }),
    /REMOVIDO/u,
    'a chave legada foi aceita: ainda há caminho programático para SQL sem guarda',
  );
  const d = decidirEntrada({
    nodeEnv: 'test', databaseUrl: 'postgresql://h:5432/d', hostConfirmado: 'h',
    email: 'a@evolvia-ci.local', nota: NOTA, segundoProprietarioPedido: true,
  });
  assert.equal(d.permitido, false, 'a política aceitou o pedido do parâmetro legado');
  assert.equal(d.motivo, 'segundo_proprietario_por_script');

  // Metade do banco: com um proprietário ativo, o segundo é recusado.
  const schema = await schemaIsolado(prisma, criados);
  const primeiro = await usuarioVerificado(prisma, schema, 'leg1');
  const segundo = await usuarioVerificado(prisma, schema, 'leg2');

  await provisionar(prisma, schema, gerar(primeiro.email));
  assert.equal(await proprietariosAtivos(prisma, schema), 1, 'o primeiro proprietário não nasceu');

  const tentativa = await Promise.allSettled([provisionar(prisma, schema, gerar(segundo.email))]);
  assert.equal(tentativa[0].status, 'rejected', 'o segundo proprietário foi criado');
  assert.match(mensagemDe(tentativa[0]), /Ja existe proprietario Master ativo/u);
  assert.equal(await proprietariosAtivos(prisma, schema), 1, 'nasceu um segundo proprietário ativo');
  assert.equal(await linhasDaTrilha(prisma, schema), 1, 'a tentativa recusada gravou trilha');

  // E a guarda está presente em todo texto que o gerador produz.
  for (let i = 0; i < 5; i += 1) {
    assert.match(
      gerar(`qualquer-${i}@evolvia-ci.local`), /Ja existe proprietario Master ativo/u,
      'um texto gerado saiu SEM a guarda de proprietário único',
    );
  }
});

// ---------------------------------------------------------------------------
// 3. Falha tardia: rollback atômico da identidade E da trilha
// ---------------------------------------------------------------------------

test('falha depois dos dois INSERT desfaz identidade E trilha juntas', { timeout: 120000 }, async () => {
  const schema = await schemaIsolado(prisma, criados);
  const alvo = await usuarioVerificado(prisma, schema, 'rollback');

  const resultado = await Promise.allSettled([
    provisionar(prisma, schema, comFalhaTardia(gerar(alvo.email))),
  ]);

  assert.equal(resultado[0].status, 'rejected', 'a falha injetada não derrubou a transação: o caso não mede nada');
  assert.match(mensagemDe(resultado[0]), /falha sintetica tardia/u);

  // O ponto: as duas escritas já tinham acontecido quando o erro subiu.
  assert.equal(await identidades(prisma, schema), 0, 'a identidade ficou: um proprietário sem trilha é poder sem origem registrada');
  assert.equal(await linhasDaTrilha(prisma, schema), 0, 'a trilha ficou: registro de uma criação que foi desfeita');

  // E o schema continua utilizável: provisionar de novo, agora sem a falha,
  // funciona. Senão "zero linhas" poderia ser efeito de um banco quebrado.
  await provisionar(prisma, schema, gerar(alvo.email));
  assert.equal(await proprietariosAtivos(prisma, schema), 1, 'depois do rollback o provisionamento normal deixou de funcionar');
  assert.equal(await linhasDaTrilha(prisma, schema), 1);
});

// ---------------------------------------------------------------------------
// 4. Host divergente e produção: recusa antes de existir SQL
// ---------------------------------------------------------------------------

test('produção e host divergente recusam ANTES de existir SQL para executar', { timeout: 120000 }, async () => {
  // A recusa acontece em JS, sem banco, e é isso que se afirma: não existe
  // texto para chegar ao PostgreSQL. O caso vive neste arquivo porque a
  // consequência é sobre o banco — provar que ele continua intocado é metade
  // da garantia.
  const schema = await schemaIsolado(prisma, criados);
  const alvo = await usuarioVerificado(prisma, schema, 'alvoerrado');

  const recusadas = [
    ['produção', { nodeEnv: 'production', databaseUrl: 'postgresql://real:5432/d', hostConfirmado: 'real' }],
    ['produção com caixa alta', { nodeEnv: 'PRODUCTION', databaseUrl: 'postgresql://real:5432/d', hostConfirmado: 'real' }],
    ['host divergente', { nodeEnv: 'test', databaseUrl: 'postgresql://real:5432/d', hostConfirmado: 'outro' }],
    ['host não informado', { nodeEnv: 'test', databaseUrl: 'postgresql://real:5432/d' }],
    ['host só por prefixo', { nodeEnv: 'test', databaseUrl: 'postgresql://real:5432/d', hostConfirmado: 'rea' }],
    ['socket Unix, sem host', { nodeEnv: 'test', databaseUrl: 'postgresql:///d', hostConfirmado: '' }],
  ];
  for (const [rotulo, parcial] of recusadas) {
    const d = decidirEntrada({ ...parcial, email: alvo.email, nota: NOTA });
    assert.equal(d.permitido, false, `${rotulo} foi AUTORIZADO`);
    assert.equal(typeof d.mensagem, 'string');
    assert.ok(d.mensagem.length > 0, `${rotulo} recusou sem explicar`);
    // A recusa não pode vazar a URL de conexão na mensagem.
    assert.doesNotMatch(d.mensagem, /postgresql:\/\/[^\s]*@/u, `a mensagem de ${rotulo} vaza credencial da URL`);
  }

  // O banco continua exatamente como estava: nenhuma das recusas o alcançou.
  assert.equal(await identidades(prisma, schema), 0);
  assert.equal(await linhasDaTrilha(prisma, schema), 0);

  // E o caminho correto continua autorizando — senão o caso provaria apenas
  // que a política recusa tudo.
  const certo = decidirEntrada({
    nodeEnv: 'test', databaseUrl: 'postgresql://real:5432/d', hostConfirmado: 'real',
    email: alvo.email, nota: NOTA,
  });
  assert.equal(certo.permitido, true, 'a política passou a recusar o caminho correto');
});

// ---------------------------------------------------------------------------
// 5. A trilha: operação, quem autorizou, alvo, correlação — e nenhum segredo
// ---------------------------------------------------------------------------

test('a trilha registra operação, autorização, alvo e correlação, sem senha nem token', { timeout: 120000 }, async () => {
  const schema = await schemaIsolado(prisma, criados);
  const alvo = await usuarioVerificado(prisma, schema, 'trilha');
  const correlacao = `prov-auditoria-${randomUUID()}`;
  const quemAutorizou = 'Autorizado pelo fundador em canal privado, 21/11/2026.';

  await provisionar(prisma, schema, montarSql({ email: alvo.email, nota: quemAutorizou, correlacao }));

  const [linha] = await prisma.$queryRawUnsafe(
    `SELECT "action", "actorUserId", "targetUserId", "reason", "result"::text AS resultado,
            "correlationId", "scopeKind"::text AS escopo, "organizationId", "eventId"
       FROM "${schema}"."PlatformAuditLog"`,
  );
  assert.ok(linha, 'a operação não deixou trilha');

  assert.equal(linha.action, 'platform.master_identity_provisioned', 'a operação não está nomeada na trilha');
  assert.equal(linha.targetUserId, alvo.id, 'o alvo da concessão de poder não é o usuário provisionado');
  assert.equal(linha.reason, quemAutorizou, 'quem autorizou não chegou à trilha');
  assert.equal(linha.resultado, 'ALLOWED');
  assert.equal(linha.correlationId, correlacao, 'a correlação não permite ligar esta linha à operação');
  assert.equal(linha.escopo, 'GLOBAL', 'o poder é de plataforma: o escopo da trilha tem de dizer isso');

  // AUTORIA: o ator é o sistêmico, não o novo proprietário. Registrar o alvo
  // como ator afirmaria que ele se autoconcedeu poder pela aplicação, o que não
  // aconteceu — e falsear autoria numa trilha que existe para dizer quem criou
  // poder de plataforma é o pior defeito possível aqui.
  assert.equal(linha.actorUserId, ATOR_DO_BOOTSTRAP, 'a trilha atribuiu o ato a outra pessoa');
  assert.notEqual(linha.actorUserId, alvo.id, 'a trilha afirma que o próprio alvo se concedeu o poder');

  // NENHUM SEGREDO. A busca é pelo hash REAL daquele usuário, que existe no
  // banco — procurar pela palavra "senha" não provaria nada, porque ela nunca
  // estaria lá de todo modo.
  const tudo = [linha.action, linha.actorUserId, linha.targetUserId, linha.reason,
    linha.correlationId, linha.escopo, linha.organizationId, linha.eventId].join(' | ');
  assert.ok(!tudo.includes(alvo.hash), 'o hash de senha do usuário vazou para a trilha');
  assert.doesNotMatch(tudo, /passwordHash|tokenHash|pendingChallenge|publicKey/u);

  const [identidade] = await prisma.$queryRawUnsafe(
    `SELECT "provisionedByNote", "pendingChallenge" FROM "${schema}"."PlatformMasterIdentity" WHERE "userId" = '${alvo.id}'`,
  );
  assert.equal(identidade.provisionedByNote, quemAutorizou, 'a identidade não guarda quem autorizou');
  assert.ok(!identidade.provisionedByNote.includes(alvo.hash), 'o hash vazou para a nota da identidade');
  assert.equal(identidade.pendingChallenge, null, 'a identidade nasceu com desafio pendente: ela deve nascer SEM credencial');

  // Uma linha só: a operação aconteceu uma vez.
  assert.equal(await linhasDaTrilha(prisma, schema), 1);
});
