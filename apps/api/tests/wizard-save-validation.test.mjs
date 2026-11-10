import assert from 'node:assert/strict';
import test from 'node:test';
import { getWizardSaveIssues, subjectAreasToPersist } from '../src/wizard-save-policy.ts';

/**
 * Dois defeitos da auditoria do organizador (#640, contrato #661), cada um com
 * o teste que o REPROVA antes da correção.
 *
 * C-01: a ordem das datas só era exigida em `complete()`; `save()` gravava o
 *       intervalo invertido e respondia 200.
 * C-02: `persistEventData` escrevia `subjectAreas` sem guarda, então um
 *       salvamento parcial apagava as áreas.
 *
 * O arquivo importa `wizard-save-policy.ts`, que não tem dependência nenhuma, e
 * por isso roda com `--experimental-strip-types` sem build. A tentativa
 * anterior importava `wizard-policy.ts` e reprovou no CI: aquele módulo importa
 * `./event-publication/public-discovery.policy` sem extensão, e o Node não
 * resolve import relativo extensionless nesse modo.
 *
 * Não há aqui asserção de que "toda recusa de salvar também é recusa de
 * concluir": `getWizardCompletionIssues` passou a CHAMAR `getWizardSaveIssues`
 * em vez de repetir a comparação, então a divergência deixou de ser possível
 * por construção. Testar isso seria testar o compilador.
 */

const ERRO = 'A data de término não pode ser anterior à data de início.';
const dia = (n) => `2026-12-${String(n).padStart(2, '0')}T12:00:00.000Z`;

test('salvar com término anterior ao início é recusado', () => {
  assert.deepEqual(getWizardSaveIssues({ startDate: dia(10), endDate: dia(1) }), [ERRO]);
});
test('evento de um único instante é legítimo', () => {
  assert.deepEqual(getWizardSaveIssues({ startDate: dia(10), endDate: dia(10) }), []);
});
test('rascunho com uma data só continua podendo ser salvo', () => {
  for (const p of [{ startDate: dia(10) }, { endDate: dia(1) }, {}, { startDate: null, endDate: null }, { startDate: dia(10), endDate: null }]) {
    assert.deepEqual(getWizardSaveIssues(p), [], JSON.stringify(p));
  }
});
test('a comparação é por instante, não por texto do mesmo dia', () => {
  assert.deepEqual(getWizardSaveIssues({ startDate: '2026-12-02T03:00:00.000Z', endDate: '2026-12-02T01:00:00.000Z' }), [ERRO]);
});

test('corpo sem áreas preserva as gravadas', () => {
  for (const pedido of [undefined, [], null]) {
    assert.deepEqual(subjectAreasToPersist(pedido, ['saude', 'tecnologia']), ['saude', 'tecnologia'], String(pedido));
  }
});
test('corpo com áreas substitui as gravadas', () => {
  assert.deepEqual(subjectAreasToPersist(['educacao'], ['saude']), ['educacao']);
});

// A falha de CI 42706235716: `current is not iterable`. O chamador passava um
// Event sem `subjectAreas`. No banco o campo tem `@default([])` e nunca vem
// ausente, mas estourar por isso trocaria defeito de dado por indisponibilidade.
test('current ausente ou nulo não estoura, e significa vazio', () => {
  for (const atual of [undefined, null]) {
    assert.deepEqual(subjectAreasToPersist(undefined, atual), [], `current=${String(atual)}`);
    assert.deepEqual(subjectAreasToPersist(['educacao'], atual), ['educacao'], `current=${String(atual)}`);
  }
});

test('sem nada gravado e sem nada pedido, continua vazio', () => {
  assert.deepEqual(subjectAreasToPersist(undefined, []), []);
  assert.deepEqual(subjectAreasToPersist([], []), []);
});
test('o resultado é cópia: mexer nele não altera o que veio do banco', () => {
  const atual = ['saude'];
  const r = subjectAreasToPersist(undefined, atual);
  r.push('tecnologia');
  assert.deepEqual(atual, ['saude']);
});
