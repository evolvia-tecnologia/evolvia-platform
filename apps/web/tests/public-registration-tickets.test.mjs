import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('inscrição pública escolhe categoria e lote em cartões e resume o valor', async () => {
  const [form, css] = await Promise.all([
    read('../components/public-registration-form.tsx'),
    read('../components/public-registration-form.module.css'),
  ]);
  assert.match(form, /name="registration-category"/u);
  assert.match(form, /name="registration-lot"/u);
  assert.match(form, /role="radiogroup"/u);
  assert.match(form, /id="registration-summary-title">Sua inscrição/u);
  assert.match(form, /Valor antes do benefício/u);
  assert.match(form, /Reservar minha vaga/u);
  assert.match(form, /categoryId/u);
  assert.match(form, /lotId/u);
  assert.match(form, /remaining === 0/u);
  assert.doesNotMatch(form, /<select required value=\{categoryId\}/u);
  assert.doesNotMatch(form, /<select required value=\{lotId\}/u);
  assert.match(css, /\.checkout/u);
  assert.match(css, /position:\s*sticky/u);
  assert.match(css, /min-height:\s*var\(--space-44\)/u);
  assert.match(css, /@media \(max-width: 700px\)/u);
  assert.match(css, /grid-template-columns:\s*1fr/u);
  assert.match(css, /:focus-visible/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /@media \(forced-colors: active\)/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
  assert.doesNotMatch(css, /border-radius:\s*(?:\d+(?:\.\d+)?(?:px|rem)|\.\d+rem)/iu);
});
