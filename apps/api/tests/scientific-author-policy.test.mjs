import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthorSubmissionPolicyError, assertAbstractWithinEvent, assertAuthorRoster, assertModalityWindowOpen, composeModalityAbstract, normalizeAuthorSubmission, normalizeModalityWindow, normalizeSubmissionKey, publicModalityWindow } from '../src/scientific-author-policy.ts';

const valid = {
  modalityId: 'clongmodality01',
  title: ' Pesquisa aplicada ',
  abstractText: 'Um resumo com conteúdo científico suficiente para atender ao limite mínimo.',
  keywords: [' saúde ', 'tecnologia'],
  institution: ' Instituto Evolvia ',
  taxonomyAreaId: null,
  taxonomySubareaId: null,
};

test('normaliza o trabalho e a chave opaca de idempotência', () => {
  assert.equal(normalizeSubmissionKey('author-request-123456'), 'author-request-123456');
  assert.deepEqual(normalizeAuthorSubmission(valid), {
    ...valid, title: 'Pesquisa aplicada', keywords: ['saúde', 'tecnologia'], institution: 'Instituto Evolvia',
    presentationFormatCode: null, scientificName: '', institutionAddress: '', fundingAgency: '',
    conflictDeclared: null, conflictDetail: '', referencesText: '', proceedingsAuthorizationAccepted: false,
    coauthors: [], submitterPresenter: true, submitterCorresponding: true, submitterSortOrder: 1,
  });
});

test('rejeita entradas inválidas, duplicadas e subárea sem área', () => {
  for (const key of [undefined, 'short', 'a'.repeat(129), 'chave com espaços e comprimento']) {
    assert.throws(() => normalizeSubmissionKey(key), AuthorSubmissionPolicyError);
  }
  for (const input of [
    { ...valid, title: 'a' },
    { ...valid, title: '<script>alert(1)</script>' },
    { ...valid, abstractText: `<script>alert(1)</script>${' conteúdo científico suficiente para o limite.'}` },
    { ...valid, keywords: ['Saúde', 'saúde'] },
    { ...valid, taxonomySubareaId: 'clongsubarea01' },
    { ...valid, modalityId: 'outro-evento' },
  ]) assert.throws(() => normalizeAuthorSubmission(input), AuthorSubmissionPolicyError);
});

test('prazo da modalidade é inclusivo e os blocos compõem o resumo', () => {
  const eventRule = { enabled: true, unit: 'CHARACTERS', min: 30, max: 10000 };
  const opensAt = '2026-10-08T12:00:00.000Z';
  const closesAt = '2026-10-08T18:00:00.000Z';
  const saved = normalizeModalityWindow({
    opensAt, closesAt,
    blocks: [
      { label: 'Introdução', min: 10, max: 40 },
      { label: 'Método', min: 10, max: 40 },
    ],
  });
  assert.deepEqual(publicModalityWindow(saved).blocks.map((block) => block.code), ['introducao', 'metodo']);
  assert.doesNotThrow(() => assertModalityWindowOpen(saved, new Date(opensAt)));
  assert.doesNotThrow(() => assertModalityWindowOpen(saved, new Date(closesAt)));
  assert.throws(() => assertModalityWindowOpen(saved, new Date('2026-10-08T11:59:59.999Z')), /ainda não abriu/);
  assert.throws(() => assertModalityWindowOpen(saved, new Date('2026-10-08T18:00:00.001Z')), /encerrou/);
  const input = normalizeAuthorSubmission({
    ...valid,
    abstractText: '',
    abstractBlocks: [
      { code: 'introducao', text: 'contexto clínico ' },
      { code: 'metodo', text: 'coorte observacional' },
    ],
  });
  const composed = composeModalityAbstract(input, saved, eventRule);
  assert.equal(composed.abstractBlocks, undefined);
  assert.equal(composed.abstractText, 'Introdução\ncontexto clínico\n\nMétodo\ncoorte observacional');
  assert.throws(() => composeModalityAbstract(input, { ...saved, blocks: [] }, eventRule), /único resumo/);
  assert.throws(() => normalizeModalityWindow({ opensAt: closesAt, closesAt: opensAt, blocks: [] }), /posterior à abertura/);
  assert.throws(() => normalizeModalityWindow({ blocks: [{ label: 'Bloco A', min: 1, max: 2 }, { label: 'Bloco B', min: 1, max: 2 }, { label: 'Bloco C', min: 1, max: 2 }, { label: 'Bloco D', min: 1, max: 2 }, { label: 'Bloco E', min: 1, max: 2 }] }), /no máximo 4/);
  assert.throws(() => normalizeModalityWindow({ blocks: [{ label: 'Introdução', min: 0, max: 10000 }, { label: 'Método', min: 0, max: 10000 }] }), /soma dos limites e títulos/);
  for (const invalid of [null, [], true, false, '']) {
    assert.throws(() => normalizeModalityWindow({ blocks: [{ label: 'Introdução', min: invalid, max: 40 }] }), /mínimo e um máximo válidos/);
  }
  const { abstractBlocks: _ignoredBlocks, ...withoutBlocks } = input;
  assert.deepEqual(composeModalityAbstract(input, saved, { ...eventRule, enabled: false }), withoutBlocks);
});

