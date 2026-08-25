import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PasswordResetPasswordPolicyError,
  PasswordResetRejectedError,
  PasswordResetService,
  PasswordResetStoreRejection,
  PasswordResetUnavailableError,
} from '../dist/auth/password-reset.service.js';
import { generatePasswordResetToken, hashPasswordResetToken } from '../dist/auth/password-recovery.js';

function createHarness({ storeError, hashError, auditError, diagnosticsError } = {}) {
  const state = {
    storeInputs: [],
    auditInputs: [],
    diagnosticInputs: [],
    hashedPasswords: [],
  };
  const now = new Date('2026-08-17T22:00:00.000Z');
  const service = new PasswordResetService({
    store: {
      async resetPassword(input) {
        state.storeInputs.push(input);
        if (storeError) throw storeError;
      },
    },
    audit: {
      async record(input) {
        state.auditInputs.push(input);
        if (auditError) throw auditError;
      },
    },
    diagnostics: {
      async capture(input) {
        state.diagnosticInputs.push(input);
        if (diagnosticsError) throw diagnosticsError;
      },
    },
    async hashPassword(password) {
      state.hashedPasswords.push(password);
      if (hashError) throw hashError;
      return 'bcrypt-hash';
    },
    now: () => now,
  });

  return { service, state, now };
}

test('rejeita senha fora da política central antes de hash ou persistência', async () => {
  const { service, state } = createHarness();

  await assert.rejects(
    service.reset({ token: generatePasswordResetToken(), newPassword: 'fraca' }),
    PasswordResetPasswordPolicyError,
  );
  assert.deepEqual(state.hashedPasswords, []);
  assert.deepEqual(state.storeInputs, []);
  assert.deepEqual(state.auditInputs, []);
});

test('envia somente hashes e horário ao store para concluir redefinição', async () => {
  const { service, state, now } = createHarness();
  const token = generatePasswordResetToken();

  await service.reset({ token, newPassword: 'SenhaForte1!' });

  assert.deepEqual(state.hashedPasswords, ['SenhaForte1!']);
  assert.deepEqual(state.storeInputs, [{
    tokenHash: hashPasswordResetToken(token),
    passwordHash: 'bcrypt-hash',
    now,
  }]);
  assert.equal(JSON.stringify(state.storeInputs).includes(token), false);
  assert.equal(JSON.stringify(state.storeInputs).includes('SenhaForte1!'), false);
});

test('token malformado recebe resposta genérica e auditoria sem segredo', async () => {
  const { service, state } = createHarness();

  await assert.rejects(
    service.reset({ token: 'token-invalido', newPassword: 'SenhaForte1!' }),
    PasswordResetRejectedError,
  );
  assert.deepEqual(state.storeInputs, []);
  assert.deepEqual(state.auditInputs, [{
    action: 'password_recovery.reset',
    outcome: 'RESET_REJECTED',
  }]);
  assert.equal(JSON.stringify(state.auditInputs).includes('token-invalido'), false);
});

test('token expirado, consumido ou revogado não revela o estado interno', async () => {
  const { service, state } = createHarness({ storeError: new PasswordResetStoreRejection() });

  await assert.rejects(
    service.reset({ token: generatePasswordResetToken(), newPassword: 'SenhaForte1!' }),
    PasswordResetRejectedError,
  );
  assert.deepEqual(state.auditInputs, [{
    action: 'password_recovery.reset',
    outcome: 'RESET_REJECTED',
  }]);
});

test('falha operacional é sanitizada e diagnóstico não recebe senha, token ou exceção', async () => {
  const { service, state } = createHarness({ storeError: new Error('segredo interno') });
  const token = generatePasswordResetToken();

  await assert.rejects(
    service.reset({ token, newPassword: 'SenhaForte1!' }),
    PasswordResetUnavailableError,
  );
  assert.deepEqual(state.diagnosticInputs, [{
    operation: 'password_recovery.reset',
    stage: 'PERSISTENCE',
  }]);
  const diagnostics = JSON.stringify(state.diagnosticInputs);
  assert.equal(diagnostics.includes(token), false);
  assert.equal(diagnostics.includes('SenhaForte1!'), false);
  assert.equal(diagnostics.includes('segredo interno'), false);
});

test('falha de auditoria ou diagnóstico não substitui a rejeição pública', async () => {
  const { service } = createHarness({
    storeError: new PasswordResetStoreRejection(),
    auditError: new Error('audit indisponível'),
    diagnosticsError: new Error('log indisponível'),
  });

  await assert.rejects(
    service.reset({ token: generatePasswordResetToken(), newPassword: 'SenhaForte1!' }),
    PasswordResetRejectedError,
  );
});
