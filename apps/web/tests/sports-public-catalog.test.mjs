import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const bundled = ['sports-public-profile', 'sports-athlete-and-kits', 'sports-public-catalog']
  .map((name) => readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8').replace(/^import .*$/gmu, ''))
  .join('\n');
const javascript = ts.transpileModule(bundled, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { readSportsCatalog } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

const modality = { id: 'run-8k', name: 'Corrida 8 km', distanceKm: 8, kind: 'RUN', capacity: 200 };
const kit = { id: 'shirt-m', label: 'Camiseta M', stock: 12, reserved: 3, delivered: 5 };

test('modalidade e kit salvos aparecem sem reservar estoque', () => {
  const catalog = readSportsCatalog([{ content: { modalities: [modality], kits: [kit] } }]);
  assert.equal(catalog.modalities[0].name, 'Corrida 8 km');
  assert.equal(catalog.kits[0].available, 4);
  assert.equal(kit.reserved, 3);
});

test('capacidade nula continua válida e conteúdo inválido não vira oferta', () => {
  const catalog = readSportsCatalog([
    { content: { modalities: [{ ...modality, capacity: null }] } },
    { content: { modalities: [{ id: 'run-8k', name: 'Corrida', kind: 'RUN', distanceKm: -1 }] } },
    { content: { kits: [{ id: 'shirt-m', label: 'M', stock: 1, reserved: 1, delivered: 1 }] } },
    { content: { modalities: [modality], kits: [kit] } },
    { content: { modalities: [{ ...modality, name: 'Repetida' }], kits: [{ ...kit, label: 'Repetida' }] } },
  ]);
  assert.equal(catalog.modalities.length, 1);
  assert.equal(catalog.modalities[0].capacity, null);
  assert.equal(catalog.kits.length, 1);
  assert.equal(catalog.kits[0].available, 4);
});
