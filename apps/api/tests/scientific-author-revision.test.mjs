import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificAuthorService } from '../dist/scientific-author.service.js';

const scope = { eventId: 'cevent00000001', organizationId: 'corganization01', reservationId: 'creservation001' };
const submissionId = 'csubmission001';
const modalityId = 'cmodality000001';

const body = {
  modalityId,
  title: 'Trabalho corrigido agora',
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

function harness({ status = 'SUBMITTED', allow = true, sameHash = false, found = true, version = 1 } = {}) {
  const calls = [];
  const tx = {
    event: { findFirst: async () => ({ id: scope.eventId }) },
    eventRegistrationReservation: { findUnique: async () => ({
      status: 'CONFIRMED', registrationData: { full_name: 'Ana Souza', email: 'ana@example.test' },
    }) },
    scientificSubmission: {
      findFirst: async () => found ? { id: submissionId, status, currentVersion: version, modalityId } : null,
      updateMany: async (input) => { calls.push(['update', input]); return { count: 1 }; },
    },
    scientificSubmissionConfig: { findUnique: async () => ({ ...config, allowCorrections: allow }) },
    scientificSubmissionVersion: {
      findFirst: async () => ({ contentHash: sameHash ? null : 'hash-anterior' }),
      create: async (input) => { calls.push(['version', input.data.versionNumber, input.data.contentHash]); return { id: 'cversion000002' }; },
    },
    scientificTaxonomyNode: { findMany: async () => [] },
    scientificPerson: {
      findFirst: async () => ({ id: 'cpersonowner01' }),
      create: async () => { throw new Error('pessoa nova não deveria ser criada'); },
    },
    scientificSubmissionAuthor: {
      deleteMany: async () => { calls.push('authors-replaced'); return { count: 1 }; },
      create: async () => { calls.push('author'); },
    },
    auditLog: { create: async (input) => { calls.push(['audit', input.data.action, input.data.metadata]); } },
  };
  const prisma = { $transaction: async (callback) => callback(tx) };
  const files = { write: async () => { throw new Error('arquivo não pedido'); }, remove: async () => {} };
  const participant = { requireConfirmedScope: async () => scope };
  return { service: new ScientificAuthorService(prisma, participant, files), calls };
}

test('trabalho decidido ou evento sem correção não cria versão', async () => {
  const decided = harness({ status: 'ACCEPTED' });
  await assert.rejects(decided.service.revise('congresso', 'Bearer participante', submissionId, body), /já foi decidido/);
  assert.deepEqual(decided.calls, []);
  const closed = harness({ allow: false });
  await assert.rejects(closed.service.revise('congresso', 'Bearer participante', submissionId, body), /não aceita correção/);
  assert.deepEqual(closed.calls, []);
  const missing = harness({ found: false });
  await assert.rejects(missing.service.revise('congresso', 'Bearer participante', submissionId, body), /não encontrado/);
});

test('correção grava a versão seguinte e devolve o trabalho para submissão', async () => {
  const h = harness({ status: 'ACCEPTED_WITH_CHANGES' });
  const result = await h.service.revise('congresso', 'Bearer participante', submissionId, body);
  assert.equal(result.duplicate, false);
  assert.equal(result.status, 'SUBMITTED');
  assert.equal(result.currentVersion, 2);
  assert.equal(h.calls.some((call) => call === 'authors-replaced'), true);
  assert.deepEqual(h.calls.find((call) => Array.isArray(call) && call[0] === 'version').slice(0, 2), ['version', 2]);
  const audit = h.calls.find((call) => Array.isArray(call) && call[0] === 'audit');
  assert.equal(audit[1], 'scientific.author_revised');
  assert.equal(audit[2].previousStatus, 'ACCEPTED_WITH_CHANGES');
  assert.equal(h.calls.some((call) => Array.isArray(call) && call[0] === 'version' && call[1] === 1), false);
});

test('o mesmo conteúdo não abre outra versão', async () => {
  const first = harness();
  const created = await first.service.revise('congresso', 'Bearer participante', submissionId, body);
  const hash = first.calls.find((call) => Array.isArray(call) && call[0] === 'version')[2];
  const prismaCalls = [];
  const tx = {
    event: { findFirst: async () => ({ id: scope.eventId }) },
    eventRegistrationReservation: { findUnique: async () => ({ status: 'CONFIRMED', registrationData: { full_name: 'Ana Souza', email: 'ana@example.test' } }) },
    scientificSubmission: { findFirst: async () => ({ id: submissionId, status: 'SUBMITTED', currentVersion: created.currentVersion, modalityId }), updateMany: async () => { prismaCalls.push('update'); return { count: 1 }; } },
    scientificSubmissionConfig: { findUnique: async () => config },
    scientificSubmissionVersion: { findFirst: async () => ({ contentHash: hash }), create: async () => { prismaCalls.push('version'); } },
    scientificTaxonomyNode: { findMany: async () => [] },
    scientificPerson: { findFirst: async () => ({ id: 'cpersonowner01' }), create: async () => ({ id: 'new' }) },
    scientificSubmissionAuthor: { deleteMany: async () => { prismaCalls.push('authors'); }, create: async () => {} },
    auditLog: { create: async () => { prismaCalls.push('audit'); } },
  };
  const service = new ScientificAuthorService({ $transaction: async (callback) => callback(tx) }, { requireConfirmedScope: async () => scope }, { write: async () => {}, remove: async () => {} });
  const duplicate = await service.revise('congresso', 'Bearer participante', submissionId, body);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.currentVersion, 2);
  assert.deepEqual(prismaCalls, []);
});
