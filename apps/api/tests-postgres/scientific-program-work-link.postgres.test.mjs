// Executa contra um PostgreSQL descartável com as migrations aplicadas (DATABASE_URL).
// No CI roda dentro do contêiner da API, depois do smoke; localmente, após `npm run build`.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test, { after, before } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { AuthorizationService } from '../dist/authorization.service.js';
import { EventMutationPolicy } from '../dist/event-mutation-policy.service.js';
import { ScientificProgramService } from '../dist/scientific-program.service.js';

const run = randomBytes(5).toString('hex');
const token = `Vinculopg${run}`;
const prisma = new PrismaClient();
const program = new ScientificProgramService(prisma, new AuthorizationService(prisma), new EventMutationPolicy());
const ctx = {};

async function outcome(promise) {
  try { await promise; return 'ok'; } catch (error) { return error.getStatus?.() ?? `erro bruto: ${error.message}`; }
}

async function work(status = 'ACCEPTED') {
  return prisma.scientificSubmission.create({ data: { ...ctx.scope, modalityId: ctx.modality.id, title: `Trabalho fictício ${randomBytes(3).toString('hex')}`, status, currentVersion: 1, submittedAt: new Date() } });
}

async function activity() {
  const startAt = new Date(Date.now() + 86_400_000);
  return prisma.scientificProgramActivity.create({ data: {
    ...ctx.scope, title: `Sessão fictícia ${randomBytes(3).toString('hex')}`, activityType: 'Apresentação oral',
    startAt, endAt: new Date(startAt.getTime() + 3_600_000),
  } });
}

const linkAudits = (activityId) => prisma.auditLog.count({ where: { entityId: activityId, action: 'scientific.program_work_linked' } });

// Holds an uncommitted decision on the work row until release() is called, like a committee decision in flight.
async function decisionInFlight(submissionId, status) {
  let release;
  let locked;
  const gate = new Promise((resolve) => { release = resolve; });
  const ready = new Promise((resolve) => { locked = resolve; });
  const done = prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "ScientificSubmission" SET "status" = ${status}::"ScientificSubmissionStatus" WHERE "id" = ${submissionId}`;
    locked();
    await gate;
  }, { timeout: 20_000 });
  await ready;
  return { release, done };
}

before(async () => {
  ctx.owner = await prisma.user.create({ data: { name: 'PG dono', email: `owner-${run}@evolvia-ci.local`, passwordHash: 'x' } });
  ctx.external = await prisma.user.create({ data: { name: 'PG externo', email: `external-${run}@evolvia-ci.local`, passwordHash: 'x' } });
  const organization = await prisma.organization.create({ data: { name: `Org ${token}`, slug: `org-${token.toLowerCase()}`, createdById: ctx.owner.id } });
  const other = await prisma.organization.create({ data: { name: `Ext ${token}`, slug: `ext-${token.toLowerCase()}`, createdById: ctx.external.id } });
  await prisma.organizationMembership.createMany({ data: [
    { organizationId: organization.id, userId: ctx.owner.id, role: 'OWNER' },
    { organizationId: other.id, userId: ctx.external.id, role: 'OWNER' },
  ] });
  ctx.event = await prisma.event.create({ data: {
    ownerId: ctx.owner.id, organizationId: organization.id, name: `${token} evento`, slug: `${token.toLowerCase()}-${randomBytes(4).toString('hex')}`,
    eventType: 'Congresso', format: 'IN_PERSON', registrationMode: 'FREE', status: 'PUBLISHED', profileCode: 'SCIENTIFIC_EVENT',
  } });
  ctx.scope = { organizationId: organization.id, eventId: ctx.event.id };
  ctx.modality = await prisma.scientificSubmissionModality.create({ data: { ...ctx.scope, code: 'ORAL', name: 'Oral', active: true } });
});

after(async () => {
  await prisma.event.updateMany({ where: { name: { startsWith: token } }, data: { status: 'CANCELLED' } });
  await prisma.$disconnect();
});

test('decisão ACCEPTED→REJECTED em andamento: o vínculo espera, vê a recusa e não grava vínculo nem auditoria', async () => {
  const submission = await work('ACCEPTED');
  const session = await activity();
  const decision = await decisionInFlight(submission.id, 'REJECTED');
  const link = outcome(program.linkConfirmedWork(ctx.owner.id, ctx.event.id, session.id, submission.id));
  await new Promise((resolve) => setTimeout(resolve, 300));
  decision.release();
  await decision.done;
  assert.equal(await link, 400);
  assert.equal((await prisma.scientificProgramActivity.findUniqueOrThrow({ where: { id: session.id } })).submissionId, null);
  assert.equal(await linkAudits(session.id), 0);
});

test('decisão que volta atrás antes do commit mantém o vínculo válido', async () => {
  const submission = await work('ACCEPTED');
  const session = await activity();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let locked;
  const ready = new Promise((resolve) => { locked = resolve; });
  const rolledBack = prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "ScientificSubmission" SET "status" = 'REJECTED'::"ScientificSubmissionStatus" WHERE "id" = ${submission.id}`;
    locked();
    await gate;
    throw new Error('decisão desfeita');
  }, { timeout: 20_000 }).catch(() => 'desfeita');
  await ready;
  const link = outcome(program.linkConfirmedWork(ctx.owner.id, ctx.event.id, session.id, submission.id));
  await new Promise((resolve) => setTimeout(resolve, 300));
  release();
  assert.equal(await rolledBack, 'desfeita');
  assert.equal(await link, 'ok');
  assert.equal((await prisma.scientificProgramActivity.findUniqueOrThrow({ where: { id: session.id } })).submissionId, submission.id);
  assert.equal(await linkAudits(session.id), 1);
});

