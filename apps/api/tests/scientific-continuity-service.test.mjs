import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { ScientificAuthorService } from '../dist/scientific-author.service.js';
import { ScientificReviewerService } from '../dist/scientific-reviewer.service.js';

const scope = { eventId: 'cevent00000001', organizationId: 'corganization01', reservationId: 'creservation001' };
const submissionId = 'csubmission001';
const pdf = { fileName: 'poster.pdf', contentBase64: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF').toString('base64') };

function authorHarness({ failCommit = false, failCleanup = false, found = true } = {}) {
  const actions = [];
  const previous = `${scope.organizationId}/${scope.eventId}/00000000-0000-4000-8000-000000000000.pdf`;
  const tx = {
    scientificSubmission: { findFirst: async ({ where }) => {
      assert.deepEqual(where, { id: submissionId, eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId });
      return found ? { id: submissionId, status: 'ACCEPTED', presentationFormatCode: 'EPOSTER', currentVersion: 1 } : null;
    } },
    scientificSubmissionConfig: { findUnique: async () => ({ acceptedWorkUploadEnabled: true, acceptedWorkUploadDeadline: null }) },
    scientificSubmissionVersion: { findFirst: async () => ({ id: 'cversion000001', fileKey: previous }), update: async () => { actions.push('update'); } },
    auditLog: { create: async () => { actions.push('audit'); } },
  };
  const prisma = { $transaction: async (callback) => {
    const result = await callback(tx);
    if (failCommit) { actions.push('rollback'); throw new Error('commit recusado'); }
    actions.push('commit'); return result;
  } };
  const files = {
    write: async (key) => { actions.push(['write', key]); },
    remove: async (key) => { actions.push(['remove', key]); if (failCleanup) throw new Error('limpeza indisponível'); },
  };
  const participant = { requireConfirmedScope: async () => scope };
  return { service: new ScientificAuthorService(prisma, participant, files), actions, previous };
}

test('rollback do ePoster preserva o arquivo anterior e limpa somente o novo', async () => {
  const h = authorHarness({ failCommit: true });
  await assert.rejects(h.service.uploadEposter('congresso', 'Bearer participante', submissionId, pdf), /commit recusado/);
  const written = h.actions.find((item) => Array.isArray(item) && item[0] === 'write')[1];
  assert.deepEqual(h.actions.filter((item) => Array.isArray(item) && item[0] === 'remove'), [['remove', written]]);
  assert.ok(!h.actions.some((item) => Array.isArray(item) && item[1] === h.previous));
});

test('limpeza do PDF anterior acontece após commit e sua falha não remove o novo', async () => {
  for (const failCleanup of [false, true]) {
    const h = authorHarness({ failCleanup });
    assert.deepEqual(await h.service.uploadEposter('congresso', 'Bearer participante', submissionId, pdf), { id: submissionId, status: 'ACCEPTED', hasEposter: true });
    const removed = h.actions.findIndex((item) => Array.isArray(item) && item[0] === 'remove');
    assert.ok(removed > h.actions.indexOf('commit'));
    assert.deepEqual(h.actions[removed], ['remove', h.previous]);
    assert.equal(h.actions.filter((item) => Array.isArray(item) && item[0] === 'remove').length, 1);
  }
});

test('trabalho de outra reserva e PDF ativo são recusados', async () => {
  const h = authorHarness({ found: false });
  await assert.rejects(h.service.uploadEposter('congresso', 'Bearer participante', submissionId, pdf), /não encontrado/);
  assert.ok(!h.actions.includes('update'));
  const active = authorHarness();
  await assert.rejects(active.service.uploadEposter('congresso', 'Bearer participante', submissionId, {
    ...pdf, contentBase64: Buffer.from('%PDF-1.4\n/JavaScript (alert)\n%%EOF').toString('base64'),
  }), /script/);
  assert.deepEqual(active.actions, []);
});

const token = 'a'.repeat(64);
const assignmentId = 'cassignment001';
const criterionId = 'ccriterion0001';
const clear = { conflictStatus: 'CLEAR', scores: [{ criterionId, value: 8 }], recommendation: 'ACCEPT' };

function reviewerHarness({ foreignPerson = false, foreignAccess = false, failAudit = false } = {}) {
  const calls = []; let transactions = 0;
  const row = {
    ...scope, personId: 'cperson0000001', revokedAt: null, expiresAt: new Date(Date.now() + 60_000),
    event: { id: scope.eventId, slug: 'congresso', status: 'PUBLISHED', organizationId: scope.organizationId },
    person: { id: 'cperson0000001', name: 'Avaliador de teste', status: 'ACTIVE', eventId: scope.eventId, organizationId: foreignPerson ? 'coutraorg00001' : scope.organizationId },
  };
  if (foreignAccess) row.organizationId = 'coutraorg00001';
  const tx = {
    scientificReviewAssignment: { update: async (input) => { calls.push(['assignment', input]); } },
    scientificReview: { create: async (input) => { calls.push(['review', input]); return { id: 'creview0000001' }; } },
    scientificReviewScore: { createMany: async (input) => { calls.push(['scores', input]); } },
    auditLog: { create: async (input) => { calls.push(['audit', input]); if (failAudit) throw new Error('auditoria indisponível'); } },
  };
  const prisma = {
    scientificReviewerAccess: { findUnique: async ({ where }) => {
      assert.equal(where.tokenHash, createHash('sha256').update(token).digest('hex')); return row;
    } },
    scientificReviewAssignment: { findFirst: async ({ where }) => {
      assert.deepEqual(where, { id: assignmentId, eventId: scope.eventId, organizationId: scope.organizationId, reviewerPersonId: row.personId });
      return { id: assignmentId, status: 'ASSIGNED', startedAt: null, submission: { authors: [] } };
    } },
    scientificSubmissionConfig: { findUnique: async () => ({ evaluationStyle: 'ANALYTIC', coordinatorDecidesStatus: false }) },
    scientificReviewCriterion: { findMany: async ({ where }) => {
      assert.deepEqual(where, { eventId: scope.eventId, organizationId: scope.organizationId, active: true });
      return [{ id: criterionId, required: true, minScore: 0, maxScore: 10 }];
    } },
    $transaction: async (callback) => { transactions++; const result = await callback(tx); calls.push(['commit']); return result; },
  };
  return { service: new ScientificReviewerService(prisma, {}), calls, transactions: () => transactions };
}

test('Bearer aceita variação no esquema e a nota de outro evento falha antes da escrita', async () => {
  for (const scheme of ['Bearer', 'bearer', 'BEARER']) {
    const h = reviewerHarness();
    await assert.rejects(h.service.submit('congresso', `${scheme} ${token}`, assignmentId, {
      ...clear, scores: [{ criterionId: 'coutracrit0001', value: 8 }],
    }), /não pertence/);
    assert.equal(h.transactions(), 0);
    assert.deepEqual(h.calls, []);
  }
});

test('parecer válido grava nota, estado e auditoria no mesmo commit', async () => {
  const h = reviewerHarness();
  assert.deepEqual(await h.service.submit('congresso', `bearer ${token}`, assignmentId, clear), { id: assignmentId, status: 'SUBMITTED', conflictStatus: 'CLEAR' });
  assert.deepEqual(h.calls.map((call) => call[0]), ['review', 'scores', 'assignment', 'audit', 'commit']);
});

test('conflito exige auditoria na transação sem registrar nota nem motivo no log', async () => {
  const h = reviewerHarness();
  await h.service.submit('congresso', `Bearer ${token}`, assignmentId, { conflictStatus: 'CONFLICT', conflictReason: 'Colaboração acadêmica', scores: [] });
  assert.equal(h.transactions(), 1);
  assert.deepEqual(h.calls.map((call) => call[0]), ['assignment', 'audit', 'commit']);
  const audit = h.calls.find((call) => call[0] === 'audit')[1].data;
  assert.equal(audit.eventId, scope.eventId);
  assert.equal(audit.organizationId, scope.organizationId);
  assert.equal(audit.action, 'scientific.review_conflict_declared');
  assert.deepEqual(audit.metadata, { conflictStatus: 'CONFLICT' });
  const failed = reviewerHarness({ failAudit: true });
  await assert.rejects(failed.service.submit('congresso', `Bearer ${token}`, assignmentId, { conflictStatus: 'CONFLICT', conflictReason: 'Colaboração acadêmica', scores: [] }), /auditoria indisponível/);
  assert.ok(!failed.calls.some((call) => call[0] === 'commit'));
});

test('sessão do avaliador recusa pessoa, organização e slug de outro escopo', async () => {
  for (const options of [{ foreignPerson: true }, { foreignAccess: true }, {}]) {
    const h = reviewerHarness(options);
    await assert.rejects(h.service.submit(options.foreignPerson || options.foreignAccess ? 'congresso' : 'outro-evento', `Bearer ${token}`, assignmentId, clear), /Sessão do avaliador inválida/);
    assert.equal(h.transactions(), 0);
  }
});
