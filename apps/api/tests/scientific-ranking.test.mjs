import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ScientificRankingPolicyError,
  normalizeRankingRule,
  rankWorks,
} from '../src/scientific-ranking.policy.ts';

const eliminatory = 'c012345678901234567890';
const classificatory = 'c112345678901234567890';
const criteria = [
  { id: eliminatory, minScore: 0, maxScore: 10, weight: 1, phase: 'ELIMINATORY' },
  { id: classificatory, minScore: 0, maxScore: 5, weight: 1, phase: 'CLASSIFICATORY' },
];

test('o corte aceita a fase de cada critério ativo e recusa nota fora da escala', () => {
  const rule = normalizeRankingRule({
    cutoff: 6,
    phases: { [classificatory]: 'CLASSIFICATORY', [eliminatory]: 'ELIMINATORY' },
  }, [eliminatory, classificatory]);
  assert.equal(rule.cutoff, 6);
  assert.equal(rule.phases[eliminatory], 'ELIMINATORY');
  assert.equal(normalizeRankingRule({
    cutoff: 6.5,
    phases: { [eliminatory]: 'ELIMINATORY', [classificatory]: 'CLASSIFICATORY' },
  }, [eliminatory, classificatory]).cutoff, 6.5);
  for (const input of [
    { cutoff: 6.5, phases: { [eliminatory]: 'ELIMINATORY' } },
    { cutoff: 11, phases: { [eliminatory]: 'ELIMINATORY', [classificatory]: 'CLASSIFICATORY' } },
    { cutoff: 6.555, phases: { [eliminatory]: 'ELIMINATORY', [classificatory]: 'CLASSIFICATORY' } },
    { cutoff: 6, phases: { [eliminatory]: 'OUTRA', [classificatory]: 'CLASSIFICATORY' } },
    null,
  ]) {
    assert.throws(() => normalizeRankingRule(input, input && input.phases ? [eliminatory, classificatory] : []), ScientificRankingPolicyError);
  }
});

test('abaixo do corte elimina, a nota classificatória ordena e a faixa vira escala de 0 a 10', () => {
  const rule = { cutoff: 6, phases: { [eliminatory]: 'ELIMINATORY', [classificatory]: 'CLASSIFICATORY' } };
  const rows = rankWorks(rule, criteria, [
    { submissionId: 'b', title: 'Beta', status: 'UNDER_REVIEW', reviews: [{ scores: [{ criterionId: eliminatory, value: 8 }, { criterionId: classificatory, value: 2 }] }] },
    { submissionId: 'a', title: 'Alfa', status: 'UNDER_REVIEW', reviews: [{ scores: [{ criterionId: eliminatory, value: 4 }, { criterionId: classificatory, value: 5 }] }] },
    { submissionId: 'c', title: 'Gama', status: 'SUBMITTED', reviews: [] },
    { submissionId: 'd', title: 'Delta', status: 'UNDER_REVIEW', reviews: [{ scores: [{ criterionId: eliminatory, value: 9 }, { criterionId: classificatory, value: 5 }] }] },
  ]);
  assert.deepEqual(rows.map((row) => [row.submissionId, row.outcome, row.eliminatoryAverage, row.classificatoryAverage]), [
    ['d', 'CLASSIFIED', 9, 10],
    ['b', 'CLASSIFIED', 8, 4],
    ['c', 'INSUFFICIENT', null, null],
    ['a', 'ELIMINATED', 4, 10],
  ]);
  assert.equal(JSON.stringify(rows).includes('parecer'), false);
});
