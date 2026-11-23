import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JANELA_DA_SESSAO_MS, JANELA_DO_DESAFIO_MS,
  contadorAceito, lerDesafio, lerSessao, validadeDaSessao, validadeDoDesafio,
} from '../src/platform-session-policy.ts';

const AGORA = Date.parse('2026-11-13T10:00:00.000Z');
const ms = (min) => min * 60 * 1000;

const identidade = (over = {}) => ({ role: 'OWNER', status: 'ACTIVE', ...over });
const sessao = (over = {}) => ({
  secondFactorAt: new Date(AGORA - ms(30)).toISOString(),
  stepUpAt: null,
  expiresAt: new Date(AGORA + ms(60)).toISOString(),
  revokedAt: null,
  ...over,
});

// ---------------------------------------------------------------- lerSessao

test('sessão válida de proprietário devolve os dois carimbos para a decisão', () => {
  const r = lerSessao(identidade(), sessao({ stepUpAt: new Date(AGORA - ms(2)).toISOString() }), AGORA);
  assert.equal(r.valida, true);
  assert.deepEqual(r.sessao, {
    proprietario: true,
    segundoFatorVerificadoEm: new Date(AGORA - ms(30)).toISOString(),
    verificacaoReforcadaEm: new Date(AGORA - ms(2)).toISOString(),
  });
});

test('delegado não vira proprietário', () => {
  const r = lerSessao(identidade({ role: 'DELEGADO' }), sessao(), AGORA);
  assert.equal(r.valida, true);
  assert.equal(r.sessao.proprietario, false);
});

test('sem verificação reforçada o carimbo sai nulo, não ausente', () => {
  const r = lerSessao(identidade(), sessao({ stepUpAt: null }), AGORA);
  assert.equal(r.valida, true);
  assert.equal(r.sessao.verificacaoReforcadaEm, null);
  assert.ok('verificacaoReforcadaEm' in r.sessao);
});

test('sessão inexistente e identidade inexistente recusam por inexistência', () => {
  for (const [i, s] of [[null, sessao()], [identidade(), null], [null, null], [undefined, undefined]]) {
    const r = lerSessao(i, s, AGORA);
    assert.equal(r.valida, false);
    assert.equal(r.recusa, 'SESSAO_INEXISTENTE');
  }
});

test('sessão revogada recusa como revogada, mesmo dentro da validade', () => {
  const r = lerSessao(identidade(), sessao({ revokedAt: new Date(AGORA - ms(1)).toISOString() }), AGORA);
  assert.equal(r.valida, false);
  assert.equal(r.recusa, 'SESSAO_REVOGADA');
});

test('revogação vence expiração: a recusa mais específica é a que foi deliberada', () => {
  const r = lerSessao(identidade(), sessao({
    revokedAt: new Date(AGORA - ms(90)).toISOString(),
    expiresAt: new Date(AGORA - ms(5)).toISOString(),
  }), AGORA);
  assert.equal(r.recusa, 'SESSAO_REVOGADA');
});

test('revogação no futuro ainda é revogação: a coluna preenchida é o que conta', () => {
  // Sessão agendada para encerrar não deve continuar valendo por um relógio.
  const r = lerSessao(identidade(), sessao({ revokedAt: new Date(AGORA + ms(10)).toISOString() }), AGORA);
  assert.equal(r.recusa, 'SESSAO_REVOGADA');
});

test('sessão vencida recusa', () => {
  const r = lerSessao(identidade(), sessao({ expiresAt: new Date(AGORA - 1).toISOString() }), AGORA);
  assert.equal(r.valida, false);
  assert.equal(r.recusa, 'SESSAO_EXPIRADA');
});

test('expiração exatamente agora já venceu', () => {
  const r = lerSessao(identidade(), sessao({ expiresAt: new Date(AGORA).toISOString() }), AGORA);
  assert.equal(r.recusa, 'SESSAO_EXPIRADA');
});

test('um milissegundo antes de vencer ainda vale', () => {
  const r = lerSessao(identidade(), sessao({ expiresAt: new Date(AGORA + 1).toISOString() }), AGORA);
  assert.equal(r.valida, true);
});

