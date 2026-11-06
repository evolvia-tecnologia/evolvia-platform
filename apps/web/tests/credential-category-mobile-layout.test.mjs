import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('controles de formatação não exigem largura fixa em 320 e 390px', async () => {
  const css = await readFile(new URL('../components/credential-category-templates.module.css', import.meta.url), 'utf8');
  assert.ok(css.includes('@media (max-width: 850px) { .columns { grid-template-columns: minmax(0, 1fr); } }'));
  assert.ok(css.includes('@media (max-width: 850px) { .preview { position: static; } }'));
  const narrow = css.split('@media (max-width: 390px) {')[1]?.split('\n}')[0];
  assert.ok(narrow, 'o breakpoint 390px deve atender também 320px');
  assert.ok(narrow.includes('.formatBar label { display: grid; grid-template-columns: minmax(0, 1fr); align-items: stretch; min-width: 0; }'));
  assert.ok(narrow.includes('.formatBar label select { width: 100%; max-width: 100%; min-width: 0; }'));
  assert.ok(narrow.includes('.formatBar .boldOption { display: flex; justify-content: flex-start; white-space: normal; }'));
  assert.ok(css.includes('.section :is(button, select):focus-visible { outline: 3px solid'));
});
