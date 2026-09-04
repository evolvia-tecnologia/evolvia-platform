import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const ajudaDirectory = path.resolve(testsDirectory, "../app/ajuda");

async function discoverPlannerRoutes() {
  let entries;

  try {
    entries = await readdir(ajudaDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("planejar-"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "pt-BR"));
}

async function readRouteSources(route) {
  const routeDirectory = path.join(ajudaDirectory, route);
  const entries = await readdir(routeDirectory, { withFileTypes: true });
  const sourceNames = entries
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    sourceNames.map(async (name) => ({
      name,
      source: await readFile(path.join(routeDirectory, name), "utf8"),
    })),
  );
}

function fail(route, contract) {
  assert.fail(`${route}: ${contract}`);
}

function assertNoExternalEffects(route, files) {
  const forbidden = [
    [/\bfetch\s*\(/, "não pode executar fetch"],
    [/\bnew\s+XMLHttpRequest\b/, "não pode criar XMLHttpRequest"],
    [/\bnew\s+WebSocket\b/, "não pode abrir WebSocket"],
    [/\b(?:localStorage|sessionStorage|indexedDB)\b/, "não pode usar armazenamento"],
    [/\bdocument\s*\.\s*cookie\b/, "não pode acessar cookies"],
    [/\bnavigator\s*\.\s*sendBeacon\b/, "não pode enviar analytics"],
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

  if (
    !/from\s+["'][^"']*components\/local-planner-shell["']/.test(combined) ||
    !/<LocalPlannerShell\b/.test(combined)
  ) {
    fail(route, "deve importar e renderizar LocalPlannerShell");
  }

  if (!/<LocalPlannerSummary\b/.test(combined)) {
    fail(
      route,
      "deve renderizar LocalPlannerSummary para comunicar resultado sem depender somente de cor",
    );
  }

  const implementsChoices =
    /<fieldset\b|type=["']radio["']|\bchoices?\s*=|\boptions?\s*=/.test(combined);

  if (
    implementsChoices &&
    (!/local-planner-choice-group/.test(combined) ||
      !/<LocalPlannerChoiceGroup\b/.test(combined))
  ) {
    fail(
      route,
      "deve reutilizar LocalPlannerChoiceGroup quando oferecer escolhas",
    );
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

  if (/style=\{\{[^}]*\bcolor\s*:/.test(combined)) {
    fail(route, "não deve comunicar estado por cor inline");
  }
}

test("planejadores públicos reutilizam a fundação local segura", async (t) => {
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

test("descoberta de planejadores é determinística e aceita árvore vazia", async () => {
  const first = await discoverPlannerRoutes();
  const second = await discoverPlannerRoutes();

  assert.deepEqual(first, second);
  assert.deepEqual(first, [...first].sort((left, right) => left.localeCompare(right, "pt-BR")));
  assert.ok(first.every((route) => route.startsWith("planejar-")));
});
