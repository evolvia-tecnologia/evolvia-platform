import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateWeightedReviewScore,
  canAuthorSeeReviewerIdentity,
  canMutateReview,
  canReviewerSeeAuthorIdentity,
  canTransitionReviewAssignment,
  hasObjectiveAuthorshipConflict,
  validateReviewForSubmit,
} from '../dist/scientific-review-policy.js';

const criteria = [
  { id: 'method', required: true, minScore: 0, maxScore: 10, weight: 2 },
  { id: 'relevance', required: true, minScore: 0, maxScore: 5, weight: 1 },
  { id: 'clarity', required: false, minScore: 1, maxScore: 5, weight: 1 },
];

test('cegamento distingue a perspectiva do avaliador e do autor', () => {
  assert.equal(canReviewerSeeAuthorIdentity('OPEN'), true);
  assert.equal(canReviewerSeeAuthorIdentity('SINGLE_BLIND'), true);
  assert.equal(canReviewerSeeAuthorIdentity('DOUBLE_BLIND'), false);

  assert.equal(canAuthorSeeReviewerIdentity('OPEN'), true);
  assert.equal(canAuthorSeeReviewerIdentity('SINGLE_BLIND'), false);
  assert.equal(canAuthorSeeReviewerIdentity('DOUBLE_BLIND'), false);
});

test('autoria própria é conflito objetivo e bloqueante', () => {
  assert.equal(hasObjectiveAuthorshipConflict('reviewer-1', ['author-1', 'reviewer-1']), true);
  assert.equal(hasObjectiveAuthorshipConflict('reviewer-2', ['author-1', 'author-2']), false);
});

test('parecer submetido ou cancelado não pode ser alterado silenciosamente', () => {
  assert.equal(canMutateReview('ASSIGNED'), true);
  assert.equal(canMutateReview('IN_PROGRESS'), true);
  assert.equal(canMutateReview('SUBMITTED'), false);
  assert.equal(canMutateReview('CANCELLED'), false);

  assert.equal(canTransitionReviewAssignment('ASSIGNED', 'IN_PROGRESS'), true);
  assert.equal(canTransitionReviewAssignment('IN_PROGRESS', 'SUBMITTED'), true);
  assert.equal(canTransitionReviewAssignment('SUBMITTED', 'IN_PROGRESS'), false);
  assert.equal(canTransitionReviewAssignment('CANCELLED', 'ASSIGNED'), false);
});

test('exige declaração de conflito, recomendação e critérios obrigatórios', () => {
  const errors = validateReviewForSubmit(
    criteria,
    [{ criterionId: 'method', value: 8 }],
    'PENDING',
    null,
  );

  assert.deepEqual(errors.map((item) => item.code), [
    'CONFLICT_PENDING',
    'RECOMMENDATION_REQUIRED',
    'REQUIRED_CRITERION_MISSING',
  ]);
});

test('conflito declarado bloqueia envio mesmo com notas completas', () => {
  const errors = validateReviewForSubmit(
    criteria,
    [
      { criterionId: 'method', value: 8 },
      { criterionId: 'relevance', value: 4 },
    ],
    'CONFLICT',
    'ACCEPT',
  );

  assert.deepEqual(errors.map((item) => item.code), ['CONFLICT_DECLARED']);
});

test('rejeita critério duplicado, desconhecido e nota fora da escala', () => {
  const errors = validateReviewForSubmit(
    criteria,
    [
      { criterionId: 'method', value: 11 },
      { criterionId: 'method', value: 7 },
      { criterionId: 'unknown', value: 3 },
      { criterionId: 'relevance', value: 4 },
    ],
    'CLEAR',
    'CHANGES',
  );

  assert.equal(errors.some((item) => item.code === 'SCORE_OUT_OF_RANGE'), true);
  assert.equal(errors.some((item) => item.code === 'DUPLICATED_CRITERION'), true);
  assert.equal(errors.some((item) => item.code === 'UNKNOWN_CRITERION'), true);
});

test('parecer completo é válido e score ponderado é derivado', () => {
  const scores = [
    { criterionId: 'method', value: 8 },
    { criterionId: 'relevance', value: 5 },
    { criterionId: 'clarity', value: 4 },
  ];

  assert.equal(validateReviewForSubmit(criteria, scores, 'CLEAR', 'ACCEPT').length, 0);
  assert.equal(calculateWeightedReviewScore(criteria, scores), 6.25);
});
