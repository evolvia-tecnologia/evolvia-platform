import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [panel, area, letters, policy] = await Promise.all([
  readFile(new URL('../components/scientific-author-panel.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/participant-area.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/scientific-decision-letters.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../api/src/acceptance-letter.policy.ts', import.meta.url), 'utf8'),
]);

test('a carta fica na área do autor aceito ou recusado e a EVA não promete e-mail', () => {
  assert.match(panel, /decision-letter/u);
  assert.match(panel, /letter\?\.id === submissionId/u);
  assert.match(panel, /item\.status === 'ACCEPTED' \|\| item\.status === 'ACCEPTED_WITH_CHANGES'/u);
  assert.match(panel, /Ver carta de aceite/u);
  assert.match(panel, /Ver carta de recusa/u);
  assert.match(panel, /PublicRichText/u);
  assert.match(panel, /carta-de-recusa/u);
  assert.match(area, /Não mostro parecer, nota ou o trabalho de outra pessoa/u);
  assert.match(area, /aceita ou recusa/u);
  assert.match(area, /A EVA não envia e-mail nem parecer/u);
  assert.equal(area.match(/<ScientificEvaHelp/gu)?.length, 1);
  assert.doesNotMatch(panel, /reviewer|nota do avaliador/iu);
});

test('o organizador formata aceite e recusa com as mesmas tags da política', () => {
  const acceptance = policy.match(/export const DEFAULT_ACCEPTANCE_LETTER_BODY = `([\s\S]*?)`;/u);
  const rejection = policy.match(/export const DEFAULT_REJECTION_LETTER_BODY = `([\s\S]*?)`;/u);
  assert.ok(acceptance && rejection);
  assert.ok(letters.includes(acceptance[1]));
  assert.ok(letters.includes(rejection[1]));
  assert.match(letters, /PublicationRichTextField/u);
  assert.equal(letters.match(/<PublicationRichTextField/gu)?.length, 2);
  assert.match(letters, /Salvar cartas/u);
  assert.match(letters, /\{NOME\}/u);
  assert.match(letters, /\{SITUACAO\}/u);
  assert.match(letters, /\{CODIGO\}/u);
  assert.equal(letters.match(/<ScientificEvaHelp/gu)?.length, 1);
  assert.doesNotMatch(letters, /organizationId|parecerista|e-mail do autor/iu);
});
