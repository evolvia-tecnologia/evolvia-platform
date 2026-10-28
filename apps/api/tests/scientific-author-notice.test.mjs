import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificAuthorService } from '../dist/scientific-author.service.js';

const scope = { eventId: 'cevent00000001', organizationId: 'corganization01', reservationId: 'creservation001' };
const submissionId = 'csubmission001';
const modalityId = 'cmodality000001';
const key = 'author-notice-key-0001';
const body = {
  modalityId,
  title: 'Trabalho com aviso de recebimento',
  abstractText: 'Resumo com tamanho suficiente para a regra padrão do evento.',
  keywords: ['alfa', 'beta', 'gama'],
  institution: 'Hospital Central',
  coauthors: [],
  submitterPresenter: true,
};

const config = {
  allowCorrections: true,
  requireFile: false,
  titleMaxLength: 250,
  minKeywords: 3,
  maxKeywords: 5,
  maxSubmissionsPerAuthor: 3,
  collectTypedAbstract: true,
  abstractCounterUnit: 'CHARACTERS',
  abstractMin: 30,
  abstractMax: 10000,
  presentationFormats: null,
  requirePresentationSuggestion: false,
  collectScientificName: false,
  collectInstitutionAddress: false,
  collectFundingAgency: false,
  collectConflictOfInterest: false,
  collectReferences: false,
  showProceedingsAuthorization: false,
  minAuthors: 1,
  maxAuthors: null,
  maxPresenters: 1,
  requirePresenter: true,
  requireCorrespondingAuthor: true,
  requireAuthorInstitution: true,
  collectAuthorInstitution: true,
  collectAdditionalAuthors: true,
  collectAuthorOrder: false,
  requireSubmitterAsFirstAuthor: false,
  requireArea: false,
  requireSubarea: false,
};

function harness(noticeMail = undefined) {
  const state = { submission: null, notices: [] };
  const writes = [];
  const tx = {
    event: { findFirst: async () => ({ id: scope.eventId }) },
    eventRegistrationReservation: { findUnique: async () => ({
      status: 'CONFIRMED', registrationData: { full_name: 'Ana Souza', email: 'ana@example.test' },
    }) },
    scientificSubmission: {
      findFirst: async () => state.submission,
      count: async () => (state.submission ? 1 : 0),
      create: async (input) => {
        state.submission = {
          id: submissionId, title: input.data.title, status: 'SUBMITTED',
          submittedAt: input.data.submittedAt, submissionPayloadHash: input.data.submissionPayloadHash, currentVersion: 1,
        };
        return state.submission;
      },
    },
    scientificSubmissionConfig: { findUnique: async () => config },
    scientificSubmissionModality: { findFirst: async () => ({ id: modalityId, rules: null }) },
    scientificTaxonomyNode: { findMany: async () => [] },
    scientificPerson: { findFirst: async () => ({ id: 'cpersonowner01' }), create: async () => { throw new Error('pessoa nova'); } },
    scientificSubmissionAuthor: { create: async () => { writes.push('author'); } },
    scientificSubmissionVersion: { create: async () => { writes.push('version'); } },
    scientificAuthorNotice: {
      create: async (input) => {
        writes.push(['notice', input.data.kind, input.data.versionNumber]);
        assert.equal(input.data.ownerReservationId, scope.reservationId);
        assert.equal(JSON.stringify(input.data).includes('@'), false);
        const row = { id: 'cnotice0000001', versionNumber: input.data.versionNumber, kind: input.data.kind, recordedAt: input.data.recordedAt, submissionId, ownerReservationId: scope.reservationId };
        state.notices.push(row);
        return row;
      },
      findUnique: async ({ where }) => {
        const key = where.eventId_submissionId_versionNumber;
        assert.equal(where.organizationId, scope.organizationId);
        assert.equal(where.ownerReservationId, scope.reservationId);
        assert.equal(key.eventId, scope.eventId);
        return state.notices.find((notice) => notice.submissionId === key.submissionId
          && notice.versionNumber === key.versionNumber && notice.ownerReservationId === where.ownerReservationId) ?? null;
      },
    },
    auditLog: { create: async (input) => {
      writes.push(['audit', input.data.action, input.data.metadata]);
      assert.equal(JSON.stringify(input.data.metadata ?? {}).includes('@'), false);
    } },
  };
  const service = new ScientificAuthorService(
    { $transaction: async (callback) => callback(tx) },
    { requireConfirmedScope: async () => scope },
    { write: async () => { throw new Error('arquivo não pedido'); }, remove: async () => {} },
    noticeMail,
  );
  return { service, writes, state };
}

