import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const routeDirectory = new URL("../app/ajuda/planejar-trabalhos-cientificos/", import.meta.url);
const foundationUrl = new URL("../components/local-planner-shell.tsx", import.meta.url);
const modelUrl = new URL("scientific-planner-model.ts", routeDirectory);

async function routeSources() {
  const names = [
    "page.tsx",
    "scientific-planner.tsx",
    "scientific-planner-model.ts",
    "planejar-trabalhos-cientificos.module.css",
  ];
  return Promise.all(names.map(async (name) => ({ name, source: await readFile(new URL(name, routeDirectory), "utf8") })));
}

async function loadSummaryModule() {
  const source = await readFile(modelUrl, "utf8");
  const outputText = stripTypeScriptTypes(source, { mode: "transform" });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const readyAnswers = {
  responsible: "confirmed",
  workModel: "abstract",
  presentation: "oral",
  areas: "not-needed",
  authors: "defined",
  presenter: "defined",
  evaluation: "criteria-ready",
};

test("modelo científico puro é importável sem React, JSX ou efeitos externos", async () => {
  const model = await readFile(modelUrl, "utf8");
  assert.doesNotMatch(model, /^\s*import\s/m);
  assert.doesNotMatch(model, /\b(?:React|useState|useMemo|fetch|XMLHttpRequest|WebSocket)\b/);
  assert.doesNotMatch(model, /^\\s*<[\\/A-Za-z]/m);
  const loaded = await loadSummaryModule();
  assert.equal(typeof loaded.deriveSummary, "function");
});

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

test("resultado executa a precedência incompleto, stop, depois e pronto", async () => {
  const { deriveSummary, initialAnswers } = await loadSummaryModule();

  const incomplete = deriveSummary({ ...initialAnswers, responsible: "missing" });
  assert.equal(incomplete.state, "later");
  assert.equal(incomplete.title, "Continue o planejamento");

  const blockedBeforeDeferred = deriveSummary({
    ...readyAnswers,
    responsible: "missing",
    workModel: "later",
  });
  assert.equal(blockedBeforeDeferred.state, "stop");

  const deferred = deriveSummary({ ...readyAnswers, workModel: "later" });
  assert.equal(deferred.state, "later");
  assert.equal(deferred.title, "Decisões registradas para depois");

  const ready = deriveSummary(readyAnswers);
  assert.equal(ready.state, "ready");
  assert.equal(ready.title, "Definido para planejar");
});

test("resumo incompleto informa pendências e próximo passo científico", async () => {
  const { deriveSummary, initialAnswers } = await loadSummaryModule();
  assert.equal(
    deriveSummary(initialAnswers).lead,
    "Faltam 7 decisões. Próximo passo: Existe uma função responsável pelas decisões científicas?",
  );
  assert.equal(
    deriveSummary({ ...readyAnswers, evaluation: "" }).lead,
    "Falta 1 decisão. Próximo passo: Como avaliação, correção e reavaliação entram no plano?",
  );
});

test("modelo rejeita resposta científica fora do catálogo fechado", async () => {
  const { deriveSummary, isAnswerValue, questions } = await loadSummaryModule();
  const result = deriveSummary({ ...readyAnswers, presentation: "valor-injetado" });
  assert.equal(result.state, "stop");
  assert.equal(result.title, "Pare e revise as escolhas");

  for (const question of questions) {
    assert.equal(isAnswerValue(question.key, "valor-injetado"), false);
    for (const option of question.options) {
      assert.equal(isAnswerValue(question.key, option.value), true);
    }
  }
});

test("progresso científico conta escolhas e usa texto compreensível", async () => {
  const { deriveProgress, formatProgressLabel, initialAnswers } = await loadSummaryModule();
  assert.deepEqual(deriveProgress(initialAnswers), { completed: 0, total: 7 });
  assert.deepEqual(deriveProgress({ ...initialAnswers, responsible: "confirmed" }), {
    completed: 1,
    total: 7,
  });
  assert.equal(formatProgressLabel(1, 7), "Progresso: 1 de 7 decisão respondida.");
  assert.equal(formatProgressLabel(7, 7), "Progresso: 7 de 7 decisões respondidas.");
});

test("orientação científica acompanha modelo e apresentação sem criar regra", async () => {
  const { deriveScientificGuidance, initialAnswers } = await loadSummaryModule();
  assert.match(deriveScientificGuidance(initialAnswers), /Escolha o modelo preliminar/);
  assert.match(deriveScientificGuidance({ ...initialAnswers, workModel: "undefined" }), /Defina a regra/);
  assert.match(deriveScientificGuidance({ ...initialAnswers, workModel: "later" }), /decisão humana/);
  assert.match(deriveScientificGuidance({ ...initialAnswers, workModel: "abstract" }), /como os trabalhos poderão ser apresentados/);
  assert.match(
    deriveScientificGuidance({ ...readyAnswers, presentation: "later" }),
    /apresentação continuará pendente/,
  );
  assert.match(deriveScientificGuidance(readyAnswers), /revise áreas, autores/);
});

test("cada bloqueio científico produz a orientação humana correspondente", async () => {
  const { deriveSummary } = await loadSummaryModule();
  const cases = [
    ["responsible", "missing", "Defina quem responderá pelas decisões científicas."],
    ["workModel", "undefined", "Defina a regra do formato do trabalho antes de configurar."],
    ["areas", "required-missing", "Estruture áreas e subáreas antes de torná-las obrigatórias."],
    ["authors", "missing", "Discuta os limites de autores antes de abrir o fluxo."],
    ["presenter", "missing", "Defina a regra de apresentador antes da abertura."],
    ["evaluation", "criteria-missing", "Defina critérios antes de habilitar avaliação, correção ou reavaliação."],
  ];

  for (const [key, value, reason] of cases) {
    const result = deriveSummary({ ...readyAnswers, [key]: value });
    assert.equal(result.state, "stop", `${key} deve bloquear o planejamento`);
    assert.equal(result.title, "Pare e confirme antes de configurar");
    assert.deepEqual(result.actions, [reason]);
  }
});

test("bloqueios simultâneos preservam a ordem das perguntas", async () => {
  const { deriveSummary } = await loadSummaryModule();
  const result = deriveSummary({
    ...readyAnswers,
    responsible: "missing",
    areas: "required-missing",
    presenter: "missing",
    evaluation: "criteria-missing",
  });

  assert.equal(result.state, "stop");
  assert.deepEqual(result.actions, [
    "Defina quem responderá pelas decisões científicas.",
    "Estruture áreas e subáreas antes de torná-las obrigatórias.",
    "Defina a regra de apresentador antes da abertura.",
    "Defina critérios antes de habilitar avaliação, correção ou reavaliação.",
  ]);
});

test("cada decisão adiada aponta exatamente a pergunta pendente", async () => {
  const { deriveSummary } = await loadSummaryModule();
  const cases = [
    ["responsible", "Existe uma função responsável pelas decisões científicas?"],
    ["workModel", "Qual modelo preliminar de trabalho será considerado?"],
    ["presentation", "Quais formas conceituais de apresentação devem entrar no plano?"],
    ["areas", "Como áreas e subáreas devem ser consideradas neste planejamento?"],
    ["authors", "A política preliminar de autores já prevê limites?"],
    ["presenter", "A regra de apresentador está encaminhada?"],
    ["evaluation", "Como avaliação, correção e reavaliação entram no plano?"],
  ];

  for (const [key, legend] of cases) {
    const result = deriveSummary({ ...readyAnswers, [key]: "later" });
    assert.equal(result.state, "later", `${key} deve permanecer pendente`);
    assert.deepEqual(result.actions, [`Decidir: ${legend}`]);
  }
});

test("resumo pronto usa rótulos completos sem fallback silencioso", async () => {
  const { deriveSummary } = await loadSummaryModule();
  const result = deriveSummary({
    ...readyAnswers,
    workModel: "full",
    presentation: "multiple",
    areas: "optional",
    evaluation: "not-needed",
  });

  assert.equal(result.state, "ready");
  assert.equal(result.actions.length, 7);
  assert.match(result.actions[1], /Trabalho completo/);
  assert.match(result.actions[2], /Mais de uma forma/);
  assert.match(result.actions[3], /Poderão ser opcionais/);
  assert.match(result.actions[6], /Não serão necessárias neste plano/);
  assert.equal(result.actions.some((action) => action.endsWith(" Definido.")), false);
});

test("stop rules cobrem as seis decisões científicas inseguras", async () => {
  const model = await readFile(modelUrl, "utf8");

  for (const evidence of [
    "Defina quem responderá pelas decisões científicas.",
    "Defina a regra do formato do trabalho antes de configurar.",
    "Estruture áreas e subáreas antes de torná-las obrigatórias.",
    "Discuta os limites de autores antes de abrir o fluxo.",
    "Defina a regra de apresentador antes da abertura.",
    "Defina critérios antes de habilitar avaliação, correção ou reavaliação.",
  ]) {
    assert.match(model, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
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

test("reinício, anúncio único e acessibilidade visual permanecem explícitos", async () => {
  const [files, foundation] = await Promise.all([
    routeSources(),
    readFile(foundationUrl, "utf8"),
  ]);
  const combined = files.map(({ source }) => source).join("\n");

  assert.match(combined, /Reiniciar planejamento/);
  assert.match(combined, /function restart\(\)/);
  assert.match(combined, /setAnswers\(initialAnswers\)/);
  assert.match(combined, /questionsRef\.current/);
  assert.match(combined, /scientific-responsible/);
  assert.match(combined, /\.focus\(\)/);
  assert.match(foundation, /role="status"/);
  assert.match(foundation, /aria-live="polite"/);
  assert.match(foundation, /aria-atomic="true"/);
  assert.equal(
    (combined.match(/aria-live=/g) ?? []).length,
    0,
    "a rota deve reutilizar somente a região viva de LocalPlannerSummary",
  );
  assert.match(combined, /min-height:\s*44px/);
  assert.match(combined, /:focus-visible/);
  assert.match(combined, /max-width:\s*360px/);
  assert.match(combined, /forced-colors:\s*active/);
  assert.match(combined, /<progress/);
  assert.match(combined, /aria-labelledby="scientific-progress"/);
  assert.match(combined, /aria-labelledby="scientific-guidance-title"/);
  assert.match(combined, /A EVA apenas orienta/);
  assert.doesNotMatch(combined, /(?:animation|transition|scroll-behavior)\s*:/);
});
