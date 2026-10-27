import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const component = readFileSync(new URL('../components/print-surface.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../components/print-surface.module.css', import.meta.url), 'utf8');

test('a folha imprime em portal e a regra @page é instalada e removida sem hoisting React', () => {
  assert.match(component, /createPortal\(<div data-evolvia-print-root/u);
  assert.match(component, /useLayoutEffect\(\(\) => \{/u);
  assert.match(component, /document\.head\.appendChild\(style\)/u);
  assert.match(component, /return \(\) => style\.remove\(\)/u);
  assert.match(component, /style\.setAttribute\('data-evolvia-print-page', 'true'\)/u);
  assert.doesNotMatch(component, /<style[\s>]/u);
});

test('CSS Modules mantém classe local e ancora a folha no atributo do portal', () => {
  assert.match(css, /:global\(body\):has\(> \.root\[data-evolvia-print-root\]\)/u);
  assert.match(css, /:global\(body\):has\(> \.root\[data-evolvia-print-root\]\) > :not\(\.root\)/u);
  assert.match(css, /\.root \{ display: block !important;/u);
});
