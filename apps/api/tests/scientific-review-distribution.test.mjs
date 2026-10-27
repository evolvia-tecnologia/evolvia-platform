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

test('o lote considera carga anterior e desempata IDs de forma determinística', () => {
  const work = { submissionId: 's', versionId: 'v', authorPersonIds: [], authorEmails: [], activeReviewerIds: [], assignedCount: 0 };
  const plan = planAssistedReviewDistribution({ cap: 1, works: [work], reviewers: [
    { id: 'rev-a', email: 'a@evento.test', assignmentCount: 40 },
    { id: 'rev-b', email: 'b@evento.test', assignmentCount: 2 },
    { id: 'rev-c', email: 'c@evento.test', assignmentCount: 2 },
  ] });
  assert.equal(plan.plans[0].reviewerPersonId, 'rev-b');
  const next = planAssistedReviewDistribution({ cap: 1, works: [{ ...work, submissionId: 's2' }], reviewers: [
    { id: 'rev-a', email: 'a@evento.test', assignmentCount: 40 },
    { id: 'rev-b', email: 'b@evento.test', assignmentCount: 3 },
    { id: 'rev-c', email: 'c@evento.test', assignmentCount: 2 },
  ] });
  assert.equal(next.plans[0].reviewerPersonId, 'rev-c');
});

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

