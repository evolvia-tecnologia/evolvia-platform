import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_EXECUTOR_ROLES,
  EXAMPLE_KIND,
  EVIDENCE_KIND,
  EXIT_BLOCKS_GO,
  EXIT_INVALID,
  EXIT_OK,
  REQUIRED_ROUTES,
  REQUIRED_SCENARIOS,
  SCHEMA_ID,
  SCHEMA_VERSION,
  formatReport,
  parseEvidenceJson,
  requiredPairs,
  runCli,
  validateEvidence,
  validateEvidenceFile,
} from './validate-public-accessibility-manual-evidence.mjs';

const SCRIPT = fileURLToPath(new URL('./validate-public-accessibility-manual-evidence.mjs', import.meta.url));
const EXAMPLE = fileURLToPath(new URL('../docs/quality/examples/gate1-manual-accessibility.example.json', import.meta.url));

function completeEntries(result = 'PASS', extra = {}) {
  return requiredPairs().map(({ route, scenario }) => ({
    route,
    scenario,
    result,
    observation: `Observação sanitizada de ${scenario} em ${route}.`,
    ...extra,
  }));
}

function validEvidence(overrides = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: EVIDENCE_KIND,
    sourceSha: '4844373c89db322655155611baccad7f949dbb97',
    recordedAt: '2026-09-03T12:00:00Z',
    executorRole: 'revisor-humano',
    platform: {
      os: 'Linux',
      browser: { name: 'Firefox', version: '128.0' },
      assistiveTechnology: { name: 'NVDA', version: '2024.4' },
    },
    entries: completeEntries(),
    ...overrides,
  };
}

function spawnScript(args, timeoutMs = 8_000) {
  return new Promise((resolveSpawn) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveSpawn({ code, stdout, stderr });
    });
  });
}

test('matriz completa só com PASS é aceita e não declara Go', () => {
  const result = validateEvidence(validEvidence());
  assert.equal(result.ok, true);
  assert.equal(result.exitCode, EXIT_OK);
  assert.equal(result.blocksGo, false);
  assert.equal(result.counts.pass, 35);
  assert.equal(result.counts.missing, 0);
  assert.match(formatReport(result), /não declara Go\/No-Go/u);
  assert.match(formatReport(result), /não executa deploy/u);
  assert.doesNotMatch(formatReport(result), /\bGo aprovado\b/u);
});

test('ausência de cenário não é aprovação', () => {
  const evidence = validEvidence();
  evidence.entries = evidence.entries.filter((entry) => !(
    entry.route === '/login' && entry.scenario === 'leitor-de-tela'
  ));
  const result = validateEvidence(evidence);
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, EXIT_INVALID);
  assert.equal(result.counts.missing, 1);
  assert.match(formatReport(result), /Cenário ausente: falta leitor-de-tela em \/login/u);
  assert.match(formatReport(result), /Ausência não aprova/u);
});

test('duplicidade da mesma rota e cenário é recusada', () => {
  const evidence = validEvidence();
  evidence.entries.push({
    route: '/',
    scenario: 'teclado-foco',
    result: 'PASS',
    observation: 'Segunda observação sanitizada da home.',
  });
  const result = validateEvidence(evidence);
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, EXIT_INVALID);
  assert.match(formatReport(result), /Duplicidade: a rota \/ no cenário teclado-foco/u);
});

test('SHA inválido é recusado', () => {
  const result = validateEvidence(validEvidence({ sourceSha: 'develop' }));
  assert.equal(result.ok, false);
  assert.match(formatReport(result), /SHA inválido/u);
});

test('PASS sem executor ou data é recusado', () => {
  const semExecutor = validateEvidence(validEvidence({ executorRole: '' }));
  assert.match(formatReport(semExecutor), /PASS sem executor/u);
  assert.equal(semExecutor.ok, false);

  const semData = validateEvidence(validEvidence({ recordedAt: '2026-09-03' }));
  assert.match(formatReport(semData), /PASS sem data/u);
  assert.equal(semData.ok, false);
});

