import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PASSWORD_RESET_COMPLETED_MESSAGE,
  PasswordRecoveryController,
} from '../dist/password-recovery.controller.js';
import { PASSWORD_RECOVERY_PUBLIC_MESSAGE } from '../dist/auth/password-recovery.js';
import { PasswordRecoveryRateLimitExceededError } from '../dist/auth/password-recovery-rate-limiter.js';
import {
  PasswordResetRejectedError,
} from '../dist/auth/password-reset.service.js';

function createController({ requestError, resetError } = {}) {
  const calls = { requests: [], resets: [] };
  const controller = new PasswordRecoveryController(
    {
      async request(input) {
        calls.requests.push(input);
        if (requestError) throw requestError;
        return { message: PASSWORD_RECOVERY_PUBLIC_MESSAGE };
      },
    },
    {
      async reset(input) {
        calls.resets.push(input);
        if (resetError) throw resetError;
      },
    },
    {
      createKey() {
        return 'a'.repeat(64);
      },
    },
  );
  return { controller, calls };
}

test('endpoint de solicitação encaminha somente e-mail e HMAC da origem', async () => {
  const { controller, calls } = createController();
  const response = await controller.forgot(
    { email: 'pessoa@exemplo.com' },
    { socket: { remoteAddress: '203.0.113.10' }, headers: {} },
  );

  assert.deepEqual(response, { message: PASSWORD_RECOVERY_PUBLIC_MESSAGE });
  assert.deepEqual(calls.requests, [{
    email: 'pessoa@exemplo.com',
    originKey: 'a'.repeat(64),
  }]);
});

test('rate limit mantém mensagem anti-enumeração e retorna 429', async () => {
  const { controller } = createController({
    requestError: new PasswordRecoveryRateLimitExceededError(30_000),
  });

  await assert.rejects(
    controller.forgot(
      { email: 'pessoa@exemplo.com' },
      { socket: { remoteAddress: '203.0.113.10' }, headers: {} },
    ),
    (reason) => {
      assert.equal(reason.getStatus(), 429);
      assert.equal(reason.getResponse().message, PASSWORD_RECOVERY_PUBLIC_MESSAGE);
      return true;
    },
  );
});

test('redefinição concluída não devolve token nem hash', async () => {
  const { controller, calls } = createController();
  const token = 'A'.repeat(43);

  assert.deepEqual(
    await controller.reset({ token, newPassword: 'SenhaForte1!' }),
    { message: PASSWORD_RESET_COMPLETED_MESSAGE },
  );
  assert.deepEqual(calls.resets, [{ token, newPassword: 'SenhaForte1!' }]);
  assert.equal(JSON.stringify({ message: PASSWORD_RESET_COMPLETED_MESSAGE }).includes(token), false);
});

test('token rejeitado recebe uma única resposta pública de erro', async () => {
  const { controller } = createController({
    resetError: new PasswordResetRejectedError(),
  });

  await assert.rejects(
    controller.reset({ token: 'A'.repeat(43), newPassword: 'SenhaForte1!' }),
    (reason) => {
      assert.equal(reason.getStatus(), 400);
      assert.match(String(reason.getResponse().message), /inválido, expirou ou já foi utilizado/u);
      return true;
    },
  );
});
