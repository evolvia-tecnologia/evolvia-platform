import assert from 'node:assert/strict';
import test from 'node:test';
import { isRunningProfile, sportsStarterModalities, SPORTS_PUBLIC_SECTIONS, validateSportsModalities } from '../lib/sports-public-profile.ts';

test('somente Corrida habilita experiência esportiva específica', () => {
  assert.equal(isRunningProfile('Corrida'), true);
  assert.equal(isRunningProfile('Feira ou exposição'), false);
  assert.equal(isRunningProfile('Evento esportivo ou torneio'), false);
});

test('página esportiva oferece seções distintas sem duplicações', () => {
  assert.equal(new Set(SPORTS_PUBLIC_SECTIONS.map((section) => section.id)).size, SPORTS_PUBLIC_SECTIONS.length);
  assert.ok(SPORTS_PUBLIC_SECTIONS.some((section) => section.id === 'retirada'));
});

test('modalidades padrão são exemplos válidos e independentes', () => {
  const first = sportsStarterModalities();
  assert.deepEqual(validateSportsModalities(first), []);
  first[0].name = 'Alterado';
  assert.equal(sportsStarterModalities()[0].name, 'Caminhada 4 km');
});

test('validação rejeita duplicidade, distâncias e capacidade inválidas', () => {
  assert.ok(validateSportsModalities([]).length > 0);
  assert.ok(validateSportsModalities([{ id: 'run', name: 'Corrida', kind: 'RUN', distanceKm: 4 }, { id: 'run', name: 'Corrida', kind: 'RUN', distanceKm: 8 }]).length > 0);
  assert.ok(validateSportsModalities([{ id: 'x', name: 'Corrida', kind: 'RUN', distanceKm: -1 }]).length > 0);
  assert.ok(validateSportsModalities([{ id: 'x', name: 'Corrida', kind: 'RUN', distanceKm: 4, capacity: 0 }]).length > 0);
  assert.deepEqual(validateSportsModalities([{ id: 'x', name: 'Corrida', kind: 'RUN', distanceKm: 4, capacity: null }]), []);
  assert.ok(validateSportsModalities([{ id: 'x', name: 'Corrida', kind: 'RUN', distanceKm: Number.NaN }]).length > 0);
  for (const invalidKind of [['RUN'], { value: 'RUN' }, 1, null]) {
    assert.ok(validateSportsModalities([{ id: 'x', name: 'Corrida', kind: invalidKind, distanceKm: 4 }]).some((error) => error.includes('tipo inválido')));
  }
});
