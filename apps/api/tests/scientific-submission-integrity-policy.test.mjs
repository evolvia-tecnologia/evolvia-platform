import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateScientificSubmissionIntegrityForSubmit,
  validateScientificSubmissionIntegrityRules,
} from '../dist/scientific-submission-integrity.policy.js';

const rules = {
  titleCount: { unit: 'CHARACTERS', min: 5, max: 80 },
  requirePresentationForm: true,
  allowedPresentationForms: ['ORAL', 'POSTER', 'EPOSTER'],
  presenterPolicy: 'EXACTLY_ONE',
  correspondingAuthorPolicy: 'OPTIONAL_ONE',
  minInstitutions: 1,
  maxInstitutions: 5,
  requireInstitutionPerAuthor: true,
  requireOrcidForAuthors: true,
  conflictPolicy: 'REQUIRED',
  requireConflictDescriptionWhenDeclared: true,
  file: {
    enabled: true,
    required: true,
    maxFiles: 1,
    maxBytesPerFile: 5_000_000,
    allowedMimeTypes: ['application/pdf'],
    requireAnonymizationConfirmation: true,
  },
  additionalFields: [
    { code: 'ethicsApproval', required: true },
    { code: 'funding', required: false },
  ],
};

test('aceita configuração íntegra', () => {
  assert.deepEqual(validateScientificSubmissionIntegrityRules(rules), []);
});

test('rejeita ranges, arquivo e campos adicionais incoerentes', () => {
  const errors = validateScientificSubmissionIntegrityRules({
    ...rules,
    titleCount: { unit: 'CHARACTERS', min: 50, max: 10 },
    minInstitutions: 3,
    maxInstitutions: 1,
    file: { ...rules.file, maxFiles: 0 },
    additionalFields: [
      { code: 'same', required: true },
      { code: 'same', required: false },
    ],
  });

  const codes = errors.map((item) => item.code);
  assert.equal(codes.includes('INVALID_TITLE_RANGE'), true);
  assert.equal(codes.includes('INVALID_INSTITUTION_RANGE'), true);
  assert.equal(codes.includes('INVALID_FILE_RULE'), true);
  assert.equal(codes.includes('DUPLICATED_ADDITIONAL_FIELD'), true);
});

test('valida apresentação, apresentador, correspondente, instituições e ORCID', () => {
  const errors = validateScientificSubmissionIntegrityForSubmit(rules, {
    title: 'Título científico válido',
    presentationForm: 'VIDEO',
    presenterCount: 0,
    correspondingAuthorCount: 2,
    institutionCount: 0,
    authorsWithoutInstitution: 1,
    authorsMissingOrcid: 2,
    conflictDeclared: false,
    files: [{ mimeType: 'application/pdf', sizeBytes: 1000 }],
    anonymizationConfirmed: true,
    additionalResponses: { ethicsApproval: 'CEP 123' },
  });

  const codes = errors.map((item) => item.code);
  assert.equal(codes.includes('PRESENTATION_FORM_NOT_ALLOWED'), true);
  assert.equal(codes.includes('PRESENTER_REQUIRED'), true);
  assert.equal(codes.includes('MULTIPLE_CORRESPONDING_AUTHORS_NOT_ALLOWED'), true);
  assert.equal(codes.includes('MIN_INSTITUTIONS_NOT_MET'), true);
  assert.equal(codes.includes('AUTHOR_INSTITUTION_REQUIRED'), true);
  assert.equal(codes.includes('AUTHOR_ORCID_REQUIRED'), true);
});

test('conflito declarado exige descrição quando configurado', () => {
  const errors = validateScientificSubmissionIntegrityForSubmit(rules, {
    title: 'Título científico válido',
    presentationForm: 'ORAL',
    presenterCount: 1,
    correspondingAuthorCount: 1,
    institutionCount: 1,
    authorsWithoutInstitution: 0,
    authorsMissingOrcid: 0,
    conflictDeclared: true,
    conflictDescription: '   ',
    files: [{ mimeType: 'application/pdf', sizeBytes: 1000 }],
    anonymizationConfirmed: true,
    additionalResponses: { ethicsApproval: 'CEP 123' },
  });

  assert.equal(errors.some((item) => item.code === 'CONFLICT_DESCRIPTION_REQUIRED'), true);
});

test('arquivo respeita quantidade, tamanho, MIME e anonimização', () => {
  const errors = validateScientificSubmissionIntegrityForSubmit(rules, {
    title: 'Título científico válido',
    presentationForm: 'POSTER',
    presenterCount: 1,
    correspondingAuthorCount: 0,
    institutionCount: 1,
    authorsWithoutInstitution: 0,
    authorsMissingOrcid: 0,
    conflictDeclared: false,
    files: [
      { mimeType: 'application/pdf', sizeBytes: 6_000_000 },
      { mimeType: 'image/png', sizeBytes: 1000 },
    ],
    anonymizationConfirmed: false,
    additionalResponses: { ethicsApproval: 'CEP 123' },
  });

  const codes = errors.map((item) => item.code);
  assert.equal(codes.includes('TOO_MANY_FILES'), true);
  assert.equal(codes.includes('FILE_TOO_LARGE'), true);
  assert.equal(codes.includes('FILE_TYPE_NOT_ALLOWED'), true);
  assert.equal(codes.includes('ANONYMIZATION_CONFIRMATION_REQUIRED'), true);
});

test('campo adicional obrigatório é validado pelo backend', () => {
  const errors = validateScientificSubmissionIntegrityForSubmit(rules, {
    title: 'Título científico válido',
    presentationForm: 'EPOSTER',
    presenterCount: 1,
    correspondingAuthorCount: 0,
    institutionCount: 1,
    authorsWithoutInstitution: 0,
    authorsMissingOrcid: 0,
    conflictDeclared: false,
    files: [{ mimeType: 'application/pdf', sizeBytes: 1000 }],
    anonymizationConfirmed: true,
    additionalResponses: {},
  });

  assert.equal(errors.some((item) => item.code === 'ADDITIONAL_FIELD_REQUIRED'), true);
});

test('submissão íntegra passa sem erros', () => {
  const errors = validateScientificSubmissionIntegrityForSubmit(rules, {
    title: 'Avaliação multicêntrica de uma estratégia científica',
    presentationForm: 'ORAL',
    presenterCount: 1,
    correspondingAuthorCount: 1,
    institutionCount: 2,
    authorsWithoutInstitution: 0,
    authorsMissingOrcid: 0,
    conflictDeclared: true,
    conflictDescription: 'Financiamento institucional declarado.',
    files: [{ mimeType: 'application/pdf', sizeBytes: 2_000_000 }],
    anonymizationConfirmed: true,
    additionalResponses: {
      ethicsApproval: 'CAAE 12345678.9.0000.0000',
      funding: 'Instituição X',
    },
  });

  assert.deepEqual(errors, []);
});