test('sessão sem validade gravada não é sessão eterna', () => {
  for (const ruim of [null, undefined, '', 'ontem']) {
    const r = lerSessao(identidade(), sessao({ expiresAt: ruim }), AGORA);
    assert.equal(r.valida, false, `expiresAt=${String(ruim)}`);
    assert.equal(r.recusa, 'SESSAO_EXPIRADA');
  }
});

test('identidade suspensa recusa mesmo com sessão viva', () => {
  const r = lerSessao(identidade({ status: 'SUSPENDED' }), sessao(), AGORA);
  assert.equal(r.valida, false);
  assert.equal(r.recusa, 'IDENTIDADE_SUSPENSA');
});

test('suspensão vem depois de expiração: não conta o estado da conta a quem já venceu', () => {
  const r = lerSessao(identidade({ status: 'SUSPENDED' }), sessao({ expiresAt: new Date(AGORA - 1).toISOString() }), AGORA);
  assert.equal(r.recusa, 'SESSAO_EXPIRADA');
});

test('status desconhecido não passa por ACTIVE', () => {
  const r = lerSessao(identidade({ status: 'QUALQUER' }), sessao(), AGORA);
  assert.equal(r.recusa, 'IDENTIDADE_SUSPENSA');
});

test('aceita Date além de string, e normaliza para ISO', () => {
  const r = lerSessao(identidade(), {
    secondFactorAt: new Date(AGORA - ms(10)),
    stepUpAt: new Date(AGORA - ms(1)),
    expiresAt: new Date(AGORA + ms(10)),
    revokedAt: null,
  }, AGORA);
  assert.equal(r.valida, true);
  assert.equal(r.sessao.segundoFatorVerificadoEm, new Date(AGORA - ms(10)).toISOString());
  assert.equal(r.sessao.verificacaoReforcadaEm, new Date(AGORA - ms(1)).toISOString());
});

test('toda recusa traz frase para o usuário, e nenhuma vaza estado interno', () => {
  const casos = [
    lerSessao(null, null, AGORA),
    lerSessao(identidade(), sessao({ revokedAt: new Date(AGORA).toISOString() }), AGORA),
    lerSessao(identidade(), sessao({ expiresAt: new Date(AGORA - 1).toISOString() }), AGORA),
    lerSessao(identidade({ status: 'SUSPENDED' }), sessao(), AGORA),
  ];
  for (const c of casos) {
    assert.equal(c.valida, false);
    assert.ok(c.porque.length > 10, c.recusa);
    assert.ok(!/token|hash|identityId|sessionId/i.test(c.porque), c.porque);
  }
});

test('os quatro motivos de recusa são distintos entre si', () => {
  const motivos = [
    lerSessao(null, null, AGORA).recusa,
    lerSessao(identidade(), sessao({ revokedAt: new Date(AGORA).toISOString() }), AGORA).recusa,
    lerSessao(identidade(), sessao({ expiresAt: new Date(AGORA - 1).toISOString() }), AGORA).recusa,
    lerSessao(identidade({ status: 'SUSPENDED' }), sessao(), AGORA).recusa,
  ];
  assert.equal(new Set(motivos).size, 4);
});

// -------------------------------------------------------------- as validades

test('a sessão vale doze horas e o desafio cinco minutos', () => {
  assert.equal(JANELA_DA_SESSAO_MS, 12 * 60 * 60 * 1000);
  assert.equal(JANELA_DO_DESAFIO_MS, 5 * 60 * 1000);
  assert.equal(validadeDaSessao(AGORA), new Date(AGORA + 12 * 60 * 60 * 1000).toISOString());
  assert.equal(validadeDoDesafio(AGORA), new Date(AGORA + 5 * 60 * 1000).toISOString());
});

test('a sessão emitida agora é lida como válida, e a emitida há doze horas não', () => {
  const emitida = { secondFactorAt: new Date(AGORA).toISOString(), stepUpAt: null, expiresAt: validadeDaSessao(AGORA), revokedAt: null };
  assert.equal(lerSessao(identidade(), emitida, AGORA).valida, true);
  assert.equal(lerSessao(identidade(), emitida, AGORA + JANELA_DA_SESSAO_MS).valida, false);
  assert.equal(lerSessao(identidade(), emitida, AGORA + JANELA_DA_SESSAO_MS - 1).valida, true);
});

// --------------------------------------------------------------- lerDesafio

