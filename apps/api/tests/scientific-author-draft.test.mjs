import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificAuthorService } from '../dist/scientific-author.service.js';

const scope = { eventId: 'cevent00000001', organizationId: 'corganization01', reservationId: 'creservation001' };
const modalityId = 'cmodality000001';
const key = 'author-draft-key-01';
const otherKey = 'author-draft-key-02';

const config = {
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
  maxSubmissionsPerAuthor: 1,
};

const draftBody = {
  modalityId,
  title: 'Ab',
  abstractText: '',
  keywords: [],
  institution: 'Hospital Central',
  scientificName: 'Ana scientifica',
  institutionAddress: 'Rua de teste, 1',
  fundingAgency: 'FAP fictícia',
  conflictDeclared: true,
  conflictDetail: 'Conflito fictício',
  referencesText: 'Referência fictícia',
  proceedingsAuthorizationAccepted: true,
};

const submitBody = {
  modalityId,
  title: 'Trabalho pronto para envio',
  abstractText: 'Resumo com tamanho suficiente para a regra padrão do evento.',
  keywords: ['alfa', 'beta', 'gama'],
  institution: 'Hospital Central',
};

function harness(configOverride = {}) {
  const activeConfig = { ...config, ...configOverride };
  const rows = [];
  const versions = [];
  const audits = [];
  const authors = [];
  const people = new Map([['ana@example.test', { id: 'cpersonowner01' }]]);
  let sequence = 0;
  const tx = {
    event: { findFirst: async () => ({ id: scope.eventId }) },
    eventRegistrationReservation: { findUnique: async () => ({
      status: 'CONFIRMED', registrationData: { full_name: 'Ana Souza', email: 'ana@example.test' },
    }) },
    scientificSubmissionConfig: { findUnique: async () => activeConfig },
    scientificSubmissionModality: { findFirst: async () => ({ id: modalityId }) },
    scientificTaxonomyNode: { findMany: async () => [] },
    scientificSubmission: {
      findFirst: async ({ where }) => rows.find((row) => (
        where.id ? row.id === where.id : row.submissionKeyHash === where.submissionKeyHash
      ) && row.ownerReservationId === where.ownerReservationId) ?? null,
      count: async ({ where }) => rows.filter((row) => row.id !== where.id?.not).length,
      create: async ({ data }) => {
        const row = { id: `cdraft${String(++sequence).padStart(10, '0')}`, submittedAt: data.submittedAt ?? null, ...data };
        rows.push(row);
        return row;
      },
      updateMany: async ({ where, data }) => {
        const row = rows.find((item) => item.id === where.id && item.ownerReservationId === where.ownerReservationId
          && item.eventId === where.eventId && item.organizationId === where.organizationId && (!where.status || item.status === where.status));
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    scientificPerson: {
      findFirst: async ({ where }) => people.get(typeof where.email === 'string' ? where.email : where.email.equals) ?? null,
      create: async ({ data }) => { const person = { id: `cperson${people.size}`, ...data }; people.set(data.email, person); return person; },
    },
    scientificSubmissionAuthor: {
      deleteMany: async ({ where }) => { authors.splice(0, authors.length, ...authors.filter((item) => item.submissionId !== where.submissionId)); return { count: 1 }; },
      create: async ({ data }) => { authors.push(data); },
    },
    scientificSubmissionVersion: { create: async ({ data }) => { versions.push(data); return data; } },
    auditLog: { create: async ({ data }) => { audits.push(data); } },
  };
  const service = new ScientificAuthorService(
    { $transaction: async (callback) => callback(tx) },
    { requireConfirmedScope: async () => scope },
    { write: async () => { throw new Error('arquivo no rascunho'); }, remove: async () => {} },
  );
  return { service, rows, versions, audits, authors, tx };
}

test('rascunho não cria versão e a retomada atualiza a mesma linha', async () => {
  const h = harness();
  const first = await h.service.saveDraft('congresso', 'Bearer participante', draftBody, key);
  assert.equal(first.status, 'DRAFT');
  assert.equal(first.currentVersion, 0);
  assert.equal(first.submittedAt, null);
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].title, 'Ab');
  assert.deepEqual(h.rows[0].keywords, []);
  assert.equal(h.rows[0].fundingAgency, 'FAP fictícia');
  assert.equal(h.rows[0].conflictDeclared, true);
  assert.equal(h.rows[0].conflictDetail, 'Conflito fictício');
  assert.equal(h.rows[0].referencesText, 'Referência fictícia');
  assert.equal(h.rows[0].proceedingsAuthorizationAcceptedAt, null);
  assert.equal(h.versions.length, 0);
  assert.equal(h.audits[0].action, 'scientific.author_draft_saved');
  assert.equal(h.audits[0].metadata.updated, false);

  const second = await h.service.saveDraft('congresso', 'Bearer participante', {
    ...draftBody, title: 'Trabalho ainda em rascunho', draftId: first.id,
  }, otherKey);
  assert.equal(second.id, first.id);
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].title, 'Trabalho ainda em rascunho');
  assert.equal(h.rows[0].status, 'DRAFT');
  assert.equal(h.versions.length, 0);
  assert.equal(h.audits[1].metadata.updated, true);
});

