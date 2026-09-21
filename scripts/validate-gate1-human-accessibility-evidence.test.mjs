import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  MAX_EVIDENCE_BYTES,
  REQUIRED_CHECKS,
  parseCliArgs,
  runCli,
  serializeEvidence,
  validateEvidence,
} from './validate-gate1-human-accessibility-evidence.mjs';

function validInput(status = 'PASS') {
  return {
    schemaVersion: 1,
    source: {
      sha: 'e787442a2488f2a1d0b9b6ca8dfc3432459faebd',
      baseUrl: 'https://homologacao.evolviatecnologia.com/',
      testedAt: '2026-09-21T11:00:00.000Z',
    },
    tester: { id: 'QA_GATE1_01' },
    environment: {
      assistiveTechnology: 'NVDA',
      assistiveTechnologyVersion: '2026.2',
      os: 'Windows 11',
      browser: 'Chrome',
      browserVersion: '140.0',
    },
    checks: REQUIRED_CHECKS.map((spec) => ({
      id: spec.id,
      status,
      routes: [...spec.routes],
      observation: 'Jornada executada integralmente sem barreira observada.',
    })),
  };
}

test('evidência completa permanece humana e não autoriza Go/No-Go', () => {
  const manifest = validateEvidence(validInput());
  assert.equal(manifest.result, 'HUMAN_EVIDENCE_COMPLETE');
  assert.equal(manifest.goNoGo, 'NOT_AUTHORIZED');
  assert.deepEqual(manifest.summary, { pass: 6, fail: 0, blocked: 0 });
  assert.equal(manifest.checks.length, REQUIRED_CHECKS.length);
});

test('falha e bloqueio têm precedência conservadora', () => {
  const blocked = validInput();
  blocked.checks[1].status = 'BLOCKED';
  assert.equal(validateEvidence(blocked).result, 'HUMAN_EVIDENCE_BLOCKED');

  const failed = validInput();
  failed.checks[1].status = 'BLOCKED';
  failed.checks[2].status = 'FAIL';
  assert.equal(validateEvidence(failed).result, 'HUMAN_EVIDENCE_FAILED');
});

test('recusa cobertura parcial, duplicada ou fora de ordem', () => {
  const missingRoute = validInput();
  missingRoute.checks[0].routes.pop();
  assert.throws(() => validateEvidence(missingRoute), /cobertura de rotas incompleta/u);

  const reordered = validInput();
  [reordered.checks[0], reordered.checks[1]] = [reordered.checks[1], reordered.checks[0]];
  assert.throws(() => validateEvidence(reordered), /ordem ou id inválido/u);
});

test('recusa origem insegura, SHA parcial e timestamp não UTC', () => {
  const http = validInput();
  http.source.baseUrl = 'http://homologacao.evolviatecnologia.com/';
  assert.throws(() => validateEvidence(http), /deve usar HTTPS/u);

  const partialSha = validInput();
  partialSha.source.sha = 'e787442a';
  assert.throws(() => validateEvidence(partialSha), /SHA Git completo/u);

  const localTime = validInput();
  localTime.source.testedAt = '2026-09-21 08:00:00';
  assert.throws(() => validateEvidence(localTime), /ISO UTC/u);
});

test('recusa PII, token, marcação e campos extras', () => {
  const email = validInput();
  email.checks[0].observation = 'Falha enviada para pessoa@example.com.';
  assert.throws(() => validateEvidence(email), /dado sensível/u);

  const secretKey = validInput();
  secretKey.environment.token = 'segredo';
  assert.throws(() => validateEvidence(secretKey), /campo sensível/u);

  const markup = validInput();
  markup.checks[0].observation = '<script>alerta observado</script>';
  assert.throws(() => validateEvidence(markup), /marcação/u);
});

test('exige pseudônimo e ambiente de tecnologia assistiva permitido', () => {
  const named = validInput();
  named.tester.id = 'Pessoa Testadora';
  assert.throws(() => validateEvidence(named), /identificador pseudônimo/u);

  const unsupported = validInput();
  unsupported.environment.assistiveTechnology = 'Leitor desconhecido';
  assert.throws(() => validateEvidence(unsupported), /NVDA ou VoiceOver/u);
});

test('serialização é determinística e limitada', () => {
  const manifest = validateEvidence(validInput());
  assert.equal(serializeEvidence(manifest), serializeEvidence(manifest));
  assert.throws(
    () => serializeEvidence({ value: 'x'.repeat(MAX_EVIDENCE_BYTES) }),
    /evidência excedeu/u,
  );
});

test('contrato obrigatório é profundamente imutável', () => {
  assert.ok(Object.isFrozen(REQUIRED_CHECKS));
  for (const check of REQUIRED_CHECKS) {
    assert.ok(Object.isFrozen(check));
    assert.ok(Object.isFrozen(check.routes));
  }
  assert.throws(() => REQUIRED_CHECKS[0].routes.push('/injetada'), TypeError);
});

test('CLI recusa arquivo acima do limite antes de processar JSON', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'evolvia-gate1-'));
  const input = join(directory, 'entrada.json');
  const output = join(directory, 'saida.json');
  try {
    await writeFile(input, 'x'.repeat(MAX_EVIDENCE_BYTES + 1), 'utf8');
    await assert.rejects(
      runCli(['--input', input, '--output', output]),
      /entrada excedeu o limite permitido/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('CLI exige entrada e saída distintas', () => {
  const paths = parseCliArgs(['--input', 'entrada.json', '--output', 'saida.json']);
  assert.notEqual(paths.input, paths.output);
  assert.throws(() => parseCliArgs(['--input', 'x.json']), /Uso/u);
  assert.throws(() => parseCliArgs(['--input', 'x.json', '--output', 'x.json']), /diferentes/u);
});