test('executor precisa ser papel, nunca pessoa ou e-mail', () => {
  const result = validateEvidence(validEvidence({ executorRole: 'Maria Silva' }));
  assert.equal(result.ok, false);
  assert.match(formatReport(result), /executorRole inválido/u);
  assert.ok(ALLOWED_EXECUTOR_ROLES.includes('revisor-humano'));
});

test('e-mail, token e cookie na observação são recusados', () => {
  const withEmail = validEvidence();
  withEmail.entries[0] = {
    ...withEmail.entries[0],
    observation: 'Contato do evento: dono@exemplo.com',
  };
  const emailResult = validateEvidence(withEmail);
  assert.equal(emailResult.ok, false);
  assert.match(formatReport(emailResult), /Conteúdo sensível recusado \(e-mail\)/u);

  const withToken = validEvidence();
  withToken.entries[1] = {
    ...withToken.entries[1],
    observation: 'Colei Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaa.bbbb por engano',
  };
  const tokenResult = validateEvidence(withToken);
  assert.equal(tokenResult.ok, false);
  assert.match(formatReport(tokenResult), /Conteúdo sensível recusado \(token\)/u);

  const withCookie = validEvidence();
  withCookie.entries[2] = {
    ...withCookie.entries[2],
    observation: 'Set-Cookie session=abc123',
  };
  const cookieResult = validateEvidence(withCookie);
  assert.equal(cookieResult.ok, false);
  assert.match(formatReport(cookieResult), /Conteúdo sensível recusado \(cookie\)/u);
});

test('BLOCKED sem causa ou próxima ação é recusado', () => {
  const evidence = validEvidence();
  evidence.entries = evidence.entries.map((entry) => (
    entry.route === '/privacidade' && entry.scenario === 'zoom-reflow'
      ? { ...entry, result: 'BLOCKED', observation: 'Zoom indisponível no ambiente de prova.' }
      : entry
  ));
  const semCausa = validateEvidence(evidence);
  assert.match(formatReport(semCausa), /BLOCKED sem causa/u);
  assert.match(formatReport(semCausa), /BLOCKED sem próxima ação/u);

  evidence.entries = evidence.entries.map((entry) => (
    entry.route === '/privacidade' && entry.scenario === 'zoom-reflow'
      ? {
        ...entry,
        result: 'BLOCKED',
        observation: 'Zoom indisponível no ambiente de prova.',
        blockedCause: 'Máquina sem controle de zoom do navegador.',
        nextAction: 'Repetir o cenário em estação com zoom 200%.',
      }
      : entry
  ));
  const completo = validateEvidence(evidence);
  assert.equal(completo.ok, false);
  assert.equal(completo.exitCode, EXIT_BLOCKS_GO);
  assert.match(formatReport(completo), /FAIL ou BLOCKED impede declarar Go/u);
});

test('qualquer FAIL impede declarar Go mesmo com matriz completa', () => {
  const evidence = validEvidence();
  evidence.entries = evidence.entries.map((entry) => (
    entry.route === '/cadastro' && entry.scenario === 'mensagens'
      ? { ...entry, result: 'FAIL', observation: 'Mensagem de erro não descreve o campo.' }
      : entry
  ));
  const result = validateEvidence(evidence);
  assert.equal(result.ok, false);
  assert.equal(result.blocksGo, true);
  assert.equal(result.exitCode, EXIT_BLOCKS_GO);
  assert.equal(result.counts.fail, 1);
  assert.match(formatReport(result), /FAIL ou BLOCKED impede declarar Go/u);
});

test('rota de evento real e chave extra são recusadas', () => {
  const evidence = validEvidence();
  evidence.entries = evidence.entries.map((entry) => (
    entry.route === '/evento/[slug]'
      ? { ...entry, route: '/evento/congresso-aberto' }
      : entry
  ));
  evidence.reviewerName = 'Ana';
  const result = validateEvidence(evidence);
  assert.match(formatReport(result), /Chave de topo não permitida: reviewerName/u);
  assert.match(formatReport(result), /rota não permitida \(\/evento\/congresso-aberto\)/u);
  assert.match(formatReport(result), /Cenário ausente: falta teclado-foco em \/evento\/\[slug\]/u);
});

