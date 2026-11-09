import assert from 'node:assert/strict';
import test from 'node:test';
import { lotesRemovidos } from '../src/registration-catalog-removal.ts';

/**
 * C-04 da auditoria do organizador (fila #640, contrato #661).
 *
 * `RegistrationCommercialService.save()` reconcilia o catálogo por `code` e
 * apaga o que não veio no corpo. Com inscrições existentes o banco recusa
 * (`onDelete: Restrict`), mas a recusa chegava como 500. Esta função permite
 * antecipar e nomear a recusa; aqui ela é exercitada sem banco.
 */

const cat = (code, ...lotes) => ({ code, lots: lotes.map((c) => ({ id: `id-${code}-${c}`, code: c })) });
const ped = (code, ...lotes) => ({ code, lots: lotes.map((c) => ({ code: c })) });
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
  assert.deepEqual(r.map((l) => l.id).sort(), ['id-VIP-V1', 'id-VIP-V2']);
});

test('lote novo no corpo não conta como remoção', () => {
  assert.deepEqual(lotesRemovidos([cat('GERAL', 'L1')], [ped('GERAL', 'L1', 'L2')]), []);
});

test('código igual em categorias diferentes não se confunde', () => {
  // L1 existe nas duas; só a VIP sai. O L1 da GERAL tem de permanecer.
  const r = lotesRemovidos([cat('GERAL', 'L1'), cat('VIP', 'L1')], [ped('GERAL', 'L1')]);
  assert.deepEqual(r.map((l) => l.id), ['id-VIP-L1'], 'removeu o lote da categoria errada');
});

// Este caso existe porque o anterior NÃO bastava: nele a VIP inteira sai, então
// o ramo por lote nem é exercitado. Um mutante que comparasse o lote contra
// QUALQUER categoria pedida sobrevivia ao teste acima.
//
// Aqui as duas categorias permanecem, e o código X1 existe nas duas. Só o X1 da
// GERAL foi retirado do corpo. Comparar contra a categoria errada faria o
// serviço concluir que ele continua pedido — e deixar de removê-lo.
test('lote é comparado dentro da PRÓPRIA categoria, não contra todas', () => {
  const r = lotesRemovidos(
    [cat('GERAL', 'L1', 'X1'), cat('VIP', 'X1')],
    [ped('GERAL', 'L1'), ped('VIP', 'X1')],
  );
  assert.deepEqual(r.map((l) => l.id), ['id-GERAL-X1'], 'o X1 da GERAL saiu do corpo e tem de ser removido');
});

test('catálogo vazio no corpo remove tudo', () => {
  assert.deepEqual(codigos(lotesRemovidos([cat('GERAL', 'L1'), cat('VIP', 'V1')], [])), ['L1', 'V1']);
});

test('sem catálogo anterior não há o que remover', () => {
  assert.deepEqual(lotesRemovidos([], [ped('GERAL', 'L1')]), []);
});
