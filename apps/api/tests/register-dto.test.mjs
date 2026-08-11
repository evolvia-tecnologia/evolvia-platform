import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from '../dist/auth/register.dto.js';

async function validateRegistration(payload) {
  const dto = plainToInstance(RegisterDto, payload);
  const errors = await validate(dto);
  return { dto, errors };
}

test('normaliza nome e e-mail antes da validação', async () => {
  const { dto, errors } = await validateRegistration({
    name: '  João   D’Ávila  ',
    email: '  TESTE@Example.COM  ',
    password: 'Evolvia#2026',
  });

  assert.equal(errors.length, 0);
  assert.equal(dto.name, 'João D’Ávila');
  assert.equal(dto.email, 'teste@example.com');
});

test('rejeita nome com números ou caracteres incompatíveis', async () => {
  const { errors } = await validateRegistration({
    name: 'João 123',
    email: 'joao@example.com',
    password: 'Evolvia#2026',
  });

  const nameError = errors.find((error) => error.property === 'name');
  assert.ok(nameError);
  assert.ok(Object.values(nameError.constraints ?? {}).some((message) => message.includes('apenas letras')));
});

test('rejeita e-mail sem formato válido', async () => {
  const { errors } = await validateRegistration({
    name: 'João da Silva',
    email: 'joao@dominio',
    password: 'Evolvia#2026',
  });

  const emailError = errors.find((error) => error.property === 'email');
  assert.ok(emailError);
  assert.ok(Object.values(emailError.constraints ?? {}).some((message) => message.includes('e-mail válido')));
});

test('rejeita nome que vira vazio após normalização', async () => {
  const { errors } = await validateRegistration({
    name: '    ',
    email: 'joao@example.com',
    password: 'Evolvia#2026',
  });

  assert.ok(errors.some((error) => error.property === 'name'));
});
