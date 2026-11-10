import assert from 'node:assert/strict';
import test from 'node:test';
import {
  lotesRemovidos,
  lotesImpedidos,
  mensagemDeLotesImpedidos,
} from '../src/registration-catalog-removal.ts';

/**
 * C-04 da auditoria do organizador (#640, contrato #661).
 *
 * `RegistrationCommercialService.save()` reconcilia o catálogo por `code` e
 * apaga o que não veio no corpo. TRÊS modelos referenciam o lote com
 * `onDelete: Restrict` — inscrição, pedido e fila de espera —, e o banco
 * recusa nos três casos. A recusa chegava como 500.
 *
 * A primeira versão desta conferência olhava SÓ inscrições, e o Work apontou
 * o buraco: lote preso apenas por pedido ou apenas por fila passava e caía no
 * 500 do banco assim mesmo. Há mutante nomeado para esse caso.
 */

const cat = (code, ...l) => ({ code, lots: l.map((c) => ({ id: `id-${code}-${c}`, code: c })) });
const ped = (code, ...l) => ({ code, lots: l.map((c) => ({ code: c })) });
const codigos = (r) => r.map((l) => l.code).sort();

test('nada muda, nada é removido', () => {
  assert.deepEqual(lotesRemovidos([cat('GERAL', 'L1', 'L2')], [ped('GERAL', 'L1', 'L2')]), []);
});
test('lote ausente do corpo é removido', () => {
  assert.deepEqual(codigos(lotesRemovidos([cat('GERAL', 'L1', 'L2')], [ped('GERAL', 'L1')])), ['L2']);
});
test('categoria inteira ausente leva todos os seus lotes', () => {
  const r = lotesRemovidos([cat('GERAL', 'L1'), cat('VIP', 'V1', 'V2')], [ped('GERAL', 'L1')]);
  assert.deepEqual(codigos(r), ['V1', 'V2']);
});
test('lote novo no corpo não conta como remoção', () => {
  assert.deepEqual(lotesRemovidos([cat('GERAL', 'L1')], [ped('GERAL', 'L1', 'L2')]), []);
});
test('lote é comparado dentro da PRÓPRIA categoria, não contra todas', () => {
  const r = lotesRemovidos([cat('GERAL', 'L1', 'X1'), cat('VIP', 'X1')], [ped('GERAL', 'L1'), ped('VIP', 'X1')]);
  assert.deepEqual(r.map((l) => l.id), ['id-GERAL-X1']);
});
test('sem catálogo anterior não há o que remover', () => {
  assert.deepEqual(lotesRemovidos([], [ped('GERAL', 'L1')]), []);
});

// --- vínculos: as TRÊS tabelas, não só inscrições -------------------------
const L = (c) => ({ id: `id-${c}`, code: c });

test('lote sem vínculo nenhum não aparece como impedido', () => {
  assert.deepEqual(lotesImpedidos([L('A')], {}), []);
  assert.deepEqual(lotesImpedidos([L('A')], { inscricoes: [], pedidos: [], fila: [] }), []);
});

// Este é o buraco que o Work apontou na versão anterior: eu só olhava
// inscrições, então lote preso SÓ por pedido ou SÓ por fila passava pela
// conferência e caía no 500 do banco.
test('pedido sozinho impede, e fila de espera sozinha impede', () => {
  assert.deepEqual(lotesImpedidos([L('A')], { pedidos: ['id-A'] }), [{ code: 'A', motivos: ['pedido'] }]);
  assert.deepEqual(lotesImpedidos([L('A')], { fila: ['id-A'] }), [{ code: 'A', motivos: ['fila de espera'] }]);
});

test('vínculos acumulam no mesmo lote, em ordem fixa', () => {
  const r = lotesImpedidos([L('A')], { fila: ['id-A'], inscricoes: ['id-A'], pedidos: ['id-A'] });
  assert.deepEqual(r, [{ code: 'A', motivos: ['inscrição', 'pedido', 'fila de espera'] }]);
});

test('a saída é ordenada por código, para a mensagem ser estável', () => {
  const r = lotesImpedidos([L('Z'), L('A'), L('M')], { inscricoes: ['id-Z', 'id-A', 'id-M'] });
  assert.deepEqual(r.map((l) => l.code), ['A', 'M', 'Z']);
});

test('id de lote que não está sendo removido não contamina', () => {
  assert.deepEqual(lotesImpedidos([L('A')], { inscricoes: ['id-OUTRO'] }), []);
});

test('a mensagem nomeia lote e motivo', () => {
  const texto = mensagemDeLotesImpedidos([
    { code: 'LOTE1', motivos: ['inscrição'] },
    { code: 'LOTE2', motivos: ['pedido', 'fila de espera'] },
  ]);
  assert.match(texto, /LOTE1 \(inscrição\)/u);
  assert.match(texto, /LOTE2 \(pedido, fila de espera\)/u);
  assert.match(texto, /Desative o lote/u);
});
