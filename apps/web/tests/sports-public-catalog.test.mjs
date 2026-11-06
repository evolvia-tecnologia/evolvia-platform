import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/u.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { readSportsCatalog } = await import('../lib/sports-public-catalog.ts');

const modality = { id: 'run-8k', name: 'Corrida 8 km', distanceKm: 8, kind: 'RUN', capacity: 200 };
const kit = { id: 'shirt-m', label: 'Camiseta M', stock: 12, reserved: 3, delivered: 5 };

test('modalidade e kit salvos aparecem sem reservar estoque', () => {
  const catalog = readSportsCatalog([{ content: { modalities: [modality], kits: [kit] } }]);
  assert.equal(catalog.modalities[0].name, 'Corrida 8 km');
  assert.equal(catalog.kits[0].available, 4);
  assert.equal(kit.reserved, 3);
});

test('conteúdo inválido não vira oferta e a duplicata fica de fora', () => {
  const catalog = readSportsCatalog([
    { content: { modalities: [{ id: 'run-8k', name: 'Corrida', kind: 'RUN', distanceKm: -1 }] } },
    { content: { kits: [{ id: 'shirt-m', label: 'M', stock: 1, reserved: 1, delivered: 1 }] } },
    { content: 'texto solto' },
    { content: { modalities: [modality], kits: [kit] } },
    { content: { modalities: [{ ...modality, name: 'Repetida' }], kits: [{ ...kit, label: 'Repetida' }] } },
  ]);
  assert.equal(catalog.modalities.length, 1);
  assert.equal(catalog.modalities[0].name, 'Corrida 8 km');
  assert.equal(catalog.kits.length, 1);
  assert.equal(catalog.kits[0].available, 4);
});
