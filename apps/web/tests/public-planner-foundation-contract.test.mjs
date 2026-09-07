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

function joinRelativeSourcePath(directory, name) {
  return path.posix.join(directory, name);
}

async function collectRouteSources(directory, relativeDirectory = "") {
  const entries = (await readdir(directory, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  const files = [];

  for (const entry of entries) {
    const relativeName = joinRelativeSourcePath(relativeDirectory, entry.name);
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

function blank(character) {
  return character === "\n" || character === "\r" ? character : " ";
}

function analyzeSource(source) {
  const active = source.split("");
  const executable = source.split("");
  const stack = [{ type: "code", templateExpression: false, braceDepth: 0 }];
  let index = 0;

  const mask = (target, position) => {
    target[position] = blank(source[position]);
  };

  while (index < source.length) {
    const state = stack.at(-1);

    if (state.type === "template") {
      if (source[index] === "\\") {
        mask(executable, index);
        if (index + 1 < source.length) {
          mask(executable, index + 1);
        }
        index += 2;
        continue;
      }

      if (source[index] === "`") {
        mask(executable, index);
        stack.pop();
        index += 1;
        continue;
      }

      if (source[index] === "$" && source[index + 1] === "{") {
        mask(executable, index);
        mask(executable, index + 1);
        stack.push({ type: "code", templateExpression: true, braceDepth: 0 });
        index += 2;
        continue;
      }

      mask(executable, index);
      index += 1;
      continue;
    }

    if (state.templateExpression && source[index] === "}") {
      if (state.braceDepth === 0) {
        mask(executable, index);
        stack.pop();
        index += 1;
        continue;
      }

      state.braceDepth -= 1;
      index += 1;
      continue;
    }

    if (state.templateExpression && source[index] === "{") {
      state.braceDepth += 1;
      index += 1;
      continue;
    }

    if (source[index] === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") {
        mask(active, index);
        mask(executable, index);
        index += 1;
      }
      continue;
    }

    if (source[index] === "/" && source[index + 1] === "*") {
      mask(active, index);
      mask(executable, index);
      mask(active, index + 1);
      mask(executable, index + 1);
      index += 2;

      while (index < source.length) {
        if (source[index] === "*" && source[index + 1] === "/") {
          mask(active, index);
          mask(executable, index);
          mask(active, index + 1);
          mask(executable, index + 1);
          index += 2;
          break;
        }

        mask(active, index);
        mask(executable, index);
        index += 1;
      }
      continue;
    }

    if (source[index] === "'" || source[index] === '"') {
      const quote = source[index];
      mask(executable, index);
      index += 1;

      while (index < source.length) {
        mask(executable, index);

        if (source[index] === "\\") {
          if (index + 1 < source.length) {
            mask(executable, index + 1);
          }
          index += 2;
          continue;
        }

        const current = source[index];
        index += 1;
        if (current === quote) {
          break;
        }
      }
      continue;
    }

    if (source[index] === "`") {
      mask(executable, index);
      stack.push({ type: "template" });
      index += 1;
      continue;
    }

    index += 1;
  }

  return {
    active: active.join(""),
    executable: executable.join(""),
  };
}

function fail(route, contract) {
  assert.fail(`${route}: ${contract}`);
}

function assertNoExternalEffects(route, files) {
  const forbidden = [
    ["executable", /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/i, "não pode usar cliente de rede ou fetch"],
    ["executable", /\b(?:localStorage|sessionStorage|indexedDB)\b/i, "não pode acessar armazenamento"],
    ["executable", /\bdocument\s*(?:\.\s*cookie\b|\[)/i, "não pode acessar cookies ou propriedades computadas de document"],
    ["executable", /\bnavigator\s*(?:\.\s*sendBeacon\b|\[)/i, "não pode enviar analytics nem acessar propriedades computadas de navigator"],
    ["executable", /\b(?:window|globalThis|self|global)\s*\[/, "não pode acessar global por propriedade computada"],
    ["executable", /=\s*(?:window|globalThis|self|global)\b/, "não pode criar alias de objeto global"],
    ["executable", /\bReflect\s*(?:\.\s*(?:get|construct)\s*\(|\[)/, "não pode usar reflexão dinâmica"],
    ["executable", /=\s*Reflect\b/, "não pode criar alias de Reflect"],
    ["executable", /\b(?:eval|Function)\b/, "não pode executar código dinâmico"],
    ["executable", /\bimport\s*\(/, "não pode usar importação dinâmica"],
    ["executable", /\brequire\s*\(/, "não pode usar carregamento dinâmico"],
    ["active", /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'](?:axios|node-fetch|undici|(?:node:)?https?)["']/i, "não pode importar cliente de rede"],
  ];

  for (const { name, source } of files) {
    const analyzed = analyzeSource(source);

    for (const [view, pattern, message] of forbidden) {
      if (pattern.test(analyzed[view])) {
        fail(route, `${name} ${message}`);
      }
    }
  }
}

function combineActiveSources(files) {
  return files.map(({ source }) => analyzeSource(source).active).join("\n");
}

function assertUsesFoundation(route, files) {
  const combined = combineActiveSources(files);
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
  const combined = combineActiveSources(files);

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

function assertFoundationAccessibilitySources(foundationSource, stylesSource) {
  const foundation = analyzeSource(foundationSource).active;
  const styles = analyzeSource(stylesSource).active;

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

async function assertFoundationAccessibilityContract() {
  const [foundation, styles] = await Promise.all([
    readFile(foundationPath, "utf8"),
    readFile(foundationStylesPath, "utf8"),
  ]);

  assertFoundationAccessibilitySources(foundation, styles);
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
    assert.equal(joinRelativeSourcePath("components", "form.tsx"), "components/form.tsx");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  await t.test("guardas falham diante de efeitos externos e evasões", () => {
    const evasions = [
      "globalThis['fetch']('/api')",
      "window['local' + 'Storage']",
      "document['cookie'] = 'x'",
      "Reflect.construct(WebSocket, ['wss://example.invalid'])",
      "import('node-fetch')",
      "const { fetch: f } = globalThis; f('/api');",
      "const f = self.fetch; f('/api');",
      "const f = global.fetch; f('/api');",
      "const f = globalThis['fe' + 'tch']; f('/api');",
      "const { ['fe' + 'tch']: f } = globalThis; f('/api');",
      "const browserGlobal = globalThis; browserGlobal['fe' + 'tch']('/api');",
      "Reflect.get(globalThis, 'fetch')('/api');",
      "Reflect['get'](globalThis, 'fetch')('/api');",
      "const reflection = Reflect; reflection.get(globalThis, 'fetch')('/api');",
      "eval('fe' + 'tch(\"/api\")');",
      "Function('return fetch(\"/api\")')();",
      "new Function('return fetch(\"/api\")')();",
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

  await t.test("comentários e literais legítimos não violam o contrato", () => {
    const legitimateReferences = [
      "const cookieMessage = 'Este planejador não utiliza document.cookie ou fetch.';",
      "const endpointExample = 'https://example.invalid/path';",
      "const template = `Não usamos fetch nem localStorage.`;",
      "type BrowserDocument = { title: string };",
      "// Não usar fetch(), document.cookie ou localStorage aqui.",
      "/* globalThis['fetch']; <main><h1>exemplo</h1></main> */",
    ];

    for (const [index, source] of legitimateReferences.entries()) {
      assert.doesNotThrow(() =>
        assertNoExternalEffects("planejar-fixture", [
          { name: `legitimate-${index}.tsx`, source },
        ]),
      );
    }

    const analyzedTemplate = analyzeSource("`texto ${fetch('/api')}`");
    assert.match(analyzedTemplate.executable, /fetch\s*\(/);
  });

  await t.test("comentários não satisfazem nem quebram contratos estruturais", () => {
    const commentedFoundation = [{
      name: "page.tsx",
      source: '// import { LocalPlannerShell } from "@/components/local-planner-shell";\n// <LocalPlannerShell />',
    }];
    assert.throws(
      () => assertUsesFoundation("planejar-fixture", commentedFoundation),
      /deve importar e renderizar LocalPlannerShell/,
    );

    assert.doesNotThrow(() =>
      assertPreservesSemantics("planejar-fixture", [{
        name: "page.tsx",
        source: "// <main><h1>exemplo inativo</h1></main>",
      }]),
    );

    assert.throws(
      () => assertFoundationAccessibilitySources(
        '// role="status" aria-live="polite" summaryIcons',
        "/* min-height: 44px; :focus-visible; outline: 3px; @media (max-width: 360px); overflow-wrap: anywhere; @media (forced-colors: active); */",
      ),
      /role="status"/,
    );
  });

  await t.test("contratos falham diante de rota estruturalmente inválida", () => {
    const invalid = [{ name: "page.tsx", source: "export default function Page() { return null; }" }];

    assert.throws(
      () => assertUsesFoundation("planejar-fixture", invalid),
      /deve importar e renderizar LocalPlannerShell/,
    );
  });
});
