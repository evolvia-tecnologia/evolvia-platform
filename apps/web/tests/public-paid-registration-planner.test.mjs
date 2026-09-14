import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const routeDirectory = new URL("../app/ajuda/planejar-inscricao-paga/", import.meta.url);
const foundationUrl = new URL("../components/local-planner-shell.tsx", import.meta.url);

async function routeSources() {
  const names = ["page.tsx", "paid-registration-planner.tsx", "planejar-inscricao-paga.module.css"];
  return Promise.all(names.map(async (name) => ({ name, source: await readFile(new URL(name, routeDirectory), "utf8") })));
}
async function loadSummaryModule() {
  const client = await readFile(new URL("paid-registration-planner.tsx", routeDirectory), "utf8");
  const start = client.indexOf("type Answers");
  const end = client.indexOf("export function PaidRegistrationPlanner");
  assert.notEqual(start, -1, "o contrato de respostas deve estar presente");
  assert.notEqual(end, -1, "o componente deve delimitar o módulo puro");

  const source = [
    'type LocalPlannerState = "ready" | "later" | "stop";',
    client.slice(start, end),
    "export { deriveSummary, initialAnswers };",
  ].join("\n");
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

test("planejador pago reutiliza a fundação e cobre a matriz fechada", async () => {
  const combined = (await routeSources()).map(({ source }) => source).join("\n");
  for (const evidence of [
    "LocalPlannerShell", "LocalPlannerChoiceGroup", "LocalPlannerSummary",
    "Evento gratuito", "Inscrição paga", "Atividades pagas", "Cupom, convite ou cortesia",
    "comprovante por categoria antes do pagamento", "Repasse ou split", "Reembolso",
  ]) assert.match(combined, new RegExp(evidence, "i"));
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

test("stop rules cobrem as seis decisões financeiras inseguras", async () => {
  const client = await readFile(new URL("paid-registration-planner.tsx", routeDirectory), "utf8");
  for (const evidence of [
    "Defina quem responderá pelas decisões financeiras.",
    "Defina a política de preços e lotes antes de configurar.",
    "Defina os critérios de comprovante e aprovação antes do pagamento.",
    "Confirme destinatários e contrato antes de planejar repasse ou split.",
    "Defina a regra de reembolso antes de abrir inscrições pagas.",
    "Defina o controle de capacidade antes de oferecer atividade paga.",
  ]) assert.match(client, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("rota não coleta PII nem produz efeito financeiro ou externo", async () => {
  const executable = (await routeSources()).filter(({ name }) => name.endsWith(".tsx")).map(({ source }) => source).join("\n");
  for (const forbidden of [
    /type=["'](?:file|text|number)["']/i, /<textarea\b/i, /<form\b/i, /<iframe\b/i,
    /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/,
    /\b(?:localStorage|sessionStorage|indexedDB)\b/, /\bdocument\.cookie\b/, /\bsendBeacon\b/,
  ]) assert.doesNotMatch(executable, forbidden);
  assert.match(executable, /não calcula preço/);
  assert.match(executable, /não cobra/);
  assert.match(executable, /não reserva vaga/);
  assert.match(executable, /não processa pagamento/);
});

test("reinício, anúncio único e acessibilidade visual permanecem explícitos", async () => {
  const [files, foundation] = await Promise.all([
    routeSources(),
    readFile(foundationUrl, "utf8"),
  ]);
  const combined = files.map(({ source }) => source).join("\n");
  assert.match(combined, /function restart\(\) \{\s*setAnswers\(initialAnswers\);\s*\}/);
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
  assert.doesNotMatch(combined, /scroll-behavior/);
});
