// O ciclo de vida encerrado não é apagado por moderação.
//
// Decisão de produto em #691/7011426019 e correção pedida em #691/7012008651:
// evento `FINISHED` ou `CANCELLED` pode ser moderado com motivo e auditoria, e
// precisa continuar constando como encerrado ANTES, DURANTE e DEPOIS. A
// restrição administrativa vem da linha de moderação.
//
// O defeito que estes casos fixam era meu, e de um tipo específico: o corpo da
// #691 já declarava que "suspensão pela plataforma não é cancelamento pelo
// organizador" e que por isso o estado vive em tabela separada — e o código
// gravava `Event.status = SUSPENDED` em cima de `FINISHED`. A fotografia
// garantia a volta, mas durante a investigação o histórico deixava de ser fiel,
// que é exatamente quando ele importa.
//
// A varredura de ida-e-volta em `platform-moderation-transaction.test.mjs`
// cobre `FINISHED` e `CANCELLED`, e segue verde porque alimenta `SUSPENDED`
// como status atual na volta. Fica o registro de que, nessas duas pontas, ela
// passa a modelar um estado que não é mais alcançável: o caminho real está
// aqui.
import assert from 'node:assert/strict';
import test from 'node:test';
import { ACOES, decidirModeracao } from '../src/platform-moderation-policy.ts';
import {
  STATUS_TERMINAIS,
  aplicarPlano,
  planejarGravacao,
  statusTerminal,
} from '../src/platform-moderation-transaction.ts';

const pedido = (extra = {}) => ({
  acao: 'suspender',
  estadoAtual: 'ATIVO',
  statusDoEvento: 'FINISHED',
  ehMaster: true,
  atorUserId: 'master-1',
  classificacao: 'VIOLACAO_DE_REGRA',
  motivo: 'Denúncia confirmada sobre evento encerrado.',
  referenciaDoCaso: 'CASO-2026-010',
  ...extra,
});

const entrada = (extra = {}) => ({
  eventId: 'evt-terminal',
  organizationId: 'org-1',
  acao: 'suspender',
  classificacao: 'VIOLACAO_DE_REGRA',
  linhaAtual: null,
  statusDoEvento: 'FINISHED',
  atorUserId: 'master-1',
  correlationId: 'corr-terminal',
  ...extra,
});

