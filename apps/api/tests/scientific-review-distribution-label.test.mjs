import assert from 'node:assert/strict';
import test from 'node:test';
import { distributionLabel } from '../dist/scientific-review-distribution.policy.js';

test('títulos científicos preservam comparadores e Unicode na projeção textual', () => {
  for (const title of ['p < 0.05 e temperatura > 37°C', 'Resposta ≥ 10 e dose ≤ 5 μg', 'Expressão <gene> em células']) {
    assert.equal(distributionLabel(title), title);
  }
});

test('limites e caracteres de controle continuam bloqueados', () => {
  for (const title of ['', 'x', 'x'.repeat(181), 'Título\nnovo', 'Título\u0000', 'Título\u007f']) {
    assert.equal(distributionLabel(title), 'Não exibível');
  }
  assert.equal(distributionLabel('  Título   científico  '), 'Título científico');
  assert.equal(distributionLabel('x'.repeat(180)), 'x'.repeat(180));
});
