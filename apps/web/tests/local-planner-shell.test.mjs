import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../components/local-planner-shell.tsx", import.meta.url);
const stylesPath = new URL(
  "../components/local-planner-shell.module.css",
  import.meta.url,
);

const [component, styles] = await Promise.all([
  readFile(componentPath, "utf8"),
  readFile(stylesPath, "utf8"),
]);

test("mantém o shell server-first e sem coleta ou persistência", () => {
  assert.doesNotMatch(component, /["']use client["']/);
  assert.doesNotMatch(
    component,
    /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB)\b/,
  );
  assert.match(
    component,
    /Nada é enviado, salvo ou compartilhado pelo Evolvia/,
  );
});

test("oferece estrutura semântica e retorno seguro para a ajuda", () => {
  assert.match(component, /<main/);
  assert.match(component, /<h1>/);
  assert.match(component, /role="note"/);
  assert.match(component, /backHref = "\/ajuda"/);
  assert.match(component, /aria-label=\{\`Planejamento:/);
});

test("preserva foco, toque, 320 px e cores forçadas", () => {
  assert.match(styles, /min-height:\s*44px/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /outline:\s*3px/);
  assert.match(styles, /@media \(max-width:\s*360px\)/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.match(styles, /@media \(forced-colors:\s*active\)/);
});
