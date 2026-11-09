import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROTULOS,
  ROTULOS_DE_PERFIL,
  diferencaDeConcessoes,
  rotulo,
  rotuloDePerfil,
  temMudanca,
} from '../lib/operator-capability-diff.ts';

test('marcar uma ação nova pede concessão; desmarcar pede revogação', () => {
  const d = diferencaDeConcessoes(['checkin'], ['checkin', 'relatorio']);
  assert.deepEqual(d, { conceder: ['relatorio'], revogar: [] });

  const e = diferencaDeConcessoes(['checkin', 'relatorio'], ['relatorio']);
  assert.deepEqual(e, { conceder: [], revogar: ['checkin'] });
});

test('conceder e revogar ao mesmo tempo é um diff só', () => {
  const d = diferencaDeConcessoes(['checkin', 'relatorio'], ['relatorio', 'sorteio']);
  assert.deepEqual(d, { conceder: ['sorteio'], revogar: ['checkin'] });
});

test('ação que está nos dois lados não gera operação alguma', () => {
  const iguais = ['checkin', 'relatorio'];
  assert.deepEqual(diferencaDeConcessoes(iguais, [...iguais].reverse()), { conceder: [], revogar: [] });
  assert.equal(temMudanca(diferencaDeConcessoes(iguais, iguais)), false);
});

test('conjunto vazio nos dois lados não gera operação', () => {
  const d = diferencaDeConcessoes([], []);
  assert.deepEqual(d, { conceder: [], revogar: [] });
  assert.equal(temMudanca(d), false);
});

test('desmarcar tudo revoga tudo, e marcar do zero concede tudo', () => {
  const todas = Object.keys(ROTULOS);
  assert.deepEqual(diferencaDeConcessoes(todas, []).revogar, [...todas].sort());
  assert.deepEqual(diferencaDeConcessoes([], todas).conceder, [...todas].sort());
});

test('repetição e ordem na entrada não mudam o resultado', () => {
  const d = diferencaDeConcessoes(['checkin', 'checkin'], ['relatorio', 'relatorio', 'relatorio']);
  assert.deepEqual(d, { conceder: ['relatorio'], revogar: ['checkin'] });
});

test('a saída é ordenada, para a chamada ser determinística', () => {
  const d = diferencaDeConcessoes([], ['sorteio', 'buscar', 'relatorio']);
  assert.deepEqual(d.conceder, ['buscar', 'relatorio', 'sorteio']);
});

test('temMudanca só é falso quando nada há a enviar', () => {
  assert.equal(temMudanca({ conceder: ['checkin'], revogar: [] }), true);
  assert.equal(temMudanca({ conceder: [], revogar: ['checkin'] }), true);
  assert.equal(temMudanca({ conceder: [], revogar: [] }), false);
});

test('ação sem rótulo aparece pelo código, em vez de desaparecer da tela', () => {
  assert.equal(rotulo('checkin'), 'Fazer check-in');
  assert.equal(rotulo('acao_que_o_servidor_acrescentou'), 'acao_que_o_servidor_acrescentou');
  assert.equal(rotuloDePerfil('credenciamento'), 'Credenciamento');
  assert.equal(rotuloDePerfil('perfil_novo'), 'perfil_novo');
});

test('há rótulo para as 17 ações e os 8 perfis que a API publica', () => {
  assert.equal(Object.keys(ROTULOS).length, 17);
  assert.equal(Object.keys(ROTULOS_DE_PERFIL).length, 8);
  for (const [acao, texto] of Object.entries(ROTULOS)) {
    assert.notEqual(texto, acao, `${acao} ficou sem rótulo de verdade`);
    assert.ok(texto.length > 3, acao);
  }
  // reverter e reimprimir precisam ser distinguíveis da ação direta no olho
  assert.notEqual(ROTULOS.checkin, ROTULOS.checkin_reverter);
  assert.notEqual(ROTULOS.credencial_imprimir, ROTULOS.credencial_reimprimir);
  assert.notEqual(ROTULOS.material_entregar, ROTULOS.material_reverter);
  assert.notEqual(ROTULOS.presenca_dia, ROTULOS.presenca_dia_reverter);
});
