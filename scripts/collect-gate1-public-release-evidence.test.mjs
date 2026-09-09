import assert from "node:assert/strict";
import test from "node:test";

import {
  MANIFEST_LIMIT_BYTES,
  VALIDATORS,
  buildValidatorPlan,
  collectGate1Evidence,
  parseCliArgs,
  parseSource,
  validateManifest,
} from "./collect-gate1-public-release-evidence.mjs";

const baseConfig = Object.freeze({
  baseUrl: "https://dev.evolviatecnologia.com/",
  sha: "156ca89f82f6314bdec4bf8c737b944e8d70654d",
  timestamp: "2026-09-09T15:00:00.000Z",
  timeoutMs: 10_000,
});

test("plano compõe os validadores canônicos sem duplicar regras", () => {
  const source = parseSource(baseConfig);
  const plan = buildValidatorPlan(source, baseConfig.timeoutMs);

  assert.deepEqual(plan.map(({ id }) => id), [
    "runtime_publico_e_reflow",
    "arvore_acessivel",
    "espacamento_de_texto",
    "evidencia_visual",
  ]);
  assert.equal(new Set(plan.map(({ script }) => script)).size, VALIDATORS.length);
  assert.ok(plan.every(({ env }) => env.EVOLVIA_WEB_URL === baseConfig.baseUrl));
  assert.ok(plan.every(({ env }) => env.GITHUB_SHA === baseConfig.sha));
  assert.ok(plan.every(({ expectedOrigin }) => expectedOrigin === "https://dev.evolviatecnologia.com"));
});

test("manifesto determinístico separa automação, humano e administração", async () => {
  const executor = async (spec) => ({ code: 0, timedOut: false, origin: spec.expectedOrigin });
  const first = await collectGate1Evidence(baseConfig, executor);
  const second = await collectGate1Evidence(baseConfig, executor);

  assert.deepEqual(first, second);
  assert.deepEqual(first.summary, {
    pass: 4,
    fail: 0,
    blockedHuman: 2,
    blockedAdmin: 1,
  });
  assert.equal(first.decision, "NOT_AUTHORIZED");
  assert.ok(first.human.every(({ status }) => status === "BLOCKED_HUMAN"));
  assert.ok(first.administrative.every(({ status }) => status === "BLOCKED_ADMIN"));
  assert.ok(Buffer.byteLength(validateManifest(first), "utf8") < MANIFEST_LIMIT_BYTES);
});

test("falha parcial e timeout fecham somente as evidências afetadas", async () => {
  const executor = async (spec) => {
    if (spec.id === "arvore_acessivel") return { code: 2, timedOut: false, origin: spec.expectedOrigin };
    if (spec.id === "evidencia_visual") return { code: null, timedOut: true, origin: spec.expectedOrigin };
    return { code: 0, timedOut: false, origin: spec.expectedOrigin };
  };
  const manifest = await collectGate1Evidence(baseConfig, executor);

  assert.deepEqual(manifest.automated.map(({ status }) => status), ["PASS", "FAIL", "PASS", "FAIL"]);
  assert.match(manifest.automated[1].detail, /código 2/u);
  assert.match(manifest.automated[3].detail, /timeout/u);
  assert.equal(manifest.summary.fail, 2);
  assert.equal(manifest.decision, "NOT_AUTHORIZED");
});

test("exceção do executor vira FAIL sanitizado", async () => {
  const manifest = await collectGate1Evidence(baseConfig, async (spec) => {
    if (spec.id === "runtime_publico_e_reflow") throw new Error("token=segredo html=<main>PII</main>");
    return { code: 0, timedOut: false, origin: spec.expectedOrigin };
  });
  const json = validateManifest(manifest);

  assert.equal(manifest.automated[0].status, "FAIL");
  assert.doesNotMatch(json, /segredo|<main>|PII/u);
});

test("origem divergente falha fechada", async () => {
  await assert.rejects(
    collectGate1Evidence(baseConfig, async () => ({
      code: 0,
      timedOut: false,
      origin: "https://externo.example",
    })),
    /origem divergente/u,
  );
});

test("fonte recusa SHA, timestamp, origem e credenciais inválidos", () => {
  assert.throws(() => parseSource({ ...baseConfig, sha: "abc" }), /SHA Git completo/u);
  assert.throws(() => parseSource({ ...baseConfig, timestamp: "09/09/2026" }), /timestamp ISO UTC/u);
  assert.throws(() => parseSource({ ...baseConfig, baseUrl: "http://dev.example/" }), /exigem HTTPS/u);
  assert.throws(() => parseSource({ ...baseConfig, baseUrl: "https://user:pass@dev.example/" }), /credenciais/u);
  assert.throws(() => parseSource({ ...baseConfig, baseUrl: "https://dev.example/app" }), /raiz/u);
  assert.equal(parseSource({ ...baseConfig, baseUrl: "http://127.0.0.1:3000/" }).origin, "http://127.0.0.1:3000");
});

test("manifesto recusa campos extras sensíveis, incompletude e resumo adulterado", async () => {
  const executor = async (spec) => ({ code: 0, timedOut: false, origin: spec.expectedOrigin });
  const manifest = await collectGate1Evidence(baseConfig, executor);

  assert.throws(
    () => validateManifest({ ...manifest, secretToken: "não registrar" }),
    /campo sensível não permitido/u,
  );
  assert.throws(
    () => validateManifest({ ...manifest, automated: manifest.automated.slice(1) }),
    /conjunto automatizado completo/u,
  );
  assert.throws(
    () => validateManifest({ ...manifest, summary: { ...manifest.summary, pass: 99 } }),
    /resumo do manifesto/u,
  );
  assert.throws(
    () => validateManifest({ ...manifest, human: manifest.human.map((item) => ({ ...item, status: "PASS" })) }),
    /Pendências humanas/u,
  );
});

test("CLI exige pares conhecidos, saída e timeout limitado", () => {
  const parsed = parseCliArgs([
    "--base-url", baseConfig.baseUrl,
    "--sha", baseConfig.sha,
    "--timestamp", baseConfig.timestamp,
    "--output", "evidence.json",
    "--timeout-ms", "2500",
  ]);
  assert.equal(parsed.timeoutMs, 2500);
  assert.throws(() => parseCliArgs(["--sha"]), /pares/u);
  assert.throws(() => parseCliArgs(["--unknown", "x", "--output", "x"]), /desconhecidos/u);
  assert.throws(
    () => parseCliArgs([
      "--base-url", baseConfig.baseUrl,
      "--sha", baseConfig.sha,
      "--timestamp", baseConfig.timestamp,
    ]),
    /--output/u,
  );
  assert.throws(() => buildValidatorPlan(parseSource(baseConfig), 999), /timeout/u);
});
