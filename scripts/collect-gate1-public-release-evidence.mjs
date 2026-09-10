import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MANIFEST_LIMIT_BYTES = 64 * 1024;
export const DEFAULT_TIMEOUT_MS = 300_000;

export const VALIDATORS = Object.freeze([
  {
    id: "runtime_publico_e_reflow",
    script: "scripts/validate-public-accessibility-runtime.mjs",
    description: "Rotas públicas, reflow em 320 px, foco e alvos mínimos.",
  },
  {
    id: "arvore_acessivel",
    script: "scripts/validate-public-accessibility-tree.mjs",
    description: "Estrutura semântica e árvore de acessibilidade das rotas públicas.",
  },
  {
    id: "espacamento_de_texto",
    script: "scripts/validate-public-text-spacing.mjs",
    description: "Espaçamento de texto sem perda de conteúdo ou funcionalidade.",
  },
  {
    id: "evidencia_visual",
    script: "scripts/capture-events-visual-evidence.mjs",
    description: "Matriz visual canônica das superfícies públicas.",
  },
]);

const HUMAN_BLOCKERS = Object.freeze([
  {
    id: "leitor_de_tela_nvda",
    status: "BLOCKED_HUMAN",
    detail: "Exige validação humana com NVDA; não é simulada por este agregador.",
  },
  {
    id: "leitor_de_tela_voiceover",
    status: "BLOCKED_HUMAN",
    detail: "Exige validação humana com VoiceOver; não é simulada por este agregador.",
  },
]);

const ADMIN_BLOCKERS = Object.freeze([
  {
    id: "https_publico_e_tls",
    status: "BLOCKED_ADMIN",
    detail: "Exige prova TLS pública e intervenção administrativa mantida fora desta execução.",
  },
]);

const SENSITIVE_KEY = /(?:authorization|cookie|email|html|password|personal|secret|token)/iu;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const ALLOWED_STATUS = new Set(["PASS", "BLOCKED_HUMAN", "BLOCKED_ADMIN", "FAIL"]);

function fail(message) {
  throw new Error(message);
}

