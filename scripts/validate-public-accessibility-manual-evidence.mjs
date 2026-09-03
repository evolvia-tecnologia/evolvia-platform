import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 1;
export const SCHEMA_ID = 'gate1-manual-accessibility/v1';

export const EVIDENCE_KIND = 'gate1-manual-accessibility-evidence';
export const EXAMPLE_KIND = 'gate1-manual-accessibility-example';

export const EXIT_OK = 0;
export const EXIT_INVALID = 1;
export const EXIT_BLOCKS_GO = 2;

export const REQUIRED_ROUTES = Object.freeze([
  '/',
  '/login',
  '/cadastro',
  '/eventos',
  '/evento/[slug]',
  '/termos-de-uso',
  '/privacidade',
]);

export const REQUIRED_SCENARIOS = Object.freeze([
  'teclado-foco',
  'leitor-de-tela',
  'zoom-reflow',
  'contraste-forcado',
  'mensagens',
]);

export const ALLOWED_RESULTS = Object.freeze(['PASS', 'FAIL', 'BLOCKED']);

export const ALLOWED_EXECUTOR_ROLES = Object.freeze([
  'revisor-humano',
  'homologador-acessibilidade',
]);

const SHA_RE = /^[0-9a-f]{40}$/u;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/u;
const TOKEN_RE = /(?:^|[^a-z0-9])(?:bearer\s+[a-z0-9._\-+=\/]+|ghp_[a-z0-9]+|gho_[a-z0-9]+|github_pat_[a-z0-9_]+|sk-[a-z0-9]+|xox[baprs]-[a-z0-9-]+|eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9._-]+)(?:$|[^a-z0-9])/iu;
const COOKIE_RE = /(?:^|[^a-z])(?:set-cookie|cookie\s*=)/iu;
const SECRET_RE = /(?:api[_-]?key|client[_-]?secret|authorization\s*:|password\s*[:=]|senha\s*[:=])/iu;
const OBSERVATION_MAX = 280;

const TOP_LEVEL_KEYS = new Set([
  'schemaVersion',
  'kind',
  'sourceSha',
  'recordedAt',
  'executorRole',
  'platform',
  'entries',
]);

const PLATFORM_KEYS = new Set(['os', 'browser', 'assistiveTechnology']);
const NAMED_VERSION_KEYS = new Set(['name', 'version']);
const ENTRY_BASE_KEYS = new Set(['route', 'scenario', 'result', 'observation']);
const ENTRY_BLOCKED_KEYS = new Set(['blockedCause', 'nextAction']);

function isMainModule() {
  const invoked = process.argv[1];
  return Boolean(invoked) && fileURLToPath(import.meta.url) === resolve(invoked);
}

function shouldRunCli() {
  if (!isMainModule()) return false;
  if (process.env.NODE_TEST_CONTEXT) return false;
  if (process.argv.includes('--test')) return false;
  return !process.execArgv.some((arg) => arg === '--test' || arg.startsWith('--test='));
}

function pairKey(route, scenario) {
  return `${route}::${scenario}`;
}

export function requiredPairs() {
  const pairs = [];
  for (const route of REQUIRED_ROUTES) {
    for (const scenario of REQUIRED_SCENARIOS) {
      pairs.push({ route, scenario, key: pairKey(route, scenario) });
    }
  }
  return pairs;
}

function pushError(errors, message) {
  if (!errors.includes(message)) errors.push(message);
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function unexpectedKeys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function collectSensitiveHits(value, path, hits, options = {}) {
  const skip = options.skipPaths ?? new Set();
  if (skip.has(path)) return;
  if (typeof value === 'string') {
    if (EMAIL_RE.test(value)) hits.push({ path, kind: 'e-mail' });
    if (TOKEN_RE.test(value)) hits.push({ path, kind: 'token' });
    if (COOKIE_RE.test(value)) hits.push({ path, kind: 'cookie' });
    if (SECRET_RE.test(value)) hits.push({ path, kind: 'segredo' });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectSensitiveHits(item, `${path}[${index}]`, hits, options);
    });
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      collectSensitiveHits(child, path ? `${path}.${key}` : key, hits, options);
    }
  }
}

function validateNamedVersion(label, value, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    pushError(errors, `${label} precisa ser um objeto com name e version.`);
    return;
  }
  const extra = unexpectedKeys(value, NAMED_VERSION_KEYS);
  if (extra.length > 0) {
    pushError(errors, `${label} contém chave não permitida: ${extra.join(', ')}.`);
  }
  if (!asTrimmedString(value.name)) {
    pushError(errors, `${label}.name é obrigatório.`);
  }
  if (!asTrimmedString(value.version)) {
    pushError(errors, `${label}.version é obrigatório.`);
  }
}

