import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import {
  CONDITION_OPERATORS,
  CONDITION_SOURCE_TYPES,
  isConditionSourceType,
  validateFieldCondition,
} from '../dist/registration-form-conditions.js';

const source = {
  id: 'field-hospedagem',
  type: 'SELECT',
  enabled: true,
  options: [
    { id: 'opt_stay', label: 'Sim' },
    { id: 'opt_keep', label: 'Não' },
  ],
};
const later = { id: 'field-later', type: 'RADIO', enabled: true, options: [{ id: 'opt_later', label: 'Depois' }] };
const fields = [
  { id: 'field-name', type: 'TEXT', enabled: true },
  source,
  { id: 'field-city', type: 'TEXT', enabled: true },
  later,
];

function reject(fn, message) {
  assert.throws(fn, (error) => error instanceof BadRequestException && String(error.message) === message);
}

function validate(condition, overrides = {}) {
  return validateFieldCondition(condition, {
    dependentIndex: 2,
    dependentLocked: false,
    fields,
    ...overrides,
  });
}

test('operadores e fontes canônicas ficam no contrato da API', () => {
  assert.deepEqual([...CONDITION_SOURCE_TYPES], ['SELECT', 'RADIO']);
  assert.deepEqual(
    CONDITION_OPERATORS.map((operator) => operator.id),
    ['EQUALS', 'NOT_EQUALS'],
  );
  assert.equal(CONDITION_OPERATORS[0].label, 'for igual a');
  assert.equal(CONDITION_OPERATORS[1].label, 'for diferente de');
  assert.equal(isConditionSourceType('RADIO'), true);
  assert.equal(isConditionSourceType('CHECKBOX'), false);
});

test('preserva o identificador estável da opção depois de renomear', () => {
  const renamed = {
    ...source,
    options: [
      { id: 'opt_stay', label: 'Necessita hospedagem' },
      { id: 'opt_keep', label: 'Não precisa' },
    ],
  };
  const result = validate(
    { fieldId: 'field-hospedagem', operator: 'EQUALS', value: 'opt_stay', extra: '<script>' },
    { fields: [fields[0], renamed, fields[2]] },
  );
  assert.deepEqual(result, { fieldId: 'field-hospedagem', operator: 'EQUALS', value: 'opt_stay' });
});

test('rejeita fonte posterior na ordem da ficha', () => {
  reject(
    () => validate(
      { fieldId: 'field-later', operator: 'EQUALS', value: 'opt_later' },
      { dependentIndex: 2 },
    ),
    'A condição deve depender de um campo anterior da ficha.',
  );
});

test('rejeita reordenação que coloca o dependente antes da fonte', () => {
  reject(
    () => validate(
      { fieldId: 'field-hospedagem', operator: 'EQUALS', value: 'opt_stay' },
      {
        dependentIndex: 0,
        fields: [
          { id: 'field-city', type: 'TEXT', enabled: true },
          source,
        ],
      },
    ),
    'A condição deve depender de um campo anterior da ficha.',
  );
});

test('rejeita fonte inexistente', () => {
  reject(
    () => validate({ fieldId: 'field-missing', operator: 'EQUALS', value: 'opt_stay' }),
    'O campo fonte da condição não existe nesta ficha.',
  );
});

test('rejeita fonte desabilitada', () => {
  reject(
    () => validate(
      { fieldId: 'field-hospedagem', operator: 'EQUALS', value: 'opt_stay' },
      { fields: [fields[0], { ...source, enabled: false }, fields[2]] },
    ),
    'A condição deve depender de um campo habilitado.',
  );
});

test('rejeita tipo de fonte não permitido', () => {
  reject(
    () => validate(
      { fieldId: 'field-hospedagem', operator: 'EQUALS', value: 'opt_stay' },
      { fields: [fields[0], { ...source, type: 'CHECKBOX' }, fields[2]] },
    ),
    'A condição só pode depender de um campo de lista ou escolha única.',
  );
  reject(
    () => validate(
      { fieldId: 'field-name', operator: 'EQUALS', value: 'opt_stay' },
    ),
    'A condição só pode depender de um campo de lista ou escolha única.',
  );
});

test('rejeita opção inexistente ou removida e não aceita o rótulo no lugar do ID', () => {
  reject(
    () => validate({ fieldId: 'field-hospedagem', operator: 'EQUALS', value: 'opt_removed' }),
    'O valor da condição deve ser uma opção atual do campo fonte.',
  );
  reject(
    () => validate({ fieldId: 'field-hospedagem', operator: 'EQUALS', value: 'Sim' }),
    'O valor da condição deve ser uma opção atual do campo fonte.',
  );
  reject(
    () => validate(
      { fieldId: 'field-hospedagem', operator: 'EQUALS', value: 'opt_keep' },
      { fields: [fields[0], { ...source, options: [source.options[0]] }, fields[2]] },
    ),
    'O valor da condição deve ser uma opção atual do campo fonte.',
  );
});

test('rejeita condicionar campo essencial ou travado', () => {
  reject(
    () => validate(
      { fieldId: 'field-hospedagem', operator: 'EQUALS', value: 'opt_stay' },
      { dependentLocked: true, dependentIndex: 2 },
    ),
    'Campos essenciais não podem ter condição de exibição.',
  );
});

test('aceita NOT_EQUALS com o ID estável da opção atual', () => {
  const result = validate({ fieldId: 'field-hospedagem', operator: 'NOT_EQUALS', value: 'opt_keep' });
  assert.equal(result.operator, 'NOT_EQUALS');
  assert.equal(result.value, 'opt_keep');
});
