import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [search, page] = await Promise.all([
  readFile(new URL('../components/scientific-station-search.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/evento/[slug]/estacao/page.tsx', import.meta.url), 'utf8'),
]);

test('a estação pública pagina a lista e mantém busca, idioma e QR', () => {
  assert.match(search, /pagina/u);
  assert.match(search, /Próxima página|copy\.next/u);
  assert.match(search, /copy\.previous/u);
  assert.match(search, /fieldset/u);
  assert.match(search, /aria-label=\{copy\.pages\}/u);
  assert.match(search, /skip-link/u);
  assert.match(search, /id="conteudo-estacao"/u);
  assert.match(search, /type="search"/u);
  assert.match(search, /ScientificStationQr/u);
  assert.match(search, /styles\.identity/u);
  assert.match(search, /styles\.logo/u);
  assert.match(search, /media\/LOGO/u);
  assert.match(search, /payload\.event\.name/u);
  assert.match(search, /idioma/u);
  assert.match(page, /ScientificStationSearch/u);
  assert.doesNotMatch(search, /take:\s*50|mailto:|nodemailer/u);
});
