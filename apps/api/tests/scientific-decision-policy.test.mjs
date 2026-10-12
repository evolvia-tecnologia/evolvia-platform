import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAuthorDecisionView,
  canTransitionSubmissionToDecision,
  recommendationIsOnlyEvidence,
  requiresNewVersion,
  validateScientificDecision,
} from '../dist/scientific-decision-policy.js';

test('somente trabalho em avaliação pode receber decisão oficial', () => {
  assert.equal(canTransitionSubmissionToDecision('UNDER_REVIEW', 'ACCEPTED'), true);
  assert.equal(canTransitionSubmissionToDecision('UNDER_REVIEW', 'REJECTED'), true);
  assert.equal(canTransitionSubmissionToDecision('UNDER_REVIEW', 'ACCEPTED_WITH_CHANGES'), true);
  assert.equal(canTransitionSubmissionToDecision('SUBMITTED', 'ACCEPTED'), false);
  assert.equal(canTransitionSubmissionToDecision('ACCEPTED', 'REJECTED'), false);
});

test('parecer do avaliador permanece evidência e não impõe decisão', () => {
  assert.equal(recommendationIsOnlyEvidence('ACCEPT', 'ACCEPTED'), true);
  assert.equal(recommendationIsOnlyEvidence('ACCEPT', 'REJECTED'), false);
  assert.equal(recommendationIsOnlyEvidence('CHANGES', 'ACCEPTED_WITH_CHANGES'), true);
});

test('decisão exige trabalho em avaliação e versão imutável correta', () => {
  const errors = validateScientificDecision(
    'SUBMITTED',
    'submission-1',
    'version-2',
    {
      submissionId: 'submission-1',
      versionId: 'version-1',
      decision: null,
    },
  );

  assert.deepEqual(errors.map((item) => item.code), [
    'DECISION_REQUIRED',
    'SOURCE_STATUS_NOT_ELIGIBLE',
    'VERSION_MISMATCH',
  ]);
});

test('aceite com alterações exige instrução explícita ao autor', () => {
  const errors = validateScientificDecision(
    'UNDER_REVIEW',
    'submission-1',
    'version-1',
    {
      submissionId: 'submission-1',
      versionId: 'version-1',
      decision: 'ACCEPTED_WITH_CHANGES',
      publicMessage: '   ',
    },
  );

  assert.deepEqual(errors.map((item) => item.code), ['CHANGES_MESSAGE_REQUIRED']);
  assert.equal(requiresNewVersion('ACCEPTED_WITH_CHANGES'), true);
  assert.equal(requiresNewVersion('ACCEPTED'), false);
});

test('visão do autor minimiza dados internos e identidade operacional', () => {
  const view = buildAuthorDecisionView({
    decision: 'REJECTED',
    publicMessage: 'A comissão concluiu a análise.',
    decidedAt: '2026-08-10T03:10:00.000Z',
    versionId: 'version-1',
    internalNote: 'Comentário reservado à comissão.',
    decidedByUserId: 'user-1',
    reviewerPersonIds: ['reviewer-1'],
  });

  assert.deepEqual(view, {
    decision: 'REJECTED',
    publicMessage: 'A comissão concluiu a análise.',
    decidedAt: '2026-08-10T03:10:00.000Z',
    versionId: 'version-1',
    requiresNewVersion: false,
  });
});
