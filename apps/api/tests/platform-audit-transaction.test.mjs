import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AuditoriaInvalida, LIMITE_ACAO, LIMITE_ID, LIMITE_MOTIVO, MudancaRevertida,
  executarAuditado, montarRegistro, registrarRecusa,
} from '../src/platform-audit-transaction.ts';

const DADOS = {
  actorUserId: 'usr-rosberg',
  action: 'suspender_evento',
  scopeKind: 'EVENTO',
  eventId: 'evt-sintetico-1',
  organizationId: 'org-sintetica-1',
  targetUserId: '',
  reason: 'Denúncia de conteúdo verificada pela equipe de moderação.',
  correlationId: 'corr-0001',
};

/**
 * Transação falsa com a semântica que importa: o que a função escreveu só
 * passa para o comitado se ela resolver. Se rejeitar, o rascunho é jogado
 * fora — que é o que o PostgreSQL faz, e é a única forma de eu afirmar
 * "a mudança foi revertida" sem ter banco nesta sessão.
 */
function bancoFalso({ auditoriaFalha = false, soltaFalha = false, mudancaFalha = false } = {}) {
  const comitado = { mudancas: [], auditorias: [] };
  const soltas = [];
  const ordem = [];
  const banco = {
    comitado, soltas, ordem,
    transacoesAbertas: 0,
    async emTransacao(fn) {
      banco.transacoesAbertas += 1;
      const rascunho = { mudancas: [], auditorias: [] };
      const tx = {
        // `cliente` é o cliente transacional: a mudança TEM de passar por ele,
        // senão não participa do rollback. O teste espelha a forma real.
        cliente: { anotar(m) { ordem.push('mudanca'); rascunho.mudancas.push(m); } },
        async gravarAuditoria(r) {
          ordem.push('auditoria');
          if (auditoriaFalha) throw new Error('unique constraint na auditoria');
          rascunho.auditorias.push(r);
        },
      };
      const resultado = await fn(tx);
      comitado.mudancas.push(...rascunho.mudancas);
      comitado.auditorias.push(...rascunho.auditorias);
      return resultado;
    },
    async gravarAuditoriaSolta(r) {
      ordem.push('solta');
      if (soltaFalha) throw new Error('a gravação solta também falhou');
      soltas.push(r);
    },
  };
  banco.mudanca = async (tx) => {
    if (mudancaFalha) throw new Error('evento já estava suspenso');
    tx.cliente.anotar({ suspenso: true });
    return 'pronto';
  };
  return banco;
}

// ------------------------------------------------------------------- sucesso

test('sucesso: a mudança e a auditoria ALLOWED são comitadas juntas', async () => {
  const b = bancoFalso();
  const r = await executarAuditado(b, DADOS, b.mudanca);
  assert.equal(r, 'pronto');
  assert.equal(b.comitado.mudancas.length, 1);
  assert.equal(b.comitado.auditorias.length, 1);
  assert.equal(b.comitado.auditorias[0].result, 'ALLOWED');
  assert.equal(b.soltas.length, 0, 'sucesso não grava nada fora da transação');
});

test('a mudança vem antes da auditoria, porque é a auditoria que afirma o resultado', async () => {
  const b = bancoFalso();
  await executarAuditado(b, DADOS, b.mudanca);
  assert.deepEqual(b.ordem, ['mudanca', 'auditoria']);
});

// --------------------------------------- a garantia decidida pelo proprietário

test('auditoria falha: a mudança privilegiada é revertida', async () => {
  const b = bancoFalso({ auditoriaFalha: true });
  await assert.rejects(() => executarAuditado(b, DADOS, b.mudanca), MudancaRevertida);
  assert.equal(b.comitado.mudancas.length, 0, 'a mudança NÃO pode ter sido comitada');
  assert.equal(b.comitado.auditorias.length, 0);
});

test('auditoria falha: o chamador sabe que foi a auditoria, não a mudança', async () => {
  const b = bancoFalso({ auditoriaFalha: true });
  const erro = await executarAuditado(b, DADOS, b.mudanca).catch((e) => e);
  assert.ok(erro instanceof MudancaRevertida);
  assert.equal(erro.tipo, 'AUDITORIA');
  assert.match(erro.message, /desfeita porque a auditoria/);
  assert.equal(erro.causa.message, 'unique constraint na auditoria');
});

test('auditoria falha: a tentativa não desaparece — FAILED é gravado FORA da transação', async () => {
  const b = bancoFalso({ auditoriaFalha: true });
  await executarAuditado(b, DADOS, b.mudanca).catch(() => {});
  assert.equal(b.soltas.length, 1);
  assert.equal(b.soltas[0].result, 'FAILED');
  assert.equal(b.soltas[0].changes.falha, 'AUDITORIA');
  // Se o FAILED fosse gravado dentro da transação, viria aqui — e teria sido
  // revertido junto, deixando a tentativa invisível.
  assert.equal(b.comitado.auditorias.length, 0);
});

