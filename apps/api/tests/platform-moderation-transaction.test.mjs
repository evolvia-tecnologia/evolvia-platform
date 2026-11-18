import assert from 'node:assert/strict';
import test from 'node:test';
import { ACOES, decidirModeracao } from '../src/platform-moderation-policy.ts';
import {
  LIMITE_DA_CORRELACAO,
  LIMITE_DO_STATUS,
  ModeracaoNaoGravavelError,
  acaoNoBanco,
  aplicarPlano,
  planejarGravacao,
} from '../src/platform-moderation-transaction.ts';

const STATUS_DO_EVENTO = ['DRAFT', 'SETUP', 'HOMOLOGATION', 'READY_TO_PUBLISH', 'PUBLISHED', 'FINISHED', 'CANCELLED'];

const pedido = (extra = {}) => ({
  acao: 'suspender',
  estadoAtual: 'ATIVO',
  statusDoEvento: 'PUBLISHED',
  ehMaster: true,
  atorUserId: 'master-1',
  classificacao: 'VIOLACAO_DE_REGRA',
  motivo: 'Denúncia confirmada.',
  referenciaDoCaso: 'CASO-2026-001',
  ...extra,
});

const entrada = (extra = {}) => ({
  eventId: 'evt-1',
  organizationId: 'org-1',
  acao: 'suspender',
  classificacao: 'VIOLACAO_DE_REGRA',
  linhaAtual: null,
  statusDoEvento: 'PUBLISHED',
  atorUserId: 'master-1',
  correlationId: 'corr-1',
  ...extra,
});

/** Cliente transacional de mentira: registra a ORDEM das escritas. */
function clienteFalso(falharEm = '') {
  const chamadas = [];
  const registrar = (nome) => async (args) => {
    if (falharEm === nome) throw new Error(`falha injetada em ${nome}`);
    chamadas.push({ nome, args });
    return {};
  };
  return {
    chamadas,
    tx: {
      platformEventModeration: { upsert: registrar('moderacao') },
      platformEventModerationEvent: { create: registrar('trilha') },
      event: { update: registrar('evento') },
    },
  };
}

// --- nomeação da ação -------------------------------------------------------

test('toda ação da política tem equivalente no banco, e só elas', () => {
  for (const acao of ACOES) {
    assert.equal(typeof acaoNoBanco(acao), 'string', acao);
    assert.equal(acaoNoBanco(acao), acao.toUpperCase());
  }
  assert.equal(acaoNoBanco('banir'), null);
  assert.equal(acaoNoBanco(''), null);
  assert.equal(acaoNoBanco(null), null);
  // Herdado de Object.prototype não é ação: sem hasOwnProperty isto viraria função.
  assert.equal(acaoNoBanco('toString'), null);
  assert.equal(acaoNoBanco('constructor'), null);
});

// --- o que NÃO vira escrita -------------------------------------------------

test('veredito recusado não produz escrita alguma', () => {
  const veredito = decidirModeracao(pedido({ ehMaster: false }));
  assert.equal(veredito.permitido, false);
  const plano = planejarGravacao(entrada({ veredito }));
  assert.equal(plano.gravar, false);
  assert.equal(plano.motivo, 'veredito_nao_permitido');
  assert.equal(plano.moderacao, null);
  assert.equal(plano.trilha, null);
});

test('veredito idempotente não vira trilha, e se distingue de recusa', () => {
  // Liberar evento que já está ATIVO: nada a fazer, e não é erro. Gravar uma
  // linha de trilha aqui inventaria uma mudança de estado que não houve.
  const veredito = decidirModeracao(pedido({ acao: 'liberar', estadoAtual: 'ATIVO' }));
  assert.equal(veredito.idempotente, true);
  const plano = planejarGravacao(entrada({ acao: 'liberar', veredito }));
  assert.equal(plano.gravar, false);
  assert.equal(plano.motivo, 'nada_a_fazer');
  assert.equal(plano.trilha, null);
});

test('aplicarPlano recusa plano não gravável em vez de escrever parcialmente', async () => {
  const veredito = decidirModeracao(pedido({ ehMaster: false }));
  const plano = planejarGravacao(entrada({ veredito }));
  const { tx, chamadas } = clienteFalso();
  await assert.rejects(() => aplicarPlano(tx, plano), ModeracaoNaoGravavelError);
  assert.equal(chamadas.length, 0, 'houve escrita a partir de um plano recusado');
});

// --- as duas CHECK, conferidas antes de qualquer escrita --------------------

test('estado fora de ATIVO sem fotografia é recusado aqui, não pelo PostgreSQL', () => {
  // Veredito forjado: a política não produz isto, mas um caminho futuro pode.
  const veredito = {
    permitido: true, motivo: null, idempotente: false,
    estadoNovo: 'SUSPENSO', statusDoEventoNovo: 'SUSPENDED',
    statusOriginalNovo: null, motivoTexto: 'x', referencia: 'y',
  };
  const plano = planejarGravacao(entrada({ veredito }));
  assert.equal(plano.gravar, false);
  assert.equal(plano.motivo, 'fotografia_ausente_fora_de_ativo');
});

