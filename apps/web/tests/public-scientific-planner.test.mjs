import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeDirectory = new URL("../app/ajuda/planejar-trabalhos-cientificos/", import.meta.url);

async function routeSources() {
  const names = [
    "page.tsx",
    "scientific-planner.tsx",
    "planejar-trabalhos-cientificos.module.css",
  ];
  return Promise.all(names.map(async (name) => ({ name, source: await readFile(new URL(name, routeDirectory), "utf8") })));
}

test("planejador científico reutiliza a fundação e cobre a matriz fechada", async () => {
  const files = await routeSources();
  const combined = files.map(({ source }) => source).join("\n");

  assert.match(combined, /LocalPlannerShell/);
  assert.match(combined, /LocalPlannerChoiceGroup/);
  assert.match(combined, /LocalPlannerSummary/);
  assert.match(combined, /Resumo/);
  assert.match(combined, /Trabalho completo/);
  assert.match(combined, /Oral/);
  assert.match(combined, /Pôster/);
  assert.match(combined, /ePoster/);
  assert.match(combined, /áreas e subáreas/i);
  assert.match(combined, /avaliação, correção e reavaliação/i);
});

test("resultado mantém precedência determinística entre stop, depois e pronto", async () => {
  const client = await readFile(new URL("scientific-planner.tsx", routeDirectory), "utf8");

  assert.match(client, /if \(firstMissing\)/);
  assert.match(client, /if \(blockers\.length > 0\)/);
  assert.match(client, /if \(deferred\.length > 0\)/);
  assert.match(client, /state: "stop"/);
  assert.match(client, /state: "later"/);
  assert.match(client, /state: "ready"/);
  assert.match(client, /Pare e confirme antes de configurar/);
  assert.match(client, /Decisões registradas para depois/);
  assert.match(client, /Definido para planejar/);
});

test("stop rules cobrem as seis decisões científicas inseguras", async () => {
  const client = await readFile(new URL("scientific-planner.tsx", routeDirectory), "utf8");

  for (const evidence of [
    "Defina quem responderá pelas decisões científicas.",
    "Defina a regra do formato do trabalho antes de configurar.",
    "Estruture áreas e subáreas antes de torná-las obrigatórias.",
    "Discuta os limites de autores antes de abrir o fluxo.",
    "Defina a regra de apresentador antes da abertura.",
    "Defina critérios antes de habilitar avaliação, correção ou reavaliação.",
  ]) {
    assert.match(client, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("rota não coleta dados reais nem cria efeitos externos", async () => {
  const files = await routeSources();
  const executable = files.filter(({ name }) => name.endsWith(".tsx")).map(({ source }) => source).join("\n");

  for (const forbidden of [
    /type=["']file["']/i,
    /type=["']text["']/i,
    /<textarea\b/i,
    /<form\b/i,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\b(?:localStorage|sessionStorage|indexedDB)\b/,
    /\bdocument\.cookie\b/,
    /\bsendBeacon\b/,
  ]) {
    assert.doesNotMatch(executable, forbidden);
  }
  assert.match(executable, /não recebe trabalhos/);
  assert.match(executable, /não cadastra autores/);
  assert.match(executable, /não avalia/);
  assert.match(executable, /não publica resultados/);
  assert.match(executable, /não cria regras científicas/);
});

test("reinício, anúncio e acessibilidade visual permanecem explícitos", async () => {
  const files = await routeSources();
  const combined = files.map(({ source }) => source).join("\n");

  assert.match(combined, /Reiniciar planejamento/);
  assert.match(combined, /Planejamento reiniciado\. Todas as escolhas foram removidas\./);
  assert.match(combined, /aria-live="polite"/);
  assert.match(combined, /min-height:\s*44px/);
  assert.match(combined, /:focus-visible/);
  assert.match(combined, /max-width:\s*360px/);
  assert.match(combined, /forced-colors:\s*active/);
  assert.match(combined, /prefers-reduced-motion:\s*reduce/);
});

test("anúncio identifica dinamicamente a pergunta e a opção selecionada", async () => {
  const client = await readFile(new URL("scientific-planner.tsx", routeDirectory), "utf8");

  assert.match(client, /questions\.find\(\(candidate\) => candidate\.key === key\)/);
  assert.match(client, /labels\.get\(`\$\{key}:\$\{value\}`\)/);
  assert.match(client, /Opção "\$\{optionLabel\}" selecionada para "\$\{question\?\.legend/);
  assert.doesNotMatch(client, /setAnnouncement\("Plano atualizado\."\)/);
});