test('a mudança falha: nada é comitado e o FAILED registra que foi a mudança', async () => {
  const b = bancoFalso({ mudancaFalha: true });
  const erro = await executarAuditado(b, DADOS, b.mudanca).catch((e) => e);
  assert.ok(erro instanceof MudancaRevertida);
  assert.equal(erro.tipo, 'MUDANCA');
  assert.equal(erro.causa.message, 'evento já estava suspenso');
  assert.equal(b.comitado.mudancas.length, 0);
  assert.equal(b.comitado.auditorias.length, 0);
  assert.equal(b.soltas.length, 1);
  assert.equal(b.soltas[0].result, 'FAILED');
  assert.equal(b.soltas[0].changes.falha, 'MUDANCA');
});

test('se a gravação solta também falhar, o erro original é o que sobe', async () => {
  const b = bancoFalso({ auditoriaFalha: true, soltaFalha: true });
  const erro = await executarAuditado(b, DADOS, b.mudanca).catch((e) => e);
  assert.ok(erro instanceof MudancaRevertida, 'não troca a falha por outra');
  assert.equal(erro.tipo, 'AUDITORIA');
  assert.equal(erro.causa.message, 'unique constraint na auditoria');
  assert.equal(b.comitado.mudancas.length, 0, 'e a reversão continua valendo');
});

test('o detalhe do erro entra no FAILED sem stack e com tamanho limitado', async () => {
  const b = bancoFalso();
  b.mudanca = async () => { throw new Error('x'.repeat(500)); };
  await executarAuditado(b, DADOS, b.mudanca).catch(() => {});
  const detalhe = b.soltas[0].changes.detalhe;
  assert.ok(detalhe.length <= 180, `detalhe com ${detalhe.length}`);
  assert.ok(detalhe.endsWith('…'));
  assert.ok(!/\n|at Object|\.ts:/.test(detalhe), 'não vaza stack');
});

// ------------------------------------------------------------------- recusa

test('recusa é gravada fora de transação e persiste', async () => {
  const b = bancoFalso();
  await registrarRecusa(b, { ...DADOS, action: 'suspender_evento:recusada' });
  assert.equal(b.soltas.length, 1);
  assert.equal(b.soltas[0].result, 'DENIED');
  assert.equal(b.transacoesAbertas, 0, 'negar não precisa de transação, e não pode ser revertido');
});

// ------------------------------------------------------- montagem do registro

test('registro inválido não chega a abrir transação', async () => {
  const b = bancoFalso();
  await assert.rejects(
    () => executarAuditado(b, { ...DADOS, reason: '   ' }, b.mudanca),
    AuditoriaInvalida,
  );
  assert.equal(b.transacoesAbertas, 0);
  assert.equal(b.soltas.length, 0);
});

test('auditoria sem motivo não serve para nada e é recusada', () => {
  for (const vazio of ['', '   ', '\n\t ']) {
    assert.throws(() => montarRegistro({ ...DADOS, reason: vazio }, 'ALLOWED'), AuditoriaInvalida);
  }
});

test('motivo é guardado sem espaços nas pontas', () => {
  const r = montarRegistro({ ...DADOS, reason: '  Motivo com espaços.  ' }, 'ALLOWED');
  assert.equal(r.reason, 'Motivo com espaços.');
});

test('motivo longo é cortado com marca visível, no limite exato do schema', () => {
  const r = montarRegistro({ ...DADOS, reason: 'a'.repeat(LIMITE_MOTIVO + 50) }, 'ALLOWED');
  assert.equal(r.reason.length, LIMITE_MOTIVO);
  assert.ok(r.reason.endsWith('…'), 'o corte tem de ser visível para quem lê a trilha');
});

test('motivo exatamente no limite não é cortado nem marcado', () => {
  const exato = 'b'.repeat(LIMITE_MOTIVO);
  const r = montarRegistro({ ...DADOS, reason: exato }, 'ALLOWED');
  assert.equal(r.reason, exato);
  assert.ok(!r.reason.endsWith('…'));
});

test('campos escritos pelo código recusam em vez de cortar: cortar esconderia o defeito', () => {
  assert.throws(() => montarRegistro({ ...DADOS, action: 'a'.repeat(LIMITE_ACAO + 1) }, 'ALLOWED'), AuditoriaInvalida);
  assert.throws(() => montarRegistro({ ...DADOS, correlationId: 'c'.repeat(LIMITE_ID + 1) }, 'ALLOWED'), AuditoriaInvalida);
  assert.throws(() => montarRegistro({ ...DADOS, actorUserId: 'u'.repeat(LIMITE_ID + 1) }, 'ALLOWED'), AuditoriaInvalida);
  assert.throws(() => montarRegistro({ ...DADOS, eventId: 'e'.repeat(LIMITE_ID + 1) }, 'ALLOWED'), AuditoriaInvalida);
  assert.throws(() => montarRegistro({ ...DADOS, organizationId: 'o'.repeat(LIMITE_ID + 1) }, 'ALLOWED'), AuditoriaInvalida);
  assert.throws(() => montarRegistro({ ...DADOS, targetUserId: 't'.repeat(LIMITE_ID + 1) }, 'ALLOWED'), AuditoriaInvalida);
});