test('fotografia residual em ATIVO é recusada aqui, não pelo PostgreSQL', () => {
  const veredito = {
    permitido: true, motivo: null, idempotente: false,
    estadoNovo: 'ATIVO', statusDoEventoNovo: 'PUBLISHED',
    statusOriginalNovo: undefined, motivoTexto: 'x', referencia: 'y',
  };
  const plano = planejarGravacao(entrada({
    acao: 'liberar', veredito,
    linhaAtual: { state: 'SUSPENSO', originalEventStatus: 'PUBLISHED' },
  }));
  assert.equal(plano.gravar, false);
  assert.equal(plano.motivo, 'fotografia_residual_em_ativo');
});

test('toda transição permitida pela política gera linha que satisfaz as duas CHECK', () => {
  const partidas = [
    { estadoAtual: 'ATIVO', linha: null },
    { estadoAtual: 'SUSPENSO', linha: { state: 'SUSPENSO', originalEventStatus: 'PUBLISHED' } },
    { estadoAtual: 'REMOVIDO', linha: { state: 'REMOVIDO', previousState: 'SUSPENSO', originalEventStatus: 'PUBLISHED' } },
    { estadoAtual: 'REMOVIDO', linha: { state: 'REMOVIDO', previousState: 'ATIVO', originalEventStatus: 'DRAFT' } },
  ];
  let permitidas = 0;
  for (const { estadoAtual, linha } of partidas) {
    for (const acao of ACOES) {
      const veredito = decidirModeracao(pedido({
        acao, estadoAtual,
        statusOriginal: linha?.originalEventStatus ?? null,
        estadoAnterior: linha?.previousState ?? null,
        statusDoEvento: estadoAtual === 'ATIVO' ? 'PUBLISHED' : 'SUSPENDED',
        permitirSemSuspensaoPrevia: true,
        segundaAprovacaoPor: 'master-2',
      }));
      if (!veredito.permitido) continue;
      permitidas += 1;
      const plano = planejarGravacao(entrada({
        acao, veredito, linhaAtual: linha,
        statusDoEvento: estadoAtual === 'ATIVO' ? 'PUBLISHED' : 'SUSPENDED',
        segundaAprovacaoPor: 'master-2',
      }));
      assert.equal(plano.gravar, true, `${estadoAtual} -> ${acao}: ${plano.motivo}`);
      const { state, originalEventStatus } = plano.linhaResultante;
      if (state === 'ATIVO') {
        assert.equal(originalEventStatus, null, `${estadoAtual} -> ${acao}: fotografia residual em ATIVO`);
      } else {
        assert.notEqual(originalEventStatus, null, `${estadoAtual} -> ${acao}: fotografia ausente fora de ATIVO`);
      }
    }
  }
  assert.ok(permitidas >= 6, `só ${permitidas} transições permitidas: a varredura não cobriu o esperado`);
});

// --- a propriedade que impede publicar o que nunca foi publicado ------------

test('ida e volta pelo plano devolve o status EXATO, para todo status possível', () => {
  for (const status of STATUS_DO_EVENTO) {
    const suspender = decidirModeracao(pedido({ statusDoEvento: status }));
    const planoIda = planejarGravacao(entrada({ veredito: suspender, statusDoEvento: status }));
    assert.equal(planoIda.gravar, true, status);
    assert.equal(planoIda.linhaResultante.originalEventStatus, status);

    const liberar = decidirModeracao(pedido({
      acao: 'liberar', estadoAtual: 'SUSPENSO',
      statusOriginal: planoIda.linhaResultante.originalEventStatus,
      statusDoEvento: 'SUSPENDED',
    }));
    const planoVolta = planejarGravacao(entrada({
      acao: 'liberar', veredito: liberar, statusDoEvento: 'SUSPENDED',
      linhaAtual: planoIda.linhaResultante,
    }));
    assert.equal(planoVolta.gravar, true, status);
    assert.equal(planoVolta.statusDoEventoNovo, status, `${status} não voltou idêntico`);
    assert.equal(planoVolta.trilha.eventStatusAfter, status);
    assert.equal(planoVolta.linhaResultante.originalEventStatus, null);
  }
});

// --- preservar x apagar a fotografia ---------------------------------------

