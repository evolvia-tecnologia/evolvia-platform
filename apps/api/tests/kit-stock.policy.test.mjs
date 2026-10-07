import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeShirtSizeField } from '../dist/kit-form.js';
import { SHIRT_SIZE_FIELD_CODE, normalizeKitConfig } from '../dist/kit-stock.policy.js';

test('aceita kit com tamanhos únicos e recusa estoque inválido', () => {
  const kit = normalizeKitConfig({
    name: 'Kit do corredor',
    shirtsEnabled: true,
    sizes: [
      { label: ' P ', stockQuantity: 10 },
      { label: 'M', stockQuantity: 0 },
    ],
  });
  assert.equal(kit.name, 'Kit do corredor');
  assert.deepEqual(kit.sizes.map((size) => size.label), ['P', 'M']);
  assert.throws(() => normalizeKitConfig({ name: 'Kit', shirtsEnabled: true, sizes: [] }), /ao menos um tamanho/);
  assert.throws(() => normalizeKitConfig({
    name: 'Kit',
    shirtsEnabled: true,
    sizes: [{ label: 'P', stockQuantity: 1 }, { label: 'p', stockQuantity: 1 }],
  }), /não podem se repetir/);
  assert.throws(() => normalizeKitConfig({
    name: 'Kit',
    shirtsEnabled: true,
    sizes: [{ label: 'P', stockQuantity: -1 }],
  }), /estoque/);
});

test('a ficha reutiliza um SELECT e a preferência não entra no estoque', () => {
  const enabled = mergeShirtSizeField([{ code: 'full_name', type: 'TEXT' }], [{ id: 'size-p', label: 'P' }], true);
  const shirt = enabled.find((field) => field.code === SHIRT_SIZE_FIELD_CODE);
  assert.equal(shirt.type, 'SELECT');
  assert.equal(shirt.required, false);
  assert.deepEqual(shirt.options, [{ id: 'size-p', label: 'P' }]);
  assert.match(String(shirt.help), /Não reserva estoque/);

  const disabled = mergeShirtSizeField(enabled, [], false);
  assert.equal(disabled.find((field) => field.code === SHIRT_SIZE_FIELD_CODE).enabled, false);
  assert.equal(disabled.some((field) => field.code === 'full_name'), true);
});
