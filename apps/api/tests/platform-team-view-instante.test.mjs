// O que `instante` aceita como data, MEDIDO e não suposto.
//
// Este arquivo existe por causa de um erro meu que vale ficar registrado onde
// dói. No commit 5bca781c eu escrevi:
//
//     assert.equal(situacaoDoAcesso('20261120', AGORA), 'VIGENTE',
//       'foi lido como data de 2026, não como epoch de 1970');
//
// sem medir. `new Date('20261120')` é `Invalid Date` — conferido no Node
// v22.23.4 desta sessão, `getTime()` devolve `NaN`. Então a string cai em
// ilegível e `situacaoDoAcesso` devolve EXPIRADA, que é a direção segura e o
// comportamento declarado do módulo.
//
// O agravante é o contexto: escrevi aquela asserção no mesmo commit em que
// corrigi uma revisão por afirmar consequência sem medir. Cometi o erro que
// acabara de apontar.
//
// E o fato medido deixa o argumento mais forte: para texto, não há adivinhação
// nenhuma — um número em forma de string não é data válida e é recusado direto.
// É a forma mais conservadora possível, e agora está afirmada como tal.
import assert from 'node:assert/strict';
import test from 'node:test';
import { situacaoDoAcesso } from '../src/platform-team-view.ts';

const AGORA = Date.parse('2026-11-20T12:00:00.000Z');

test('a premissa: string puramente numérica NÃO é data válida em JavaScript', () => {
  // A medição que faltava. Se algum dia o Node passar a aceitar esta forma,
  // este caso fica vermelho e avisa que a premissa dos outros mudou.
  assert.ok(Number.isNaN(new Date('20261120').getTime()), 'new Date("20261120") passou a ser válido');
  assert.ok(Number.isNaN(new Date('1700000000000').getTime()), 'new Date("1700000000000") passou a ser válido');
});

test('epoch em NÚMERO é entendido', () => {
  // Veio da revisão do Gemini, e estava certo: `new Date("1700000000000")` é
  // inválido, então epoch precisava de ramo próprio.
  assert.equal(situacaoDoAcesso(AGORA + 86400_000, AGORA), 'VIGENTE');
  assert.equal(situacaoDoAcesso(AGORA - 86400_000, AGORA), 'EXPIRADA');
});

test('número imprestável é expirado, não vigente', () => {
  assert.equal(situacaoDoAcesso(Number.NaN, AGORA), 'EXPIRADA');
  assert.equal(situacaoDoAcesso(Number.POSITIVE_INFINITY, AGORA), 'EXPIRADA');
  assert.equal(situacaoDoAcesso(Number.NEGATIVE_INFINITY, AGORA), 'EXPIRADA');
});

test('string numérica é ilegível, e ilegível é EXPIRADA', () => {
  // Era aqui que eu tinha afirmado VIGENTE. O comportamento certo — e o que o
  // módulo declara — é que na dúvida a leitura mostra o estado menos
  // favorável, para ninguém contar com acesso que o autorizador pode recusar.
  assert.equal(situacaoDoAcesso('20261120', AGORA), 'EXPIRADA');
  assert.equal(situacaoDoAcesso('1700000000000', AGORA), 'EXPIRADA');
  assert.equal(situacaoDoAcesso('nao-e-data', AGORA), 'EXPIRADA');
});

test('data ISO em texto continua sendo lida', () => {
  // O que NÃO pode ter se perdido no reparo: a forma que o Prisma devolve
  // serializada, e a que de fato chega aqui na prática.
  assert.equal(situacaoDoAcesso(new Date(AGORA + 86400_000).toISOString(), AGORA), 'VIGENTE');
  assert.equal(situacaoDoAcesso(new Date(AGORA - 86400_000).toISOString(), AGORA), 'EXPIRADA');
  assert.equal(situacaoDoAcesso('2026-12-25', AGORA), 'VIGENTE');
});

test('objeto Date continua sendo lido', () => {
  assert.equal(situacaoDoAcesso(new Date(AGORA + 1000), AGORA), 'VIGENTE');
  assert.equal(situacaoDoAcesso(new Date(AGORA - 1000), AGORA), 'EXPIRADA');
});

test('ausência de prazo é VIGENTE, e isso não mudou', () => {
  // Sem prazo significa "vale até revogar". Confundir ausência com ilegível
  // faria toda concessão sem prazo aparecer expirada.
  assert.equal(situacaoDoAcesso(null, AGORA), 'VIGENTE');
  assert.equal(situacaoDoAcesso(undefined, AGORA), 'VIGENTE');
  assert.equal(situacaoDoAcesso('', AGORA), 'VIGENTE');
});