test('repetir o vínculo é idempotente e duas sessões disputando o mesmo trabalho deixam um único vínculo', async () => {
  const submission = await work('ACCEPTED_WITH_CHANGES');
  const first = await activity();
  const second = await activity();
  assert.equal(await outcome(program.linkConfirmedWork(ctx.owner.id, ctx.event.id, first.id, submission.id)), 'ok');
  assert.equal(await outcome(program.linkConfirmedWork(ctx.owner.id, ctx.event.id, first.id, submission.id)), 'ok');
  assert.equal(await linkAudits(first.id), 1);
  await prisma.scientificProgramActivity.update({ where: { id: first.id }, data: { submissionId: null } });

  const results = await Promise.all([
    outcome(program.linkConfirmedWork(ctx.owner.id, ctx.event.id, first.id, submission.id)),
    outcome(program.linkConfirmedWork(ctx.owner.id, ctx.event.id, second.id, submission.id)),
  ]);
  assert.deepEqual(results.sort(), [409, 'ok'].sort());
  assert.equal(await prisma.scientificProgramActivity.count({ where: { eventId: ctx.event.id, submissionId: submission.id } }), 1);
});

test('outra organização e trabalho de outro evento não ligam nada', async () => {
  const submission = await work('ACCEPTED');
  const session = await activity();
  assert.ok([403, 404].includes(await outcome(program.linkConfirmedWork(ctx.external.id, ctx.event.id, session.id, submission.id))));
  const otherEvent = await prisma.event.create({ data: {
    ownerId: ctx.owner.id, organizationId: ctx.scope.organizationId, name: `${token} outro`, slug: `${token.toLowerCase()}-${randomBytes(4).toString('hex')}`,
    eventType: 'Congresso', format: 'IN_PERSON', registrationMode: 'FREE', status: 'PUBLISHED', profileCode: 'SCIENTIFIC_EVENT',
  } });
  const otherModality = await prisma.scientificSubmissionModality.create({ data: { organizationId: ctx.scope.organizationId, eventId: otherEvent.id, code: 'ORAL', name: 'Oral', active: true } });
  const foreign = await prisma.scientificSubmission.create({ data: { organizationId: ctx.scope.organizationId, eventId: otherEvent.id, modalityId: otherModality.id, title: 'Trabalho de outro evento', status: 'ACCEPTED', currentVersion: 1 } });
  assert.equal(await outcome(program.linkConfirmedWork(ctx.owner.id, ctx.event.id, session.id, foreign.id)), 404);
  assert.equal((await prisma.scientificProgramActivity.findUniqueOrThrow({ where: { id: session.id } })).submissionId, null);
  assert.equal(await linkAudits(session.id), 0);
});
