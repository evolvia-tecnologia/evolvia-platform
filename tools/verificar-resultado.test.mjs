#!/usr/bin/env node
// Regression tests for the process-level Playwright JSON verdict guard.
// Run: node --test tools/verificar-resultado.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const guard = new URL('./verificar-resultado.mjs', import.meta.url);
function verdict(report) {
  const dir = mkdtempSync(join(tmpdir(), 'evolvia-guard-'));
  try {
    const path = join(dir, 'resultados.json');
    writeFileSync(path, JSON.stringify(report));
    return spawnSync(process.execPath, [guard.pathname, path], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
function report(status = 'passed', title = 'fluxo @gate-consentimento') {
  return {
    suites: [{ title: 'inscricoes', specs: [{ title, tests: [{
      projectName: 'chromium', results: [{ status }],
    }] }] }],
    errors: [], stats: { unexpected: 0, flaky: 0 },
  };
}
test('aceita somente execucao real bem-sucedida', () => {
  const result = verdict(report());
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
test('reprova SKIP de gate obrigatorio', () => {
  const result = verdict(report('skipped'));
  assert.equal(result.status, 1);
  assert.match(result.stdout, /GATE OBRIGATORIO/);
});
test('reprova teste funcional falho, inclusive impressao ilegivel', () => {
  const result = verdict(report('failed', 'impressao ilegivel @gate-etiqueta'));
  assert.equal(result.status, 1);
  assert.match(result.stdout, /falharam na execucao/);
});
test('reprova suite vazia, sem falso verde', () => {
  const result = verdict({ suites: [], errors: [] });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /NENHUM caso executado/);
});
test('reprova erro global mesmo com teste passando', () => {
  const input = report();
  input.errors.push({ message: 'fixture indisponivel' });
  const result = verdict(input);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /erro\(s\) globais/);
});
test('reprova flakiness reportada mesmo com ultimo retry verde', () => {
  const input = report();
  input.stats.flaky = 1;
  const result = verdict(input);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /flaky=1/);
});

test('reprova relatorio inteiramente SKIP mesmo fora dos gates obrigatorios', () => {
  const result = verdict(report('skipped', 'cenario opcional sem gate'));
  assert.equal(result.status, 1);
  assert.match(result.stdout, /NENHUM caso passou/);
});

test('reprova SKIP quando tag obrigatoria esta em suite ancestral', () => {
  const input = report('skipped', 'cenario sem tag local');
  input.suites = [{ title: 'inscricoes @gate-consentimento', suites: input.suites }];
  const result = verdict(input);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /GATE OBRIGATORIO/);
});

test('reprova retry com falha anterior mesmo quando stats.flaky esta zerado', () => {
  const input = report();
  input.suites[0].specs[0].tests[0].results = [
    { status: 'failed' },
    { status: 'passed' },
  ];
  const result = verdict(input);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /falha em tentativa anterior/);
});

test('nao confunde prefixo de tag com gate obrigatorio', () => {
  const input = report('passed', 'jornada obrigatoria real @gate-consentimento');
  input.suites[0].specs.push({
    title: 'cenario opcional @gate-consentimento-extra',
    tests: [{ projectName: 'chromium', results: [{ status: 'skipped' }] }],
  });
  const result = verdict(input);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('reprova SKIP com tag exata e pontuacao separada', () => {
  const input = report('skipped', 'cenario @gate-etiqueta outro');
  const result = verdict(input);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /GATE OBRIGATORIO/);
});
