import assert from 'node:assert/strict';
import test from 'node:test';
import { code128Modules } from '../lib/code128.ts';

test('o código de barras Code 128 B começa no start B e fecha no stop', () => {
  const modules = code128Modules('HI');
  assert.match(modules, /^211214/u);
  assert.match(modules, /2331112$/u);
  assert.equal(modules.length > 20, true);
});
