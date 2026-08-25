import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfirmEmailDto } from '../dist/auth/confirm-email.dto.js';
import {
  EMAIL_VERIFICATION_COMPLETED_MESSAGE,
  EMAIL_VERIFICATION_RESEND_MESSAGE,
  EmailVerificationController,
} from '../dist/email-verification.controller.js';
import {
  EmailVerificationDispatchRateLimitedError,
  EmailVerificationDispatchUnavailableError,
} from '../dist/auth/email-verification-dispatch.service.js';
import {
  EmailVerificationRejectedError,
  EmailVerificationUnavailableError,
} from '../dist/auth/email-verification.service.js';

function createController({ confirmError, dispatchError } = {}) {
  const calls = { confirmations: [], dispatches: [] };
  const controller = new EmailVerificationController(
    {
      async confirm(token) {
        calls.confirmations.push(token);
        if (confirmError) throw confirmError;
        return { verifiedAt: new Date('2026-08-24T00:00:00.000Z') };
      },
    },
    {
      async send(userId) {
        calls.dispatches.push(userId);
        if (dispatchError) throw dispatchError;
      },
    },
  );
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

  assert.deepEqual(calls.confirmations, [token]);
  assert.deepEqual(response, { message: EMAIL_VERIFICATION_COMPLETED_MESSAGE });
  assert.equal(JSON.stringify(response).includes(token), false);
  assert.equal(JSON.stringify(response).includes('verifiedAt'), false);
});

test('token rejeitado recebe resposta pública única', async () => {
  const { controller } = createController({
    confirmError: new EmailVerificationRejectedError(),
  });

  await assert.rejects(
    controller.verify({ token: 'A'.repeat(43) }),
    (reason) => {
      assert.equal(reason.getStatus(), 400);
      assert.match(String(reason.getResponse().message), /inválido, expirou ou já foi utilizado/u);
      return true;
    },
  );
});

test('falha operacional de confirmação recebe indisponibilidade sanitizada', async () => {
  const { controller } = createController({
    confirmError: new EmailVerificationUnavailableError(),
  });

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

test('reenvio usa somente o usuário autenticado e retorna mensagem mínima', async () => {
  const { controller, calls } = createController();
  const response = await controller.resend({
    user: { id: 'user-123', email: 'nao-usado@exemplo.com' },
    headers: {},
  });

  assert.deepEqual(calls.dispatches, ['user-123']);
  assert.deepEqual(response, { message: EMAIL_VERIFICATION_RESEND_MESSAGE });
  assert.equal(JSON.stringify(response).includes('nao-usado@exemplo.com'), false);
});

test('rate limit de reenvio usa 429 sem revelar estado da conta', async () => {
  const { controller } = createController({
    dispatchError: new EmailVerificationDispatchRateLimitedError(60_000),
  });

  await assert.rejects(
    controller.resend({ user: { id: 'user-123', email: 'oculto@exemplo.com' }, headers: {} }),
    (reason) => {
      assert.equal(reason.getStatus(), 429);
      assert.equal(reason.getResponse().message, EMAIL_VERIFICATION_RESEND_MESSAGE);
      assert.equal(JSON.stringify(reason.getResponse()).includes('oculto@exemplo.com'), false);
      return true;
    },
  );
});

test('falha de reenvio recebe indisponibilidade sanitizada', async () => {
  const { controller } = createController({
    dispatchError: new EmailVerificationDispatchUnavailableError(),
  });

  await assert.rejects(
    controller.resend({ user: { id: 'user-123', email: 'oculto@exemplo.com' }, headers: {} }),
    (reason) => {
      assert.equal(reason.getStatus(), 503);
      assert.equal(
        reason.getResponse().message,
        'Não foi possível reenviar o link agora. Tente novamente mais tarde.',
      );
      return true;
    },
  );
});
