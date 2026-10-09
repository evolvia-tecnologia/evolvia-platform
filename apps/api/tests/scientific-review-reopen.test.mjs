import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificReviewerService } from '../dist/scientific-reviewer.service.js';

const scope = { eventId: 'cevent00000001', organizationId: 'corganization01' };
const assignmentId = 'cassignment001';
const otherId = 'cassignment002';
const reviewId = 'creview0000001';
const criterionId = 'ccriterion0001';
const submittedAt = new Date('2026-10-01T12:00:00.000Z');

function harness({ status = 'SUBMITTED', withRevision = false } = {}) {
  const calls = [];
  const scores = [{ id: 'cscore00000001', criterionId, value: 8 }];
  const revisions = withRevision ? [{ versionNumber: 1 }] : [];
  const statuses = { [assignmentId]: status, [otherId]: 'SUBMITTED' };
  const tx = {
    scientificReviewAssignment: {
      findUnique: async ({ where }) => {
        assert.deepEqual(where.id_eventId_organizationId, { id: assignmentId, ...scope });
        if (statuses[assignmentId] === 'CANCELLED') return { id: assignmentId, status: 'CANCELLED', submissionId: 'csubmission001', review: null, revisions: [] };
        return {
          id: assignmentId, status: statuses[assignmentId], submissionId: 'csubmission001',
          review: { id: reviewId, recommendation: 'ACCEPT', overallScore: null, authorComment: 'Bom', confidentialComment: null, submittedAt, scores },
          revisions,
        };
      },
      count: async ({ where }) => {
        assert.equal(where.id.not, assignmentId);
        return statuses[otherId] === 'CANCELLED' ? 0 : 1;
      },
      updateMany: async ({ where, data }) => {
        assert.equal(where.id, assignmentId);
        assert.equal(where.status, 'SUBMITTED');
        assert.equal(data.status, 'IN_PROGRESS');
        assert.equal(data.submittedAt, null);
        calls.push('reopen');
        statuses[assignmentId] = 'IN_PROGRESS';
        return { count: status === 'SUBMITTED' ? 1 : 0 };
      },
    },
    scientificReviewCriterion: { findMany: async () => [{ id: criterionId, code: 'metodo', label: 'Método', minScore: 0, maxScore: 10, weight: 1, required: true, active: true }] },
    scientificSubmissionConfig: { findUnique: async () => ({ evaluationStyle: 'ANALYTIC' }) },
    scientificReviewRevision: { create: async ({ data }) => { calls.push(['revision', data.versionNumber, data.scores, data.rubric]); revisions.push({ versionNumber: data.versionNumber }); return data; } },
    scientificReviewScore: { count: async () => scores.length },
    auditLog: { create: async ({ data }) => { calls.push(['audit', data.action, data.metadata]); } },
  };
  const prisma = {
    event: { findUnique: async () => ({ id: scope.eventId, organizationId: scope.organizationId, status: 'PUBLISHED' }) },
    $transaction: async (callback) => callback(tx),
  };
  const authorization = { requireRole: async () => undefined };
  return { service: new ScientificReviewerService(prisma, authorization), calls, statuses, scores };
}

test('retomar arquiva a rubrica, mantém as notas e não mexe na banca', async () => {
  const h = harness();
  const result = await h.service.reopen('cuser000000001', scope.eventId, assignmentId);
  assert.equal(result.status, 'IN_PROGRESS');
  assert.equal(result.versionNumber, 1);
  assert.equal(result.boardSize, 1);
  assert.equal(h.statuses[otherId], 'SUBMITTED');
  assert.equal(h.scores[0].value, 8);
  assert.equal(h.calls[0], 'reopen', 'a atribuição é reivindicada antes de arquivar');
  assert.equal(h.calls[1][0], 'revision');
  assert.equal(h.calls[1][1], 1);
  assert.deepEqual(h.calls[1][2], [{ criterionId, value: 8 }]);
  assert.equal(h.calls[1][3].source, 'RECONSTRUCTED_AT_REOPEN');
  assert.equal(h.calls[2][1], 'scientific.review_reopened');
  assert.equal(h.calls[2][2].boardSize, 1);
});

test('parecer ainda não enviado não abre outra versão', async () => {
  const h = harness({ status: 'IN_PROGRESS', withRevision: true });
  await assert.rejects(h.service.reopen('cuser000000001', scope.eventId, assignmentId), /já enviado/);
  assert.deepEqual(h.calls, []);
  assert.equal(h.statuses[otherId], 'SUBMITTED');
});

test('cada atribuição mostra sua rubrica arquivada mesmo quando a configuração atual muda', async () => {
  const oldCriterion = { id: criterionId, code: 'metodo', label: 'Método original', minScore: 0, maxScore: 10, weight: 1, required: true };
  const revision = { versionNumber: 1, submittedAt, rubric: { style: 'ANALYTIC', source: 'AT_SUBMISSION', criteria: [oldCriterion], secret: 'não devolver' },
    scores: [{ criterionId, value: 8 }], overallScore: null, recommendation: 'ACCEPT' };
  const prisma = {
    scientificSubmissionConfig: { findUnique: async () => ({ evaluationStyle: 'SYNTHETIC', reviewMode: 'DOUBLE_BLIND' }) },
    scientificReviewCriterion: { findMany: async () => [{ ...oldCriterion, label: 'Método atual', maxScore: 5, weight: 3 }] },
    scientificReviewAssignment: { findMany: async (query) => {
      assert.equal(query.where.reviewerPersonId, 'avaliador-atual');
      assert.equal(query.where.eventId, scope.eventId);
      assert.equal(query.where.organizationId, scope.organizationId);
      return [{ id: assignmentId, status: 'IN_PROGRESS', conflictStatus: 'CLEAR', dueAt: null, submittedAt: null, review: null,
        revisions: [revision], submission: { authors: [{ person: { name: 'Autor oculto' } }] }, version: { title: 'Trabalho', abstractText: 'Resumo' } }];
    } },
  };
  const service = new ScientificReviewerService(prisma, {});
  service.access = async () => ({ ...scope, personId: 'avaliador-atual', personName: 'Avaliador' });
  const result = await service.area('congresso', 'Bearer fixture');
  assert.equal(result.evaluationStyle, 'SYNTHETIC');
  assert.equal(result.criteria[0].maxScore, 5);
  const archived = result.assignments[0].revisions[0];
  assert.equal(archived.rubric.style, 'ANALYTIC');
  assert.equal(archived.rubric.source, 'AT_SUBMISSION');
  assert.deepEqual(archived.rubric.criteria, [oldCriterion]);
  assert.deepEqual(archived.scores, [{ criterionId, value: 8 }]);
  assert.equal('secret' in archived.rubric, false);
  assert.deepEqual(result.assignments[0].submission.authors, []);
  delete revision.rubric.source;
  assert.equal((await service.area('congresso', 'Bearer fixture')).assignments[0].revisions[0].rubric.source, 'UNKNOWN');
  revision.rubric.criteria[0].weight = 'inválido';
  assert.equal((await service.area('congresso', 'Bearer fixture')).assignments[0].revisions[0].rubric, null);
});
