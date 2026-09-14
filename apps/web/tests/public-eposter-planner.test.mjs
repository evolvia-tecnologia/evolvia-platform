import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeDirectory = new URL("../app/ajuda/planejar-eposters/", import.meta.url);

async function routeSources() {
  const names = ["page.tsx", "eposter-planner.tsx", "planejar-eposters.module.css"];
  return Promise.all(
    names.map(async (name) => ({ name, source: await readFile(new URL(name, routeDirectory), "utf8") })),
  );
}

async function foundationSource() {
  return readFile(new URL("../components/local-planner-shell.tsx", import.meta.url), "utf8");
}

test("planejador de ePosters reutiliza a fundação e cobre a matriz fechada", async () => {
  const combined = (await routeSources()).map(({ source }) => source).join("\n");
  for (const evidence of [
    "LocalPlannerShell",
    "LocalPlannerChoiceGroup",
    "LocalPlannerSummary",
    "Pôster impresso",
    "ePoster",
    "Trabalho aprovado",
    "ID, título, autor, área e instituição",
    "Código Pxx e QR individual",
    "download",
    "Mais de um idioma",
  ]) assert.match(combined, new RegExp(evidence, "i"));
});

test("resultado preserva precedência incompleto, pare, depois e pronto", async () => {
  const client = await readFile(new URL("eposter-planner.tsx", routeDirectory), "utf8");
  assert.match(client, /if \(firstMissing\)/);
  assert.match(client, /if \(blockers\.length > 0\)/);
  assert.match(client, /if \(deferred\.length > 0\)/);
  assert.match(client, /state: "stop"/);
  assert.match(client, /state: "later"/);
  assert.match(client, /state: "ready"/);
});

test("stop rules cobrem as sete decisões inseguras", async () => {
  const client = await readFile(new URL("eposter-planner.tsx", routeDirectory), "utf8");
  for (const evidence of [
    "Defina quem responderá pelas decisões de pôsteres.",
    "Especifique o formato antes de preparar a exibição.",
    "Confirme a aprovação ou curadoria do conteúdo antes de planejar a publicação.",
    "Defina a política de código Pxx e QR antes de gerar identificadores.",
    "Confirme a autorização antes de disponibilizar download.",
    "Defina uma alternativa acessível antes de usar mídia.",
    "Valide o equipamento de exibição antes do evento.",
  ]) assert.match(client, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("rota não coleta PII nem produz efeito externo ou de publicação", async () => {
  const executable = (await routeSources())
    .filter(({ name }) => name.endsWith(".tsx"))
    .map(({ source }) => source)
    .join("\n");
  for (const forbidden of [
    /type=["'](?:file|text|number)["']/i,
    /<textarea\b/i,
    /<form\b/i,
    /<iframe\b/i,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\b(?:localStorage|sessionStorage|indexedDB)\b/,
    /\bdocument\.cookie\b/,
    /\bsendBeacon\b/,
    /\bgetUserMedia\b/,
  ]) assert.doesNotMatch(executable, forbidden);
  assert.match(executable, /não recebe, converte, hospeda, exibe ou publica pôster/i);
});

test("reinício, anúncio único e acessibilidade visual permanecem explícitos", async () => {
  const [routeFiles, foundation] = await Promise.all([routeSources(), foundationSource()]);
  const combined = routeFiles.map(({ source }) => source).join("\n");
  assert.match(combined, /function restart\(\) \{\s*setAnswers\(initialAnswers\);\s*\}/);
  assert.match(foundation, /role="status"/);
  assert.match(foundation, /aria-live="polite"/);
  assert.match(foundation, /aria-atomic="true"/);
  assert.equal((combined.match(/aria-live=/g) ?? []).length, 0, "a rota deve reutilizar somente a região viva de LocalPlannerSummary");
  assert.match(combined, /min-height:\s*44px/);
  assert.match(combined, /:focus-visible/);
  assert.match(combined, /max-width:\s*360px/);
  assert.match(combined, /forced-colors:\s*active/);
  assert.doesNotMatch(combined, /(?:animation|transition|scroll-behavior)\s*:/);
});
