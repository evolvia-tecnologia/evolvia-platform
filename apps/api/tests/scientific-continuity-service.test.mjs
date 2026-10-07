import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { ScientificAuthorService } from '../dist/scientific-author.service.js';
import { ScientificReviewerService } from '../dist/scientific-reviewer.service.js';
import { ScientificSubmissionsService } from '../dist/scientific-submissions.service.js';
import { ScientificStationService } from '../dist/scientific-station.service.js';

const scope = { eventId: 'cevent00000001', organizationId: 'corganization01', reservationId: 'creservation001' };
const submissionId = 'csubmission001';
const pdf = { fileName: 'poster.pdf', contentBase64: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF').toString('base64') };

function authorHarness({ failCommit = false, failCleanup = false, found = true, concurrent = false } = {}) {
  const actions = [];
  const previous = `${scope.organizationId}/${scope.eventId}/00000000-0000-4000-8000-000000000000.pdf`;
  const tx = {
    scientificSubmission: { findFirst: async ({ where }) => {
      assert.deepEqual(where, { id: submissionId, eventId: scope.eventId, organizationId: scope.organizationId, ownerReservationId: scope.reservationId });
      return found ? { id: submissionId, status: 'ACCEPTED', presentationFormatCode: 'EPOSTER', currentVersion: 1 } : null;
    } },
    scientificSubmissionConfig: { findUnique: async () => ({ acceptedWorkUploadEnabled: true, acceptedWorkUploadDeadline: null }) },
    scientificSubmissionVersion: {
      findFirst: async () => ({ id: 'cversion000001', fileKey: 'original-submission.pdf', eposterFileKey: previous }),
      updateMany: async ({ where, data }) => {
        assert.equal(where.eventId, scope.eventId); assert.equal(where.organizationId, scope.organizationId);
        assert.equal(where.eposterFileKey, previous);
        assert.deepEqual(Object.keys(data), ['eposterFileKey']);
        actions.push('update'); return { count: concurrent ? 0 : 1 };
      },
    },
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

test('substituição concorrente preserva o ePoster anterior e limpa o upload rejeitado', async () => {
  const h = authorHarness({ concurrent: true });
  await assert.rejects(h.service.uploadEposter('congresso', 'Bearer participante', submissionId, pdf), /outra sessão/);
  assert.ok(!h.actions.includes('commit'));
  const removed = h.actions.filter((item) => Array.isArray(item) && item[0] === 'remove');
  assert.equal(removed.length, 1); assert.notEqual(removed[0][1], h.previous);
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

function reviewerHarness({ foreignPerson = false, foreignAccess = false, failAudit = false, unavailableAssignment = false, declaredConflict = false, authorConflict = false } = {}) {
  const calls = []; let transactions = 0;
  const row = {
    ...scope, personId: 'cperson0000001', revokedAt: null, expiresAt: new Date(Date.now() + 60_000),
    event: { id: scope.eventId, slug: 'congresso', status: 'PUBLISHED', organizationId: scope.organizationId },
    person: { id: 'cperson0000001', name: 'Avaliador de teste', status: 'ACTIVE', eventId: scope.eventId, organizationId: foreignPerson ? 'coutraorg00001' : scope.organizationId },
  };
  if (foreignAccess) row.organizationId = 'coutraorg00001';
  const tx = {
    scientificReviewAssignment: { updateMany: async (input) => {
      assert.equal(input.where.eventId, scope.eventId); assert.equal(input.where.organizationId, scope.organizationId);
      assert.equal(input.where.reviewerPersonId, row.personId);
      assert.deepEqual(input.where.status.notIn, ['CANCELLED', 'SUBMITTED']);
      assert.equal(input.where.conflictStatus.not, 'CONFLICT');
      calls.push(['assignment', input]); return { count: unavailableAssignment ? 0 : 1 };
    } },
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
      return { id: assignmentId, status: 'ASSIGNED', conflictStatus: declaredConflict ? 'CONFLICT' : 'PENDING', startedAt: null, submission: { authors: authorConflict ? [{ personId: row.personId }] : [] } };
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
  assert.deepEqual(h.calls.map((call) => call[0]), ['assignment', 'review', 'scores', 'audit', 'commit']);
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

function stationHarness({ eposterFileKey = null, secondEposterFileKey = null, presentationFormatCode = 'EPOSTER' } = {}) {
  const calls = [];
  const event = { id: scope.eventId, organizationId: scope.organizationId, slug: 'congresso', name: 'Congresso', status: 'PUBLISHED', profileCode: 'SCIENTIFIC_EVENT' };
  const work = { id: submissionId, title: 'Pesquisa', presentationFormatCode, stationPublicCode: 1, stationShowAbstract: false, stationShowEposter: true, taxonomyArea: null, taxonomySubarea: null, authors: [], versions: [{ fileKey: 'original-submission.pdf', eposterFileKey, secondEposterFileKey }] };
  const submissions = {
    findFirst: async ({ where }) => {
      assert.equal(where.eventId, scope.eventId); assert.equal(where.organizationId, scope.organizationId);
      return work;
    },
    findMany: async () => [],
    update: async (input) => { calls.push(['visibility', input]); },
  };
  const prisma = {
    event: { findFirst: async () => event, findUnique: async () => event }, scientificSubmission: submissions,
    $transaction: async (callback) => callback({ scientificSubmission: submissions, auditLog: { create: async (input) => { calls.push(['audit', input]); } } }),
  };
  const authorization = { requireRole: async (user, organizationId, roles) => {
    assert.equal(organizationId, scope.organizationId); assert.deepEqual(roles, ['OWNER', 'ADMIN', 'MANAGER']);
  } };
  const files = { read: async (key) => { calls.push(['read', key]); return Buffer.from('%PDF-1.4'); } };
  return { service: new ScientificStationService(prisma, authorization, files), calls };
}

test('PDF original não libera download nem publicação de ePoster na estação', async () => {
  const h = stationHarness();
  await assert.rejects(h.service.eposter('congresso', '1'), /indisponível/);
  await assert.rejects(h.service.updateVisibility('organizador', scope.eventId, submissionId, { showAbstract: false, showEposter: true }), /não tem e-poster/);
  assert.deepEqual(h.calls, []);
});

test('estação mostra a segunda versão e mantém a primeira fora da leitura', async () => {
  const h = stationHarness({ eposterFileKey: 'poster-v1.pdf', secondEposterFileKey: 'poster-v2.pdf' });
  const result = await h.service.eposter('congresso', '1');
  assert.equal(result.fileName, 'eposter-1.pdf');
  assert.deepEqual(h.calls, [['read', 'poster-v2.pdf']]);
});

test('modalidade diferente de ePoster recusa arquivo final e estação lê somente o arquivo final', async () => {
  const wrong = stationHarness({ eposterFileKey: 'poster-final.pdf', presentationFormatCode: 'ORAL' });
  await assert.rejects(wrong.service.eposter('congresso', '1'), /indisponível/);
  assert.deepEqual(wrong.calls, []);
  const h = stationHarness({ eposterFileKey: 'poster-final.pdf' });
  const result = await h.service.eposter('congresso', '1');
  assert.equal(result.fileName, 'eposter-1.pdf'); assert.deepEqual(h.calls, [['read', 'poster-final.pdf']]);
});

test('liberação da estação grava visibilidade e auditoria do organizador na transação', async () => {
  const h = stationHarness({ eposterFileKey: 'poster-final.pdf' });
  await h.service.updateVisibility('organizador', scope.eventId, submissionId, { showAbstract: true, showEposter: true });
  assert.deepEqual(h.calls.map((call) => call[0]), ['visibility', 'audit']);
  assert.equal(h.calls[1][1].data.actorUserId, 'organizador');
  assert.deepEqual(h.calls[1][1].data.metadata, { showAbstract: true, showEposter: true });
});

test('configuração nunca exige instituição com coleta desativada, inclusive em PATCH parcial', async () => {
  for (const [current, dto, expected] of [
    [{ collectAuthorInstitution: false, requireAuthorInstitution: false }, { requireAuthorInstitution: true }, false],
    [{ collectAuthorInstitution: true, requireAuthorInstitution: true }, { collectAuthorInstitution: false }, false],
    [null, { collectAuthorInstitution: false }, false],
    [{ collectAuthorInstitution: true, requireAuthorInstitution: false }, { requireAuthorInstitution: true }, true],
  ]) {
    let written;
    const tx = {
      scientificSubmissionConfig: { upsert: async (input) => { written = input; return { id: 'cconfig0000001' }; } },
      auditLog: { create: async () => ({}) },
    };
    const prisma = {
      scientificSubmissionConfig: { findUnique: async () => current },
      $transaction: async (run) => run(tx),
    };
    const service = new ScientificSubmissionsService(prisma, {}, {});
    service.requireMutableScientificEvent = async () => ({ id: scope.eventId, organizationId: scope.organizationId });
    service.getManagement = async () => ({ configured: true });
    await service.configure('corganizer001', scope.eventId, dto);
    assert.equal(written.create.requireAuthorInstitution, expected);
    assert.equal(written.update.requireAuthorInstitution, expected);
    assert.deepEqual(written.where.eventId_organizationId, { eventId: scope.eventId, organizationId: scope.organizationId });
  }
});

test('remoção de formato desativa só os códigos anteriores deste escopo e mantém modalidades próprias', async () => {
  const writes = [];
  const tx = { scientificSubmissionModality: {
    updateMany: async (input) => { writes.push(input); return { count: 1 }; },
    upsert: async (input) => { writes.push(input); return {}; },
  } };
  const service = new ScientificSubmissionsService({}, {}, {});
  await service.syncFormatModalities(tx, { eventId: scope.eventId, organizationId: scope.organizationId },
    [{ code: 'ORAL', label: 'Oral', submissionEnabled: true, evaluationEnabled: true }], ['ORAL', 'LEGACY']);
  assert.deepEqual(writes[0], {
    where: { eventId: scope.eventId, organizationId: scope.organizationId, code: { in: ['LEGACY'] } },
    data: { active: false },
  });
  assert.equal(writes[1].where.eventId_code.eventId, scope.eventId);
  assert.equal(writes[1].where.eventId_code.code, 'ORAL');
  assert.equal(writes[1].create.organizationId, scope.organizationId);
  assert.equal(writes.length, 2);
});

test('atribuição cancelada/enviada por concorrência não recebe parecer nem conflito ou auditoria', async () => {
  for (const opinion of [clear, { conflictStatus: 'CONFLICT', conflictReason: 'Colaboração acadêmica', scores: [] }]) {
    const h = reviewerHarness({ unavailableAssignment: true });
    await assert.rejects(h.service.submit('congresso', `Bearer ${token}`, assignmentId, opinion), /atribuição mudou/u);
    assert.deepEqual(h.calls.map((call) => call[0]), ['assignment']);
  }
});

test('conflito já declarado não pode ser removido pelo envio de parecer', async () => {
  const h = reviewerHarness({ declaredConflict: true });
  await assert.rejects(h.service.submit('congresso', `Bearer ${token}`, assignmentId, clear), /conflito de interesse/u);
  assert.equal(h.transactions(), 0);
});

test('coautor do trabalho não envia parecer mesmo com atribuição antiga', async () => {
  const h = reviewerHarness({ authorConflict: true });
  await assert.rejects(h.service.submit('congresso', `Bearer ${token}`, assignmentId, clear), /conflito de interesse/u);
  assert.equal(h.transactions(), 0);
});