const comDesafio = (over = {}) => identidade({
  pendingChallenge: 'desafio-abc',
  pendingChallengeKind: 'AUTHENTICATION',
  pendingChallengeExpires: new Date(AGORA + ms(2)).toISOString(),
  ...over,
});

test('desafio vigente do tipo esperado é devolvido', () => {
  const r = lerDesafio(comDesafio(), 'AUTHENTICATION', AGORA);
  assert.deepEqual(r, { ok: true, desafio: 'desafio-abc' });
});

test('sem cerimônia aberta não há o que consumir', () => {
  for (const vazio of [null, undefined, '']) {
    const r = lerDesafio(comDesafio({ pendingChallenge: vazio }), 'AUTHENTICATION', AGORA);
    assert.equal(r.ok, false);
  }
  assert.equal(lerDesafio(null, 'AUTHENTICATION', AGORA).ok, false);
});

test('desafio de registro não autentica, e o de autenticação não registra', () => {
  assert.equal(lerDesafio(comDesafio({ pendingChallengeKind: 'REGISTRATION' }), 'AUTHENTICATION', AGORA).ok, false);
  assert.equal(lerDesafio(comDesafio({ pendingChallengeKind: 'AUTHENTICATION' }), 'REGISTRATION', AGORA).ok, false);
  assert.equal(lerDesafio(comDesafio({ pendingChallengeKind: 'REGISTRATION' }), 'REGISTRATION', AGORA).ok, true);
});

test('desafio sem tipo não serve para tipo nenhum', () => {
  assert.equal(lerDesafio(comDesafio({ pendingChallengeKind: null }), 'AUTHENTICATION', AGORA).ok, false);
  assert.equal(lerDesafio(comDesafio({ pendingChallengeKind: null }), 'REGISTRATION', AGORA).ok, false);
});

test('desafio vencido, e vencendo exatamente agora, não serve', () => {
  assert.equal(lerDesafio(comDesafio({ pendingChallengeExpires: new Date(AGORA - 1).toISOString() }), 'AUTHENTICATION', AGORA).ok, false);
  assert.equal(lerDesafio(comDesafio({ pendingChallengeExpires: new Date(AGORA).toISOString() }), 'AUTHENTICATION', AGORA).ok, false);
  assert.equal(lerDesafio(comDesafio({ pendingChallengeExpires: new Date(AGORA + 1).toISOString() }), 'AUTHENTICATION', AGORA).ok, true);
});

test('desafio sem validade gravada não vale para sempre', () => {
  for (const ruim of [null, undefined, '', 'nunca']) {
    assert.equal(lerDesafio(comDesafio({ pendingChallengeExpires: ruim }), 'AUTHENTICATION', AGORA).ok, false, String(ruim));
  }
});

test('o desafio aberto agora é lido como vigente, e aos cinco minutos não', () => {
  const i = comDesafio({ pendingChallengeExpires: validadeDoDesafio(AGORA) });
  assert.equal(lerDesafio(i, 'AUTHENTICATION', AGORA).ok, true);
  assert.equal(lerDesafio(i, 'AUTHENTICATION', AGORA + JANELA_DO_DESAFIO_MS - 1).ok, true);
  assert.equal(lerDesafio(i, 'AUTHENTICATION', AGORA + JANELA_DO_DESAFIO_MS).ok, false);
});

test('cada recusa de desafio diz o que fazer', () => {
  const casos = [
    lerDesafio(comDesafio({ pendingChallenge: null }), 'AUTHENTICATION', AGORA),
    lerDesafio(comDesafio({ pendingChallengeKind: 'REGISTRATION' }), 'AUTHENTICATION', AGORA),
    lerDesafio(comDesafio({ pendingChallengeExpires: new Date(AGORA - 1).toISOString() }), 'AUTHENTICATION', AGORA),
  ];
  const frases = new Set();
  for (const c of casos) {
    assert.equal(c.ok, false);
    assert.match(c.porque, /novamente/);
    frases.add(c.porque);
  }
  assert.equal(frases.size, 3, 'motivos diferentes não podem ter a mesma frase');
});

// ------------------------------------------------------------ contadorAceito

test('contador que avança é aceito', () => {
  assert.equal(contadorAceito(5, 6), true);
  assert.equal(contadorAceito(0, 1), true);
  assert.equal(contadorAceito(5, 500), true);
});