test('no limite exato os campos do código passam', () => {
  const r = montarRegistro({
    ...DADOS,
    action: 'a'.repeat(LIMITE_ACAO),
    correlationId: 'c'.repeat(LIMITE_ID),
    actorUserId: 'u'.repeat(LIMITE_ID),
  }, 'ALLOWED');
  assert.equal(r.action.length, LIMITE_ACAO);
  assert.equal(r.correlationId.length, LIMITE_ID);
});

test('colunas de escopo ausentes viram a sentinela vazia que o schema espera, não undefined', () => {
  const r = montarRegistro({
    actorUserId: 'usr-1', action: 'consultar', scopeKind: 'GLOBAL',
    reason: 'Conferência de rotina.', correlationId: 'corr-2',
  }, 'ALLOWED');
  assert.equal(r.organizationId, '');
  assert.equal(r.eventId, '');
  assert.equal(r.targetUserId, '');
  assert.equal(r.changes, null, 'sem changes grava null, não undefined');
});

test('os três resultados do schema são montáveis e distintos', () => {
  const resultados = ['ALLOWED', 'DENIED', 'FAILED'].map((r) => montarRegistro(DADOS, r).result);
  assert.deepEqual(resultados, ['ALLOWED', 'DENIED', 'FAILED']);
});

// --------------------------------- lacunas encontradas pela rodada de mutação

test('mensagem curta de erro não vaza stack no FAILED', async () => {
  // A versão anterior deste arquivo só testava mensagem de 500 caracteres: o
  // corte em 180 removia o stack antes de ele aparecer, e a asserção
  // "não vaza stack" passava pelo motivo errado. Mensagem curta expõe isso.
  const b = bancoFalso();
  b.mudanca = async () => { throw new Error('evento inexistente'); };
  await executarAuditado(b, DADOS, b.mudanca).catch(() => {});
  const detalhe = b.soltas[0].changes.detalhe;
  assert.equal(detalhe, 'Error: evento inexistente');
  assert.ok(!detalhe.includes('\n'), 'stack tem caminho de arquivo e número de linha; não vai para a trilha');
  assert.ok(!/\.ts:|\.mjs:|at /.test(detalhe));
});

test('os limites são os do schema, presos ao literal', () => {
  // `PlatformAuditLog.action` é VarChar(60), `reason` VarChar(200) e as colunas
  // de id VarChar(64). Se o schema mudar, estes números têm de falhar aqui
  // antes de falharem numa gravação em produção. Usar a própria constante como
  // entrada dos testes de limite deixava a mudança passar sem ninguém ver.
  assert.equal(LIMITE_ACAO, 60);
  assert.equal(LIMITE_MOTIVO, 200);
  assert.equal(LIMITE_ID, 64);
});

test('limites conferidos contra literais, sem passar pela constante', () => {
  assert.throws(() => montarRegistro({ ...DADOS, action: 'a'.repeat(61) }, 'ALLOWED'), AuditoriaInvalida);
  assert.equal(montarRegistro({ ...DADOS, action: 'a'.repeat(60) }, 'ALLOWED').action.length, 60);
  assert.throws(() => montarRegistro({ ...DADOS, actorUserId: 'u'.repeat(65) }, 'ALLOWED'), AuditoriaInvalida);
  assert.equal(montarRegistro({ ...DADOS, actorUserId: 'u'.repeat(64) }, 'ALLOWED').actorUserId.length, 64);
  assert.equal(montarRegistro({ ...DADOS, reason: 'r'.repeat(201) }, 'ALLOWED').reason.length, 200);
  assert.equal(montarRegistro({ ...DADOS, reason: 'r'.repeat(200) }, 'ALLOWED').reason.endsWith('…'), false);
});

test('mudança feita pelo cliente transacional é revertida quando a auditoria falha', async () => {
  // Este é o teste que o defeito de desenho pedia. A versão anterior do módulo
  // entregava à mudança apenas `gravarAuditoria`, sem cliente transacional:
  // quem usasse seria forçado a alterar pelo cliente de fora, a alteração não
  // participaria do rollback, e tudo aqui continuaria verde. Os dois casos
  // abaixo mostram a diferença que isso faz.
  const b = bancoFalso({ auditoriaFalha: true });
  const foraDaTransacao = [];
  await executarAuditado(b, DADOS, async (tx) => {
    tx.cliente.anotar({ dentro: true });   // participa da transação
    foraDaTransacao.push({ fora: true });  // não participa: sobrevive ao rollback
  }).catch(() => {});

  assert.equal(b.comitado.mudancas.length, 0, 'o que passou pelo cliente transacional voltou');
  assert.equal(foraDaTransacao.length, 1, 'o que não passou por ele sobreviveu — é por isso que `cliente` existe');
});

test('a transação entregue à mudança expõe o cliente, não só a auditoria', async () => {
  const b = bancoFalso();
  let recebido;
  await executarAuditado(b, DADOS, async (tx) => { recebido = tx; });
  assert.ok(recebido.cliente, 'sem cliente, a mudança não tem como ser transacional');
  assert.equal(typeof recebido.gravarAuditoria, 'function');
});
