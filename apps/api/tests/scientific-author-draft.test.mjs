import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
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
  const notices = [];
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
      deleteMany: async ({ where }) => {
        const index = rows.findIndex((item) => item.id === where.id && item.ownerReservationId === where.ownerReservationId
          && item.eventId === where.eventId && item.organizationId === where.organizationId && item.status === where.status
          && item.currentVersion === where.currentVersion);
        if (index < 0) return { count: 0 };
        rows.splice(index, 1);
        authors.splice(0, authors.length, ...authors.filter((item) => item.submissionId !== where.id));
        versions.splice(0, versions.length, ...versions.filter((item) => item.submissionId !== where.id));
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
    scientificAuthorNotice: {
      create: async ({ data }) => { const row = { id: `cnotice${notices.length}`, ...data }; notices.push(row); return row; },
      findUnique: async ({ where }) => {
        assert.equal(where.organizationId, scope.organizationId);
        assert.equal(where.ownerReservationId, scope.reservationId);
        const key = where.eventId_submissionId_versionNumber;
        assert.equal(key.eventId, scope.eventId);
        return notices.find((item) => item.submissionId === key.submissionId && item.versionNumber === key.versionNumber
          && item.organizationId === where.organizationId && item.ownerReservationId === where.ownerReservationId) ?? null;
      },
    },
    auditLog: { create: async ({ data }) => { audits.push(data); } },
  };
  const service = new ScientificAuthorService(
    { $transaction: async (callback) => callback(tx) },
    { requireConfirmedScope: async () => scope },
    { write: async () => { throw new Error('arquivo no rascunho'); }, remove: async () => {} },
  );
  return { service, rows, versions, audits, notices, authors, people, tx };
}

test('rascunho usa busca exata antes do fallback legado e mantém escopo', async () => {
  for (const legacy of [false, true]) {
    const h = harness();
    const queries = [];
    h.tx.scientificPerson.findFirst = async ({ where }) => {
      queries.push(where);
      assert.equal(where.eventId, scope.eventId);
      assert.equal(where.organizationId, scope.organizationId);
      if (typeof where.email === 'string') return legacy ? null : { id: 'cpersonowner01' };
      assert.deepEqual(where.email, { equals: 'ana@example.test', mode: 'insensitive' });
      return { id: 'cpersonowner01' };
    };
    await h.service.saveDraft('congresso', 'Bearer participante', draftBody, key);
    assert.equal(queries[0].email, 'ana@example.test');
    assert.equal(queries.length, legacy ? 2 : 1);
    assert.equal(h.authors[0].personId, 'cpersonowner01');
    assert.equal(h.people.size, 1, 'pessoa existente não é duplicada');
  }
});

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

