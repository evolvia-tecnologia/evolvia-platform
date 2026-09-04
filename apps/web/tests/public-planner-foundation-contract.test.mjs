import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const ajudaDirectory = path.resolve(testsDirectory, "../app/ajuda");
const foundationPath = path.resolve(
  testsDirectory,
  "../components/local-planner-shell.tsx",
);
const foundationStylesPath = path.resolve(
  testsDirectory,
  "../components/local-planner-shell.module.css",
);

async function discoverPlannerRoutes(root = ajudaDirectory) {
  let entries;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("planejar-"))
    .map((entry) => entry.name)
    .sort();
}

async function collectRouteSources(directory, relativeDirectory = "") {
  const entries = (await readdir(directory, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  const files = [];

  for (const entry of entries) {
    const relativeName = path.join(relativeDirectory, entry.name);
    const absoluteName = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectRouteSources(absoluteName, relativeName)));
      continue;
    }

    if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      files.push({
        name: relativeName,
        source: await readFile(absoluteName, "utf8"),
      });
    }
  }

  return files;
}

async function readRouteSources(route, root = ajudaDirectory) {
  return collectRouteSources(path.join(root, route));
}

function fail(route, contract) {
  assert.fail(`${route}: ${contract}`);
}

function assertNoExternalEffects(route, files) {
  const forbidden = [
    [/\bfetch\b/i, "não pode referenciar fetch"],
    [/\bXMLHttpRequest\b/, "não pode referenciar XMLHttpRequest"],
    [/\bWebSocket\b/, "não pode referenciar WebSocket"],
    [/\bEventSource\b/, "não pode referenciar EventSource"],
    [/\b(?:localStorage|sessionStorage|indexedDB)\b/i, "não pode usar armazenamento"],
    [/\bcookie\b/i, "não pode acessar cookies"],
    [/\bsendBeacon\b/i, "não pode enviar analytics"],
    [/\b(?:window|document|navigator|globalThis)\b/, "não pode acessar globais do navegador"],
    [/\bReflect\s*\.\s*construct\b/, "não pode construir APIs dinamicamente"],
    [/\bimport\s*\(/, "não pode usar importação dinâmica"],
    [/\brequire\s*\(/, "não pode usar carregamento dinâmico"],
    [/\b(?:axios|node-fetch|undici)\b/i, "não pode importar cliente de rede"],
    [/from\s+["'](?:node:)?https?["']/, "não pode importar HTTP nativo"],
  ];

  for (const { name, source } of files) {
    for (const [pattern, message] of forbidden) {
      if (pattern.test(source)) {
        fail(route, `${name} ${message}`);
      }
    }
  }
}

function assertUsesFoundation(route, files) {
  const combined = files.map(({ source }) => source).join("\n");
  const importsPlannerFoundation =
    /from\s+["'][^"']*components(?:\/local-planner-shell)?["']/.test(combined);

  if (!importsPlannerFoundation || !/<LocalPlannerShell\b/.test(combined)) {
    fail(route, "deve importar e renderizar LocalPlannerShell");
  }

  const exposesResult =
    /<LocalPlannerSummary\b|\bLocalPlannerState\b|role=["']status["']|data-state=/.test(
      combined,
    );

  if (exposesResult && !/<LocalPlannerSummary\b/.test(combined)) {
    fail(route, "deve reutilizar LocalPlannerSummary ao comunicar um resultado");
  }

  const implementsNativeChoices =
    /<fieldset\b|type=["'](?:radio|checkbox)["']/.test(combined);

  if (
    implementsNativeChoices &&
    (!/local-planner-choice-group/.test(combined) ||
      !/<LocalPlannerChoiceGroup\b/.test(combined))
  ) {
    fail(route, "deve reutilizar LocalPlannerChoiceGroup ao oferecer escolhas");
  }
}

function assertPreservesSemantics(route, files) {
  const combined = files.map(({ source }) => source).join("\n");

  if (/<main\b/.test(combined)) {
    fail(route, "não deve criar um segundo main fora de LocalPlannerShell");
  }

  if (/<h1\b/.test(combined)) {
    fail(route, "não deve criar um segundo h1 fora de LocalPlannerShell");
  }

  if (/style=\{\{[^}]*\b(?:color|backgroundColor)\s*:/.test(combined)) {
    fail(route, "não deve comunicar estado por cor inline");
  }
}

async function assertFoundationAccessibilityContract() {
  const [foundation, styles] = await Promise.all([
    readFile(foundationPath, "utf8"),
    readFile(foundationStylesPath, "utf8"),
  ]);

  assert.match(foundation, /role="status"/);
  assert.match(foundation, /aria-live="polite"/);
  assert.match(foundation, /summaryIcons/);
  assert.match(styles, /min-height:\s*44px/);
  assert.match(styles, /:focus-(?:visible|within)/);
  assert.match(styles, /outline:\s*3px/);
  assert.match(styles, /@media\s*\(max-width:\s*360px\)/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.match(styles, /@media\s*\(forced-colors:\s*active\)/);
}

test("planejadores públicos reutilizam a fundação local segura", async (t) => {
  await assertFoundationAccessibilityContract();
  const routes = await discoverPlannerRoutes();

  for (const route of routes) {
    await t.test(route, async () => {
      const files = await readRouteSources(route);

      if (files.length === 0) {
        fail(route, "não possui fonte TypeScript para validar");
      }

      assertUsesFoundation(route, files);
      assertNoExternalEffects(route, files);
      assertPreservesSemantics(route, files);
    });
  }
});

test("descoberta é determinística, recursiva e aceita árvore vazia", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "evolvia-planner-"));

  try {
    assert.deepEqual(await discoverPlannerRoutes(temporaryRoot), []);

    const routeDirectory = path.join(temporaryRoot, "planejar-fixture");
    const nestedDirectory = path.join(routeDirectory, "components");
    await mkdir(nestedDirectory, { recursive: true });
    await writeFile(path.join(routeDirectory, "page.tsx"), "export default null;\n");
    await writeFile(path.join(nestedDirectory, "form.tsx"), "export const nested = true;\n");

    assert.deepEqual(await discoverPlannerRoutes(temporaryRoot), ["planejar-fixture"]);
    assert.deepEqual(
      (await readRouteSources("planejar-fixture", temporaryRoot)).map(
        ({ name }) => name,
      ),
      ["components/form.tsx", "page.tsx"],
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  await t.test("guardas falham diante de efeitos externos representativos", () => {
    const evasions = [
      "globalThis['fetch']('/api')",
      "window['local' + 'Storage']",
      "document['cookie'] = 'x'",
      "Reflect.construct(WebSocket, ['wss://example.invalid'])",
      "import('node-fetch')",
    ];

    for (const [index, source] of evasions.entries()) {
      assert.throws(
        () =>
          assertNoExternalEffects("planejar-fixture", [
            { name: `fixture-${index}.tsx`, source },
          ]),
        /planejar-fixture/,
      );
    }
  });

  await t.test("contratos falham diante de rota estruturalmente inválida", () => {
    const invalid = [{ name: "page.tsx", source: "export default function Page() { return null; }" }];

    assert.throws(
      () => assertUsesFoundation("planejar-fixture", invalid),
      /deve importar e renderizar LocalPlannerShell/,
    );
  });
});

test("o contrato declara seu limite de segurança", () => {
  assert.ok(
    "guardrail estático" !== "prova de ausência de efeitos em runtime",
    "análise textual não substitui testes de runtime ou revisão humana",
  );
});
