import assert from 'node:assert/strict';
import test from 'node:test';
import { OPERACOES } from '../src/platform-moderation-policy.ts';
import { PONTOS_DE_CONSUMO, estadoDe, podeOperar } from '../src/platform-moderation-enforcement.ts';

test('evento SEM linha de moderação se comporta como hoje', () => {
  for (const linha of [null, undefined]) {
    assert.equal(estadoDe(linha), 'ATIVO');
    for (const o of OPERACOES) {
      assert.equal(podeOperar(linha, o).permitido, true,
        `${o} foi barrada sem moderação: aplicar a migration bloquearia todo evento existente`);
    }
  }
});

test('linha com estado irreconhecível NEGA, ao contrário da ausência', () => {
  for (const state of ['', 'ativo', 'ATIVO ', 42, null, undefined, {}, 'DELETADO']) {
    const d = podeOperar({ state }, 'nova_inscricao');
    assert.equal(d.estado, 'INDETERMINADO', `aceitou state=${JSON.stringify(state)}`);
    assert.equal(d.permitido, false);
  }
  assert.equal(estadoDe({}), 'INDETERMINADO', 'linha sem campo state é malformada, não ativa');
});

test('os três estados reconhecidos atravessam para a política', () => {
  assert.equal(podeOperar({ state: 'ATIVO' }, 'nova_inscricao').permitido, true);
  assert.equal(podeOperar({ state: 'SUSPENSO' }, 'nova_inscricao').permitido, false);
  assert.equal(podeOperar({ state: 'REMOVIDO' }, 'listagem_publica').permitido, false);
  assert.equal(podeOperar({ state: 'SUSPENSO' }, 'listagem_publica').permitido, true);
});

test('leitura administrativa e histórico passam em qualquer estado', () => {
  for (const state of ['ATIVO', 'SUSPENSO', 'REMOVIDO']) {
    for (const o of ['leitura_administrativa', 'historico_e_auditoria']) {
      assert.equal(podeOperar({ state }, o).permitido, true, `${state} barrou ${o}`);
    }
  }
});

test('operação desconhecida nega, mesmo em evento ativo', () => {
  for (const o of ['', 'qualquer', undefined, null, 42]) {
    assert.equal(podeOperar({ state: 'ATIVO' }, o).permitido, false, `liberou operação ${String(o)}`);
    assert.equal(podeOperar(null, o).permitido, false, `liberou operação ${String(o)} sem linha`);
  }
});

test('toda operação do catálogo tem ponto de consumo nomeado', () => {
  const cobertas = new Set(PONTOS_DE_CONSUMO.map((p) => p.operacao));
  for (const o of OPERACOES) {
    assert.ok(cobertas.has(o), `operação "${o}" existe e nunca é consultada: efeito que não existe`);
  }
  for (const ponto of PONTOS_DE_CONSUMO) {
    assert.ok(OPERACOES.includes(ponto.operacao), `ponto cita operação inexistente: ${ponto.operacao}`);
    assert.ok(ponto.onde.length > 0 && ponto.efeitoEsperado.length > 0, `ponto incompleto: ${ponto.operacao}`);
  }
});

test('a decisão devolve o estado observado, para a mensagem não mentir', () => {
  assert.equal(podeOperar({ state: 'SUSPENSO' }, 'nova_inscricao').estado, 'SUSPENSO');
  assert.equal(podeOperar(null, 'nova_inscricao').estado, 'ATIVO');
  assert.equal(podeOperar({ state: 'x' }, 'nova_inscricao').estado, 'INDETERMINADO');
});
