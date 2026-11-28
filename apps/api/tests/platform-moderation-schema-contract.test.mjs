import assert from 'node:assert/strict';
import test from 'node:test';
import { ACOES, ESTADOS, decidirModeracao } from '../src/platform-moderation-policy.ts';

/**
 * As duas CHECK de "PlatformEventModeration", copiadas da migration
 * 20261118170000_platform_event_moderation:
 *
 *   state = 'ATIVO' OR originalEventStatus IS NOT NULL
 *   state <> 'ATIVO' OR originalEventStatus IS NULL
 *
 * Se a política produzir um par que viole uma delas, a escrita falha em tempo
 * de execução — erro 500 numa ação de moderação, no pior momento possível.
 * Este arquivo existe para que isso falhe aqui, e não lá.
 */
const fotografiaObrigatoria = (linha) => linha.state === 'ATIVO' || linha.originalEventStatus !== null;
const ativoSemFotografia = (linha) => linha.state !== 'ATIVO' || linha.originalEventStatus === null;

/** Aplica o veredito à linha, como a transação faria. */
function aplicar(linha, veredito) {
  return {
    state: veredito.estadoNovo,
    originalEventStatus:
      veredito.statusOriginalNovo === undefined ? linha.originalEventStatus : veredito.statusOriginalNovo,
  };
}

const STATUS = ['DRAFT', 'PUBLISHED', 'READY_TO_PUBLISH'];

const pedido = (over) => ({
  ehMaster: true,
  atorUserId: 'usr_master',
  classificacao: 'VIOLACAO_DE_REGRA',
  motivo: 'Apuração concluída.',
  referenciaDoCaso: 'CASO-1',
  segundaAprovacaoPor: 'usr_segundo',
  permitirSemSuspensaoPrevia: true,
  ...over,
});

test('nenhuma transição permitida viola as CHECK do banco', () => {
  let permitidas = 0;
  for (const acao of ACOES) {
    for (const estadoAtual of ESTADOS) {
      for (const statusDoEvento of STATUS) {
        // Linha de partida coerente com o próprio banco: fora de ATIVO, a
        // fotografia existe; em ATIVO, não.
        for (const estadoAnterior of ['ATIVO', 'SUSPENSO']) {
          const linha = {
            state: estadoAtual,
            originalEventStatus: estadoAtual === 'ATIVO' ? null : 'PUBLISHED',
          };
          assert.ok(fotografiaObrigatoria(linha) && ativoSemFotografia(linha), 'a linha de partida já viola o banco');

          const veredito = decidirModeracao(pedido({
            acao, estadoAtual, statusDoEvento,
            statusOriginal: linha.originalEventStatus,
            estadoAnterior,
          }));
          if (!veredito.permitido) continue;
          permitidas += 1;

          const depois = aplicar(linha, veredito);
          assert.ok(fotografiaObrigatoria(depois),
            `${acao} de ${estadoAtual} deixou ${depois.state} sem fotografia: "liberar" não teria para onde voltar`);
          assert.ok(ativoSemFotografia(depois),
            `${acao} de ${estadoAtual} deixou ATIVO com fotografia residual`);
        }
      }
    }
  }
  assert.ok(permitidas >= 10, `só ${permitidas} transições permitidas: o laço não está exercitando o esperado`);
});

test('a CHECK de segunda aprovação concorda com a política', () => {
  // CHECK: action <> 'REMOVER' OR (approverUserId <> '' AND approverUserId <> actorUserId)
  const checkDoBanco = (acao, ator, aprovador) =>
    acao !== 'REMOVER' || (aprovador !== '' && aprovador !== ator);

  const permitido = decidirModeracao(pedido({
    acao: 'remover', estadoAtual: 'SUSPENSO', statusDoEvento: 'SUSPENDED', statusOriginal: 'PUBLISHED',
  }));
  assert.equal(permitido.permitido, true);
  assert.ok(checkDoBanco('REMOVER', 'usr_master', 'usr_segundo'));

  for (const aprovador of ['', 'usr_master']) {
    const d = decidirModeracao(pedido({
      acao: 'remover', estadoAtual: 'SUSPENSO', statusDoEvento: 'SUSPENDED',
      statusOriginal: 'PUBLISHED', segundaAprovacaoPor: aprovador,
    }));
    assert.equal(d.permitido, false, `a política aceitou aprovador "${aprovador}" que o banco recusaria`);
    assert.equal(checkDoBanco('REMOVER', 'usr_master', aprovador), false, 'a CHECK do banco deveria recusar também');
  }
});

test('o limite de 64 do ator cabe os identificadores que o sistema produz', () => {
  // Apontamento do Gemini nas threads 2 e 3 da #691: `actorUserId` era TEXT
  // enquanto `approverUserId`, na MESMA tabela, e `lastActorUserId`, na tabela
  // irmã, já eram VARCHAR(64). A inconsistência era real e foi corrigida.
  //
  // A JUSTIFICATIVA da revisão, porém, não se sustenta, e isso está medido em
  // PostgreSQL 16.15: `pg_column_size` do MESMO valor é IDÊNTICO em `text` e em
  // `varchar(64)` — 26 bytes para um cuid nos dois casos. VARCHAR(n) não
  // economiza armazenamento nem acelera índice no PostgreSQL; ele apenas impõe
  // um limite. A mudança vale pela consistência e pelo limite explícito, não
  // por desempenho, e registrar isso evita propagar a crença errada.
  //
  // E limite em coluna de TRILHA só é seguro se couber tudo o que o sistema
  // consegue produzir: uma linha de auditoria que falha por tamanho é pior que
  // uma coluna larga. Daí este caso existir.
  const LIMITE_DO_ATOR = 64;
  const identificadores = [
    'ckv9q8r2p0000abcd1234efgh', // cuid do Prisma
    'sistema:bootstrap-master',  // ator sistêmico de platform-master
  ];
  for (const id of identificadores) {
    assert.ok(id.length <= LIMITE_DO_ATOR,
      `"${id}" tem ${id.length} caracteres e não cabe em VARCHAR(${LIMITE_DO_ATOR}): a trilha falharia ao gravar`);
  }
  // Margem, e não limite raspado: se um identificador passar de metade, vale
  // reavaliar antes de a trilha começar a recusar escrita.
  const maior = Math.max(...identificadores.map((id) => id.length));
  assert.ok(maior * 2 <= LIMITE_DO_ATOR,
    `o maior identificador tem ${maior} caracteres, mais de metade de ${LIMITE_DO_ATOR}: a margem ficou apertada`);
});

test('o limite de coluna da migration cabe o que a política permite', () => {
  const d = decidirModeracao(pedido({
    acao: 'suspender', estadoAtual: 'ATIVO', statusDoEvento: 'PUBLISHED',
    motivo: 'm'.repeat(200), referenciaDoCaso: 'r'.repeat(64),
  }));
  assert.equal(d.permitido, true);
  assert.ok(d.motivoTexto.length <= 200, 'reason é VARCHAR(200)');
  assert.ok(d.referencia.length <= 64, 'caseRef é VARCHAR(64)');
  for (const status of ['DRAFT', 'READY_TO_PUBLISH', 'HOMOLOGATION', 'PUBLISHED', 'CANCELLED', 'FINISHED', 'SUSPENDED']) {
    assert.ok(status.length <= 32, `${status} não cabe em VARCHAR(32)`);
  }
});
