import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import {
  PasswordResetPasswordPolicyError,
  PasswordResetRejectedError,
  PasswordResetService,
  PasswordResetStoreRejection,
  PasswordResetUnavailableError,
  PASSWORD_RESET_REJECTED_MESSAGE,
  PASSWORD_RESET_UNAVAILABLE_MESSAGE,
} from '../dist/auth/password-reset.service.js';
import { PasswordResetStoreRejection as IntegratedPasswordResetStoreRejection } from '../dist/auth/password-reset-prisma.store.js';
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
} from '../dist/auth/password-recovery.js';
import { PASSWORD_POLICY_MESSAGE } from '../dist/password-policy.js';

const SERVICE_SOURCE = new URL(
  '../src/auth/password-reset.service.ts',
  import.meta.url,
);

function createHarness({ storeError, hashError, auditError, diagnosticsError, hashPassword } = {}) {
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
    hashPassword: hashPassword ?? (async (password) => {
      state.hashedPasswords.push(password);
      if (hashError) throw hashError;
      return 'bcrypt-hash';
    }),
    now: () => now,
  });

  return { service, state, now };
}

function assertNoSecrets(serialized, extra = []) {
  const forbidden = ['token-invalido', 'SenhaForte1!', 'segredo interno', ...extra];
  for (const value of forbidden) {
    assert.equal(serialized.includes(value), false, `vazou ${value}`);
  }
  assert.equal(/sess[aã]o/iu.test(serialized), false);
  assert.equal(serialized.toLowerCase().includes('jwt'), false);
  assert.equal(serialized.toLowerCase().includes('cookie'), false);
}

test('o serviço reexporta a rejeição integrada sem duplicar a classe', async () => {
  const source = await readFile(SERVICE_SOURCE, 'utf8');
  assert.match(source, /from '\.\/password-reset-prisma\.store'/u);
  assert.equal(source.includes('class PasswordResetStoreRejection'), false);
  assert.equal(source.includes('process.env'), false);
  assert.equal(source.includes('@Injectable'), false);
  assert.equal(PasswordResetStoreRejection, IntegratedPasswordResetStoreRejection);
});

test('rejeita senha fora da política central antes de hash ou persistência', async () => {
  const { service, state } = createHarness();

  await assert.rejects(
    service.reset({ token: generatePasswordResetToken(), newPassword: 'fraca' }),
    (error) => {
      assert.equal(error instanceof PasswordResetPasswordPolicyError, true);
      assert.equal(error.message, PASSWORD_POLICY_MESSAGE);
      return true;
    },
  );
  assert.deepEqual(state.hashedPasswords, []);
  assert.deepEqual(state.storeInputs, []);
  assert.deepEqual(state.auditInputs, []);
});

test('formato de token inválido não chama hash de senha nem store', async () => {
  const { service, state } = createHarness();

  await assert.rejects(
    service.reset({ token: 'token-invalido', newPassword: 'SenhaForte1!' }),
    PasswordResetRejectedError,
  );
  assert.deepEqual(state.hashedPasswords, []);
  assert.deepEqual(state.storeInputs, []);
  assert.deepEqual(state.auditInputs, [{
    action: 'password_recovery.reset',
    outcome: 'RESET_REJECTED',
  }]);
  assertNoSecrets(JSON.stringify(state.auditInputs));
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

test('senha é processada por bcrypt com custo canônico do projeto', async () => {
  const state = { storeInputs: [] };
  const service = new PasswordResetService({
    store: {
      async resetPassword(input) {
        state.storeInputs.push(input);
      },
    },
    audit: { async record() {} },
    diagnostics: { async capture() {} },
  });

  await service.reset({
    token: generatePasswordResetToken(),
    newPassword: 'SenhaForte1!',
  });

  const passwordHash = state.storeInputs[0].passwordHash;
  assert.equal(bcrypt.getRounds(passwordHash), 12);
  assert.equal(await bcrypt.compare('SenhaForte1!', passwordHash), true);
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

test('rejeição do store vira mensagem pública uniforme sem identidade', async () => {
  const { service, state } = createHarness({ storeError: new PasswordResetStoreRejection() });
  const token = generatePasswordResetToken();

  await assert.rejects(
    service.reset({ token, newPassword: 'SenhaForte1!' }),
    (error) => {
      assert.equal(error instanceof PasswordResetRejectedError, true);
      assert.equal(error.message, PASSWORD_RESET_REJECTED_MESSAGE);
      assert.equal(error.message.includes(token), false);
      return true;
    },
  );
  assert.deepEqual(state.auditInputs, [{
    action: 'password_recovery.reset',
    outcome: 'RESET_REJECTED',
  }]);
  assertNoSecrets(JSON.stringify(state.auditInputs), [token, hashPasswordResetToken(token)]);
});

test('falha de hashing vira indisponibilidade genérica', async () => {
  const { service, state } = createHarness({ hashError: new Error('custo indisponível') });
  const token = generatePasswordResetToken();

  await assert.rejects(
    service.reset({ token, newPassword: 'SenhaForte1!' }),
    PasswordResetUnavailableError,
  );
  assert.deepEqual(state.storeInputs, []);
  assert.deepEqual(state.diagnosticInputs, [{
    operation: 'password_recovery.reset',
    stage: 'PASSWORD_HASH',
  }]);
  assertNoSecrets(JSON.stringify(state.diagnosticInputs), [token, 'custo indisponível']);
});

test('falha operacional é sanitizada e diagnóstico não recebe senha, token ou exceção', async () => {
  const { service, state } = createHarness({ storeError: new Error('segredo interno') });
  const token = generatePasswordResetToken();

  await assert.rejects(
    service.reset({ token, newPassword: 'SenhaForte1!' }),
    (error) => {
      assert.equal(error instanceof PasswordResetUnavailableError, true);
      assert.equal(error.message, PASSWORD_RESET_UNAVAILABLE_MESSAGE);
      return true;
    },
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

test('o serviço não promete invalidação de sessão', async () => {
  const { service, state } = createHarness();
  const result = await service.reset({
    token: generatePasswordResetToken(),
    newPassword: 'SenhaForte1!',
  });

  assert.equal(result, undefined);
  assert.equal(state.storeInputs.length, 1);
  assertNoSecrets(PASSWORD_RESET_REJECTED_MESSAGE);
  assertNoSecrets(PASSWORD_RESET_UNAVAILABLE_MESSAGE);
  const source = await readFile(SERVICE_SOURCE, 'utf8');
  assert.equal(/sess[aã]o/iu.test(source), false);
  assert.equal(source.toLowerCase().includes('jwt'), false);
  assert.equal(source.includes('credentialVersion'), false);
});