test('a primeira submissão registra um aviso e a mesma chave devolve o mesmo aviso', async () => {
  const h = harness();
  const created = await h.service.submit('congresso', 'Bearer participante', body, key);
  assert.equal(created.duplicate, false);
  assert.equal(created.notice.kind, 'SUBMITTED');
  assert.equal(created.notice.versionNumber, 1);
  const repeated = await h.service.submit('congresso', 'Bearer participante', body, key);
  assert.equal(repeated.duplicate, true);
  assert.deepEqual(repeated.notice, created.notice);
  assert.equal(h.writes.filter((item) => Array.isArray(item) && item[0] === 'notice').length, 1);
  const audits = h.writes.filter((item) => Array.isArray(item) && item[1] === 'scientific.author_notice_recorded');
  assert.equal(audits.length, 1);
  assert.deepEqual(audits[0][2], { submissionId, version: 1, kind: 'SUBMITTED' });
  await assert.rejects(
    h.service.submit('congresso', 'Bearer participante', { ...body, title: 'Outro trabalho na mesma chave' }, key),
    /outro trabalho/u,
  );
  assert.equal(h.state.notices.length, 1);
});

test('repetir uma versão legada sem recibo não fabrica confirmação retroativa', async () => {
  const h = harness();
  await h.service.submit('congresso', 'Bearer participante', body, key);
  h.state.notices.length = 0;
  const writesBefore = h.writes.length;
  const result = await h.service.submit('congresso', 'Bearer participante', body, key);
  assert.equal(result.duplicate, true);
  assert.equal(result.notice, null);
  assert.equal(h.writes.length, writesBefore);
});


test('envia somente após commit de submissão nova; replay não duplica notificações', async () => {
  const calls = [];
  const h = harness({ notify: async (...args) => { calls.push(args); } });
  const first = await h.service.submit('congresso', 'Bearer participante', body, key);
  assert.equal(first.duplicate, false);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][0], scope);
  assert.equal(calls[0][1], submissionId);
  assert.equal(calls[0][2], 1);
  const again = await h.service.submit('congresso', 'Bearer participante', body, key);
  assert.equal(again.duplicate, true);
  assert.equal(calls.length, 1);
});

test('falha isolada de comunicação após commit não desfaz a submissão', async () => {
  let attempts = 0;
  const h = harness({ notify: async () => { attempts += 1; throw new Error('gateway simulado indisponível'); } });
  const result = await h.service.submit('congresso', 'Bearer participante', body, key);
  assert.equal(result.duplicate, false);
  assert.equal(result.notice.kind, 'SUBMITTED');
  assert.equal(attempts, 1);
  assert.equal(h.state.notices.length, 1);
});

test('resposta da submissão não aguarda gateway lento; aviso permanece persistido', async () => {
  let release;
  const gateway = new Promise((resolve) => { release = resolve; });
  let started = 0;
  const h = harness({ notify: async () => { started += 1; await gateway; } });
  const result = await h.service.submit('congresso', 'Bearer participante', body, key);
  assert.equal(result.duplicate, false);
  assert.equal(started, 1);
  assert.equal(h.state.notices.length, 1);
  release();
  await gateway;
});
