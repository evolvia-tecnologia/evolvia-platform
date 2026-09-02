import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import {
  CHOICE_FIELD_TYPES,
  createStableOptionId,
  isChoiceFieldType,
  normalizeOptionLabel,
  REGISTRATION_OPTION_CONSTRAINTS,
  validateChoiceOptions,
} from '../dist/registration-form-options.js';

function reject(fn, message) {
  assert.throws(fn, (error) => error instanceof BadRequestException && String(error.message) === message);
}

test('limites canônicos de opções ficam entre 1 e 50', () => {
  assert.equal(REGISTRATION_OPTION_CONSTRAINTS.minCount, 1);
  assert.equal(REGISTRATION_OPTION_CONSTRAINTS.maxCount, 50);
  assert.deepEqual([...CHOICE_FIELD_TYPES], ['SELECT', 'RADIO', 'CHECKBOX']);
  assert.equal(isChoiceFieldType('RADIO'), true);
  assert.equal(isChoiceFieldType('TEXT'), false);
});

test('gera identificador opaco e estável sem depender da posição', () => {
  const seen = new Set();
  for (let index = 0; index < 8; index += 1) {
    const id = createStableOptionId();
    assert.match(id, /^opt_[a-f0-9]{24}$/u);
    assert.doesNotMatch(id, /option-\d/u);
    assert.equal(seen.has(id), false);
    seen.add(id);
  }
});

test('preserva o identificador ao validar rename e reorder', () => {
  const renamed = validateChoiceOptions([
    { id: 'opt_stay', label: 'Nome novo' },
    { id: 'opt_keep', label: 'Outra' },
  ]);
  assert.deepEqual(renamed.map((option) => option.id), ['opt_stay', 'opt_keep']);
  assert.equal(renamed[0].label, 'Nome novo');

  const reordered = validateChoiceOptions([
    { id: 'opt_keep', label: 'Outra' },
    { id: 'opt_stay', label: 'Nome novo' },
  ]);
  assert.deepEqual(reordered.map((option) => option.id), ['opt_keep', 'opt_stay']);
});

test('rejeita identificadores duplicados no mesmo campo', () => {
  reject(
    () => validateChoiceOptions([
      { id: 'opt_same', label: 'Primeira' },
      { id: 'opt_same', label: 'Segunda' },
    ]),
    'Cada opção deve possuir identificador único.',
  );
});

test('rejeita rótulos vazios ou duplicados após normalização', () => {
  assert.equal(normalizeOptionLabel('  Sim   isso  '), 'Sim isso');
  reject(
    () => validateChoiceOptions([{ id: 'opt_empty', label: '   ' }]),
    'O opção é inválido.',
  );
  reject(
    () => validateChoiceOptions([
      { id: 'opt_one', label: '  Sim ' },
      { id: 'opt_two', label: 'sim' },
    ]),
    'Cada opção deve possuir um rótulo único.',
  );
});

test('exige o mínimo de uma opção e recusa a 51ª', () => {
  reject(
    () => validateChoiceOptions([]),
    'Campos de escolha precisam ter entre 1 e 50 opções.',
  );
  const fifty = Array.from({ length: 50 }, (_, index) => ({
    id: `opt_${String(index).padStart(3, '0')}`,
    label: `Opção ${index + 1}`,
  }));
  assert.equal(validateChoiceOptions(fifty).length, 50);
  reject(
    () => validateChoiceOptions([...fifty, { id: 'opt_051', label: 'Opção 51' }]),
    'Campos de escolha precisam ter entre 1 e 50 opções.',
  );
});