test('contador que não avança é recusado: é o sinal de autenticador clonado', () => {
  assert.equal(contadorAceito(5, 5), false);
  assert.equal(contadorAceito(5, 4), false);
  assert.equal(contadorAceito(1, 0), false);
});

test('autenticador sem contador manda zero sempre, e isso é legítimo', () => {
  // Exceção da especificação do WebAuthn. Sem ela, chave de segurança
  // legítima que não implementa contador nunca entraria na Área Master.
  assert.equal(contadorAceito(0, 0), true);
});

test('a exceção do zero não se estende a nenhum outro empate', () => {
  for (const n of [1, 2, 7, 1000]) {
    assert.equal(contadorAceito(n, n), false, `empate em ${n}`);
  }
});

test('contador negativo ou fracionário é recusado, não interpretado', () => {
  assert.equal(contadorAceito(-1, 5), false);
  assert.equal(contadorAceito(5, -1), false);
  assert.equal(contadorAceito(-1, -1), false);
  assert.equal(contadorAceito(0.5, 1), false);
  assert.equal(contadorAceito(1, 1.5), false);
  assert.equal(contadorAceito(Number.NaN, 1), false);
  assert.equal(contadorAceito(1, Number.NaN), false);
  assert.equal(contadorAceito(1, Number.POSITIVE_INFINITY), false);
});

// ------------------------------------- composição com a política de concessões
// Prova que a saída de `lerSessao` é exatamente o que `decidir` consome. Se as
// duas peças divergirem, isto para de compilar e de passar — que é o ponto.

import { decidir } from '../src/platform-grant-policy.ts';

// Pedido na forma real de `Pedido`: `alvo`, não `escopo`. A primeira versão
// deste arquivo passou `escopo` e ficou verde — os caminhos exercitados aqui
// não leem o alvo. O `tsc` acusou, e a lição ficou: nestes testes a asserção é
// o motivo da decisão, e não apenas o booleano.
const PEDIDO = {
  acao: 'consultar',
  alvo: { tipo: 'PLATAFORMA' },
  motivo: 'Verificação de inconsistência relatada pelo organizador.',
};

test('composição: sessão válida de proprietário autoriza ação global', () => {
  const leitura = lerSessao(identidade(), sessao(), AGORA);
  assert.equal(leitura.valida, true);
  const d = decidir(leitura.sessao, [], PEDIDO, AGORA);
  assert.equal(d.permitido, true);
  assert.equal(d.porque, 'Proprietário da plataforma.');
});

test('composição: sessão vencida nunca chega a decidir, e não é "sem permissão"', () => {
  const leitura = lerSessao(identidade(), sessao({ expiresAt: new Date(AGORA - 1).toISOString() }), AGORA);
  assert.equal(leitura.valida, false);
  assert.equal(leitura.recusa, 'SESSAO_EXPIRADA');
  assert.ok(!('sessao' in leitura), 'sessão inválida não pode produzir sessão para decisão');
});

test('composição: segundo fator antigo reprova no decidir, não no lerSessao', () => {
  // A sessão ainda vale; o que venceu é o frescor do segundo fator. São dois
  // controles distintos, e cada um recusa no seu lugar.
  const antigo = new Date(AGORA - 13 * 60 * 60 * 1000).toISOString();
  const leitura = lerSessao(identidade(), sessao({ secondFactorAt: antigo, expiresAt: new Date(AGORA + ms(60)).toISOString() }), AGORA);
  assert.equal(leitura.valida, true, 'a sessão em si continua válida');
  const d = decidir(leitura.sessao, [], PEDIDO, AGORA);
  assert.equal(d.permitido, false);
  // O motivo é o que importa: recusar por sessão velha não é recusar por falta
  // de permissão, e o teste ficaria verde pelos dois se olhasse só o booleano.
  assert.equal(d.recusa, 'SEM_SEGUNDO_FATOR');
});

test('composição: delegado sem concessão é recusado mesmo com sessão impecável', () => {
  const leitura = lerSessao(identidade({ role: 'DELEGADO' }), sessao(), AGORA);
  assert.equal(leitura.valida, true);
  const d = decidir(leitura.sessao, [], PEDIDO, AGORA);
  assert.equal(d.permitido, false);
  assert.equal(d.recusa, 'SEM_CONCESSAO');
});
