import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthorSubmissionPolicyError, assertAbstractWithinEvent, normalizeAuthorSubmission, normalizeSubmissionKey } from '../src/scientific-author-policy.ts';

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
  });
});

test('rejeita entradas inválidas, duplicadas e subárea sem área', () => {
  for (const key of [undefined, 'short', 'a'.repeat(129), 'chave com espaços e comprimento']) {
    assert.throws(() => normalizeSubmissionKey(key), AuthorSubmissionPolicyError);
  }
  for (const input of [
    { ...valid, title: 'a' },
    { ...valid, abstractText: `<script>alert(1)</script>${' conteúdo científico suficiente para o limite.'}` },
    { ...valid, keywords: ['Saúde', 'saúde'] },
    { ...valid, taxonomySubareaId: 'clongsubarea01' },
    { ...valid, modalityId: 'outro-evento' },
  ]) assert.throws(() => normalizeAuthorSubmission(input), AuthorSubmissionPolicyError);
});

test('o resumo obedece a unidade e os limites do evento', () => {
  assert.throws(() => assertAbstractWithinEvent('curto', { enabled: true, unit: 'CHARACTERS', min: 30, max: 10000 }), /30 e 10000 caracteres/);
  assert.throws(() => assertAbstractWithinEvent('uma duas', { enabled: true, unit: 'WORDS', min: 50, max: 500 }), /50 e 500 palavras/);
  assert.doesNotThrow(() => assertAbstractWithinEvent(valid.abstractText, { enabled: true, unit: 'CHARACTERS', min: 30, max: 10000 }));
  assert.throws(() => assertAbstractWithinEvent('Texto digitado.', { enabled: false, unit: 'CHARACTERS', min: 0, max: 10000 }), /não coleta resumo/);
});