test('preservar a fotografia OMITE a coluna no update, em vez de mandar nulo', () => {
  // Remover vindo de SUSPENSO preserva o original. Mandar `null` apagaria a
  // fotografia e a restauração perderia para onde voltar.
  const veredito = decidirModeracao(pedido({
    acao: 'remover', estadoAtual: 'SUSPENSO', statusOriginal: 'PUBLISHED',
    statusDoEvento: 'SUSPENDED', segundaAprovacaoPor: 'master-2',
  }));
  assert.equal(veredito.statusOriginalNovo, undefined);
  const plano = planejarGravacao(entrada({
    acao: 'remover', veredito, statusDoEvento: 'SUSPENDED',
    linhaAtual: { state: 'SUSPENSO', originalEventStatus: 'PUBLISHED' },
    segundaAprovacaoPor: 'master-2',
  }));
  assert.equal(plano.gravar, true);
  assert.equal(Object.prototype.hasOwnProperty.call(plano.moderacao, 'originalEventStatus'), false,
    'o update mandaria originalEventStatus e sobrescreveria a fotografia preservada');
  assert.equal(plano.linhaResultante.originalEventStatus, 'PUBLISHED');
  assert.equal(plano.trilha.originalEventStatus, 'PUBLISHED');
});

test('liberar apaga a fotografia explicitamente', () => {
  const veredito = decidirModeracao(pedido({
    acao: 'liberar', estadoAtual: 'SUSPENSO', statusOriginal: 'DRAFT', statusDoEvento: 'SUSPENDED',
  }));
  const plano = planejarGravacao(entrada({
    acao: 'liberar', veredito, statusDoEvento: 'SUSPENDED',
    linhaAtual: { state: 'SUSPENSO', originalEventStatus: 'DRAFT' },
  }));
  assert.equal(plano.moderacao.originalEventStatus, null);
  assert.equal(plano.linhaResultante.originalEventStatus, null);
});

// --- previousState ----------------------------------------------------------

test('previousState é guardado ao entrar em REMOVIDO e limpo ao sair', () => {
  const remover = decidirModeracao(pedido({
    acao: 'remover', estadoAtual: 'SUSPENSO', statusOriginal: 'PUBLISHED',
    statusDoEvento: 'SUSPENDED', segundaAprovacaoPor: 'master-2',
  }));
  const planoRemover = planejarGravacao(entrada({
    acao: 'remover', veredito: remover, statusDoEvento: 'SUSPENDED',
    linhaAtual: { state: 'SUSPENSO', originalEventStatus: 'PUBLISHED' },
    segundaAprovacaoPor: 'master-2',
  }));
  assert.equal(planoRemover.moderacao.previousState, 'SUSPENSO');

  const restaurar = decidirModeracao(pedido({
    acao: 'restaurar', estadoAtual: 'REMOVIDO', estadoAnterior: 'SUSPENSO',
    statusOriginal: 'PUBLISHED', statusDoEvento: 'SUSPENDED',
  }));
  const planoRestaurar = planejarGravacao(entrada({
    acao: 'restaurar', veredito: restaurar, statusDoEvento: 'SUSPENDED',
    linhaAtual: planoRemover.linhaResultante,
  }));
  assert.equal(planoRestaurar.moderacao.previousState, null,
    'sair de REMOVIDO sem limpar previousState faria uma remoção futura herdar o anterior de outra');
});

// --- trilha fiel ao que foi escrito ----------------------------------------

test('a trilha registra o antes e o depois do status, sem inferir', () => {
  const veredito = decidirModeracao(pedido({ statusDoEvento: 'READY_TO_PUBLISH' }));
  const plano = planejarGravacao(entrada({ veredito, statusDoEvento: 'READY_TO_PUBLISH' }));
  assert.equal(plano.trilha.eventStatusBefore, 'READY_TO_PUBLISH');
  assert.equal(plano.trilha.eventStatusAfter, 'SUSPENDED');
  assert.equal(plano.trilha.fromState, 'ATIVO');
  assert.equal(plano.trilha.toState, 'SUSPENSO');
});

test('sem mudança de status, o depois é igual ao antes', () => {
  const veredito = {
    permitido: true, motivo: null, idempotente: false,
    estadoNovo: 'SUSPENSO', statusDoEventoNovo: null,
    statusOriginalNovo: 'PUBLISHED', motivoTexto: 'x', referencia: 'y',
  };
  const plano = planejarGravacao(entrada({ veredito, statusDoEvento: 'PUBLISHED' }));
  assert.equal(plano.gravar, true);
  assert.equal(plano.statusDoEventoNovo, null);
  assert.equal(plano.trilha.eventStatusAfter, 'PUBLISHED');
  assert.equal(plano.trilha.eventStatusBefore, 'PUBLISHED');
});

// --- obrigatórios e limites -------------------------------------------------

