import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [globals, home, auth, events] = await Promise.all([
  readFile(new URL('../app/globals.css', import.meta.url), 'utf8'),
  readFile(new URL('../app/home-viewport.module.css', import.meta.url), 'utf8'),
  readFile(new URL('../app/auth-layout.module.css', import.meta.url), 'utf8'),
  readFile(new URL('../app/eventos/page.module.css', import.meta.url), 'utf8'),
]);

test('cabeçalhos públicos compartilham altura, tipografia e assinatura da marca', () => {
  assert.match(globals, /\.brand:before\{[^}]*width:31px;[^}]*height:25px;[^}]*linear-gradient/iu);
  assert.match(home, /\.homeTopbar \{[\s\S]*?height: 64px;[\s\S]*?min-height: 64px;/u);
  assert.match(home, /\.homeNav \{[\s\S]*?font-size: var\(--font-size-sm\);/u);
  assert.match(auth, /\.header \{[\s\S]*?min-height: 64px;[\s\S]*?padding:var\(--space-8\)/u);
  assert.match(auth, /\.headerLink \{[\s\S]*?font-size:var\(--font-size-sm\);/u);
  assert.match(events, /\.siteHeader \{[\s\S]*?min-height: 64px;/u);
  assert.match(events, /\.nav \{[\s\S]*?font-size: var\(--font-size-sm\);/u);
  assert.doesNotMatch(home, /max-height: 680px[\s\S]*?height: 56px;/u);
  assert.doesNotMatch(auth, /max-height: 720px[\s\S]*?\.header \{[\s\S]*?min-height: 56px;/u);
});

test('filtro de período encolhe sem estouro e reflui nos breakpoints canônicos', () => {
  assert.match(
    events,
    /grid-template-columns: minmax\(210px, 1\.65fr\) minmax\(0, \.75fr\) minmax\(0, 1fr\) minmax\(220px, 1\.35fr\) auto;/u,
  );
  assert.match(events, /\.field \{[\s\S]*?min-width: 0;/u);
  assert.match(events, /\.field input,[\s\S]*?\.field select \{[\s\S]*?min-width: 0;/u);
  assert.match(events, /\.clearLink \{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?justify-self: end;/u);
  assert.match(events, /@media \(max-width: 1080px\)[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/u);
  assert.match(events, /@media \(max-width: 640px\)[\s\S]*?\.filters,[\s\S]*?grid-template-columns: 1fr;/u);
});
