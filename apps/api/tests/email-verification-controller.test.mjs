import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfirmEmailDto } from '../dist/auth/confirm-email.dto.js';
import {
  EMAIL_VERIFICATION_COMPLETED_MESSAGE,
  EmailVerificationController,
} from '../dist/email-verification.controller.js';
import {
  EmailVerificationRejectedError,
  EmailVerificationUnavailableError,
} from '../dist/auth/email-verification.service.js';

function createController(error) {
  const calls = [];
  const controller = new EmailVerificationController({
    async confirm(token) {
      calls.push(token);
      if (error) throw error;
      return { verifiedAt: new Date('2026-08-24T00:00:00.000Z') };
    },
  });
  return { controller, calls };
}

test('DTO aceita somente token opaco canônico', async () => {
  const valid = plainToInstance(ConfirmEmailDto, { token: 'A'.repeat(43) });
  assert.deepEqual(await validate(valid), []);

  const invalid = plainToInstance(ConfirmEmailDto, { token: 'token-invalido' });
  assert.equal((await validate(invalid)).length, 1);
});

test('confirmação concluída não devolve token, hash ou data interna', async () => {
  const token = 'A'.repeat(43);
  const { controller, calls } = createController();

  const response = await controller.verify({ token });

  assert.deepEqual(calls, [token]);
  assert.deepEqual(response, { message: EMAIL_VERIFICATION_COMPLETED_MESSAGE });
  assert.equal(JSON.stringify(response).includes(token), false);
  assert.equal(JSON.stringify(response).includes('verifiedAt'), false);
});

test('token rejeitado recebe resposta pública única', async () => {
  const { controller } = createController(new EmailVerificationRejectedError());

  await assert.rejects(
    controller.verify({ token: 'A'.repeat(43) }),
    (reason) => {
      assert.equal(reason.getStatus(), 400);
      assert.match(String(reason.getResponse().message), /inválido, expirou ou já foi utilizado/u);
      return true;
    },
  );
});

test('falha operacional recebe indisponibilidade sanitizada', async () => {
  const { controller } = createController(new EmailVerificationUnavailableError());

  await assert.rejects(
    controller.verify({ token: 'A'.repeat(43) }),
    (reason) => {
      assert.equal(reason.getStatus(), 503);
      assert.equal(
        reason.getResponse().message,
        'Não foi possível confirmar o e-mail agora. Tente novamente mais tarde.',
      );
      return true;
    },
  );
});
