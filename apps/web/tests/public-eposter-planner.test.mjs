import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
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

async function loadSummaryModule() {
  const client = await readFile(new URL("eposter-planner.tsx", routeDirectory), "utf8");
  const start = client.indexOf("export type Answers");
  const end = client.indexOf("export function EposterPlanner");
  assert.notEqual(start, -1, "o contrato de respostas deve ser exportado");
  assert.notEqual(end, -1, "o componente deve delimitar o módulo puro");

  const source = [
    'type LocalPlannerState = "ready" | "later" | "stop";',
    client.slice(start, end),
  ].join("\n");
  const outputText = stripTypeScriptTypes(source, { mode: "transform" });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const readyAnswers = {
  responsible: "confirmed",
  format: "digital",
  source: "approved-work",
  search: "extended",
  identifier: "policy-ready",
  download: "authorized",
  languages: "multiple",
  accessibility: "alternative-ready",
  equipment: "validated",
};

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

test("resultado executa a precedência incompleto, pare, depois e pronto", async () => {
  const { deriveSummary, initialAnswers } = await loadSummaryModule();

  const incomplete = deriveSummary({ ...initialAnswers, responsible: "missing" });
  assert.equal(incomplete.state, "later");
  assert.equal(incomplete.title, "Continue o planejamento");

  const blockedBeforeDeferred = deriveSummary({
    ...readyAnswers,
    responsible: "missing",
    languages: "later",
  });
  assert.equal(blockedBeforeDeferred.state, "stop");

  const deferred = deriveSummary({ ...readyAnswers, languages: "later" });
  assert.equal(deferred.state, "later");
  assert.equal(deferred.title, "Decisões registradas para depois");

  const ready = deriveSummary(readyAnswers);
  assert.equal(ready.state, "ready");
  assert.equal(ready.title, "Definido para planejar");
});

test("cada bloqueio de publicação produz a orientação humana correspondente", async () => {
  const { deriveSummary } = await loadSummaryModule();
  const cases = [
    ["responsible", "missing", "Defina quem responderá pelas decisões de pôsteres."],
    ["format", "unspecified", "Especifique o formato antes de preparar a exibição."],
    ["source", "unapproved", "Confirme a aprovação ou curadoria do conteúdo antes de planejar a publicação."],
    ["identifier", "policy-missing", "Defina a política de código Pxx e QR antes de gerar identificadores."],
    ["download", "authorization-missing", "Confirme a autorização antes de disponibilizar download."],
    ["accessibility", "alternative-missing", "Defina uma alternativa acessível antes de usar mídia."],
    ["equipment", "unvalidated", "Valide o equipamento de exibição antes do evento."],
  ];

  for (const [key, value, reason] of cases) {
    const result = deriveSummary({ ...readyAnswers, [key]: value });
    assert.equal(result.state, "stop", `${key} deve bloquear o planejamento`);
    assert.equal(result.title, "Pare e confirme antes de preparar a exibição");
    assert.deepEqual(result.actions, [reason]);
  }
});

test("decisões adiadas apontam as nove perguntas na ordem canônica", async () => {
  const { deriveSummary } = await loadSummaryModule();
  const result = deriveSummary(Object.fromEntries(
    Object.keys(readyAnswers).map((key) => [key, "later"]),
  ));

  assert.equal(result.state, "later");
  assert.deepEqual(result.actions, [
    "Decidir: Existe uma função responsável pelas decisões de pôsteres?",
    "Decidir: Qual formato preliminar deve entrar no plano?",
    "Decidir: Qual será a origem futura do conteúdo?",
    "Decidir: Quais referências de busca deverão ser consideradas?",
    "Decidir: Código Pxx e QR individual deverão ser considerados?",
    "Decidir: O download futuro deverá ser considerado?",
    "Decidir: A experiência deverá prever mais de um idioma?",
    "Decidir: Mídias futuras terão alternativa acessível?",
    "Decidir: A exibição dependerá de equipamento no local?",
  ]);
});

test("caminho sem mídia gera ações únicas e nenhum fallback silencioso", async () => {
  const { deriveSummary } = await loadSummaryModule();
  const result = deriveSummary({
    ...readyAnswers,
    format: "printed",
    search: "not-needed",
    identifier: "not-needed",
    download: "not-needed",
    languages: "single",
    accessibility: "not-applicable",
    equipment: "not-needed",
  });

  assert.equal(result.state, "ready");
  assert.equal(result.actions.length, 9);
  assert.equal(new Set(result.actions).size, result.actions.length);
  assert.match(result.actions[1], /Pôster impresso/);
  assert.match(result.actions[3], /Busca não será necessária neste plano/);
  assert.match(result.actions[7], /Não haverá mídia neste plano/);
  assert.equal(result.actions.some((action) => action.endsWith(" Definido.")), false);
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
  assert.match(combined, /function restart\(\)/);
  assert.match(combined, /setAnswers\(initialAnswers\)/);
  assert.match(combined, /questionsRef\.current/);
  assert.match(combined, /eposter-responsible/);
  assert.match(combined, /\.focus\(\)/);
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


test("modelo rejeita respostas fora do catálogo e mantém validador sincronizado", async () => {
  const { deriveSummary, isAnswerValue, questions } = await loadSummaryModule();
  const invalid = deriveSummary({ ...readyAnswers, format: "valor-injetado" });
  assert.equal(invalid.state, "stop");
  assert.equal(invalid.title, "Pare e revise as escolhas");
  assert.deepEqual(invalid.actions, ["Revise: Qual formato preliminar deve entrar no plano?"]);

  for (const question of questions) {
    for (const option of question.options) {
      assert.equal(isAnswerValue(question.key, option.value), true);
    }
    assert.equal(isAnswerValue(question.key, "valor-fora-do-catalogo"), false);
  }
});

test("seleções e reinício são anunciados dentro da região viva compartilhada", async () => {
  const { formatSelectionAnnouncement, questions } = await loadSummaryModule();

  for (const question of questions) {
    for (const option of question.options) {
      assert.equal(
        formatSelectionAnnouncement(question.key, option.value),
        `Opção "${option.label}" selecionada para "${question.legend}".`,
      );
    }
  }
  assert.equal(formatSelectionAnnouncement("format", "valor-injetado"), "");

  const combined = (await routeSources()).map(({ source }) => source).join("\n");
  assert.match(combined, /setAnnouncement\(formatSelectionAnnouncement\(key, value\)\)/);
  assert.match(combined, /Planejamento reiniciado\. Todas as decisões foram limpas\./);
  assert.match(combined, /className=\{styles\.announcement\}/);
  assert.equal((combined.match(/aria-live=/g) ?? []).length, 0);
});

test("estado e progresso rejeitam valores fora do catálogo sem mutação", async () => {
  const { applyAnswer, deriveProgress, initialAnswers, questions } = await loadSummaryModule();

  for (const question of questions) {
    assert.deepEqual(
      deriveProgress({ ...initialAnswers, [question.key]: "valor-injetado" }),
      { completed: 0, total: 9 },
      `${question.key} inválida não pode inflar o progresso`,
    );
  }

  assert.deepEqual(
    deriveProgress({ ...readyAnswers, accessibility: "valor-injetado" }),
    { completed: 8, total: 9 },
  );

  let answers = initialAnswers;
  for (const question of questions) {
    const previous = answers;
    answers = applyAnswer(answers, question.key, question.options[0].value);
    assert.notEqual(answers, previous);
    assert.equal(answers[question.key], question.options[0].value);
  }

  const stable = answers;
  for (const question of questions) {
    assert.equal(applyAnswer(stable, question.key, "valor-injetado"), stable);
  }
});

test("progresso, pendências e orientação contextual são determinísticos", async () => {
  const {
    deriveEposterGuidance,
    deriveProgress,
    deriveSummary,
    formatProgressLabel,
    initialAnswers,
  } = await loadSummaryModule();

  assert.deepEqual(deriveProgress(initialAnswers), { completed: 0, total: 9 });
  assert.equal(formatProgressLabel(0, 9), "Progresso: 0 de 9 decisões respondidas.");
  assert.equal(formatProgressLabel(1, 9), "Progresso: 1 de 9 decisão respondida.");
  assert.equal(deriveSummary(initialAnswers).lead,
    "Faltam 9 decisões. Próximo passo: Existe uma função responsável pelas decisões de pôsteres?");
  assert.equal(deriveSummary({ ...readyAnswers, equipment: "" }).lead,
    "Falta 1 decisão. Próximo passo: A exibição dependerá de equipamento no local?");

  assert.match(deriveEposterGuidance(initialAnswers), /Escolha o formato/);
  assert.match(deriveEposterGuidance({ ...initialAnswers, format: "digital" }), /origem autorizada/);
  assert.match(deriveEposterGuidance({ ...initialAnswers, format: "unspecified" }), /Especifique/);
  assert.match(deriveEposterGuidance({ ...initialAnswers, format: "later" }), /pendente/);
  assert.match(deriveEposterGuidance({ ...initialAnswers, format: "digital", source: "unapproved" }), /aprovação/);
  assert.match(deriveEposterGuidance(readyAnswers), /Formato e origem/);
});

test("interface expõe progresso e orientação sem nova região viva", async () => {
  const combined = (await routeSources()).map(({ source }) => source).join("\n");
  assert.match(combined, /<progress/);
  assert.match(combined, /aria-labelledby="eposter-progress"/);
  assert.match(combined, /aria-labelledby="eposter-guidance-title"/);
  assert.match(combined, /Orientação para a exibição/);
  assert.match(combined, /isAnswerValue\(key, value\)/);
  assert.equal((combined.match(/aria-live=/g) ?? []).length, 0);
});