test('excluir rascunho remove somente o DRAFT escopado e registra auditoria sem PII', async () => {
  const h = harness();
  const saved = await h.service.saveDraft('congresso', 'Bearer participante', draftBody, key);
  assert.equal(h.rows.length, 1);
  assert.ok(h.authors.length > 0);

  const result = await h.service.deleteDraft('congresso', 'Bearer participante', saved.id);
  assert.deepEqual(result, { id: saved.id, deleted: true });
  assert.equal(h.rows.length, 0);
  assert.equal(h.authors.length, 0);
  const audit = h.audits.at(-1);
  assert.equal(audit.action, 'scientific.author_draft_deleted');
  assert.equal(JSON.stringify(audit).includes('@'), false);

  await assert.rejects(
    h.service.deleteDraft('congresso', 'Bearer participante', saved.id),
    /Rascunho não encontrado/u,
  );

  const submitted = await h.service.saveDraft('congresso', 'Bearer participante', draftBody, otherKey);
  h.rows[0].status = 'SUBMITTED'; h.rows[0].currentVersion = 1;
  await assert.rejects(
    h.service.deleteDraft('congresso', 'Bearer participante', submitted.id),
    /Rascunho não encontrado/u,
  );
  assert.equal(h.rows.length, 1, 'trabalho submetido nunca é apagado pelo endpoint de rascunho');
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
  const submittedAudit = h.audits.find((item) => item.action === 'scientific.author_submitted');
  assert.equal(submittedAudit.metadata.fromDraft, true);
  assert.equal(submittedAudit.metadata.version, 1);
  assert.equal(result.notice.kind, 'SUBMITTED');
  assert.equal(h.notices.length, 1);
  const repeated = await h.service.submit('congresso', 'Bearer participante', { ...submitBody, draftId: saved.id }, otherKey);
  assert.equal(repeated.duplicate, true);
  assert.deepEqual(repeated.notice, result.notice);
  assert.equal(h.notices.length, 1);
  assert.equal(h.audits.filter((item) => item.action === 'scientific.author_notice_recorded').length, 1);
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


test('editar coautor com o mesmo e-mail guarda nome/instituição sem mudar a pessoa compartilhada', async () => {
  const h = harness();
  const email = 'bia@example.test';
  const original = { name: 'Bia Lima', email, institution: 'USP', presenter: false };
  const saved = await h.service.saveDraft('congresso', 'Bearer participante', { ...draftBody, coauthors: [original] }, key);
  const sharedPerson = { ...h.people.get(email) };
  const changed = { ...original, name: 'Beatriz Lima', institution: 'Unicamp' };
  await h.service.saveDraft('congresso', 'Bearer participante', { ...draftBody, draftId: saved.id, coauthors: [changed] }, otherKey);
  const author = h.authors.find((item) => item.personId === sharedPerson.id);
  assert.equal(author.nameSnapshot, 'Beatriz Lima');
  assert.equal(author.institutionSnapshot, 'Unicamp');
  assert.deepEqual(h.people.get(email), sharedPerson);
  await h.service.submit('congresso', 'Bearer participante', { ...submitBody, draftId: saved.id, coauthors: [changed] }, 'author-draft-promote-03');
  const submittedAuthor = h.authors.find((item) => item.personId === sharedPerson.id);
  assert.equal(submittedAuthor.nameSnapshot, 'Beatriz Lima');
  assert.equal(submittedAuthor.institutionSnapshot, 'Unicamp');
  assert.deepEqual(h.people.get(email), sharedPerson);
});



test('exclusão repete somente conflitos serializáveis, até três tentativas, mantendo escopo e auditoria única', async () => {
  for (const failures of [1, 2]) {
    const h = harness();
    const saved = await h.service.saveDraft('congresso', 'Bearer participante', draftBody, key);
    const original = h.service.prisma.$transaction.bind(h.service.prisma);
    let calls = 0;
    h.service.prisma.$transaction = async (callback, options) => {
      calls += 1;
      assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
      if (calls <= failures) throw new Prisma.PrismaClientKnownRequestError('serialization', { code: 'P2034', clientVersion: 'test' });
      return original(callback, options);
    };
    assert.deepEqual(await h.service.deleteDraft('congresso', 'Bearer participante', saved.id), { id: saved.id, deleted: true });
    assert.equal(calls, failures + 1);
    assert.equal(h.rows.length, 0);
    assert.equal(h.audits.filter((audit) => audit.action === 'scientific.author_draft_deleted').length, 1);
  }
});

test('exclusão propaga o terceiro conflito e não repete erro não serializável', async () => {
  for (const code of ['P2034', 'P2002']) {
    const h = harness();
    const saved = await h.service.saveDraft('congresso', 'Bearer participante', draftBody, key);
    const failure = new Prisma.PrismaClientKnownRequestError('transaction failed', { code, clientVersion: 'test' });
    let calls = 0;
    h.service.prisma.$transaction = async () => { calls += 1; throw failure; };
    await assert.rejects(h.service.deleteDraft('congresso', 'Bearer participante', saved.id), (error) => error === failure);
    assert.equal(calls, code === 'P2034' ? 3 : 1);
    assert.equal(h.rows.length, 1);
    assert.equal(h.audits.filter((audit) => audit.action === 'scientific.author_draft_deleted').length, 0);
  }
});

