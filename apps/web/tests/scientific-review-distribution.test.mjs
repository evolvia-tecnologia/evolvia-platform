import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const panel = await readFile(new URL('../components/scientific-review-distribution.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/eventos/[id]/cientifico/avaliacao/page.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../components/scientific-review-distribution.module.css', import.meta.url), 'utf8');

test('a comissão confirma o lote sem e-mail e sem a ficha na tela', () => {
  assert.match(page, /ScientificReviewDistribution/u);
  assert.match(page, /ScientificReviews/u);
  assert.match(panel, /Distribuir elegíveis/u);
  assert.match(panel, /Não há e-mail/u);
  assert.match(panel, /reviews\/distribution/u);
  assert.match(panel, /role="alert"/u);
  assert.equal(panel.match(/<table>/gu).length, 1);
  assert.match(panel, /!\('email' in value\)/u);
  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.match(css, /@media \(max-width: 360px\)/u);
  assert.match(panel, /!\('registrationData' in value\)/u);
  assert.doesNotMatch(panel, /authorEmails|identityHash/u);
});
