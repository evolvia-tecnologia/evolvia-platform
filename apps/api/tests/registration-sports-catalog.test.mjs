import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/registration-forms.service.ts', import.meta.url), 'utf8');

test('catálogo de inscrição inclui campos opcionais de Corrida sem obrigatoriedade sensível', () => {
  for (const code of ['team', 'estimated_pace', 'emergency_contact', 'guardian']) {
    assert.match(source, new RegExp(`code: '${code}'`, 'u'));
  }
  assert.match(source, /code: 'emergency_contact'[\s\S]*?sensitive: true/u);
  assert.match(source, /code: 'guardian'[\s\S]*?sensitive: true/u);
  assert.match(source, /category: 'Corrida e esportes'/u);
  // Sensíveis permanecem opcionais no catálogo (sem required: true no item).
  assert.doesNotMatch(
    source,
    /code: 'emergency_contact'[\s\S]{0,220}?required:\s*true/u,
  );
  assert.doesNotMatch(
    source,
    /code: 'guardian'[\s\S]{0,220}?required:\s*true/u,
  );
});
