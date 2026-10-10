import assert from 'node:assert/strict';
import test from 'node:test';
import {
  distributionLabel,
  planAssistedReviewDistribution,
  registrationEmail,
} from '../src/scientific-review-distribution.policy.ts';

const reviewers = [
  { id: 'rev-a', email: 'a@evento.test' },
  { id: 'rev-b', email: 'b@evento.test' },
  { id: 'rev-author', email: 'autor@evento.test' },
  { id: 'rev-empty', email: '  ' },
];

test('a sugestão pula autor, contato vazio e quem já está na versão', () => {
  const plan = planAssistedReviewDistribution({
    cap: 2,
    works: [{
      submissionId: 'sub-1',
      versionId: 'ver-1',
      authorPersonIds: ['rev-author'],
      authorEmails: ['autor@evento.test', 'dono@evento.test'],
      activeReviewerIds: ['rev-a'],
      assignedCount: 1,
    }],
    reviewers,
  });
  assert.deepEqual(plan.plans, [{ submissionId: 'sub-1', versionId: 'ver-1', reviewerPersonId: 'rev-b' }]);
  assert.equal(plan.pending, false);
  assert.equal(registrationEmail({ email: 'dono@evento.test' }), 'dono@evento.test');
  assert.equal(registrationEmail({}), null);
});

test('sem teto entra um avaliador e o lote para em 40', () => {
  const works = Array.from({ length: 41 }, (_, index) => ({
    submissionId: `sub-${index}`,
    versionId: `ver-${index}`,
    authorPersonIds: [],
    authorEmails: [],
    activeReviewerIds: [],
    assignedCount: 0,
  }));
  const plan = planAssistedReviewDistribution({ cap: null, works, reviewers: [{ id: 'rev-a', email: 'a@evento.test' }] });
  assert.equal(plan.plans.length, 40);
  assert.equal(plan.pending, true);
  assert.equal(new Set(plan.plans.map((item) => item.reviewerPersonId)).size, 1);
  assert.equal(distributionLabel('<script>'), 'Não exibível');
  assert.equal(distributionLabel('Ana Silva'), 'Ana Silva');
});
