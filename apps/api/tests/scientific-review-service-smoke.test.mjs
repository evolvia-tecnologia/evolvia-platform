import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificReviewsService } from '../dist/scientific-reviews.service.js';

function makeService() {
  const event = {
    id: 'event-1',
    name: 'Congresso Evolvia',
    organizationId: 'org-1',
    profileCode: 'SCIENTIFIC_EVENT',
    status: 'SETUP',
  };
  const prisma = {
    event: { findUnique: async () => event },
    scientificSubmissionConfig: { findUnique: async () => ({ reviewMode: 'DOUBLE_BLIND' }) },
    scientificReviewCriterion: { findMany: async () => [] },
    scientificReviewAssignment: { findMany: async () => [] },
    scientificPerson: { findMany: async () => [] },
    scientificSubmission: { findMany: async () => [] },
  };
  const authorization = { requireRole: async () => ({ role: 'OWNER' }) };
  const mutationPolicy = { assertFoundationMutable: () => undefined };
  return new ScientificReviewsService(prisma, authorization, mutationPolicy);
}

test('smoke A7: painel da comissão expõe somente administração e acompanhamento', async () => {
  const management = await makeService().getManagement('owner-1', 'event-1');

  assert.equal(management.reviewMode, 'DOUBLE_BLIND');
  assert.equal(management.actorBoundary.management, 'ORGANIZER_COMMITTEE');
  assert.equal(management.actorBoundary.reviewerActionsAvailableHere, false);
  assert.match(management.actorBoundary.message, /avaliador em área própria/i);
  assert.match(management.nextAction, /critérios de avaliação/i);
  assert.equal(management.summary.criteria, 0);
  assert.equal(management.summary.assigned, 0);
});
