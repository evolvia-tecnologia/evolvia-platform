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
const { readSportsCatalog, publishedKitAvailabilityLabel } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

const modality = { id: 'run-8k', name: 'Corrida 8 km', distanceKm: 8, kind: 'RUN', capacity: 200 };
const kit = { id: 'shirt-m', label: 'Camiseta M', stock: 12, reserved: 3, delivered: 5 };

test('o saldo publicado explica a lista sem reservar estoque', () => {
  assert.equal(publishedKitAvailabilityLabel(0), 'Sem saldo nesta lista. A inscrição não reserva estoque.');
  assert.equal(publishedKitAvailabilityLabel(1), '1 disponível nesta lista. A inscrição não reserva estoque.');
  assert.equal(publishedKitAvailabilityLabel(4), '4 disponíveis nesta lista. A inscrição não reserva estoque.');
  assert.match(publishedKitAvailabilityLabel(-1), /não reserva estoque/u);
});

test('a página da corrida mostra o kit publicado e esconde a contabilidade interna', () => {
  const landing = readFileSync(new URL('../components/public-sports-landing.tsx', import.meta.url), 'utf8');
  assert.match(landing, /catalog\.kits/u);
  assert.match(landing, /publishedKitAvailabilityLabel\(kit\.available\)/u);
  assert.doesNotMatch(landing, /kit\.(stock|reserved|delivered)/u);
});

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
