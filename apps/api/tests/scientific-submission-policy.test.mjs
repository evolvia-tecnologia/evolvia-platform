import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canTransitionSubmission,
  requiresImmutableSubmittedVersion,
  shouldHideAuthorIdentity,
  validateSubmissionForSubmit,
} from '../dist/scientific-submission-policy.js';

const baseRequirements = {
  areaEnabled: true,
  areaRequired: false,
  subareaEnabled: true,
  subareaRequired: false,
  fileEnabled: true,
  fileRequired: false,
  minAuthors: 1,
  maxAuthors: 8,
  presenterRequired: true,
};

test('área e subárea permanecem opcionais quando a modalidade permitir', () => {
  const errors = validateSubmissionForSubmit({
    title: 'Biomarcadores em insuficiência cardíaca',
    modalityId: 'oral',
    scientificAreaId: null,
    scientificSubareaId: null,
    fileId: null,
    authors: [{ id: 'a1', order: 1, presenter: true }],
  }, baseRequirements);

  assert.equal(errors.length, 0);
});

test('exige área e subárea somente quando configuradas como obrigatórias', () => {
  const errors = validateSubmissionForSubmit({
    title: 'Trabalho científico',
    modalityId: 'poster',
    authors: [{ id: 'a1', order: 1, presenter: true }],
  }, {
    ...baseRequirements,
    areaRequired: true,
    subareaRequired: true,
  });

  assert.deepEqual(errors.map((item) => item.code), ['AREA_REQUIRED', 'SUBAREA_REQUIRED']);
});

test('impede subárea sem área e ordem de autoria duplicada', () => {
  const errors = validateSubmissionForSubmit({
    title: 'Trabalho científico',
    modalityId: 'poster',
    scientificSubareaId: 'sub-1',
    authors: [
      { id: 'a1', order: 1, presenter: true },
      { id: 'a2', order: 1 },
    ],
  }, baseRequirements);

  assert.equal(errors.some((item) => item.code === 'SUBAREA_WITHOUT_AREA'), true);
  assert.equal(errors.some((item) => item.code === 'AUTHOR_ORDER_DUPLICATED'), true);
});

test('exige exatamente um apresentador quando a política exigir', () => {
  const none = validateSubmissionForSubmit({
    title: 'Trabalho científico',
    modalityId: 'oral',
    authors: [{ id: 'a1', order: 1 }],
  }, baseRequirements);
  assert.equal(none.some((item) => item.code === 'PRESENTER_REQUIRED'), true);

  const many = validateSubmissionForSubmit({
    title: 'Trabalho científico',
    modalityId: 'oral',
    authors: [
      { id: 'a1', order: 1, presenter: true },
      { id: 'a2', order: 2, presenter: true },
    ],
  }, baseRequirements);
  assert.equal(many.some((item) => item.code === 'MULTIPLE_PRESENTERS'), true);

  const twoAllowed = validateSubmissionForSubmit({
    title: 'Trabalho científico',
    modalityId: 'oral',
    authors: [
      { id: 'a1', order: 1, presenter: true },
      { id: 'a2', order: 2, presenter: true },
    ],
  }, { ...baseRequirements, maxPresenters: 2 });
  assert.equal(twoAllowed.some((item) => item.code === 'MULTIPLE_PRESENTERS'), false);
});

test('estado submetido não volta silenciosamente para rascunho', () => {
  assert.equal(canTransitionSubmission('DRAFT', 'SUBMITTED'), true);
  assert.equal(canTransitionSubmission('SUBMITTED', 'DRAFT'), false);
  assert.equal(canTransitionSubmission('UNDER_REVIEW', 'ACCEPTED_WITH_CHANGES'), true);
});

test('versões submetidas são imutáveis e modos cegos ocultam autoria', () => {
  assert.equal(requiresImmutableSubmittedVersion('DRAFT'), false);
  assert.equal(requiresImmutableSubmittedVersion('SUBMITTED'), true);
  assert.equal(requiresImmutableSubmittedVersion('ACCEPTED_WITH_CHANGES'), true);
  assert.equal(shouldHideAuthorIdentity('OPEN'), false);
  assert.equal(shouldHideAuthorIdentity('SINGLE_BLIND'), true);
  assert.equal(shouldHideAuthorIdentity('DOUBLE_BLIND'), true);
});
