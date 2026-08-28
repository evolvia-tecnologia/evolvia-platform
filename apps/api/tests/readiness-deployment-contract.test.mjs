import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [compose, workflow, controller] = await Promise.all([
  readFile(new URL('../../../docker-compose.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../../.github/workflows/validacao-v02.yml', import.meta.url), 'utf8'),
  readFile(new URL('../src/health.controller.ts', import.meta.url), 'utf8'),
]);

test('container API só fica saudável quando PostgreSQL está pronto', () => {
  assert.match(controller, /@Get\('ready'\)/u);
  assert.match(controller, /SELECT 1/u);
  assert.match(controller, /dependencies: \{ database: 'ok' \}/u);
  assert.match(compose, /127\.0\.0\.1:4000\/health\/ready/u);
  assert.doesNotMatch(compose, /127\.0\.0\.1:4000\/health >\/dev\/null/u);
});

test('CI e deploy comprovam o mesmo contrato de readiness', () => {
  assert.match(workflow, /127\.0\.0\.1:4000\/health\/ready/u);
  assert.match(workflow, /\$HOMOLOGATION_URL\/api\/health\/ready/u);
  assert.match(workflow, /Readiness público comprovado: API e PostgreSQL prontos/u);
  assert.match(workflow, /Readiness público ausente ou divergente/u);
  assert.match(workflow, /"database"\[\[:space:\]\]\*:\[\[:space:\]\]\*"ok"/u);
});