/** Cliente transacional de mentira: registra a ORDEM das escritas. */
function clienteFalso() {
  const chamadas = [];
  const registrar = (nome) => async (args) => {
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

test('o conjunto terminal é exatamente FINISHED e CANCELLED', () => {
  assert.deepEqual([...STATUS_TERMINAIS], ['FINISHED', 'CANCELLED']);
  assert.equal(statusTerminal('FINISHED'), true);
  assert.equal(statusTerminal('CANCELLED'), true);
  for (const vivo of ['DRAFT', 'SETUP', 'HOMOLOGATION', 'READY_TO_PUBLISH', 'PUBLISHED', 'SUSPENDED']) {
    assert.equal(statusTerminal(vivo), false, vivo);
  }
});

for (const status of STATUS_TERMINAIS) {
  test(`suspender evento ${status} NÃO altera Event.status, e a trilha diz isso`, () => {
    const veredito = decidirModeracao(pedido({ statusDoEvento: status }));
    assert.equal(veredito.permitido, true, 'moderar evento terminal é permitido pela decisão de produto');
    assert.equal(veredito.statusDoEventoNovo, 'SUSPENDED', 'a política segue pedindo SUSPENDED');

    const plano = planejarGravacao(entrada({ veredito, statusDoEvento: status }));

    assert.equal(plano.gravar, true);
    assert.equal(plano.statusDoEventoNovo, null, `${status} seria sobrescrito por SUSPENDED`);
    assert.equal(plano.statusPreservadoPorSerTerminal, true, 'a supressão precisa ser afirmada, não inferida de um null');

    // A restrição existe — só não mora no status do evento.
    assert.equal(plano.moderacao.state, 'SUSPENSO');
    assert.equal(plano.linhaResultante.originalEventStatus, status);

    // E a trilha registra o que de fato houve: nada mudou no ciclo de vida.
    assert.equal(plano.trilha.eventStatusBefore, status);
    assert.equal(plano.trilha.eventStatusAfter, status);
  });
}

test('as quatro ações preservam o status terminal, em todas as partidas alcançáveis', () => {
  const partidas = [
    { estadoAtual: 'ATIVO', linha: null },
    { estadoAtual: 'SUSPENSO', linha: (s) => ({ state: 'SUSPENSO', originalEventStatus: s }) },
    { estadoAtual: 'REMOVIDO', linha: (s) => ({ state: 'REMOVIDO', previousState: 'SUSPENSO', originalEventStatus: s }) },
    { estadoAtual: 'REMOVIDO', linha: (s) => ({ state: 'REMOVIDO', previousState: 'ATIVO', originalEventStatus: s }) },
  ];

  let permitidas = 0;
  for (const status of STATUS_TERMINAIS) {
    for (const { estadoAtual, linha: montar } of partidas) {
      const linha = typeof montar === 'function' ? montar(status) : montar;
      for (const acao of ACOES) {
        const veredito = decidirModeracao(pedido({
          acao,
          estadoAtual,
          // O status do evento é o terminal em TODAS as partidas: é justamente
          // isso que a correção garante, e por isso o cenário é montado assim.
          statusDoEvento: status,
          statusOriginal: linha?.originalEventStatus ?? null,
          estadoAnterior: linha?.previousState ?? null,
          permitirSemSuspensaoPrevia: true,
          segundaAprovacaoPor: 'master-2',
        }));
        if (!veredito.permitido) continue;
        permitidas += 1;

        const plano = planejarGravacao(entrada({
          acao, veredito, linhaAtual: linha, statusDoEvento: status,
          segundaAprovacaoPor: 'master-2',
        }));
        assert.equal(plano.gravar, true, `${status}/${estadoAtual} -> ${acao}: ${plano.motivo}`);
        assert.equal(
          plano.statusDoEventoNovo, null,
          `${status}/${estadoAtual} -> ${acao} escreveria Event.status`,
        );
        assert.equal(
          plano.trilha.eventStatusAfter, status,
          `${status}/${estadoAtual} -> ${acao}: a trilha afirmaria outro status`,
        );
      }
    }
  }
  assert.ok(permitidas >= 8, `só ${permitidas} transições permitidas: a varredura não cobriu o esperado`);
});

test('liberar evento terminal apaga a fotografia e NÃO reabre nada', () => {
  // O ponto da decisão de produto: liberar/restaurar nunca reabre publicação,
  // inscrição nem cobrança — porque não há status para reabrir. Nada foi
  // fechado por moderação.
  const veredito = decidirModeracao(pedido({
    acao: 'liberar', estadoAtual: 'SUSPENSO',
    statusOriginal: 'FINISHED', statusDoEvento: 'FINISHED',
  }));
  const plano = planejarGravacao(entrada({
    acao: 'liberar', veredito, statusDoEvento: 'FINISHED',
    linhaAtual: { state: 'SUSPENSO', originalEventStatus: 'FINISHED' },
  }));

  assert.equal(plano.gravar, true);
  assert.equal(plano.moderacao.state, 'ATIVO');
  assert.equal(plano.linhaResultante.originalEventStatus, null, 'fotografia residual em ATIVO viola a CHECK');
  assert.equal(plano.statusDoEventoNovo, null, 'liberar escreveria FINISHED de volta por cima de FINISHED');
  assert.equal(plano.trilha.eventStatusAfter, 'FINISHED');
});

test('em evento terminal, aplicarPlano faz DUAS escritas e não toca Event', async () => {
  const veredito = decidirModeracao(pedido({ statusDoEvento: 'CANCELLED' }));
  const plano = planejarGravacao(entrada({ veredito, statusDoEvento: 'CANCELLED' }));
  const { tx, chamadas } = clienteFalso();

  await aplicarPlano(tx, plano);

  assert.deepEqual(
    chamadas.map((c) => c.nome), ['moderacao', 'trilha'],
    'houve update em Event: o evento deixaria de constar como cancelado durante a moderação',
  );
  assert.equal(chamadas[0].args.create.originalEventStatus, 'CANCELLED');
});

test('CONTROLE POSITIVO: evento PUBLISHED continua indo para SUSPENDED', async () => {
  // Sem este caso, a suíte passaria por eu ter desligado a mudança de status
  // inteira em vez de restringi-la aos estados terminais — e aí a suspensão de
  // um evento no ar deixaria de ter efeito no ciclo de vida.
  const veredito = decidirModeracao(pedido({ statusDoEvento: 'PUBLISHED' }));
  const plano = planejarGravacao(entrada({ veredito, statusDoEvento: 'PUBLISHED' }));

  assert.equal(plano.statusDoEventoNovo, 'SUSPENDED', 'a regra terminal vazou para um evento no ar');
  assert.equal(plano.statusPreservadoPorSerTerminal, false);
  assert.equal(plano.trilha.eventStatusAfter, 'SUSPENDED');

  const { tx, chamadas } = clienteFalso();
  await aplicarPlano(tx, plano);
  assert.deepEqual(chamadas.map((c) => c.nome), ['moderacao', 'evento', 'trilha']);
  assert.equal(chamadas[1].args.data.status, 'SUSPENDED');
});

test('a flag não liga quando a política já não queria mudar o status', () => {
  // Precisão do campo: "preservado por ser terminal" tem de significar que uma
  // mudança PRETENDIDA foi suprimida. Ligar a flag quando não havia mudança
  // nenhuma mentiria para quem auditar.
  const veredito = {
    permitido: true, motivo: null, idempotente: false,
    estadoNovo: 'SUSPENSO', statusDoEventoNovo: null,
    statusOriginalNovo: 'FINISHED', motivoTexto: 'x', referencia: 'y',
  };
  const plano = planejarGravacao(entrada({ veredito, statusDoEvento: 'FINISHED' }));

  assert.equal(plano.gravar, true);
  assert.equal(plano.statusDoEventoNovo, null);
  assert.equal(plano.statusPreservadoPorSerTerminal, false, 'nada foi suprimido: não havia mudança pretendida');
});
