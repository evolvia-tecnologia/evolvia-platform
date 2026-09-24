import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthorSubmissionPolicyError, normalizeAuthorSubmission, normalizeSubmissionKey } from '../src/scientific-author-policy.ts';

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
  });
});

test('rejeita entradas inválidas, duplicadas e subárea sem área', () => {
  for (const key of [undefined, 'short', 'a'.repeat(129), 'chave com espaços e comprimento']) {
    assert.throws(() => normalizeSubmissionKey(key), AuthorSubmissionPolicyError);
  }
  for (const input of [
    { ...valid, title: 'a' },
    { ...valid, abstractText: 'curto' },
    { ...valid, keywords: ['Saúde', 'saúde'] },
    { ...valid, taxonomySubareaId: 'clongsubarea01' },
    { ...valid, modalityId: 'outro-evento' },
  ]) assert.throws(() => normalizeAuthorSubmission(input), AuthorSubmissionPolicyError);
});