function validatePlatform(platform, errors) {
  if (!platform || typeof platform !== 'object' || Array.isArray(platform)) {
    pushError(errors, 'platform precisa ser um objeto com os, browser e assistiveTechnology.');
    return;
  }
  const extra = unexpectedKeys(platform, PLATFORM_KEYS);
  if (extra.length > 0) {
    pushError(errors, `platform contém chave não permitida: ${extra.join(', ')}.`);
  }
  if (!asTrimmedString(platform.os)) {
    pushError(errors, 'platform.os é obrigatório.');
  }
  validateNamedVersion('platform.browser', platform.browser, errors);
  validateNamedVersion('platform.assistiveTechnology', platform.assistiveTechnology, errors);
}

function validateObservation(observation, label, errors) {
  const text = asTrimmedString(observation);
  if (!text) {
    pushError(errors, `${label} exige observação sanitizada.`);
    return;
  }
  if (text.length > OBSERVATION_MAX) {
    pushError(errors, `${label} tem observação acima de ${OBSERVATION_MAX} caracteres.`);
  }
}

export function validateEvidence(input) {
  const errors = [];
  const reportLines = [];

  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return finalizeValidation({
      errors: ['A evidência precisa ser um objeto JSON.'],
      reportLines: [],
      isExample: false,
      counts: { pass: 0, fail: 0, blocked: 0, missing: requiredPairs().length },
    });
  }

  const extraTop = unexpectedKeys(input, TOP_LEVEL_KEYS);
  if (extraTop.length > 0) {
    pushError(errors, `Chave de topo não permitida: ${extraTop.join(', ')}.`);
  }

  const isExample = input.kind === EXAMPLE_KIND;
  if (input.kind !== EVIDENCE_KIND && input.kind !== EXAMPLE_KIND) {
    pushError(errors, `kind inválido: use ${EVIDENCE_KIND} ou ${EXAMPLE_KIND}.`);
  }
  if (isExample) {
    pushError(errors, 'Arquivo de exemplo fictício; não constitui homologação real.');
  }

  if (input.schemaVersion !== SCHEMA_VERSION) {
    pushError(errors, `schemaVersion inválido: esperado ${SCHEMA_VERSION} (${SCHEMA_ID}).`);
  }

  const sourceSha = asTrimmedString(input.sourceSha).toLowerCase();
  if (!SHA_RE.test(sourceSha)) {
    pushError(errors, 'SHA inválido: sourceSha precisa ter 40 caracteres hexadecimais.');
  }

  const recordedAt = asTrimmedString(input.recordedAt);
  const recordedAtValid = ISO_DATETIME_RE.test(recordedAt) && !Number.isNaN(Date.parse(recordedAt));
  if (!recordedAtValid) {
    pushError(errors, 'Data/hora inválida: recordedAt precisa ser ISO-8601 UTC (ex.: 2026-09-03T12:00:00Z).');
  }

  const executorRole = asTrimmedString(input.executorRole);
  if (executorRole && !ALLOWED_EXECUTOR_ROLES.includes(executorRole)) {
    pushError(errors, `executorRole inválido: use um papel (${ALLOWED_EXECUTOR_ROLES.join(', ')}), nunca pessoa.`);
  }

  validatePlatform(input.platform, errors);

  if (!Array.isArray(input.entries)) {
    pushError(errors, 'entries precisa ser uma lista de resultados humanos.');
    return finalizeValidation({
      errors,
      reportLines,
      isExample,
      counts: { pass: 0, fail: 0, blocked: 0, missing: requiredPairs().length },
    });
  }

  const seen = new Map();
  const counts = { pass: 0, fail: 0, blocked: 0, missing: 0 };

  input.entries.forEach((entry, index) => {
    const label = `Entrada ${index + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      pushError(errors, `${label} precisa ser um objeto.`);
      return;
    }

    const extra = unexpectedKeys(entry, new Set([...ENTRY_BASE_KEYS, ...ENTRY_BLOCKED_KEYS]));
    if (extra.length > 0) {
      pushError(errors, `${label} contém chave não permitida: ${extra.join(', ')}.`);
    }

    const route = asTrimmedString(entry.route);
    const scenario = asTrimmedString(entry.scenario);
    const result = asTrimmedString(entry.result);

    if (!REQUIRED_ROUTES.includes(route)) {
      pushError(errors, `${label}: rota não permitida (${route || 'vazia'}).`);
    }
    if (!REQUIRED_SCENARIOS.includes(scenario)) {
      pushError(errors, `${label}: cenário não permitido (${scenario || 'vazio'}).`);
    }
    if (!ALLOWED_RESULTS.includes(result)) {
      pushError(errors, `${label}: resultado inválido (${result || 'vazio'}); use PASS, FAIL ou BLOCKED.`);
    }

    validateObservation(entry.observation, label, errors);

    if (REQUIRED_ROUTES.includes(route) && REQUIRED_SCENARIOS.includes(scenario)) {
      const key = pairKey(route, scenario);
      if (seen.has(key)) {
        pushError(errors, `Duplicidade: a rota ${route} no cenário ${scenario} aparece mais de uma vez.`);
      } else {
        seen.set(key, result);
      }
    }

    if (result === 'PASS') {
      counts.pass += 1;
      if (!executorRole) {
        pushError(errors, `PASS sem executor: ${label} (${route} / ${scenario}) exige executorRole.`);
      }
      if (!recordedAtValid) {
        pushError(errors, `PASS sem data: ${label} (${route} / ${scenario}) exige recordedAt válido.`);
      }
      if (asTrimmedString(entry.blockedCause) || asTrimmedString(entry.nextAction)) {
        pushError(errors, `${label}: PASS não admite blockedCause nem nextAction.`);
      }
    } else if (result === 'FAIL') {
      counts.fail += 1;
      if (asTrimmedString(entry.blockedCause) || asTrimmedString(entry.nextAction)) {
        pushError(errors, `${label}: FAIL não admite blockedCause nem nextAction.`);
      }
    } else if (result === 'BLOCKED') {
      counts.blocked += 1;
      if (!asTrimmedString(entry.blockedCause)) {
        pushError(errors, `BLOCKED sem causa: ${label} (${route} / ${scenario}) exige blockedCause.`);
      }
      if (!asTrimmedString(entry.nextAction)) {
        pushError(errors, `BLOCKED sem próxima ação: ${label} (${route} / ${scenario}) exige nextAction.`);
      }
    }
  });

  for (const pair of requiredPairs()) {
    if (!seen.has(pair.key)) {
      counts.missing += 1;
      pushError(errors, `Cenário ausente: falta ${pair.scenario} em ${pair.route}. Ausência não aprova.`);
    }
  }

  const sensitiveHits = [];
  collectSensitiveHits(input, '', sensitiveHits, { skipPaths: new Set(['sourceSha']) });
  if (sensitiveHits.length > 0) {
    const kinds = [...new Set(sensitiveHits.map((item) => item.kind))].join(', ');
    pushError(errors, `Conteúdo sensível recusado (${kinds}). Não registre e-mail, token, cookie ou segredo.`);
  }

  return finalizeValidation({ errors, reportLines, isExample, counts });
}

function finalizeValidation({ errors, reportLines, isExample, counts }) {
  const schemaInvalid = errors.some((message) => !message.startsWith('Arquivo de exemplo fictício'));
  const hasBlockingResult = counts.fail > 0 || counts.blocked > 0;
  const completePass = !isExample
    && errors.length === 0
    && counts.missing === 0
    && counts.fail === 0
    && counts.blocked === 0
    && counts.pass === requiredPairs().length;

  let exitCode = EXIT_INVALID;
  if (completePass) {
    exitCode = EXIT_OK;
  } else if (!isExample && !schemaInvalid && hasBlockingResult && counts.missing === 0) {
    exitCode = EXIT_BLOCKS_GO;
  }

  const blocksGo = !completePass;
  const lines = [
    `Contrato ${SCHEMA_ID}.`,
    `Itens: ${counts.pass} PASS, ${counts.fail} FAIL, ${counts.blocked} BLOCKED, ${counts.missing} ausentes.`,
    'Esta ferramenta valida evidência humana; não fabrica resultado, não aprova por ausência e não executa deploy.',
    ...reportLines,
    ...errors,
  ];

  if (completePass) {
    lines.push('Evidência completa sem FAIL ou BLOCKED. A ferramenta não declara Go/No-Go.');
  } else if (hasBlockingResult) {
    lines.push('FAIL ou BLOCKED impede declarar Go.');
  } else if (counts.missing > 0) {
    lines.push('Matriz incompleta: ausência de item não é aprovação e impede declarar Go.');
  } else {
    lines.push('Evidência rejeitada: Go permanece bloqueado.');
  }

  return {
    ok: completePass,
    validForHomologation: completePass,
    blocksGo,
    isExample,
    exitCode,
    errors: [...errors],
    counts,
    messages: lines,
  };
}

export function parseEvidenceJson(text) {
  const raw = String(text ?? '').trim();
  if (!raw) {
    throw new Error('O arquivo de evidência está vazio.');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('JSON de evidência inválido.');
  }
}

export function formatReport(result) {
  return result.messages.join('\n');
}

export async function validateEvidenceFile(filePath) {
  const resolved = resolve(filePath);
  let text;
  try {
    text = await readFile(resolved, 'utf8');
  } catch {
    throw new Error(`Não foi possível ler a evidência em ${resolved}.`);
  }
  return validateEvidence(parseEvidenceJson(text));
}

export async function runCli(argv = process.argv.slice(2), io = console) {
  const filePath = argv.find((item) => !item.startsWith('--'));
  if (!filePath) {
    io.error('Informe o JSON de evidência manual. Uso: node scripts/validate-public-accessibility-manual-evidence.mjs <arquivo.json>');
    io.error('A ferramenta não declara Go/No-Go e não executa deploy.');
    return EXIT_INVALID;
  }

  try {
    const result = await validateEvidenceFile(filePath);
    const report = formatReport(result);
    if (result.exitCode === EXIT_OK) {
      io.log(report);
    } else {
      io.error(report);
    }
    return result.exitCode;
  } catch (error) {
    io.error(error instanceof Error ? error.message : 'Falha ao validar a evidência manual.');
    return EXIT_INVALID;
  }
}

if (shouldRunCli()) {
  runCli().then((code) => {
    process.exitCode = code;
  });
}
