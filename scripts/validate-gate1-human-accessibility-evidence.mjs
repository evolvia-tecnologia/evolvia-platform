import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_EVIDENCE_BYTES = 64 * 1024;
export const ALLOWED_STATUS = new Set(['PASS', 'FAIL', 'BLOCKED']);
export const REQUIRED_CHECKS = Object.freeze([
  Object.freeze({ id: 'keyboard_navigation', routes: Object.freeze(['/login', '/cadastro', '/eventos']) }),
  Object.freeze({ id: 'visible_focus', routes: Object.freeze(['/login', '/cadastro', '/eventos']) }),
  Object.freeze({ id: 'screen_reader_landmarks', routes: Object.freeze(['/', '/login', '/cadastro', '/eventos', '/termos-de-uso', '/privacidade']) }),
  Object.freeze({ id: 'screen_reader_forms', routes: Object.freeze(['/login', '/cadastro']) }),
  Object.freeze({ id: 'text_zoom_reflow', routes: Object.freeze(['/', '/login', '/cadastro', '/eventos', '/termos-de-uso', '/privacidade']) }),
  Object.freeze({ id: 'accessible_errors', routes: Object.freeze(['/login', '/cadastro']) }),
]);

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const TESTER_PATTERN = /^[A-Z0-9_-]{3,32}$/u;
const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|email|cpf|cnpj|phone|telefone)/iu;
const SENSITIVE_TEXT = /(bearer\s+|@[a-z0-9.-]+\.[a-z]{2,}|https?:\/\/[^\s]+[?#]|senha\s*[:=]|token\s*[:=]|cookie\s*[:=])/iu;

function fail(message) {
  throw new Error(message);
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}: objeto obrigatório.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label}: campos inválidos; esperados ${expected.join(', ')}.`);
  }
}

function assertNoSensitiveKeys(value, path = 'evidência') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) fail(`${path}: campo sensível não permitido.`);
    assertNoSensitiveKeys(child, `${path}.${key}`);
  }
}

function cleanNote(note, label) {
  if (typeof note !== 'string') fail(`${label}: observação obrigatória.`);
  const normalized = note.replace(/\s+/gu, ' ').trim();
  if (normalized.length < 8 || normalized.length > 240) {
    fail(`${label}: observação deve ter entre 8 e 240 caracteres.`);
  }
  if (SENSITIVE_TEXT.test(normalized) || /[<>]/u.test(normalized)) {
    fail(`${label}: observação contém dado sensível, URL dinâmica ou marcação.`);
  }
  return normalized;
}

function parseUtc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) {
    fail('source.testedAt deve ser timestamp ISO UTC explícito.');
  }
  if (Number.isNaN(Date.parse(value))) fail('source.testedAt inválido.');
  return value;
}

function parseBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('source.baseUrl deve ser URL absoluta válida.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    fail('source.baseUrl deve usar HTTPS, apontar para a raiz e não conter credenciais, consulta ou fragmento.');
  }
  return url.href;
}

function validateEnvironment(environment) {
  exactKeys(environment, ['assistiveTechnology', 'assistiveTechnologyVersion', 'os', 'browser', 'browserVersion'], 'environment');
  if (!['NVDA', 'VoiceOver'].includes(environment.assistiveTechnology)) {
    fail('environment.assistiveTechnology deve ser NVDA ou VoiceOver.');
  }
  for (const key of ['assistiveTechnologyVersion', 'os', 'browser', 'browserVersion']) {
    if (typeof environment[key] !== 'string' || !/^[\p{L}\p{N} ._()+/-]{1,64}$/u.test(environment[key])) {
      fail(`environment.${key} inválido.`);
    }
  }
  return { ...environment };
}

function validateCheck(check, spec) {
  exactKeys(check, ['id', 'status', 'routes', 'observation'], `checks.${spec.id}`);
  if (check.id !== spec.id) fail(`checks: ordem ou id inválido; esperado ${spec.id}.`);
  if (!ALLOWED_STATUS.has(check.status)) fail(`${spec.id}: status inválido.`);
  if (!Array.isArray(check.routes) || JSON.stringify(check.routes) !== JSON.stringify(spec.routes)) {
    fail(`${spec.id}: cobertura de rotas incompleta ou fora de ordem.`);
  }
  return {
    id: check.id,
    status: check.status,
    routes: [...check.routes],
    observation: cleanNote(check.observation, spec.id),
  };
}

export function validateEvidence(input) {
  assertNoSensitiveKeys(input);
  exactKeys(input, ['schemaVersion', 'source', 'tester', 'environment', 'checks'], 'evidência');
  if (input.schemaVersion !== 1) fail('schemaVersion deve ser 1.');

  exactKeys(input.source, ['sha', 'baseUrl', 'testedAt'], 'source');
  if (!SHA_PATTERN.test(input.source.sha)) fail('source.sha deve ser SHA Git completo em minúsculas.');
  const source = {
    sha: input.source.sha,
    baseUrl: parseBaseUrl(input.source.baseUrl),
    testedAt: parseUtc(input.source.testedAt),
  };

  exactKeys(input.tester, ['id'], 'tester');
  if (!TESTER_PATTERN.test(input.tester.id)) {
    fail('tester.id deve ser identificador pseudônimo de 3 a 32 caracteres em A-Z, 0-9, _ ou -.');
  }

  if (!Array.isArray(input.checks) || input.checks.length !== REQUIRED_CHECKS.length) {
    fail(`checks deve conter exatamente ${REQUIRED_CHECKS.length} verificações.`);
  }
  const checks = REQUIRED_CHECKS.map((spec, index) => validateCheck(input.checks[index], spec));
  const summary = {
    pass: checks.filter(({ status }) => status === 'PASS').length,
    fail: checks.filter(({ status }) => status === 'FAIL').length,
    blocked: checks.filter(({ status }) => status === 'BLOCKED').length,
  };
  const result = summary.fail > 0 ? 'HUMAN_EVIDENCE_FAILED'
    : summary.blocked > 0 ? 'HUMAN_EVIDENCE_BLOCKED'
      : 'HUMAN_EVIDENCE_COMPLETE';

  const manifest = {
    schemaVersion: 1,
    gate: 'GATE_1_PUBLIC_ACCESSIBILITY',
    source,
    tester: { id: input.tester.id },
    environment: validateEnvironment(input.environment),
    checks,
    summary,
    result,
    goNoGo: 'NOT_AUTHORIZED',
  };
  serializeEvidence(manifest);
  return manifest;
}

export function serializeEvidence(manifest) {
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  if (Buffer.byteLength(json, 'utf8') > MAX_EVIDENCE_BYTES) {
    fail(`A evidência excedeu ${MAX_EVIDENCE_BYTES} bytes.`);
  }
  return json;
}

export function parseCliArgs(argv) {
  if (argv.length !== 4) fail('Uso: --input arquivo.json --output evidencia.json.');
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!['--input', '--output'].includes(key) || values[key]) fail('Argumentos inválidos ou repetidos.');
    values[key] = argv[index + 1];
  }
  if (!values['--input'] || !values['--output']) fail('Informe --input e --output.');
  const input = resolve(values['--input']);
  const output = resolve(values['--output']);
  if (input === output) fail('Entrada e saída devem ser arquivos diferentes.');
  return { input, output };
}

export async function runCli(argv = process.argv.slice(2)) {
  const paths = parseCliArgs(argv);
  const inputStats = await stat(paths.input);
  if (!inputStats.isFile()) fail('A entrada deve ser um arquivo regular.');
  if (inputStats.size > MAX_EVIDENCE_BYTES) fail('A entrada excedeu o limite permitido.');
  const raw = await readFile(paths.input, 'utf8');
  // Mantém a segunda verificação para falhar de modo seguro se o arquivo mudar
  // entre stat e readFile.
  if (Buffer.byteLength(raw, 'utf8') > MAX_EVIDENCE_BYTES) fail('A entrada excedeu o limite permitido.');
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    fail('A entrada não é JSON válido.');
  }
  const manifest = validateEvidence(input);
  await writeFile(paths.output, serializeEvidence(manifest), { encoding: 'utf8', flag: 'wx' });
  console.log(JSON.stringify({ arquivo: paths.output, sha: manifest.source.sha, result: manifest.result, summary: manifest.summary }));
  if (manifest.result !== 'HUMAN_EVIDENCE_COMPLETE') process.exitCode = 1;
  return manifest;
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Falha ao validar evidência humana.');
    process.exitCode = 2;
  });
}