test('objeto vazio ou JSON inválido não fabricam aprovação', () => {
  const empty = validateEvidence({});
  assert.equal(empty.ok, false);
  assert.equal(empty.counts.pass, 0);
  assert.match(formatReport(empty), /ausência de item não é aprovação|rejeitada/u);
  assert.throws(() => parseEvidenceJson('{'), /JSON de evidência inválido/u);
  assert.throws(() => parseEvidenceJson(''), /vazio/u);
});

test('exemplo sanitizado existe, é fictício e não pode ser usado como homologação', async () => {
  const raw = await readFile(EXAMPLE, 'utf8');
  const example = parseEvidenceJson(raw);
  assert.equal(example.kind, EXAMPLE_KIND);
  assert.equal(example.schemaVersion, SCHEMA_VERSION);
  assert.equal(example.sourceSha, 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
  assert.equal(example.recordedAt, '1970-01-01T00:00:00.000Z');
  assert.deepEqual(new Set(example.entries.map((item) => item.route)), new Set(REQUIRED_ROUTES));
  assert.deepEqual(new Set(example.entries.map((item) => item.scenario)), new Set(REQUIRED_SCENARIOS));
  assert.equal(example.entries.length, requiredPairs().length);
  assert.ok(example.entries.some((item) => item.result === 'FAIL'));
  assert.ok(example.entries.some((item) => item.result === 'BLOCKED'));
  assert.ok(example.entries.every((item) => String(item.observation).includes('EXEMPLO FICTÍCIO')));
  assert.doesNotMatch(raw, /@|bearer |ghp_|set-cookie|cookie=/iu);

  const result = await validateEvidenceFile(EXAMPLE);
  assert.equal(result.isExample, true);
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, EXIT_INVALID);
  assert.match(formatReport(result), /não constitui homologação real/u);
  assert.match(formatReport(result), new RegExp(SCHEMA_ID, 'u'));
});

test('CLI recusa arquivo ausente e imprime português', async () => {
  const captured = { log: [], error: [] };
  const io = {
    log: (message) => captured.log.push(message),
    error: (message) => captured.error.push(message),
  };
  const missingPath = await runCli([], io);
  assert.equal(missingPath, EXIT_INVALID);
  assert.match(captured.error.join('\n'), /Informe o JSON de evidência manual/u);

  const invalidFile = await runCli(['/tmp/evidencia-manual-inexistente.json'], io);
  assert.equal(invalidFile, EXIT_INVALID);
  assert.match(captured.error.join('\n'), /Não foi possível ler a evidência/u);
});

test('CLI devolve códigos de saída verificáveis', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gate1-manual-a11y-'));
  const okFile = join(dir, 'ok.json');
  const failFile = join(dir, 'fail.json');
  const badFile = join(dir, 'bad.json');

  await writeFile(okFile, `${JSON.stringify(validEvidence(), null, 2)}\n`, 'utf8');
  const failed = validEvidence();
  failed.entries[0] = { ...failed.entries[0], result: 'FAIL', observation: 'Foco invisível no skip link.' };
  await writeFile(failFile, `${JSON.stringify(failed, null, 2)}\n`, 'utf8');
  await writeFile(badFile, `${JSON.stringify(validEvidence({ sourceSha: 'abc' }), null, 2)}\n`, 'utf8');

  const okRun = await spawnScript([okFile]);
  assert.equal(okRun.code, EXIT_OK);
  assert.match(okRun.stdout, /Evidência completa sem FAIL ou BLOCKED/u);
  assert.doesNotMatch(`${okRun.stdout}\n${okRun.stderr}`, /\bGo aprovado\b/u);

  const failRun = await spawnScript([failFile]);
  assert.equal(failRun.code, EXIT_BLOCKS_GO);
  assert.match(failRun.stderr, /FAIL ou BLOCKED impede declarar Go/u);

  const badRun = await spawnScript([badFile]);
  assert.equal(badRun.code, EXIT_INVALID);
  assert.match(badRun.stderr, /SHA inválido/u);

  const exampleRun = await spawnScript([EXAMPLE]);
  assert.equal(exampleRun.code, EXIT_INVALID);
  assert.match(exampleRun.stderr, /não constitui homologação real/u);
});
