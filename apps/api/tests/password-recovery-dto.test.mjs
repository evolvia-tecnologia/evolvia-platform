import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ForgotPasswordDto } from '../dist/auth/forgot-password.dto.js';
import { ResetPasswordDto } from '../dist/auth/reset-password.dto.js';
import { generatePasswordResetToken } from '../dist/auth/password-recovery.js';

test('solicitação normaliza e valida o e-mail sem campos adicionais', async () => {
  const dto = plainToInstance(ForgotPasswordDto, {
    email: ' Pessoa@Exemplo.com ',
  });
  assert.equal(dto.email, 'pessoa@exemplo.com');
  assert.deepEqual(await validate(dto), []);

  const invalid = plainToInstance(ForgotPasswordDto, { email: 'invalido' });
  assert.equal((await validate(invalid)).length, 1);
});

test('redefinição aceita apenas token opaco canônico e senha presente', async () => {
  const valid = plainToInstance(ResetPasswordDto, {
    token: generatePasswordResetToken(),
    newPassword: 'SenhaForte1!',
  });
  assert.deepEqual(await validate(valid), []);

  const invalid = plainToInstance(ResetPasswordDto, {
    token: 'token-em-formato-invalido',
    newPassword: 'curta',
  });
  assert.equal((await validate(invalid)).length, 2);
});
