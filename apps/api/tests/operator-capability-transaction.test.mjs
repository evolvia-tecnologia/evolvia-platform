import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PlanoInvalido,
  aplicar,
  conferirPlano,
  planejarConcessao,
  planejarRevogacao,
  proximaSequencia,
} from '../src/operator-capability-transaction.ts';
import { ACOES_DE_OPERADOR, acoesDoPerfil } from '../src/operator-capability-policy.ts';

const TODAS = Object.keys(ACOES_DE_OPERADOR);

// ---------------------------------------------------------------------------
// 1. O par projecao <-> razao, que e a garantia da condicao 1
// ---------------------------------------------------------------------------

test('conceder gera um passo por ação, com criar emparelhado a GRANTED', () => {
  const p = planejarConcessao(['checkin', 'credencial_imprimir'], []);
  assert.equal(p.passos.length, 2);
  assert.deepEqual(p.semEfeito, []);
  for (const passo of p.passos) {
    assert.equal(passo.projecao.tipo, 'criar');
    assert.equal(passo.razao.kind, 'GRANTED');
    assert.equal(passo.projecao.acao, passo.razao.acao);
  }
  assert.deepEqual(conferirPlano(p, ['checkin', 'credencial_imprimir']), []);
});

test('revogar gera um passo por ação, com remover emparelhado a REVOKED', () => {
  const p = planejarRevogacao(['checkin'], ['checkin', 'relatorio']);
  assert.equal(p.passos.length, 1);
  assert.equal(p.passos[0].projecao.tipo, 'remover');
  assert.equal(p.passos[0].razao.kind, 'REVOKED');
  assert.equal(p.passos[0].projecao.acao, 'checkin');
  assert.deepEqual(conferirPlano(p, ['checkin']), []);
});

