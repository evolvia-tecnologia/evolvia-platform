import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildScientificSubmissionReviewView,
  buildScientificSubmissionSnapshot,
} from '../dist/scientific-submission-snapshot.policy.js';

function baseInput() {
  return {
    organizationId: 'org-1',
    eventId: 'event-1',
    submissionId: 'submission-1',
    versionNumber: 1,
    capturedAt: new Date('2026-08-10T15:00:00.000Z'),
    configurationRevision: 'rules-v3',
    modality: { id: 'modality-1', name: 'Resumo expandido' },
    presentationForm: { code: 'POSTER', label: 'Pôster' },
    area: { id: 'area-1', name: 'Cardiologia' },
    subarea: { id: 'subarea-1', name: 'Imagem cardiovascular' },
    title: 'Avaliação científica do método X',
    keywords: ['imagem', 'cardiologia'],
    conflictOfInterest: { declared: false },
    institutions: [
      { id: 'inst-1', name: 'Universidade A', acronym: 'UA' },
      { id: 'inst-2', name: 'Hospital B' },
    ],
    authors: [
      {
        personId: 'person-2',
        name: 'Autor Dois',
        sortOrder: 2,
        isPresenter: true,
        isCorresponding: false,
        institutionIds: ['inst-2'],
      },
      {
        personId: 'person-1',
        name: 'Autor Um',
        sortOrder: 1,
        isPresenter: false,
        isCorresponding: true,
        orcid: '0000-0002-1825-0097',
        institutionIds: ['inst-1'],
      },
    ],
    files: [
      {
        kind: 'SUBMISSION_PDF',
        fileKey: 'event-1/submission-1/v1.pdf',
        fileName: 'trabalho.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 120000,
        contentHash: 'abc123',
      },
    ],
    additionalFields: [
      { code: 'ethics', label: 'Comitê de ética', sortOrder: 2, value: 'CEP 123' },
      { code: 'funding', label: 'Financiamento', sortOrder: 1, value: { agency: 'FAPESP', grant: '2026/001' } },
    ],
  };
}

test('bloco único gera snapshot reproduzível e revisão em texto corrido', () => {
  const input = {
    ...baseInput(),
    content: {
      mode: 'SINGLE_BLOCK',
      singleBlock: {
        label: 'Resumo',
        text: 'Objetivo. Metodologia. Resultados. Conclusão.',
      },
    },
  };

  const snapshot = buildScientificSubmissionSnapshot(input);
  const review = buildScientificSubmissionReviewView(snapshot);

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.capturedAt, '2026-08-10T15:00:00.000Z');
  assert.deepEqual(review.contentSections, [
    {
      code: 'abstract',
      label: 'Resumo',
      text: 'Objetivo. Metodologia. Resultados. Conclusão.',
    },
  ]);
  assert.equal(review.identification.modality, 'Resumo expandido');
  assert.equal(review.identification.presentationForm, 'Pôster');
});

test('blocos estruturados são preservados e exibidos na ordem configurada', () => {
  const snapshot = buildScientificSubmissionSnapshot({
    ...baseInput(),
    content: {
      mode: 'STRUCTURED_BLOCKS',
      blocks: [
        { code: 'results', label: 'Resultados', sortOrder: 30, text: 'Resultados do estudo.' },
        { code: 'objective', label: 'Objetivo', sortOrder: 10, text: 'Objetivo do estudo.' },
        { code: 'methods', label: 'Metodologia', sortOrder: 20, text: 'Métodos utilizados.' },
        { code: 'conclusion', label: 'Conclusão', sortOrder: 40, text: 'Conclusão final.' },
      ],
    },
  });

  const review = buildScientificSubmissionReviewView(snapshot);
  assert.deepEqual(
    review.contentSections.map((section) => section.label),
    ['Objetivo', 'Metodologia', 'Resultados', 'Conclusão'],
  );
  assert.deepEqual(
    review.contentSections.map((section) => section.text),
    ['Objetivo do estudo.', 'Métodos utilizados.', 'Resultados do estudo.', 'Conclusão final.'],
  );
});

test('ordem de autoria, apresentador, correspondente e afiliações ficam congelados no snapshot', () => {
  const input = {
    ...baseInput(),
    content: {
      mode: 'SINGLE_BLOCK',
      singleBlock: { text: 'Resumo original.' },
    },
  };
  const snapshot = buildScientificSubmissionSnapshot(input);

  assert.deepEqual(snapshot.authors.map((author) => author.personId), ['person-1', 'person-2']);
  assert.equal(snapshot.authors[0].isCorresponding, true);
  assert.equal(snapshot.authors[1].isPresenter, true);
  assert.deepEqual(snapshot.authors[0].institutionIds, ['inst-1']);
});

test('mudanças posteriores no objeto de entrada não alteram a versão capturada', () => {
  const input = {
    ...baseInput(),
    content: {
      mode: 'STRUCTURED_BLOCKS',
      blocks: [
        { code: 'objective', label: 'Objetivo', sortOrder: 1, text: 'Texto original.' },
      ],
    },
  };

  const snapshot = buildScientificSubmissionSnapshot(input);
  input.title = 'Título alterado depois';
  input.authors[0].name = 'Nome alterado depois';
  input.content.blocks[0].label = 'Nome do bloco alterado';
  input.content.blocks[0].text = 'Texto alterado depois.';
  input.additionalFields[1].value = 'Outro valor';

  assert.equal(snapshot.title, 'Avaliação científica do método X');
  assert.equal(snapshot.authors[1].name, 'Autor Dois');
  assert.equal(snapshot.content.blocks[0].label, 'Objetivo');
  assert.equal(snapshot.content.blocks[0].text, 'Texto original.');
  assert.deepEqual(snapshot.additionalFields[1].value, 'CEP 123');
});

test('campos adicionais ficam ordenados e serializáveis no snapshot', () => {
  const snapshot = buildScientificSubmissionSnapshot({
    ...baseInput(),
    content: {
      mode: 'SINGLE_BLOCK',
      singleBlock: { text: 'Resumo.' },
    },
  });

  assert.deepEqual(snapshot.additionalFields.map((field) => field.code), ['funding', 'ethics']);
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});

test('rejeita snapshot sem conteúdo compatível com o modo configurado', () => {
  assert.throws(
    () => buildScientificSubmissionSnapshot({
      ...baseInput(),
      content: { mode: 'SINGLE_BLOCK' },
    }),
    /bloco único/,
  );

  assert.throws(
    () => buildScientificSubmissionSnapshot({
      ...baseInput(),
      content: { mode: 'STRUCTURED_BLOCKS', blocks: [] },
    }),
    /ao menos um bloco/,
  );
});
