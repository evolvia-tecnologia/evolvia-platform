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

test('gera link público curto com sigla e código sem dados do organizador', async () => {
  const { eventPublicSlug } = await import('../dist/slug.js');
  assert.equal(eventPublicSlug('Congresso Brasileiro de Inovação', 'a1b2c3d4e5f6'), 'cbi-a1b2c3d4e5f6');
  assert.equal(eventPublicSlug('  Saúde  ', '012345abcdef'), 'saud-012345abcdef');
  assert.equal(eventPublicSlug('!!!', '012345abcdef'), 'evt-012345abcdef');
  assert.throws(() => eventPublicSlug('Evento', '../admin'), /Código público inválido/u);
});
