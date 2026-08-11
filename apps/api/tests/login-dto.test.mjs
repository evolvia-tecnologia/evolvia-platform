import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from '../dist/auth/login.dto.js';

async function messages(instance) {
  const errors = await validate(instance);
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

test('login normaliza e-mail válido', async () => {
  const dto = plainToInstance(LoginDto, {
    email: ' USUARIO@EXAMPLE.COM.BR ',
    password: 'senha-existente',
  });

  assert.equal(dto.email, 'usuario@example.com.br');
  assert.deepEqual(await messages(dto), []);
});

test('login rejeita e-mail malformado e senha vazia', async () => {
  const dto = plainToInstance(LoginDto, {
    email: 'nao-e-email',
    password: '',
  });

  const result = await messages(dto);
  assert.ok(result.some((message) => message.includes('e-mail válido')));
  assert.ok(result.some((message) => message.includes('senha')));
});