test('rascunho conserva a autorização dos anais somente quando o evento a exibe', async () => {
  const h = harness({ showProceedingsAuthorization: true });
  await h.service.saveDraft('congresso', 'Bearer participante', draftBody, key);
  assert.ok(h.rows[0].proceedingsAuthorizationAcceptedAt instanceof Date);
});

test('arquivo no rascunho é recusado e trabalho já enviado não volta a rascunho', async () => {
  const h = harness();
  await assert.rejects(
    h.service.saveDraft('congresso', 'Bearer participante', { ...draftBody, file: { fileName: 'a.pdf' } }, key),
    /O arquivo entra somente na versão enviada/,
  );
  const saved = await h.service.saveDraft('congresso', 'Bearer participante', draftBody, key);
  h.rows[0].status = 'SUBMITTED';
  await assert.rejects(
    h.service.saveDraft('congresso', 'Bearer participante', { ...draftBody, draftId: saved.id }, otherKey),
    /A versão submetida permanece/,
  );
  assert.equal(h.versions.length, 0);
});

test('enviar o rascunho promove a mesma linha para a versão 1 sem ocupar o limite duas vezes', async () => {
  const h = harness();
  const saved = await h.service.saveDraft('congresso', 'Bearer participante', draftBody, key);
  const result = await h.service.submit('congresso', 'Bearer participante', { ...submitBody, draftId: saved.id }, otherKey);
  assert.equal(result.duplicate, false);
  assert.equal(result.currentVersion, 1);
  assert.equal(result.status, 'SUBMITTED');
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].id, saved.id);
  assert.equal(h.rows[0].currentVersion, 1);
  assert.equal(h.versions.length, 1);
  assert.equal(h.versions[0].versionNumber, 1);
  assert.equal(h.audits.at(-1).action, 'scientific.author_submitted');
  assert.equal(h.audits.at(-1).metadata.fromDraft, true);
  assert.equal(h.audits.at(-1).metadata.version, 1);
});

test('rascunho guarda os coautores e a retomada substitui a lista sem duplicar', async () => {
  const h = harness();
  const coauthors = [
    { name: 'Bia Lima', email: 'bia@example.test', institution: 'USP', presenter: false },
    { name: 'Caio Reis', email: 'caio@example.test', institution: '', presenter: false },
  ];
  const saved = await h.service.saveDraft('congresso', 'Bearer participante', { ...draftBody, coauthors }, key);
  assert.deepEqual(h.authors.map((author) => author.sortOrder), [1, 2, 3]);
  assert.equal(new Set(h.authors.map((author) => author.personId)).size, 3);
  await h.service.saveDraft('congresso', 'Bearer participante', { ...draftBody, coauthors: coauthors.slice(1), draftId: saved.id }, otherKey);
  assert.equal(h.authors.length, 2);
  assert.equal(h.audits.at(-1).metadata.authors, 2);
  await assert.rejects(
    h.service.saveDraft('congresso', 'Bearer participante', { ...draftBody, coauthors: [{ name: 'Ana Souza', email: 'ANA@example.test' }], draftId: saved.id }, otherKey),
    /não pode repetir o e-mail/u,
  );
});

test('rascunho promovido em outra sessão entre a leitura e a escrita não é promovido de novo', async () => {
  const h = harness();
  const saved = await h.service.saveDraft('congresso', 'Bearer participante', draftBody, key);
  const findFirst = h.tx.scientificSubmission.findFirst;
  h.tx.scientificSubmission.findFirst = async (query) => {
    const row = await findFirst(query);
    if (!row) return row;
    const snapshot = { ...row };
    row.status = 'SUBMITTED';
    return snapshot;
  };
  await assert.rejects(
    h.service.submit('congresso', 'Bearer participante', { ...submitBody, draftId: saved.id }, otherKey),
    /já foi enviado/u,
  );
  assert.equal(h.versions.length, 0);
  assert.equal(h.audits.some((audit) => audit.action === 'scientific.author_submitted'), false);
});
