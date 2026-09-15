import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const routeDirectory = new URL("../app/ajuda/planejar-inscricao-paga/", import.meta.url);
const foundationUrl = new URL("../components/local-planner-shell.tsx", import.meta.url);
const modelUrl = new URL("paid-registration-model.ts", routeDirectory);

async function routeSources() {
  const names = [
    "page.tsx",
    "paid-registration-planner.tsx",
    "paid-registration-model.ts",
    "planejar-inscricao-paga.module.css",
  ];
  return Promise.all(
    names.map(async (name) => ({
      name,
      source: await readFile(new URL(name, routeDirectory), "utf8"),
    })),
  );
}

async function loadSummaryModule() {
  const source = await readFile(modelUrl, "utf8");
  const outputText = stripTypeScriptTypes(source, { mode: "transform" });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const readyAnswers = {
  responsible: "confirmed",
  scenario: "paid-registration",
  categories: "policy-ready",
  benefits: "consider",
  proof: "criteria-ready",
  split: "contract-ready",
  refund: "rule-ready",
  capacity: "policy-ready",
};

test("modelo puro é importável por inteiro, sem React, JSX ou efeitos externos", async () => {
  const model = await readFile(modelUrl, "utf8");
  assert.doesNotMatch(model, /^\s*import\s/m);
  assert.doesNotMatch(model, /\b(?:React|useState|useMemo|fetch|XMLHttpRequest|WebSocket)\b/);
  assert.doesNotMatch(model, /^\\s*<[\\/A-Za-z]/m);
  const loaded = await loadSummaryModule();
  assert.equal(typeof loaded.deriveSummary, "function");
  assert.deepEqual(Object.keys(loaded.initialAnswers), Object.keys(readyAnswers));
});

test("planejador pago reutiliza a fundação e cobre a matriz fechada", async () => {
  const combined = (await routeSources()).map(({ source }) => source).join("\n");
  for (const evidence of [
    "LocalPlannerShell",
    "LocalPlannerChoiceGroup",
    "LocalPlannerSummary",
    "Evento gratuito",
    "Inscrição paga",
    "Atividades pagas",
    "Cupom, convite ou cortesia",
    "comprovante por categoria antes do pagamento",
    "Repasse ou split",
    "Reembolso",
  ]) {
    assert.match(combined, new RegExp(evidence, "i"));
  }
});

test("resultado executa a precedência incompleto, stop, depois e pronto", async () => {
  const { deriveSummary, initialAnswers } = await loadSummaryModule();

  const incomplete = deriveSummary({ ...initialAnswers, responsible: "missing" });
  assert.equal(incomplete.state, "later");
  assert.equal(incomplete.title, "Continue o planejamento");

  const blockedBeforeDeferred = deriveSummary({
    ...readyAnswers,
    responsible: "missing",
    scenario: "later",
  });
  assert.equal(blockedBeforeDeferred.state, "stop");

  const deferred = deriveSummary({ ...readyAnswers, scenario: "later" });
  assert.equal(deferred.state, "later");
  assert.equal(deferred.title, "Decisões registradas para depois");

  const ready = deriveSummary(readyAnswers);
  assert.equal(ready.state, "ready");
  assert.equal(ready.title, "Definido para planejar");
});

test("resumo incompleto informa pendências e o próximo passo determinístico", async () => {
  const { deriveSummary, initialAnswers } = await loadSummaryModule();
  const empty = deriveSummary(initialAnswers);
  assert.equal(
    empty.lead,
    "Faltam 8 decisões. Próximo passo: Existe uma função responsável pelas decisões financeiras?",
  );

  const almostReady = deriveSummary({ ...readyAnswers, capacity: "" });
  assert.equal(
    almostReady.lead,
    "Falta 1 decisão. Próximo passo: Atividades pagas terão política de capacidade?",
  );
});

test("modelo rejeita respostas fora das opções fechadas", async () => {
  const { deriveSummary } = await loadSummaryModule();
  const result = deriveSummary({ ...readyAnswers, scenario: "valor-injetado" });

  assert.equal(result.state, "stop");
  assert.equal(result.title, "Pare e revise as escolhas");
  assert.deepEqual(result.actions, ["Revise: Qual cenário preliminar deve entrar no plano?"]);
});

test("progresso conta somente decisões respondidas", async () => {
  const { deriveProgress, initialAnswers } = await loadSummaryModule();
  assert.deepEqual(deriveProgress(initialAnswers), { completed: 0, total: 8 });
  assert.deepEqual(
    deriveProgress({ ...initialAnswers, responsible: "confirmed", scenario: "free" }),
    { completed: 2, total: 8 },
  );
  assert.deepEqual(deriveProgress(readyAnswers), { completed: 8, total: 8 });
});

test("modelo bloqueia combinações financeiras contraditórias", async () => {
  const { deriveSummary } = await loadSummaryModule();
  const freeWithPaymentRules = deriveSummary({
    ...readyAnswers,
    scenario: "free",
    proof: "criteria-ready",
    split: "contract-ready",
    refund: "rule-ready",
    capacity: "not-needed",
  });
  assert.equal(freeWithPaymentRules.state, "stop");
  assert.equal(freeWithPaymentRules.title, "Pare e alinhe o cenário");
  assert.equal(freeWithPaymentRules.actions.length, 3);

  const paidWithoutPolicy = deriveSummary({ ...readyAnswers, categories: "not-needed" });
  assert.match(paidWithoutPolicy.actions[0], /inscrição paga/i);

  const activityWithoutCapacity = deriveSummary({
    ...readyAnswers,
    scenario: "paid-activities",
    capacity: "not-needed",
  });
  assert.match(activityWithoutCapacity.actions[0], /atividades pagas/i);
});

test("cada bloqueio financeiro produz a orientação humana correspondente", async () => {
  const { deriveSummary } = await loadSummaryModule();
  const cases = [
    ["responsible", "missing", "Defina quem responderá pelas decisões financeiras."],
    ["categories", "policy-missing", "Defina a política de preços e lotes antes de configurar."],
    ["proof", "criteria-missing", "Defina os critérios de comprovante e aprovação antes do pagamento."],
    ["split", "contract-missing", "Confirme destinatários e contrato antes de planejar repasse ou split."],
    ["refund", "rule-missing", "Defina a regra de reembolso antes de abrir inscrições pagas."],
    ["capacity", "policy-missing", "Defina o controle de capacidade antes de oferecer atividade paga."],
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
    proof: "criteria-missing",
    refund: "rule-missing",
    capacity: "policy-missing",
  });

  assert.equal(result.state, "stop");
  assert.deepEqual(result.actions, [
    "Defina quem responderá pelas decisões financeiras.",
    "Defina os critérios de comprovante e aprovação antes do pagamento.",
    "Defina a regra de reembolso antes de abrir inscrições pagas.",
    "Defina o controle de capacidade antes de oferecer atividade paga.",
  ]);
});