function assertExactKeys(value, allowed, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${context}: objeto esperado.`);
  }
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length > 0) {
    fail(`${context}: campos não permitidos: ${extras.join(", ")}.`);
  }
}

function assertNoSensitiveKeys(value, path = "manifesto") {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) {
      fail(`${path}: campo sensível não permitido: ${key}.`);
    }
    assertNoSensitiveKeys(nested, `${path}.${key}`);
  }
}

export function parseSource({ baseUrl, sha, timestamp }) {
  if (!SHA_PATTERN.test(String(sha ?? ""))) {
    fail("Informe um SHA Git completo com 40 caracteres hexadecimais minúsculos.");
  }
  const instant = new Date(String(timestamp ?? ""));
  if (!timestamp || Number.isNaN(instant.getTime()) || instant.toISOString() !== timestamp) {
    fail("Informe timestamp ISO UTC canônico, por exemplo 2026-09-09T15:00:00.000Z.");
  }

  let parsed;
  try {
    parsed = new URL(String(baseUrl ?? ""));
  } catch {
    fail("Informe uma URL base absoluta válida.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    fail("A URL base não pode conter credenciais, consulta ou fragmento.");
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    fail("A URL base deve apontar para a raiz da aplicação.");
  }
  const loopback = new Set(["127.0.0.1", "localhost", "::1"]).has(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
    fail("HTTP só é permitido para origem local; ambientes remotos exigem HTTPS.");
  }

  return Object.freeze({
    sha,
    timestamp,
    baseUrl: parsed.href,
    origin: parsed.origin,
  });
}

export function buildValidatorPlan(source, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > DEFAULT_TIMEOUT_MS) {
    fail(`O timeout deve ficar entre 1000 e ${DEFAULT_TIMEOUT_MS} ms.`);
  }
  return VALIDATORS.map((validator) => ({
    ...validator,
    timeoutMs,
    env: Object.freeze({
      EVOLVIA_WEB_URL: source.baseUrl,
      GITHUB_SHA: source.sha,
    }),
    expectedOrigin: source.origin,
  }));
}

export async function defaultExecutor(spec) {
  const child = spawn(process.execPath, [spec.script], {
    cwd: resolve(fileURLToPath(new URL("..", import.meta.url))),
    env: { ...process.env, ...spec.env },
    stdio: "ignore",
  });
  return new Promise((resolveExecution, reject) => {
    let settled = false;
    let forceKillTimer;

    const removeInitialListeners = () => {
      child.off("error", onError);
      child.off("exit", onExit);
    };
    const onLateExit = () => {
      clearTimeout(forceKillTimer);
      child.off("error", onLateError);
    };
    const onLateError = () => {
      clearTimeout(forceKillTimer);
      child.off("exit", onLateExit);
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      removeInitialListeners();
      resolveExecution({ ...result, origin: spec.expectedOrigin });
    };
    const onExit = (code) => finish({ code, timedOut: false });
    const onError = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      removeInitialListeners();
      reject(error);
    };

    child.once("error", onError);
    child.once("exit", onExit);
    const timeoutTimer = setTimeout(() => {
      removeInitialListeners();
      child.once("error", onLateError);
      child.once("exit", onLateExit);
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, 2_000);
      forceKillTimer.unref?.();
      finish({ code: null, timedOut: true });
    }, spec.timeoutMs);
  });
}

function toAutomatedEvidence(spec, result) {
  if (result?.origin !== spec.expectedOrigin) {
    fail(`${spec.id}: o executor informou origem divergente.`);
  }
  const passed = result?.code === 0 && result?.timedOut !== true;
  return {
    id: spec.id,
    status: passed ? "PASS" : "FAIL",
    validator: spec.script,
    detail: result?.timedOut
      ? "Validador interrompido por timeout."
      : passed
        ? "Validador concluído sem falhas."
        : `Validador terminou com código ${Number.isInteger(result?.code) ? result.code : "desconhecido"}.`,
  };
}

export function validateManifest(manifest) {
  assertNoSensitiveKeys(manifest);
  assertExactKeys(
    manifest,
    ["schemaVersion", "gate", "source", "automated", "human", "administrative", "summary", "decision"],
    "manifesto",
  );
  assertExactKeys(manifest.source, ["sha", "timestamp", "baseUrl", "origin"], "source");
  parseSource(manifest.source);
  if (manifest.schemaVersion !== 1 || manifest.gate !== "GATE_1_PUBLIC_RELEASE") {
    fail("Versão ou Gate do manifesto inválido.");
  }
  if (manifest.decision !== "NOT_AUTHORIZED") {
    fail("O agregador não pode autorizar Go/No-Go.");
  }

  const groups = [
    ["automated", manifest.automated, ["id", "status", "validator", "detail"]],
    ["human", manifest.human, ["id", "status", "detail"]],
    ["administrative", manifest.administrative, ["id", "status", "detail"]],
  ];
  for (const [name, entries, keys] of groups) {
    if (!Array.isArray(entries) || entries.length === 0) fail(`${name}: conjunto obrigatório ausente.`);
    for (const entry of entries) {
      assertExactKeys(entry, keys, name);
      if (!ALLOWED_STATUS.has(entry.status)) fail(`${name}: estado inválido.`);
    }
  }
  const expectedIds = VALIDATORS.map(({ id }) => id);
  if (JSON.stringify(manifest.automated.map(({ id }) => id)) !== JSON.stringify(expectedIds)) {
    fail("O manifesto não contém o conjunto automatizado completo e ordenado.");
  }
  if (!manifest.human.every(({ status }) => status === "BLOCKED_HUMAN")) {
    fail("Pendências humanas não podem ser simuladas como concluídas.");
  }
  if (!manifest.administrative.every(({ status }) => status === "BLOCKED_ADMIN")) {
    fail("Pendências administrativas não podem ser simuladas como concluídas.");
  }
  assertExactKeys(manifest.summary, ["pass", "fail", "blockedHuman", "blockedAdmin"], "summary");
  const allEntries = [...manifest.automated, ...manifest.human, ...manifest.administrative];
  const expectedSummary = {
    pass: allEntries.filter(({ status }) => status === "PASS").length,
    fail: allEntries.filter(({ status }) => status === "FAIL").length,
    blockedHuman: allEntries.filter(({ status }) => status === "BLOCKED_HUMAN").length,
    blockedAdmin: allEntries.filter(({ status }) => status === "BLOCKED_ADMIN").length,
  };
  if (JSON.stringify(manifest.summary) !== JSON.stringify(expectedSummary)) {
    fail("O resumo do manifesto não corresponde às evidências.");
  }

  const encoded = `${JSON.stringify(manifest, null, 2)}\n`;
  if (Buffer.byteLength(encoded, "utf8") > MANIFEST_LIMIT_BYTES) {
    fail("O manifesto excede o limite de tamanho.");
  }
  return encoded;
}

export async function collectGate1Evidence(config, executor = defaultExecutor) {
  const source = parseSource(config);
  const plan = buildValidatorPlan(source, config.timeoutMs);
  const automated = [];
  for (const spec of plan) {
    let result;
    try {
      result = await executor(spec);
    } catch {
      result = { code: null, timedOut: false, origin: spec.expectedOrigin };
    }
    automated.push(toAutomatedEvidence(spec, result));
  }
  const human = HUMAN_BLOCKERS.map((item) => ({ ...item }));
  const administrative = ADMIN_BLOCKERS.map((item) => ({ ...item }));
  const entries = [...automated, ...human, ...administrative];
  const manifest = {
    schemaVersion: 1,
    gate: "GATE_1_PUBLIC_RELEASE",
    source,
    automated,
    human,
    administrative,
    summary: {
      pass: entries.filter(({ status }) => status === "PASS").length,
      fail: entries.filter(({ status }) => status === "FAIL").length,
      blockedHuman: entries.filter(({ status }) => status === "BLOCKED_HUMAN").length,
      blockedAdmin: entries.filter(({ status }) => status === "BLOCKED_ADMIN").length,
    },
    decision: "NOT_AUTHORIZED",
  };
  validateManifest(manifest);
  return manifest;
}

export function parseCliArgs(argv) {
  if (argv.length % 2 !== 0) fail("Os argumentos devem ser informados em pares --opção valor.");
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) fail("Os argumentos devem ser informados em pares --opção valor.");
    if (values[key] !== undefined) fail(`Argumento repetido: ${key}.`);
    values[key] = value;
  }
  const allowed = new Set(["--base-url", "--sha", "--timestamp", "--output", "--timeout-ms"]);
  const unknown = Object.keys(values).filter((key) => !allowed.has(key));
  if (unknown.length > 0) fail(`Argumentos desconhecidos: ${unknown.join(", ")}.`);
  for (const required of ["--base-url", "--sha", "--timestamp", "--output"]) {
    if (!values[required]) fail(`Informe ${required} explicitamente.`);
  }
  const parsed = {
    baseUrl: values["--base-url"],
    sha: values["--sha"],
    timestamp: values["--timestamp"],
    output: values["--output"],
    timeoutMs: values["--timeout-ms"] === undefined ? DEFAULT_TIMEOUT_MS : Number(values["--timeout-ms"]),
  };
  buildValidatorPlan(parseSource(parsed), parsed.timeoutMs);
  return parsed;
}

export async function runCli(argv = process.argv.slice(2), executor = defaultExecutor) {
  const config = parseCliArgs(argv);
  const manifest = await collectGate1Evidence(config, executor);
  const json = validateManifest(manifest);
  const output = resolve(config.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, json, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({
    arquivo: output,
    sourceSha: manifest.source.sha,
    summary: manifest.summary,
    decision: manifest.decision,
  }));
  if (manifest.summary.fail > 0) process.exitCode = 1;
  return manifest;
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : "Falha ao coletar evidências do Gate 1.");
    process.exitCode = 1;
  });
}
