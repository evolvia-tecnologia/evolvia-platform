import assert from 'node:assert/strict';
import test from 'node:test';
import { slugify } from '../dist/slug.js';

test('normaliza acentos e espaços', () => {
  assert.equal(slugify('Congresso Brasileiro de Inovação'), 'congresso-brasileiro-de-inovacao');
});

test('remove caracteres especiais e limita o tamanho', () => {
  assert.equal(slugify('  Evolvia & Eventos 2026!  '), 'evolvia-eventos-2026');
  assert.ok(slugify('a'.repeat(100)).length <= 60);
});
