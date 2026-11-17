import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shellPath = new URL("../components/local-planner-shell.tsx", import.meta.url);
const choicesPath = new URL(
  "../components/local-planner-choice-group.tsx",
  import.meta.url,
);
const stylesPath = new URL(
  "../components/local-planner-shell.module.css",
  import.meta.url,
);

const [shell, choices, styles] = await Promise.all([
  readFile(shellPath, "utf8"),
  readFile(choicesPath, "utf8"),
  readFile(stylesPath, "utf8"),
]);

test("mantém a fundação sem coleta ou persistência", () => {
  assert.doesNotMatch(shell, /["']use client["']/);
  for (const source of [shell, choices]) {
    assert.doesNotMatch(
      source,
      /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB)\b/,
    );
  }
  assert.match(shell, /Nada é enviado, salvo ou compartilhado pelo Evolvia/);
});

test("oferece estrutura semântica e retorno seguro para a ajuda", () => {
  assert.match(shell, /<main/);
  assert.match(shell, /<h1>/);
  assert.match(shell, /role="note"/);
  assert.match(shell, /backHref = "\/ajuda"/);
  assert.match(shell, /aria-label=\{\`Planejamento:/);
});

test("padroniza escolhas nativas, rotuladas e descritas", () => {
  assert.match(choices, /<fieldset/);
  assert.match(choices, /<legend>/);
  assert.match(choices, /<label/);
  assert.match(choices, /type="radio"/);
  assert.match(choices, /aria-describedby=\{hintId\}/);
  assert.match(choices, /checked=\{value === option\.value\}/);
  assert.match(choices, /onChange\(event\.currentTarget\.value\)/);
});

test("padroniza os três resultados sem depender somente de cor", () => {
  assert.match(shell, /"ready" \| "later" \| "stop"/);
  assert.match(shell, /ready: "✓"/);
  assert.match(shell, /later: "◷"/);
  assert.match(shell, /stop: "!"/);
  assert.match(shell, /role="status"/);
  assert.match(shell, /aria-live="polite"/);
  assert.match(shell, /aria-atomic="true"/);
  for (const state of ["ready", "later", "stop"]) {
    assert.match(styles, new RegExp(`data-state="${state}"`));
  }
});

test("preserva foco, toque, 320 px e cores forçadas", () => {
  assert.match(styles, /min-height:\s*44px/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /:focus-within/);
  assert.match(styles, /outline:\s*3px/);
  assert.match(styles, /@media \(max-width:\s*360px\)/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.match(styles, /@media \(forced-colors:\s*active\)/);
});
