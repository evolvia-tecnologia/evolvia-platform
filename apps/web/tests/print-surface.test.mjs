import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const component = readFileSync(new URL('../components/print-surface.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../components/print-surface.module.css', import.meta.url), 'utf8');
const globalCss = readFileSync(new URL('../app/print-surface-global.css', import.meta.url), 'utf8');

test('a folha imprime em portal e a regra @page é instalada e removida sem hoisting React', () => {
  assert.match(component, /createPortal\(<div data-evolvia-print-root/u);
  assert.match(component, /useEffect\(\(\) => \{/u);
  assert.match(component, /document\.head\.appendChild\(style\)/u);
  assert.match(component, /return \(\) => style\.remove\(\)/u);
  assert.match(component, /style\.setAttribute\('data-evolvia-print-page', 'true'\)/u);
  assert.doesNotMatch(component, /<style[\s>]/u);
});

test('CSS Modules controla só a folha e o CSS global usa o atributo real do portal', () => {
  assert.match(css, /\.root \{ display: none; \}/u);
  assert.match(css, /\.root \{ display: block !important;/u);
  assert.doesNotMatch(css, /:global\(/u);
  assert.match(globalCss, /body:has\(> \[data-evolvia-print-root\]\)/u);
  assert.match(globalCss, /body:has\(> \[data-evolvia-print-root\]\) > :not\(\[data-evolvia-print-root\]\)/u);
});

