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
  const routes = [];

  async function visit(directory, relativeDirectory = "") {
    let entries;

    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT" && directory === root) {
        return;
      }

      throw error;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const relativeName = joinRelativeSourcePath(relativeDirectory, entry.name);
      if (entry.name.startsWith("planejar-")) {
        routes.push(relativeName);
        continue;
      }

      await visit(path.join(directory, entry.name), relativeName);
    }
  }

  await visit(root);
  return routes.sort();
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

function startsRegexLiteral(source, index) {
  let previous = index - 1;
  while (previous >= 0 && /\s/.test(source[previous])) {
    previous -= 1;
  }

  if (previous < 0) {
    return true;
  }

  if (/[([{=,:;!?&|+\-*%^~]/.test(source[previous])) {
    return true;
  }

  if (source[previous] === ">") {
    return previous > 0 && source[previous - 1] === "=";
  }

  if (source[previous] === "<") {
    return false;
  }

  const prefix = source.slice(0, previous + 1);
  const keyword = prefix.match(/([A-Za-z_$][\w$]*)$/)?.[1];
  return /^(?:await|case|delete|do|else|in|instanceof|new|of|return|throw|typeof|void|yield)$/.test(
    keyword ?? "",
  );
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

    if (source[index] === "/" && startsRegexLiteral(source, index)) {
      let insideCharacterClass = false;
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

        if (source[index] === "[") {
          insideCharacterClass = true;
        } else if (source[index] === "]") {
          insideCharacterClass = false;
        } else if (source[index] === "/" && !insideCharacterClass) {
          index += 1;
          while (index < source.length && /[A-Za-z]/.test(source[index])) {
            mask(executable, index);
            index += 1;
          }
          break;
        }

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

function matchesAtExecutableToken(analyzed, tokenPattern, activePattern) {
  for (const match of analyzed.executable.matchAll(tokenPattern)) {
    if (activePattern.test(analyzed.active.slice(match.index))) {
      return true;
    }
  }

  return false;
}

function fail(route, contract) {
  assert.fail(`${route}: ${contract}`);
}

function assertNoExternalEffects(route, files) {
  const forbidden = [
    ["executable", /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/i, "não pode usar cliente de rede ou fetch"],
    ["executable", /\b(?:localStorage|sessionStorage|indexedDB)\b/i, "não pode acessar armazenamento"],
    ["executable", /\bdocument\b/i, "não pode acessar nem criar alias do objeto document"],
    ["executable", /\bnavigator\b/i, "não pode acessar nem criar alias do objeto navigator"],
    ["executable", /\b(?:window|globalThis|self|global)\b/, "não pode acessar ou criar alias de objeto global"],
    ["executable", /\bReflect\b/, "não pode usar ou criar alias de Reflect"],
    ["executable", /\b(?:eval|Function|constructor)\b/, "não pode executar código dinâmico"],
    ["executable", /\bimport\s*\(/, "não pode usar importação dinâmica"],
    ["executable", /\brequire\s*\(/, "não pode usar carregamento dinâmico"],
  ];

  for (const { name, source } of files) {
    const analyzed = analyzeSource(source);

    for (const [view, pattern, message] of forbidden) {
      if (pattern.test(analyzed[view])) {
        fail(route, `${name} ${message}`);
      }
    }

    const importsForbiddenClient = matchesAtExecutableToken(
      analyzed,
      /\b(?:from|import)\b/g,
      /^(?:from\s+|import\s+)["'](?:axios|node-fetch|undici|(?:node:)?https?)["']/i,
    );
    if (importsForbiddenClient) {
      fail(route, `${name} não pode importar cliente de rede`);
    }

    const accessesDynamicConstructor = matchesAtExecutableToken(
      analyzed,
      /\.|\[/g,
      /^(?:\.\s*constructor\b|\[\s*["']constructor["']\s*\])/,
    );
    if (accessesDynamicConstructor) {
      fail(route, `${name} não pode acessar constructor para executar código dinâmico`);
    }
  }
}

function combineActiveSources(files) {
  return files.map(({ source }) => analyzeSource(source).active).join("\n");
}

function combineExecutableSources(files) {
  return files.map(({ source }) => analyzeSource(source).executable).join("\n");
}

function assertUsesFoundation(route, files) {
  const combined = combineActiveSources(files);
  const executable = combineExecutableSources(files);
  const importsPlannerFoundation = files.some(({ source }) => {
    const analyzed = analyzeSource(source);
    return matchesAtExecutableToken(
      analyzed,
      /\bfrom\b/g,
      /^from\s+["'][^"']*components(?:\/local-planner-shell(?:\.tsx?)?)?\/?["']/,
    );
  });

  if (!importsPlannerFoundation || !/<LocalPlannerShell\b/.test(executable)) {
    fail(route, "deve importar e renderizar LocalPlannerShell");
  }

  const exposesResult =
    /<LocalPlannerSummary\b|\bLocalPlannerState\b/.test(executable) ||
    /role=["']status["']|data-state=/.test(combined);

  if (exposesResult && !/<LocalPlannerSummary\b/.test(executable)) {
    fail(route, "deve reutilizar LocalPlannerSummary ao comunicar um resultado");
  }

  const implementsNativeChoices =
    /<fieldset\b/.test(executable) ||
    /type=["'](?:radio|checkbox)["']/.test(combined);

  if (
    implementsNativeChoices &&
    (!/local-planner-choice-group/.test(combined) ||
      !/<LocalPlannerChoiceGroup\b/.test(executable))
  ) {
    fail(route, "deve reutilizar LocalPlannerChoiceGroup ao oferecer escolhas");
  }
}

function assertPreservesSemantics(route, files) {
  const combined = combineExecutableSources(files);

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
  assert.match(styles, /min-height:\s*(?:44px|2\.75rem)/);
  assert.match(styles, /:focus-(?:visible|within)/);
  assert.match(styles, /outline:\s*(?:3px|0\.1875rem)/);
  assert.match(styles, /@media\s*\(\s*max-width\s*:\s*360px\s*\)/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.match(styles, /@media\s*\(\s*forced-colors\s*:\s*active\s*\)/);
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
    const groupedRouteDirectory = path.join(
      temporaryRoot,
      "(categoria)",
      "planejar-aninhado",
    );
    await mkdir(nestedDirectory, { recursive: true });
    await mkdir(groupedRouteDirectory, { recursive: true });
    await writeFile(path.join(routeDirectory, "page.tsx"), "export default null;\n");
    await writeFile(path.join(nestedDirectory, "form.tsx"), "export const nested = true;\n");
    await writeFile(
      path.join(groupedRouteDirectory, "page.tsx"),
      "export default null;\n",
    );

    assert.deepEqual(await discoverPlannerRoutes(temporaryRoot), [
      "(categoria)/planejar-aninhado",
      "planejar-fixture",
    ]);
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
      "const g = [globalThis][0]; const f = g.fetch; f('/api');",
      "const ctx = { g: globalThis }; ctx.g.fetch('/api');",
      "import axios from 'axios';",
      "import 'node:https';",
      "eval('fe' + 'tch(\"/api\")');",
      "Function('return fetch(\"/api\")')();",
      "new Function('return fetch(\"/api\")')();",
      "(() => {})['constructor']('return fetch(\"/api\")')()",
      "(() => {}).constructor('return fetch(\"/api\")')()",
      "const { constructor: c } = () => {}; c('return fetch(\"/api\")')();",
      "const { cookie } = document;",
      "const { sendBeacon } = navigator;",
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
      "const regexCommentMarkers = /[/*]/;",
      "const doubleSlashRegex = /[/][/]/;",
      "const importExample = 'import axios from node-fetch';",
      "type BrowserDocument = { title: string };",
      "// Não usar fetch(), document.cookie ou localStorage aqui.",
      "/* globalThis['fetch']; <main><h1>exemplo</h1></main> */",
      "const constructorMessage = 'A propriedade constructor não é usada.';",
      "const example = \"fn['constructor'] não deve executar\";",
    ];

    for (const [index, source] of legitimateReferences.entries()) {
      assert.doesNotThrow(() =>
        assertNoExternalEffects("planejar-fixture", [
          { name: `legitimate-${index}.tsx`, source },
        ]),
      );
    }

    assert.doesNotThrow(() =>
      assertFoundationAccessibilitySources(
        '<div role="status" aria-live="polite">{summaryIcons}</div>',
        ".choice { min-height: 2.75rem; } :focus-visible { outline: 0.1875rem solid; } @media(max-width:360px) { overflow-wrap: anywhere; } @media ( forced-colors : active ) {}",
      ),
    );

    const analyzedTemplate = analyzeSource("`texto ${fetch('/api')}`");
    assert.match(analyzedTemplate.executable, /fetch\s*\(/);

    const analyzedRegex = analyzeSource("const marker = /[/*]/; const active = true;");
    assert.match(analyzedRegex.executable, /const active = true/);

    const analyzedJsxPath = analyzeSource(
      "const view = <div>/ajuda</div>; const active = true;",
    );
    assert.match(analyzedJsxPath.executable, /const active = true/);

    const analyzedArrowRegex = analyzeSource(
      "const matcher = () => /ajuda/.test(pathname); const active = true;",
    );
    assert.match(analyzedArrowRegex.executable, /const active = true/);
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

    assert.throws(
      () => assertUsesFoundation("planejar-fixture", [{
        name: "page.tsx",
        source: 'const copy = \'from "@/components/local-planner-shell"\'; <LocalPlannerShell />;',
      }]),
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
