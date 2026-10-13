import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificRankingService } from '../dist/scientific-ranking.service.js';

const event = { id: 'evt_1', organizationId: 'org_1' };
const criterionId = 'c012345678901234567890';

function harness() {
  const audits = [];
  let config = null;
  const prisma = {
    event: { findUnique: async () => event },
    scientificReviewCriterion: {
      findMany: async ({ where }) => {
        assert.equal(where.organizationId, event.organizationId);
        assert.equal(where.eventId, event.id);
        return [{ id: criterionId, code: 'originalidade', label: 'Originalidade', minScore: 0, maxScore: 10, weight: 1 }];
      },
    },
    eventCapability: {
      findUnique: async () => (config ? { config } : null),
      upsert: async ({ where, create }) => {
        assert.equal(where.eventId_code.eventId, event.id);
        assert.equal(create.eventId, event.id);
        config = create.config;
        return create;
      },
    },
    scientificSubmission: {
      findMany: async ({ where }) => {
        assert.equal(where.organizationId, event.organizationId);
        return [{
          id: 'submission_1',
          title: 'Trabalho de ensaio',
          status: 'UNDER_REVIEW',
          versions: [{ id: 'version_1' }],
        }];
      },
    },
    scientificReviewAssignment: {
      findMany: async ({ where, select }) => {
        assert.equal(where.organizationId, event.organizationId);
        assert.equal(where.status, 'SUBMITTED');
        assert.equal(JSON.stringify(select).includes('comment'), false);
        return [{
          submissionId: 'submission_1',
          versionId: 'version_1',
          review: { scores: [{ criterionId, value: 4 }] },
        }];
      },
    },
    auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
  };
  const authorization = { requireRole: async (_userId, organizationId) => { assert.equal(organizationId, event.organizationId); } };
  return { audits, service: new ScientificRankingService(prisma, authorization) };
}

test('sem corte gravado ninguém é eliminado e o parecer não entra na consulta', async () => {
  const { service } = harness();
  const view = await service.get('user_1', event.id);
  assert.equal(view.configured, false);
  assert.equal(view.rows[0].outcome, 'CLASSIFIED');
  assert.equal(view.rows[0].eliminatoryAverage, null);
  assert.equal(JSON.stringify(view).includes('confidential'), false);
});

test('gravar o corte eliminatório audita só a conta e a nota', async () => {
  const { audits, service } = harness();
  const saved = await service.save('user_1', event.id, {
    cutoff: 6,
    phases: { [criterionId]: 'ELIMINATORY' },
  });
  assert.equal(saved.rows[0].outcome, 'ELIMINATED');
  assert.equal(saved.rows[0].eliminatoryAverage, 4);
  assert.equal(audits[0].organizationId, event.organizationId);
  assert.equal(audits[0].metadata.cutoff, 6);
  assert.equal(audits[0].metadata.eliminatory, 1);
  assert.equal(JSON.stringify(audits).includes('Trabalho de ensaio'), false);
  assert.equal(JSON.stringify(audits).includes(criterionId), false);
});