test('o resumo obedece a unidade e os limites do evento', () => {
  assert.throws(() => assertAbstractWithinEvent('curto', { enabled: true, unit: 'CHARACTERS', min: 30, max: 10000 }), /30 e 10000 caracteres/);
  assert.throws(() => assertAbstractWithinEvent('uma duas', { enabled: true, unit: 'WORDS', min: 50, max: 500 }), /50 e 500 palavras/);
  assert.doesNotThrow(() => assertAbstractWithinEvent(valid.abstractText, { enabled: true, unit: 'CHARACTERS', min: 30, max: 10000 }));
  assert.throws(() => assertAbstractWithinEvent('Texto digitado.', { enabled: false, unit: 'CHARACTERS', min: 0, max: 10000 }), /não coleta resumo/);
});


test('coautoria exige e-mail único e respeita o mínimo do evento', () => {
  const withCoauthor = normalizeAuthorSubmission({
    ...valid,
    coauthors: [{ name: 'Marina Costa', email: 'Marina@Example.com', institution: 'Instituto de Exemplo', presenter: false }],
  });
  assert.equal(withCoauthor.coauthors[0].email, 'marina@example.com');
  assert.throws(() => normalizeAuthorSubmission({
    ...valid,
    coauthors: [
      { name: 'Marina Costa', email: 'marina@example.com', institution: 'Instituto de Exemplo' },
      { name: 'Marina Costa', email: 'marina@example.com', institution: 'Instituto de Exemplo' },
    ],
  }), /mesmo e-mail/);
  assert.throws(() => assertAuthorRoster('autor@example.com', {
    ...withCoauthor,
    coauthors: [],
  }, {
    minAuthors: 2, maxAuthors: 4, maxPresenters: 1, requirePresenter: true,
    requireCorrespondingAuthor: true, requireAuthorInstitution: true,
  }), /pelo menos 2 autores/);
  assert.doesNotThrow(() => assertAuthorRoster('autor@example.com', {
    coauthors: [], submitterPresenter: true, submitterCorresponding: true, institution: 'Instituto', submitterSortOrder: 1,
  }, {
    minAuthors: 1, maxAuthors: 1, maxPresenters: 1, requirePresenter: true,
    requireCorrespondingAuthor: true, requireAuthorInstitution: true,
  }));
  assert.throws(() => assertAuthorRoster('autor@example.com', withCoauthor, {
    minAuthors: 1, maxAuthors: 1, maxPresenters: 1, requirePresenter: true,
    requireCorrespondingAuthor: true, requireAuthorInstitution: false,
    collectAdditionalAuthors: false,
  }), /apenas quem envia a inscrição/);
  assert.throws(() => assertAuthorRoster('autor@example.com', {
    coauthors: [], submitterPresenter: true, submitterCorresponding: true, institution: 'Instituto', submitterSortOrder: 1,
  }, {
    minAuthors: 1, maxAuthors: 1, maxPresenters: 1, requirePresenter: true,
    requireCorrespondingAuthor: true, requireAuthorInstitution: false,
    collectAuthorInstitution: false,
  }), /não pede instituição/);
  assert.throws(() => assertAuthorRoster('autor@example.com', {
    coauthors: [{ name: 'Marina Costa', email: 'marina@example.com', institution: 'Instituto', presenter: false, corresponding: false, sortOrder: 1 }],
    submitterPresenter: true, submitterCorresponding: true, institution: 'Instituto', submitterSortOrder: 1,
  }, {
    minAuthors: 1, maxAuthors: 4, maxPresenters: 1, requirePresenter: true,
    requireCorrespondingAuthor: true, requireAuthorInstitution: true,
    collectAuthorOrder: true,
  }), /sem repetir/);
});

test('texto científico aceita comparações e recusa marcação e scripts', () => {
  assert.doesNotThrow(() => normalizeAuthorSubmission({ ...valid, title: 'Resultados com p < 0.05', abstractText: 'A amostra teve n > 100 e significância p < 0.05.' }));
  for (const title of ['<img src=x onerror=alert(1)>', '<svg/onload=alert(1)>', '<!-- comentário -->', 'javascript:alert(1)']) {
    assert.throws(() => normalizeAuthorSubmission({ ...valid, title }), AuthorSubmissionPolicyError);
  }
});

