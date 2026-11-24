import assert from 'node:assert/strict';
import test from 'node:test';
import { ACOES_DE_MODERACAO } from '../src/platform-grant-policy.ts';
import { ACOES, decidirModeracao } from '../src/platform-moderation-policy.ts';
import { acaoDeModeracaoAutorizada } from '../src/platform-moderation-action-map.ts';

test('cada poder de moderação Master tem uma ação única e válida na máquina de estados', () => {
  const esperado = {
    suspender: 'suspender',
    desbloquear: 'liberar',
    excluir: 'remover',
    restaurar: 'restaurar',
  };
  assert.deepEqual([...ACOES_DE_MODERACAO].sort(), Object.keys(esperado).sort());
  const traduzidas = [];
  for (const permissao of ACOES_DE_MODERACAO) {
    const acao = acaoDeModeracaoAutorizada(permissao);
    assert.equal(acao, esperado[permissao]);
    assert.ok(ACOES.includes(acao));
    traduzidas.push(acao);
  }
  assert.deepEqual(traduzidas.sort(), [...ACOES].sort());
});

test('não aceitar nomes internos, poderes administrativos ou herança de protótipo como autorização', () => {
  for (const invalida of [
    'liberar', 'remover', 'conceder', 'revogar', 'consultar',
    '__proto__', 'constructor', 'toString', 'SUSPENDER', '', null,
    undefined, 1, [], {}, { toString: () => 'suspender' },
  ]) {
    assert.equal(acaoDeModeracaoAutorizada(invalida), null,
      'o adaptador aceitou uma ação que não pertence ao guard');
  }
});

const entrada = {
  estadoAtual: 'SUSPENSO',
  statusDoEvento: 'SUSPENDED',
  statusOriginal: 'PUBLISHED',
  ehMaster: true,
  atorUserId: 'master-1',
  classificacao: 'VIOLACAO_DE_REGRA',
  motivo: 'Infração confirmada após análise',
  referenciaDoCaso: 'CASO-001',
};

test('desbloquear retoma o status original sem publicar um rascunho por engano', () => {
  const acao = acaoDeModeracaoAutorizada('desbloquear');
  const decisao = decidirModeracao({ ...entrada, acao, statusOriginal: 'DRAFT' });
  assert.equal(decisao.permitido, true);
  assert.equal(decisao.estadoNovo, 'ATIVO');
  assert.equal(decisao.statusDoEventoNovo, 'DRAFT');
});

test('excluir nunca contorna a exigência de segundo aprovador diferente do ator', () => {
  const acao = acaoDeModeracaoAutorizada('excluir');
  const semAprovador = decidirModeracao({ ...entrada, acao });
  assert.equal(semAprovador.permitido, false);
  assert.equal(semAprovador.motivo, 'remocao_exige_segunda_aprovacao');

  const aprovadorIgual = decidirModeracao({
    ...entrada, acao, segundaAprovacaoPor: 'master-1',
  });
  assert.equal(aprovadorIgual.permitido, false);
  assert.equal(aprovadorIgual.motivo, 'segunda_aprovacao_do_mesmo_ator');

  const autorizado = decidirModeracao({
    ...entrada, acao, segundaAprovacaoPor: 'master-2',
  });
  assert.equal(autorizado.permitido, true);
  assert.equal(autorizado.estadoNovo, 'REMOVIDO');
});
