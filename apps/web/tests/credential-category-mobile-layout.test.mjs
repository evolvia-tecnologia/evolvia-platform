import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('editor de etiquetas mantém controles sem largura forçada em 320 e 390px', async () => {
  const css = await readFile(new URL('../components/credential-category-templates.module.css', import.meta.url), 'utf8');
  assert.match(css, /@media \\(max-width: 850px\\) \\{ \\.columns \\{ grid-template-columns: minmax\\(0, 1fr\\); \\} \\}/u);
  assert.match(css, /@media \\(max-width: 850px\\) \\{ \\.preview \\{ position: static; \\} \\}/u);
  const narrow = css.match(/@media \\(max-width: 390px\\) \\{([\\s\\S]*?)\\n\\}/u)?.[1];
  assert.ok(narrow, 'layout específico para telas de 320–390px deve existir');
  assert.match(narrow, /\\.formatBar label \\{ display: grid; grid-template-columns: minmax\\(0, 1fr\\); align-items: stretch; min-width: 0; \\}/u);
  assert.match(narrow, /\\.formatBar label select \\{ width: 100%; max-width: 100%; min-width: 0; \\}/u);
  assert.match(narrow, /\\.formatBar \\.boldOption \\{ display: flex; justify-content: flex-start; white-space: normal; \\}/u);
  assert.match(css, /\\.section :is\\(button, select\\):focus-visible \\{ outline: 3px solid/u);
});
