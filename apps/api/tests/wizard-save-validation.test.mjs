import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getWizardCompletionIssues,
  getWizardSaveIssues,
  subjectAreasToPersist,
} from '../src/wizard-policy.ts';

/**
 * Dois defeitos achados na auditoria do organizador (fila #640, contrato #661),
 * cada um com o teste que o REPROVA antes da correção.
 *
 * C-01: a checagem de ordem das datas existia só em `getWizardCompletionIssues`,
 *       chamada apenas por `complete()`. O `save()` gravava término anterior ao
 *       início e respondia 200.
 * C-02: `persistEventData` escrevia `subjectAreas` sem guarda, então um `save()`
 *       cujo corpo não repetisse as áreas as apagava.
 */

const ERRO_ORDEM = 'A data de término não pode ser anterior à data de início.';
const dia = (n) => `2026-12-${String(n).padStart(2, '0')}T12:00:00.000Z`;

// ---------------------------------------------------------------------------
// C-01 — ordem das datas, agora exigida também ao salvar
// ---------------------------------------------------------------------------

test('salvar com término anterior ao início é recusado', () => {
  assert.deepEqual(getWizardSaveIssues({ startDate: dia(10), endDate: dia(1) }), [ERRO_ORDEM]);
});

test('evento de um único instante é legítimo e não pode ser barrado', () => {
  assert.deepEqual(getWizardSaveIssues({ startDate: dia(10), endDate: dia(10) }), []);
});

test('rascunho com uma data só continua podendo ser salvo', () => {
  for (const parcial of [
    { startDate: dia(10) },
    { endDate: dia(1) },
    {},
    { startDate: null, endDate: null },
    { startDate: dia(10), endDate: null },
  ]) {
    assert.deepEqual(getWizardSaveIssues(parcial), [], JSON.stringify(parcial));
  }
});

test('a comparação é por instante, não por texto do mesmo dia', () => {
  assert.deepEqual(getWizardSaveIssues({
    startDate: '2026-12-02T03:00:00.000Z',
    endDate: '2026-12-02T01:00:00.000Z',
  }), [ERRO_ORDEM]);
});

// A regra de salvar é subconjunto da regra de concluir: o que impede salvar tem
// de impedir concluir também, senão existiriam dois contratos divergentes para
// a mesma data.
test('toda recusa de salvar também é recusa de concluir', () => {
  const invertido = {
    eventType: 'Workshop',
    format: 'IN_PERSON',
    name: 'Evento de teste',
    timeZone: 'America/Sao_Paulo',
    venue: 'Local',
    registrationMode: 'FREE',
    capabilities: ['registration'],
    subjectAreas: ['tecnologia'],
    startDate: dia(10),
    endDate: dia(1),
  };
  assert.deepEqual(getWizardSaveIssues(invertido), [ERRO_ORDEM]);
  assert.ok(
    getWizardCompletionIssues(invertido).includes(ERRO_ORDEM),
    'concluir tem de recusar o mesmo intervalo que salvar recusa',
  );
});

// ---------------------------------------------------------------------------
// C-02 — ausência no corpo não é pedido de apagamento
// ---------------------------------------------------------------------------

test('corpo sem áreas preserva as áreas já gravadas', () => {
  for (const pedido of [undefined, []]) {
    assert.deepEqual(
      subjectAreasToPersist(pedido, ['saude', 'tecnologia']),
      ['saude', 'tecnologia'],
      `pedido=${JSON.stringify(pedido)} não pode apagar o que está salvo`,
    );
  }
});

test('corpo com áreas substitui as gravadas', () => {
  assert.deepEqual(subjectAreasToPersist(['educacao'], ['saude', 'tecnologia']), ['educacao']);
});

test('sem nada gravado e sem nada pedido, continua vazio', () => {
  assert.deepEqual(subjectAreasToPersist(undefined, []), []);
  assert.deepEqual(subjectAreasToPersist([], []), []);
});

test('o resultado é cópia: mexer nele não altera o que veio do banco', () => {
  const atual = ['saude'];
  const resultado = subjectAreasToPersist(undefined, atual);
  resultado.push('tecnologia');
  assert.deepEqual(atual, ['saude'], 'preservar não pode devolver a mesma referência do banco');
});
