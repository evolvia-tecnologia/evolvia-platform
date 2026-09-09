import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeDirectory = new URL("../app/ajuda/planejar-inscricao-paga/", import.meta.url);

async function routeSources() {
  const names = ["page.tsx", "paid-registration-planner.tsx", "planejar-inscricao-paga.module.css"];
  return Promise.all(names.map(async (name) => ({ name, source: await readFile(new URL(name, routeDirectory), "utf8") })));
}

test("planejador pago reutiliza a fundação e cobre a matriz fechada", async () => {
  const combined = (await routeSources()).map(({ source }) => source).join("\n");
  for (const evidence of [
    "LocalPlannerShell", "LocalPlannerChoiceGroup", "LocalPlannerSummary",
    "Evento gratuito", "Inscrição paga", "Atividades pagas", "Cupom, convite ou cortesia",
    "comprovante por categoria antes do pagamento", "Repasse ou split", "Reembolso",
  ]) assert.match(combined, new RegExp(evidence, "i"));
});

test("resultado preserva precedência stop, depois e pronto", async () => {
  const client = await readFile(new URL("paid-registration-planner.tsx", routeDirectory), "utf8");
  assert.match(client, /if \(firstMissing\)/);
  assert.match(client, /if \(blockers\.length > 0\)/);
  assert.match(client, /if \(deferred\.length > 0\)/);
  assert.match(client, /state: "stop"/);
  assert.match(client, /state: "later"/);
  assert.match(client, /state: "ready"/);
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

test("reinício, anúncio e acessibilidade visual permanecem explícitos", async () => {
  const combined = (await routeSources()).map(({ source }) => source).join("\n");
  assert.match(combined, /Planejamento reiniciado\. Todas as escolhas foram removidas\./);
  assert.match(combined, /Opção "\$\{optionLabel\}" selecionada para/);
  assert.match(combined, /aria-live="polite"/);
  assert.match(combined, /min-height:\s*44px/);
  assert.match(combined, /:focus-visible/);
  assert.match(combined, /max-width:\s*360px/);
  assert.match(combined, /forced-colors:\s*active/);
  assert.doesNotMatch(combined, /scroll-behavior/);
});
