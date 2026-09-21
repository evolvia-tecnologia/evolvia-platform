import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REQUIRED_CHECKS,
  REQUIRED_ROUTES,
  validateGate1HumanEvidence,
} from './validate-gate1-human-accessibility-evidence.mjs';

function passingAttempt(overrides = {}) {
  return {
    commitSha: 'a'.repeat(40),
    testedAtUtc: '2026-09-21T12:00:00Z',
    environmentUrl: 'https://homologacao.evolviatecnologia.com/',
    testerRole: 'accessibility-reviewer',
    operatingSystem: 'Windows 11',
    browser: 'Chrome 152',
    assistiveTechnology: { name: 'NVDA', version: '2026.2' },
    routes: [...REQUIRED_ROUTES],
    checks: Object.fromEntries(REQUIRED_CHECKS.map((check) => [check, true])),
    notes: [],
    ...overrides,
  };
}

test('estado pendente exige bloqueio explícito e não fabrica tentativa humana', () => {
  const evidence = {
    schemaVersion: 1,
    gate: 'gate-1',
    status: 'PENDING',
    blockers: ['Validação humana ainda não executada.'],
    attempts: [],
  };
  assert.deepEqual(validateGate1HumanEvidence(evidence), []);
});

test('estado aprovado exige SHA, ambiente canônico, tecnologia assistiva e matriz completa', () => {
  const evidence = {
    schemaVersion: 1,
    gate: 'gate-1',
    status: 'PASSED',
    blockers: [],
    attempts: [passingAttempt()],
  };
  assert.deepEqual(validateGate1HumanEvidence(evidence), []);
});

test('aprovação falsa sem tentativa é rejeitada', () => {
  const failures = validateGate1HumanEvidence({
    schemaVersion: 1,
    gate: 'gate-1',
    status: 'PASSED',
    blockers: [],
    attempts: [],
  });
  assert.ok(failures.includes('PASSED exige ao menos uma tentativa humana.'));
});

test('rota ausente, check falso e domínio não canônico impedem aprovação', () => {
  const checks = Object.fromEntries(REQUIRED_CHECKS.map((check) => [check, true]));
  checks.statusAnnouncements = false;
  const failures = validateGate1HumanEvidence({
    schemaVersion: 1,
    gate: 'gate-1',
    status: 'PASSED',
    blockers: [],
    attempts: [passingAttempt({
      environmentUrl: 'https://dev.evolviatecnologia.com/',
      routes: REQUIRED_ROUTES.slice(1),
      checks,
    })],
  });
  assert.ok(failures.some((failure) => failure.includes('homologação canônica')));
  assert.ok(failures.some((failure) => failure.includes('matriz pública obrigatória')));
  assert.ok(failures.includes('PASSED exige attempts[0].checks.statusAnnouncements=true.'));
});

test('campos desconhecidos de check falham fechado', () => {
  const attempt = passingAttempt();
  attempt.checks.syntheticScore = true;
  const failures = validateGate1HumanEvidence({
    schemaVersion: 1,
    gate: 'gate-1',
    status: 'FAILED',
    blockers: ['Campo desconhecido.'],
    attempts: [attempt],
  });
  assert.ok(failures.some((failure) => failure.includes('campos desconhecidos: syntheticScore')));
});

test('evidência não grava identidade pessoal do avaliador', () => {
  const failures = validateGate1HumanEvidence({
    schemaVersion: 1,
    gate: 'gate-1',
    status: 'FAILED',
    blockers: ['Ajustar anúncio de status.'],
    attempts: [passingAttempt({
      testerRole: 'Pessoa Avaliadora',
      notes: ['Contato: avaliador@example.com'],
    })],
  });
  assert.ok(failures.some((failure) => failure.includes('somente o papel')));
  assert.ok(failures.some((failure) => failure.includes('não pode conter e-mail')));
});

test('blockers ausente retorna falhas estruturadas sem lançar exceção', () => {
  const failures = validateGate1HumanEvidence({
    schemaVersion: 1,
    gate: 'gate-1',
    status: 'PENDING',
    attempts: [],
  });
  assert.ok(failures.includes('blockers deve ser uma lista de textos não vazios.'));
  assert.ok(failures.includes('PENDING exige ao menos um bloqueio explícito.'));
});
