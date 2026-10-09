// Executa contra um PostgreSQL descartável com as migrations aplicadas (DATABASE_URL).
// No CI roda dentro do contêiner da API, depois do smoke; localmente, após `npm run build`.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test, { after, before } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { AuthorizationService } from '../dist/authorization.service.js';
import { ScientificReviewerService } from '../dist/scientific-reviewer.service.js';

const run = randomBytes(5).toString('hex');
const token = `Reabrirpg${run}`;
const prisma = new PrismaClient();
const reviewers = new ScientificReviewerService(prisma, new AuthorizationService(prisma));
const ctx = {};

async function status(promise) {
  try { await promise; return 'ok'; } catch (error) { return error.getStatus?.() ?? `erro bruto: ${error.message}`; }
}

before(async () => {
  const owner = await prisma.user.create({ data: { name: 'PG dono', email: `owner-${run}@evolvia-ci.local`, passwordHash: 'x' } });
  const external = await prisma.user.create({ data: { name: 'PG externo', email: `external-${run}@evolvia-ci.local`, passwordHash: 'x' } });
  ctx.owner = owner; ctx.external = external;
  const organization = await prisma.organization.create({ data: { name: `Org ${token}`, slug: `org-${token.toLowerCase()}`, createdById: owner.id } });
  const other = await prisma.organization.create({ data: { name: `Ext ${token}`, slug: `ext-${token.toLowerCase()}`, createdById: external.id } });
  await prisma.organizationMembership.createMany({ data: [
    { organizationId: organization.id, userId: owner.id, role: 'OWNER' },
    { organizationId: other.id, userId: external.id, role: 'OWNER' },
  ] });
  const event = await prisma.event.create({ data: {
    ownerId: owner.id, organizationId: organization.id, name: `${token} evento`, slug: `${token.toLowerCase()}-${randomBytes(4).toString('hex')}`,
    eventType: 'Congresso', format: 'IN_PERSON', registrationMode: 'FREE', status: 'PUBLISHED', profileCode: 'SCIENTIFIC_EVENT',
  } });
  const scope = { organizationId: organization.id, eventId: event.id };
  ctx.event = event; ctx.scope = scope;
  await prisma.scientificSubmissionConfig.create({ data: { ...scope, evaluationStyle: 'ANALYTIC' } });
  const modality = await prisma.scientificSubmissionModality.create({ data: { ...scope, code: 'ORAL', name: 'Oral', active: true } });
  ctx.criterion = await prisma.scientificReviewCriterion.create({ data: { ...scope, code: 'metodo', label: 'Método', minScore: 0, maxScore: 10 } });
  const submission = await prisma.scientificSubmission.create({ data: { ...scope, modalityId: modality.id, title: 'Trabalho fictício', status: 'UNDER_REVIEW', currentVersion: 1, submittedAt: new Date() } });
  const version = await prisma.scientificSubmissionVersion.create({ data: { ...scope, submissionId: submission.id, versionNumber: 1, title: 'Trabalho fictício', submittedAt: new Date() } });
  ctx.submission = submission;
  const people = [];
  for (const key of ['rita', 'saulo']) {
    people.push(await prisma.scientificPerson.create({ data: { ...scope, name: `Avaliador ${key}`, email: `${key}-${run}@evolvia-ci.local` } }));
  }
  ctx.assignments = [];
  for (const person of people) {
    ctx.assignments.push(await prisma.scientificReviewAssignment.create({ data: { ...scope, submissionId: submission.id, versionId: version.id, reviewerPersonId: person.id } }));
  }
  ctx.tokens = [];
  for (const person of people) {
    const access = await reviewers.issueAccess(owner.id, event.id, person.id);
    ctx.tokens.push(`Bearer ${access.accessPath.split('#acesso=')[1]}`);
  }
  for (const [index, assignment] of ctx.assignments.entries()) {
    await reviewers.submit(event.slug, ctx.tokens[index], assignment.id, {
      conflictStatus: 'CLEAR', recommendation: 'ACCEPT', authorComment: `Parecer fictício ${index + 1}`, scores: [{ criterionId: ctx.criterion.id, value: 7 + index }],
    });
  }
});

after(async () => {
  await prisma.event.updateMany({ where: { name: { startsWith: token } }, data: { status: 'CANCELLED' } });
  await prisma.$disconnect();
});

test('outra organização não retoma o parecer e nada muda', async () => {
  const [target] = ctx.assignments;
  assert.ok([403, 404].includes(await status(reviewers.reopen(ctx.external.id, ctx.event.id, target.id))));
  assert.equal((await prisma.scientificReviewAssignment.findUniqueOrThrow({ where: { id: target.id } })).status, 'SUBMITTED');
  assert.equal(await prisma.scientificReviewRevision.count({ where: { assignmentId: target.id } }), 1);
});

test('parecer anterior à migration: duas retomadas simultâneas, uma vence e a outra recebe 409 sem erro bruto', async () => {
  const [target, other] = ctx.assignments;
  await prisma.scientificReviewRevision.deleteMany({ where: { assignmentId: target.id } });
  const results = await Promise.all([
    status(reviewers.reopen(ctx.owner.id, ctx.event.id, target.id)),
    status(reviewers.reopen(ctx.owner.id, ctx.event.id, target.id)),
  ]);
  assert.deepEqual(results.sort(), [409, 'ok'].sort());
  const revisions = await prisma.scientificReviewRevision.findMany({ where: { assignmentId: target.id } });
  assert.deepEqual(revisions.map((item) => item.versionNumber), [1]);
  assert.equal((await prisma.scientificReviewAssignment.findUniqueOrThrow({ where: { id: target.id } })).status, 'IN_PROGRESS');
  assert.equal((await prisma.scientificReviewAssignment.findUniqueOrThrow({ where: { id: other.id } })).status, 'SUBMITTED');
  const review = await prisma.scientificReview.findFirstOrThrow({ where: { assignmentId: target.id }, include: { scores: true } });
  assert.deepEqual(review.scores.map((score) => score.value), [7]);
  assert.equal(await prisma.auditLog.count({ where: { entityId: target.id, action: 'scientific.review_reopened' } }), 1);
});

test('o reenvio grava a versão 2 e preserva a versão 1 com a rubrica original', async () => {
  const [target] = ctx.assignments;
  await prisma.scientificReviewCriterion.update({ where: { id: ctx.criterion.id }, data: { label: 'Método revisado' } });
  await reviewers.submit(ctx.event.slug, ctx.tokens[0], target.id, {
    conflictStatus: 'CLEAR', recommendation: 'CHANGES', authorComment: 'Parecer fictício revisto', scores: [{ criterionId: ctx.criterion.id, value: 5 }],
  });
  const revisions = await prisma.scientificReviewRevision.findMany({ where: { assignmentId: target.id }, orderBy: { versionNumber: 'asc' } });
  assert.deepEqual(revisions.map((item) => item.versionNumber), [1, 2]);
  assert.equal(revisions[0].recommendation, 'ACCEPT');
  assert.deepEqual(revisions[0].scores, [{ criterionId: ctx.criterion.id, value: 7 }]);
  assert.equal(revisions[0].rubric.criteria[0].label, 'Método');
  assert.equal(revisions[1].rubric.criteria[0].label, 'Método revisado');
  assert.equal(await prisma.scientificReview.count({ where: { assignmentId: target.id } }), 1);
});