test('TODA ação pedida aparece em exatamente um lugar: passo ou semEfeito', () => {
  for (const ativas of [[], ['checkin'], TODAS]) {
    for (const plano of [planejarConcessao(TODAS, ativas), planejarRevogacao(TODAS, ativas)]) {
      const emPassos = plano.passos.map((x) => x.projecao.acao);
      const total = [...emPassos, ...plano.semEfeito];
      assert.equal(total.length, TODAS.length, JSON.stringify({ ativas, emPassos, s: plano.semEfeito }));
      assert.equal(new Set(total).size, TODAS.length);
      assert.deepEqual(conferirPlano(plano, TODAS), []);
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Nao poluir o historico com o que nao mudou
// ---------------------------------------------------------------------------

test('conceder ação já ativa não gera passo algum', () => {
  const p = planejarConcessao(['checkin'], ['checkin']);
  assert.deepEqual(p.passos, []);
  assert.deepEqual(p.semEfeito, ['checkin']);
});

test('revogar ação que não estava ativa não gera passo algum', () => {
  const p = planejarRevogacao(['checkin'], ['relatorio']);
  assert.deepEqual(p.passos, []);
  assert.deepEqual(p.semEfeito, ['checkin']);
});

// ---------------------------------------------------------------------------
// 3. Idempotencia: aplicar e replanejar nao faz mais nada
// ---------------------------------------------------------------------------

test('conceder duas vezes só escreve uma vez', () => {
  const pedidas = acoesDoPerfil('credenciamento');
  const primeiro = planejarConcessao(pedidas, []);
  const depois = aplicar([], primeiro);
  assert.equal(primeiro.passos.length, pedidas.length);
  const segundo = planejarConcessao(pedidas, depois);
  assert.deepEqual(segundo.passos, []);
  assert.deepEqual(segundo.semEfeito.sort(), [...pedidas].sort());
});

test('revogar duas vezes só escreve uma vez', () => {
  const pedidas = acoesDoPerfil('credenciamento');
  const ativas = [...pedidas];
  const primeiro = planejarRevogacao(pedidas, ativas);
  const depois = aplicar(ativas, primeiro);
  assert.deepEqual(depois, []);
  const segundo = planejarRevogacao(pedidas, depois);
  assert.deepEqual(segundo.passos, []);
});

test('conceder, revogar e conceder de novo volta ao estado concedido', () => {
  let estado = [];
  estado = aplicar(estado, planejarConcessao(['checkin'], estado));
  assert.deepEqual(estado, ['checkin']);
  estado = aplicar(estado, planejarRevogacao(['checkin'], estado));
  assert.deepEqual(estado, []);
  const terceiro = planejarConcessao(['checkin'], estado);
  assert.equal(terceiro.passos.length, 1, 'reconceder depois de revogar precisa voltar a escrever');
  assert.deepEqual(aplicar(estado, terceiro), ['checkin']);
});

// ---------------------------------------------------------------------------
// 4. Entrada da borda
// ---------------------------------------------------------------------------

test('ação inexistente é recusada antes de qualquer plano', () => {
  for (const ruim of [['voar'], ['checkin', 'voar'], [null], [42], [{}], ['updateLabel']]) {
    assert.throws(() => planejarConcessao(ruim, []), PlanoInvalido, JSON.stringify(ruim));
    assert.throws(() => planejarRevogacao(ruim, []), PlanoInvalido, JSON.stringify(ruim));
  }
});

test('lista vazia é recusada', () => {
  assert.throws(() => planejarConcessao([], []), PlanoInvalido);
  assert.throws(() => planejarRevogacao([], []), PlanoInvalido);
});

test('duplicatas na entrada não geram dois passos para a mesma ação', () => {
  const p = planejarConcessao(['checkin', 'checkin', 'checkin'], []);
  assert.equal(p.passos.length, 1);
  assert.deepEqual(conferirPlano(p, ['checkin']), []);
});

// ---------------------------------------------------------------------------
// 5. O proprio conferidor precisa saber acusar
// ---------------------------------------------------------------------------

test('conferirPlano acusa par com ações divergentes', () => {
  const p = { passos: [{ projecao: { tipo: 'criar', acao: 'checkin' }, razao: { kind: 'GRANTED', acao: 'relatorio' } }], semEfeito: [] };
  const problemas = conferirPlano(p, ['checkin']);
  assert.ok(problemas.some((m) => /ações divergentes/u.test(m)), problemas.join(' | '));
});

test('conferirPlano acusa remover emparelhado a GRANTED', () => {
  const p = { passos: [{ projecao: { tipo: 'remover', acao: 'checkin' }, razao: { kind: 'GRANTED', acao: 'checkin' } }], semEfeito: [] };
  const problemas = conferirPlano(p, ['checkin']);
  assert.ok(problemas.some((m) => /deveria gerar REVOKED/u.test(m)), problemas.join(' | '));
});

test('conferirPlano acusa criar emparelhado a REVOKED', () => {
  const p = { passos: [{ projecao: { tipo: 'criar', acao: 'checkin' }, razao: { kind: 'REVOKED', acao: 'checkin' } }], semEfeito: [] };
  assert.ok(conferirPlano(p, ['checkin']).some((m) => /deveria gerar GRANTED/u.test(m)));
});

test('conferirPlano acusa ação em dois passos', () => {
  const passo = { projecao: { tipo: 'criar', acao: 'checkin' }, razao: { kind: 'GRANTED', acao: 'checkin' } };
  assert.ok(conferirPlano({ passos: [passo, passo], semEfeito: [] }, ['checkin']).some((m) => /dois passos/u.test(m)));
});

test('conferirPlano acusa ação em passo e em semEfeito ao mesmo tempo', () => {
  const p = {
    passos: [{ projecao: { tipo: 'criar', acao: 'checkin' }, razao: { kind: 'GRANTED', acao: 'checkin' } }],
    semEfeito: ['checkin'],
  };
  assert.ok(conferirPlano(p, ['checkin']).some((m) => /ao mesmo tempo/u.test(m)));
});

test('conferirPlano acusa ação pedida que o plano ignorou', () => {
  const p = { passos: [], semEfeito: [] };
  assert.ok(conferirPlano(p, ['checkin']).some((m) => /não foi coberta/u.test(m)));
});

test('conferirPlano acusa ação que o plano inventou', () => {
  const p = { passos: [{ projecao: { tipo: 'criar', acao: 'relatorio' }, razao: { kind: 'GRANTED', acao: 'relatorio' } }], semEfeito: [] };
  assert.ok(conferirPlano(p, ['checkin']).some((m) => /inventou a ação relatorio/u.test(m)));
});

// ---------------------------------------------------------------------------
// 6. Sequencia de impressao
// ---------------------------------------------------------------------------

test('a primeira tentativa de impressão é a sequência 1, nunca 0', () => {
  assert.equal(proximaSequencia(0), 1);
  assert.equal(proximaSequencia(1), 2);
  assert.equal(proximaSequencia(7), 8);
});

test('contagem inválida é recusada em vez de gravar linha que o CHECK recusaria', () => {
  for (const ruim of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => proximaSequencia(ruim), PlanoInvalido, String(ruim));
  }
});
