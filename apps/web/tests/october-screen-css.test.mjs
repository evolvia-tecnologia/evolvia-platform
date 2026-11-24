import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function css(name) {
  return readFileSync(new URL(`../components/${name}`, import.meta.url), 'utf8');
}

const reuse = css('event-reuse.module.css');
const journey = css('operator-journey.module.css');
const capabilities = css('operator-capabilities.module.css');
const communication = css('event-communication.module.css');
const show = css('show-operations-console.module.css');
const central = css('scientific-event-central.module.css');

test('reutilizar evento usa o azul da marca, anel de foco visível e alvo de 44px', () => {
  assert.doesNotMatch(reuse, /#5d3fd3|#cbbfff|#172033/u);
  assert.match(reuse, /\.primary:focus-visible/u);
  assert.match(reuse, /\.primary, \.secondary \{[^}]*min-height: var\(--space-44\)/u);
  assert.match(reuse, /\.card \.check \{[^}]*min-height: var\(--space-44\)/u);
});

test('minhas permissões não trata --space-2 e --space-4 como se fossem 8px e 16px', () => {
  assert.doesNotMatch(journey, /var\(--space-[24],/u);
  assert.match(journey, /\.card \{[^}]*gap: var\(--space-16\)/u);
  assert.match(journey, /\.abrir:focus-visible,\s*\.atualizar:focus-visible \{[^}]*outline: 3px solid var\(--color-focus-on-light\)/u);
  assert.match(journey, /\.abrir,\s*\.atualizar \{[^}]*min-height: var\(--space-44\)/u);
  assert.doesNotMatch(journey, /--color-success-border|--color-danger-border/u);
});

test('permissões do balcão usam tokens reais e não estouram a 320px', () => {
  assert.doesNotMatch(capabilities, /--borda|--superficie|--texto-suave/u);
  assert.match(capabilities, /min-width: min\(15rem, 100%\)/u);
  assert.match(capabilities, /\.perfil,\s*\.salvar \{[^}]*min-height: var\(--space-44\)/u);
  assert.match(capabilities, /\.perfil:focus-visible/u);
});

test('comunicação e show mostram o foco no azul claro, não num azul fora da paleta', () => {
  assert.doesNotMatch(communication, /#2563eb|#17233b|#475569/u);
  assert.match(communication, /outline: 3px solid var\(--color-focus-on-light\)/u);
  assert.match(communication, /\.card fieldset label \{[^}]*min-height: var\(--space-44\)/u);
  assert.match(show, /\.actions button:focus-visible/u);
  assert.match(show, /outline: 3px solid var\(--color-focus-on-light\)/u);
});

test('a central científica marca foco no miolo claro e no topo escuro', () => {
  assert.match(central, /\.button \{ min-height: var\(--space-44\)/u);
  assert.match(central, /\.page :is\(a, button, input, select, textarea, summary\):focus-visible \{ outline: 3px solid var\(--color-focus-on-light\)/u);
  assert.match(central, /\.topbar :is\(a, button\):focus-visible \{ outline: 3px solid var\(--color-focus-on-dark\)/u);
});