test("cada decisão adiada aponta exatamente a pergunta pendente", async () => {
  const { deriveSummary } = await loadSummaryModule();
  const cases = [
    ["responsible", "Existe uma função responsável pelas decisões financeiras?"],
    ["scenario", "Qual cenário preliminar deve entrar no plano?"],
    ["categories", "Como categorias, preços e lotes serão planejados?"],
    ["benefits", "Cupom, convite ou cortesia devem ser considerados?"],
    ["proof", "Haverá comprovante por categoria antes do pagamento?"],
    ["split", "Repasse ou split deve ser considerado?"],
    ["refund", "Reembolso precisa entrar no planejamento?"],
    ["capacity", "Atividades pagas terão política de capacidade?"],
  ];

  for (const [key, legend] of cases) {
    const result = deriveSummary({ ...readyAnswers, [key]: "later" });
    assert.equal(result.state, "later", `${key} deve permanecer pendente`);
    assert.deepEqual(result.actions, [`Decidir: ${legend}`]);
  }
});

test("alternativas sem cobrança também geram resumo pronto sem fallback", async () => {
  const { deriveSummary } = await loadSummaryModule();
  const result = deriveSummary({
    ...readyAnswers,
    scenario: "free",
    categories: "not-needed",
    benefits: "not-needed",
    proof: "not-needed",
    split: "not-needed",
    refund: "not-needed",
    capacity: "not-needed",
  });

  assert.equal(result.state, "ready");
  assert.equal(result.actions.length, 8);
  assert.match(result.actions[1], /Evento gratuito/);
  assert.match(result.actions[2], /Não serão necessários neste plano/);
  assert.match(result.actions[4], /Não será necessário neste plano/);
  assert.match(result.actions[7], /Não há atividade paga neste plano/);
  assert.equal(result.actions.some((action) => action.endsWith(" Definido.")), false);
});

test("stop rules cobrem as seis decisões financeiras inseguras", async () => {
  const model = await readFile(modelUrl, "utf8");
  for (const evidence of [
    "Defina quem responderá pelas decisões financeiras.",
    "Defina a política de preços e lotes antes de configurar.",
    "Defina os critérios de comprovante e aprovação antes do pagamento.",
    "Confirme destinatários e contrato antes de planejar repasse ou split.",
    "Defina a regra de reembolso antes de abrir inscrições pagas.",
    "Defina o controle de capacidade antes de oferecer atividade paga.",
  ]) {
    assert.match(model, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("rota não coleta PII nem produz efeito financeiro ou externo", async () => {
  const executable = (await routeSources())
    .filter(({ name }) => name.endsWith(".tsx") || name.endsWith(".ts"))
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
  ]) {
    assert.doesNotMatch(executable, forbidden);
  }
  assert.match(executable, /não calcula preço/);
  assert.match(executable, /não cobra/);
  assert.match(executable, /não reserva vaga/);
  assert.match(executable, /não processa pagamento/);
  assert.match(executable, /A EVA pode orientar/);
  assert.match(executable, /configuração continuam humanas/);
});

test("reinício, anúncio único e acessibilidade visual permanecem explícitos", async () => {
  const [files, foundation] = await Promise.all([
    routeSources(),
    readFile(foundationUrl, "utf8"),
  ]);
  const combined = files.map(({ source }) => source).join("\n");
  assert.match(combined, /function restart\(\)/);
  assert.match(combined, /setAnswers\(initialAnswers\)/);
  assert.match(combined, /questionsRef\.current/);
  assert.match(combined, /paid-registration-responsible/);
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
  assert.match(combined, /aria-labelledby="paid-registration-progress"/);
  assert.doesNotMatch(combined, /scroll-behavior/);
});
