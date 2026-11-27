import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const editor = await readFile(new URL('../components/publication-ckeditor.tsx', import.meta.url), 'utf8');
const field = await readFile(new URL('../components/publication-rich-text-field.tsx', import.meta.url), 'utf8');

test('atributos de acessibilidade vão para o editable, não para o host vazio', () => {
  assert.match(editor, /function applyEditableA11y\(/u);
  assert.match(editor, /getEditableElement\(\)/u);
  assert.match(editor, /setAttribute\('aria-labelledby'/u);
  assert.match(editor, /setAttribute\('aria-describedby'/u);
  assert.match(editor, /setAttribute\('aria-invalid'/u);
  assert.match(editor, /setAttribute\('aria-required'/u);
  assert.match(field, /labelledBy=\{labelId\}/u);
  assert.match(field, /describedBy=\{describedBy\}/u);
  assert.match(field, /invalid=\{Boolean\(shownError\)\}/u);
  assert.match(field, /required=\{required\}/u);
  // Só a tag de abertura do host — o textarea de fallback pode ter ARIA.
  const editorClassAt = field.indexOf('className={styles.editor}');
  const hostOpen = field.slice(editorClassAt, field.indexOf('>', editorClassAt) + 1);
  assert.equal(/aria-/u.test(hostOpen), false);
});

test('falha do ClassicEditor.create avisa e preserva o texto num textarea', () => {
  assert.match(editor, /ClassicEditor\.create\(/u);
  assert.match(editor, /onBootErrorRef\.current\?\.\(/u);
  assert.match(editor, /Não foi possível carregar o editor/u);
  assert.match(field, /onBootError=\{setBootError\}/u);
  assert.match(field, /bootError \? \(/u);
  assert.match(field, /<textarea/u);
  assert.match(field, /value=\{value\}/u);
  assert.match(field, /role="alert"/u);
});
