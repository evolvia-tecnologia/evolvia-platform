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

function harness({ status = 'SUBMITTED', allow = true, sameHash = false, found = true, version = 1, requireFile = false, failAfterWrite = false, previousHash = null } = {}) {
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
    scientificSubmissionConfig: { findUnique: async () => ({ ...config, allowCorrections: allow, requireFile }) },
    scientificSubmissionVersion: {
      findFirst: async () => ({ contentHash: previousHash ?? (sameHash ? null : 'hash-anterior') }),
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
    auditLog: { create: async (input) => { calls.push(['audit', input.data.action, input.data.metadata]); if (failAfterWrite) throw new Error('falha depois do arquivo'); } },
  };
  const prisma = { $transaction: async (callback) => callback(tx) };
  const files = { write: async (key) => { if (!requireFile) throw new Error('arquivo não pedido'); calls.push(['write', key]); }, remove: async (key) => { calls.push(['remove', key]); } };
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

test('falha da transação remove apenas o PDF criado pela tentativa', async () => {
  const h = harness({ requireFile: true, failAfterWrite: true });
  const file = { fileName: 'trabalho.pdf', contentBase64: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF').toString('base64') };
  await assert.rejects(h.service.revise('congresso', 'Bearer participante', submissionId, { ...body, file }), /falha depois do arquivo/);
  const writes = h.calls.filter((item) => Array.isArray(item) && item[0] === 'write');
  const removals = h.calls.filter((item) => Array.isArray(item) && item[0] === 'remove');
  assert.equal(writes.length, 1);
  assert.deepEqual(removals, [['remove', writes[0][1]]]);
});
test('listagem identifica o submissor mesmo quando ele é o segundo autor', async () => {
  const prisma = {
    event: { findFirst: async () => ({ name: 'Congresso' }) },
    eventRegistrationReservation: { findUnique: async ({ where }) => {
      assert.deepEqual(where.id_eventId_organizationId, { id: scope.reservationId, eventId: scope.eventId, organizationId: scope.organizationId });
      return { registrationData: { email: 'ANA@example.test' } };
    } },
    scientificSubmissionConfig: { findUnique: async () => ({ ...config, acceptedWorkUploadDeadline: null }) },
    scientificSubmissionModality: { findMany: async () => [] },
    scientificTaxonomyNode: { findMany: async () => [] },
    scientificSubmission: { findMany: async () => [{
      id: submissionId, title: 'Pesquisa', abstractText: '', keywords: [], status: 'SUBMITTED', submittedAt: null, currentVersion: 1,
      modalityId, modality: { name: 'Oral' }, presentationFormatCode: null, taxonomyAreaId: null, taxonomySubareaId: null,
      versions: [
        { versionNumber: 2, fileKey: null, eposterFileKey: null, secondEposterFileKey: null, slideFileKey: null },
        { versionNumber: 1, fileKey: 'org/event/segredo.pdf', eposterFileKey: null, secondEposterFileKey: null, slideFileKey: null },
      ],
      authors: [
        { sortOrder: 1, isPresenter: false, isCorresponding: false, person: { name: 'Bia', email: 'bia@example.test', institution: 'USP' } },
        { sortOrder: 2, isPresenter: true, isCorresponding: true, person: { name: 'Ana', email: 'ana@example.test', institution: 'Hospital' } },
      ],
    }] },
  };
  const service = new ScientificAuthorService(prisma, { requireConfirmedScope: async () => scope }, {});
  const result = await service.get('congresso', 'Bearer participante');
  assert.deepEqual(result.submissions[0].authors.map((author) => author.isSubmitter), [false, true]);
  assert.equal(result.submissions[0].hasSubmissionFile, false, 'a versão atual não tem PDF');
  assert.deepEqual(result.submissions[0].submissionFileVersions, [1]);
  assert.equal(JSON.stringify(result).includes('segredo.pdf'), false);
  assert.equal(result.config.requireFile, false);
});

 test('correção com texto igual e PDF diferente cria nova versão, repetição do PDF é idempotente', async () => {
  const file = (text) => ({ fileName: 'trabalho.pdf', contentBase64: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%' + text + '\n%%EOF').toString('base64') });
  const first = harness({ requireFile: true });
  await first.service.revise('congresso', 'Bearer participante', submissionId, { ...body, file: file('primeiro') });
  const firstHash = first.calls.find((call) => Array.isArray(call) && call[0] === 'version')[2];
  const second = harness({ requireFile: true, previousHash: firstHash });
  const revised = await second.service.revise('congresso', 'Bearer participante', submissionId, { ...body, file: file('segundo') });
  assert.equal(revised.duplicate, false);
  const secondHash = second.calls.find((call) => Array.isArray(call) && call[0] === 'version')[2];
  assert.notEqual(firstHash, secondHash);
  const repeated = harness({ requireFile: true, previousHash: secondHash });
  assert.equal((await repeated.service.revise('congresso', 'Bearer participante', submissionId, { ...body, file: file('segundo') })).duplicate, true);
  assert.equal(repeated.calls.length, 0);
});
function initialSubmissionHarness({ writeFails = false } = {}) {
  const calls = [];
  const tx = {
    event: { findFirst: async () => ({ id: scope.eventId }) },
    eventRegistrationReservation: { findUnique: async () => ({
      status: 'CONFIRMED', registrationData: { full_name: 'Ana Souza', email: 'ana@example.test' },
    }) },
    scientificSubmission: {
      findFirst: async () => null,
      count: async () => 0,
      create: async (input) => ({
        id: submissionId, title: input.data.title, status: 'SUBMITTED',
      }),
    },
    scientificSubmissionConfig: { findUnique: async () => ({
      ...config, requireFile: true, maxSubmissionsPerAuthor: 3,
    }) },
    scientificSubmissionModality: { findFirst: async () => ({ id: modalityId }) },
    scientificTaxonomyNode: { findMany: async () => [] },
    scientificPerson: {
      findFirst: async () => ({ id: 'cpersonowner01' }),
      create: async () => { throw new Error('pessoa nova não deveria ser criada'); },
    },
    scientificSubmissionAuthor: { create: async () => { calls.push('author'); } },
    scientificSubmissionVersion: { create: async (input) => { calls.push(['version', input.data.fileKey]); } },
    auditLog: { create: async () => { throw new Error('auditoria indisponível depois do upload'); } },
  };
  const prisma = { $transaction: async (callback) => callback(tx) };
  const files = {
    write: async (key) => {
      calls.push(['write', key]);
      if (writeFails) throw new Error('armazenamento falhou depois de iniciar a escrita');
    },
    remove: async (key) => { calls.push(['remove', key]); },
  };
  const participant = { requireConfirmedScope: async () => scope };
  return { service: new ScientificAuthorService(prisma, participant, files), calls };
}

test('falha da submissão inicial limpa somente o PDF novo sem deixar referência quebrada', async () => {
  const h = initialSubmissionHarness();
  const file = {
    fileName: 'trabalho-inicial.pdf',
    contentBase64: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF').toString('base64'),
  };
  await assert.rejects(
    h.service.submit('congresso', 'Bearer participante', { ...body, file }, 'initial-pdf-rollback-0001'),
    /auditoria indisponível/u,
  );
  const writes = h.calls.filter((item) => Array.isArray(item) && item[0] === 'write');
  const removals = h.calls.filter((item) => Array.isArray(item) && item[0] === 'remove');
  assert.equal(writes.length, 1);
  assert.deepEqual(removals, [['remove', writes[0][1]]]);
  assert.deepEqual(h.calls.find((item) => Array.isArray(item) && item[0] === 'version'), ['version', writes[0][1]]);
});
test('falha parcial da escrita também tenta limpar a chave do PDF inicial', async () => {
  const h = initialSubmissionHarness({ writeFails: true });
  const file = {
    fileName: 'trabalho-inicial.pdf',
    contentBase64: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF').toString('base64'),
  };
  await assert.rejects(
    h.service.submit('congresso', 'Bearer participante', { ...body, file }, 'initial-pdf-write-failure-0001'),
    /armazenamento falhou/u,
  );
  const write = h.calls.find((item) => Array.isArray(item) && item[0] === 'write');
  assert.ok(write);
  assert.deepEqual(h.calls.filter((item) => Array.isArray(item) && item[0] === 'remove'), [['remove', write[1]]]);
  assert.equal(h.calls.some((item) => Array.isArray(item) && item[0] === 'version'), false);
});

test('submissão sem o PDF exigido não grava arquivo', async () => {
  const h = initialSubmissionHarness();
  await assert.rejects(
    h.service.submit('congresso', 'Bearer participante', body, 'initial-pdf-missing-0001'),
    /Anexe o PDF exigido na submissão/u,
  );
  assert.equal(h.calls.some((item) => Array.isArray(item) && item[0] === 'write'), false);
  assert.equal(h.calls.some((item) => Array.isArray(item) && item[0] === 'version'), false);
});

test('PDF da submissão com formato incompleto é recusado pela estrutura, sem depender da mensagem do ePoster', async () => {
  for (const file of [{}, { fileName: 'trabalho.pdf' }, { contentBase64: 'JVBERi0=' }, { fileName: ' ', contentBase64: 'JVBERi0=' }, ['x']]) {
    const h = initialSubmissionHarness();
    await assert.rejects(
      h.service.submit('congresso', 'Bearer participante', { ...body, file }, 'initial-pdf-shape-0001'),
      /Anexe o PDF exigido na submissão/u,
    );
    assert.equal(h.calls.some((item) => Array.isArray(item) && item[0] === 'write'), false);
  }
  const html = initialSubmissionHarness();
  await assert.rejects(
    html.service.submit('congresso', 'Bearer participante', { ...body, file: { fileName: 'trabalho.pdf', contentBase64: Buffer.from('<html>oi</html>').toString('base64') } }, 'initial-pdf-shape-0002'),
    /precisa ser um PDF/u,
  );
});

test('download do PDF da versão filtra pelo autor, evento, organização e evento publicado', async () => {
  const queries = [];
  const reads = [];
  const prisma = { scientificSubmissionVersion: { findFirst: async (query) => { queries.push(query); return { fileKey: 'org/event/segredo.pdf' }; } } };
  const files = { read: async (key) => { reads.push(key); return Buffer.from('%PDF-1.4'); } };
  const service = new ScientificAuthorService(prisma, { requireConfirmedScope: async () => scope }, files);
  const file = await service.submissionVersionFile('congresso', 'Bearer participante', submissionId, '2');
  assert.equal(file.fileName, 'trabalho-versao-2.pdf');
  assert.equal(JSON.stringify(file).includes('segredo'), false);
  const where = queries[0].where;
  assert.equal(where.versionNumber, 2);
  assert.equal(where.submission.ownerReservationId, scope.reservationId);
  assert.equal(where.submission.eventId, scope.eventId);
  assert.equal(where.submission.organizationId, scope.organizationId);
  assert.deepEqual(where.submission.event, { status: 'PUBLISHED', profileCode: 'SCIENTIFIC_EVENT' });
  assert.deepEqual(reads, ['org/event/segredo.pdf']);

  for (const version of ['0', '01', '100', '1.5', '../2']) {
    await assert.rejects(service.submissionVersionFile('congresso', 'Bearer participante', submissionId, version), /não encontrado/u);
  }
  assert.equal(queries.length, 1);
  const missing = new ScientificAuthorService({ scientificSubmissionVersion: { findFirst: async () => ({ fileKey: null }) } }, { requireConfirmedScope: async () => scope }, files);
  await assert.rejects(missing.submissionVersionFile('congresso', 'Bearer participante', submissionId, '1'), /não encontrado/u);
  assert.equal(reads.length, 1);
});
