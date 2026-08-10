import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificReviewsService } from '../dist/scientific-reviews.service.js';

function makePrisma({ reviewMode = 'DOUBLE_BLIND', hasAssignment = true } = {}) {
  const event = {
    id: 'event-1',
    name: 'Congresso Evolvia',
    organizationId: 'org-1',
    profileCode: 'SCIENTIFIC_EVENT',
  };
  const person = {
    id: 'reviewer-1',
    name: 'Avaliador Um',
    email: 'avaliador@evolvia.test',
    status: 'ACTIVE',
  };
  const criterion = {
    id: 'criterion-1',
    label: 'Qualidade metodológica',
    required: true,
    minScore: 0,
    maxScore: 10,
    weight: 2,
    active: true,
    sortOrder: 1,
  };
  const assignment = {
    id: 'assignment-1',
    eventId: event.id,
    organizationId: event.organizationId,
    reviewerPersonId: person.id,
    status: 'IN_PROGRESS',
    conflictStatus: 'CLEAR',
    conflictReason: null,
    dueAt: null,
    assignmentRound: 1,
    createdAt: new Date('2026-08-09T12:00:00Z'),
    version: {
      id: 'version-1',
      versionNumber: 1,
      title: 'Trabalho científico de teste',
      abstractText: 'Resumo sem identificação dos autores.',
      keywords: ['teste'],
      fileKey: 'scientific/work-1.pdf',
    },
    submission: {
      authors: [
        {
          sortOrder: 1,
          person: {
            id: 'author-1',
            name: 'Autora Identificável',
            institution: 'Instituição Sigilosa',
          },
        },
      ],
    },
    review: {
      recommendation: 'ACCEPT',
      authorComment: 'Comentário ao autor',
      confidentialComment: 'Comentário confidencial',
      submittedAt: null,
      scores: [{ criterionId: criterion.id, value: 8 }],
    },
  };

  return {
    event: { findUnique: async () => event },
    scientificPerson: { findFirst: async () => person },
    scientificSubmissionConfig: { findUnique: async () => ({ reviewMode }) },
    scientificReviewCriterion: { findMany: async () => [criterion] },
    scientificReviewAssignment: {
      findFirst: async () => (hasAssignment ? assignment : null),
      findMany: async () => (hasAssignment ? [assignment] : []),
    },
  };
}

function service(prisma) {
  return new ScientificReviewsService(prisma, {}, {});
}

test('smoke A7: DOUBLE_BLIND remove autoria e instituição no backend', async () => {
  const workspace = await service(makePrisma({ reviewMode: 'DOUBLE_BLIND' })).getReviewerWorkspace(
    'user-1',
    'avaliador@evolvia.test',
    'event-1',
  );

  assert.equal(workspace.reviewMode, 'DOUBLE_BLIND');
  assert.equal(workspace.assignments.length, 1);
  assert.deepEqual(workspace.assignments[0].authors, []);
  assert.equal(workspace.assignments[0].version.title, 'Trabalho científico de teste');
  assert.equal(workspace.assignments[0].version.fileAvailable, true);
  assert.equal(workspace.assignments[0].review.weightedScore, 8);
  assert.match(workspace.privacyNotice, /removidas desta visão pelo servidor/i);
});

test('smoke A7: SINGLE_BLIND mantém autoria para avaliador sem expor sua identidade ao autor', async () => {
  const workspace = await service(makePrisma({ reviewMode: 'SINGLE_BLIND' })).getReviewerWorkspace(
    'user-1',
    'AVALIADOR@EVOLVIA.TEST',
    'event-1',
  );

  assert.equal(workspace.assignments[0].authors[0].name, 'Autora Identificável');
  assert.equal(workspace.assignments[0].authors[0].institution, 'Instituição Sigilosa');
  assert.match(workspace.privacyNotice, /sua identidade não deve ser exposta ao autor/i);
});

test('smoke A7: conta sem assignment real permanece deny-by-default', async () => {
  await assert.rejects(
    () => service(makePrisma({ hasAssignment: false })).getReviewerWorkspace(
      'user-1',
      'avaliador@evolvia.test',
      'event-1',
    ),
    (error) => error?.status === 404 && /Nenhuma atribuição de avaliação/.test(error.message),
  );
});
