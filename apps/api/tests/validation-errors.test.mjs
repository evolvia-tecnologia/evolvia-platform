import assert from 'node:assert/strict';
import test from 'node:test';
import { flattenValidationErrors, validationExceptionFactory } from '../dist/validation-errors.js';

test('estrutura erros de validação com caminho do campo e sem valor rejeitado', () => {
  const fields = flattenValidationErrors([
    {
      property: 'email',
      value: 'segredo@invalido',
      target: { email: 'segredo@invalido' },
      constraints: { isEmail: 'Informe um e-mail válido.' },
      children: [],
    },
  ]);

  assert.deepEqual(fields, [{ field: 'email', message: 'Informe um e-mail válido.' }]);
  assert.equal(JSON.stringify(fields).includes('segredo@invalido'), false);
});

test('preserva caminho de campos aninhados', () => {
  const fields = flattenValidationErrors([
    {
      property: 'answers',
      children: [
        {
          property: 'name',
          constraints: { minLength: 'Informe um nome válido.' },
          children: [],
        },
      ],
    },
  ]);

  assert.deepEqual(fields, [{ field: 'answers.name', message: 'Informe um nome válido.' }]);
});

test('exception factory usa envelope seguro e estruturado', () => {
  const exception = validationExceptionFactory([
    {
      property: 'name',
      constraints: { isString: 'Informe seu nome.' },
      children: [],
    },
  ]);
  const response = exception.getResponse();

  assert.equal(exception.getStatus(), 400);
  assert.deepEqual(response, {
    code: 'VALIDATION_ERROR',
    message: 'Revise os campos informados.',
    fields: [{ field: 'name', message: 'Informe seu nome.' }],
  });
});
