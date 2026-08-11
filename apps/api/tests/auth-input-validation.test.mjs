import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from '../dist/auth/login.dto.js';
import { RegisterDto } from '../dist/auth/register.dto.js';

async function messages(instance) {
  const errors = await validate(instance);
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

test('cadastro normaliza nome e e-mail antes da validação', async () => {
  const dto = plainToInstance(RegisterDto, {
    name: '  Ana   Júlia  Ribeiro  ',
    email: '  ANA.RIBEIRO@EXAMPLE.COM.BR ',
    password: 'Evolvia#2026',
  });

  assert.equal(dto.name, 'Ana Júlia Ribeiro');
  assert.equal(dto.email, 'ana.ribeiro@example.com.br');
  assert.deepEqual(await messages(dto), []);
});

test('cadastro rejeita nome composto apenas por caracteres inadequados', async () => {
  const dto = plainToInstance(RegisterDto, {
    name: '123456',
    email: 'pessoa@example.com.br',
    password: 'Evolvia#2026',
  });

  const result = await messages(dto);
  assert.ok(result.some((message) => message.includes('nome')));
});

test('cadastro rejeita e-mail sem domínio válido', async () => {
  const dto = plainToInstance(RegisterDto, {
    name: 'Pessoa Teste',
    email: 'fdfdf2@feff',
    password: 'Evolvia#2026',
  });

  const result = await messages(dto);
  assert.ok(result.some((message) => message.includes('e-mail válido')));
});

test('login normaliza e-mail sem enfraquecer a validação', async () => {
  const dto = plainToInstance(LoginDto, {
    email: ' USUARIO@EXAMPLE.COM.BR ',
    password: 'senha-existente',
  });

  assert.equal(dto.email, 'usuario@example.com.br');
  assert.deepEqual(await messages(dto), []);
});

test('login rejeita e-mail malformado e senha vazia antes do serviço', async () => {
  const dto = plainToInstance(LoginDto, {
    email: 'nao-e-email',
    password: '',
  });

  const result = await messages(dto);
  assert.ok(result.some((message) => message.includes('e-mail válido')));
  assert.ok(result.some((message) => message.includes('senha')));
});