test('correlação, evento, organização e status de partida são obrigatórios', () => {
  const veredito = decidirModeracao(pedido());
  const casos = [
    [{ correlationId: '' }, 'correlacao_obrigatoria'],
    [{ correlationId: '   ' }, 'correlacao_obrigatoria'],
    [{ correlationId: 'c'.repeat(LIMITE_DA_CORRELACAO + 1) }, 'correlacao_muito_longa'],
    [{ eventId: '' }, 'evento_obrigatorio'],
    [{ organizationId: '' }, 'organizacao_obrigatoria'],
    [{ statusDoEvento: '' }, 'status_anterior_obrigatorio'],
    [{ statusDoEvento: 'S'.repeat(LIMITE_DO_STATUS + 1) }, 'status_muito_longo'],
    [{ acao: 'banir' }, 'acao_sem_equivalente_no_banco'],
  ];
  for (const [extra, esperado] of casos) {
    const plano = planejarGravacao(entrada({ veredito, ...extra }));
    assert.equal(plano.gravar, false, JSON.stringify(extra));
    assert.equal(plano.motivo, esperado, JSON.stringify(extra));
  }
});

// --- ordem e atomicidade ----------------------------------------------------

test('aplicarPlano escreve estado, depois status do evento, depois trilha', async () => {
  const veredito = decidirModeracao(pedido());
  const plano = planejarGravacao(entrada({ veredito }));
  const { tx, chamadas } = clienteFalso();
  await aplicarPlano(tx, plano);
  assert.deepEqual(chamadas.map((c) => c.nome), ['moderacao', 'evento', 'trilha'],
    'a trilha descreve o que as outras duas fizeram: escrevê-la antes registraria fato não ocorrido');
  assert.equal(chamadas[0].args.where.eventId, 'evt-1');
  assert.equal(chamadas[1].args.data.status, 'SUSPENDED');
  assert.equal(chamadas[2].args.data.correlationId, 'corr-1');
});

test('falha ao mudar o status do evento impede a trilha de registrar o que não houve', async () => {
  const veredito = decidirModeracao(pedido());
  const plano = planejarGravacao(entrada({ veredito }));
  const { tx, chamadas } = clienteFalso('evento');
  await assert.rejects(() => aplicarPlano(tx, plano), /falha injetada/);
  assert.deepEqual(chamadas.map((c) => c.nome), ['moderacao'],
    'a trilha foi escrita apesar de a mudança de status ter falhado');
});

test('a criação da linha nunca deixa a fotografia implícita', async () => {
  const veredito = decidirModeracao(pedido({ statusDoEvento: 'DRAFT' }));
  const plano = planejarGravacao(entrada({ veredito, statusDoEvento: 'DRAFT' }));
  const { tx, chamadas } = clienteFalso();
  await aplicarPlano(tx, plano);
  const upsert = chamadas[0].args;
  assert.equal(upsert.create.originalEventStatus, 'DRAFT',
    'sem linha anterior não há o que preservar, e a CHECK exige valor fora de ATIVO');
  assert.equal(upsert.create.eventId, 'evt-1');
  assert.equal(upsert.create.organizationId, 'org-1');
});

// Este caso existe por causa de uma medição contra PostgreSQL 16 real, e não por
// simetria: o banco avalia as CHECK sobre a tupla do INSERT ANTES de arbitrar o
// conflito do upsert. Logo, no caminho que PRESERVA a fotografia — remover vindo
// de SUSPENSO, em que o payload de update a omite de propósito —, o ramo `create`
// precisa carregá-la mesmo sabendo que o conflito vai acontecer. Sem ela o
// PostgreSQL recusa com "fotografia_obrigatoria" e a remoção não grava.
//
// Nenhum teste com cliente falso enxerga isso, porque cliente falso não avalia
// constraint. Eu havia classificado essa linha como mutante equivalente; era
// engano meu, desfeito pela execução contra banco.
test('o create carrega a fotografia mesmo quando o update a preserva por omissão', async () => {
  const veredito = decidirModeracao(pedido({
    acao: 'remover', estadoAtual: 'SUSPENSO', statusOriginal: 'PUBLISHED',
    statusDoEvento: 'SUSPENDED', segundaAprovacaoPor: 'master-2',
  }));
  const plano = planejarGravacao(entrada({
    acao: 'remover', veredito, statusDoEvento: 'SUSPENDED',
    linhaAtual: { state: 'SUSPENSO', originalEventStatus: 'PUBLISHED' },
    segundaAprovacaoPor: 'master-2',
  }));
  const { tx, chamadas } = clienteFalso();
  await aplicarPlano(tx, plano);
  const upsert = chamadas[0].args;

  assert.equal(Object.prototype.hasOwnProperty.call(upsert.update, 'originalEventStatus'), false,
    'o update deixou de preservar: mandar a coluna aqui sobrescreveria a fotografia');
  assert.equal(upsert.create.originalEventStatus, 'PUBLISHED',
    'sem a fotografia no create, o INSERT do upsert viola a CHECK no PostgreSQL antes de detectar o conflito');
});
