import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthorSubmissionPolicyError } from '../dist/scientific-author-policy.js';
import { normalizeReviewerOpinion, normalizeScientificDecision } from '../dist/scientific-reviewer-policy.js';
import { validateReviewForSubmit } from '../dist/scientific-review-policy.js';

test('parecer do avaliador exige conflito e nota dentro do critério', () => {
  const opinion = normalizeReviewerOpinion({
    conflictStatus: 'CLEAR',
    recommendation: 'ACCEPT',
    scores: [{ criterionId: 'criterio1234567890', value: 8 }],
    authorComment: 'Texto claro.',
  });
  assert.equal(opinion.recommendation, 'ACCEPT');
  assert.deepEqual(validateReviewForSubmit(
    [{ id: 'criterio1234567890', required: true, minScore: 0, maxScore: 10, weight: 1 }],
    opinion.scores,
    opinion.conflictStatus,
    opinion.recommendation,
  ), []);
  assert.throws(() => normalizeReviewerOpinion({ conflictStatus: 'CONFLICT', conflictReason: 'ok' }), AuthorSubmissionPolicyError);
});

test('decisão científica aceita só os três resultados', () => {
  assert.equal(normalizeScientificDecision({ status: 'ACCEPTED_WITH_CHANGES' }), 'ACCEPTED_WITH_CHANGES');
  assert.throws(() => normalizeScientificDecision({ status: 'SUBMITTED' }), AuthorSubmissionPolicyError);
});

test('nota sintética recusa limites inválidos antes do banco e aceita as bordas', () => {
  const opinion = { conflictStatus: 'CLEAR', recommendation: 'ACCEPT', scores: [] };
  for (const overallScore of [-1, 10.1, NaN, Infinity, '8']) {
    assert.throws(() => normalizeReviewerOpinion({ ...opinion, overallScore }), AuthorSubmissionPolicyError);
  }
  for (const overallScore of [0, 10, null]) {
    assert.equal(normalizeReviewerOpinion({ ...opinion, overallScore }).overallScore, overallScore);
  }
});
