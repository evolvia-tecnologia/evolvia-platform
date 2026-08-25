import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PrismaPasswordResetStore } from '../dist/auth/password-reset-prisma.store.js';
import { PasswordResetStoreRejection } from '../dist/auth/password-reset.service.js';

function createHarness({ token = null, consumeCount = 1, serializableFailures = 0 } = {}) {
  const state = {
    attempts: 0,
    options: [],
    lookups: [],
    consumptions: [],
    userUpdates: [],
    audits: [],
  };
  const tx = {
    passwordResetToken: {
      async findUnique(input) {
        state.lookups.push(input);
        return token;
      },
      async updateMany(input) {
        state.consumptions.push(input);
        return { count: consumeCount };
      },
    },
    user: {
      async update(input) {
        state.userUpdates.push(input);
        return { id: input.where.id };
      },
    },
    passwordRecoveryAuditEvent: {
      async create(input) {
        state.audits.push(input);
        return { id: 'audit_1' };
      },
    },
  };
  const prisma = {
    async $transaction(operation, options) {
      state.attempts += 1;
      state.options.push(options);
      if (state.attempts <= serializableFailures) throw { code: 'P2034' };
      return operation(tx);
    },
  };
  return { store: new PrismaPasswordResetStore(prisma), state };
}

const now = new Date('2026-08-17T22:00:00.000Z');
const activeToken = {
  id: 'reset_1',
  userId: 'usr_1',
  expiresAt: new Date('2026-08-17T22:30:00.000Z'),
  consumedAt: null,
  revokedAt: null,
};

test('consome token, altera hash e grava auditoria na mesma transação serializável', async () => {
  const { store, state } = createHarness({ token: activeToken });

  await store.resetPassword({
    tokenHash: 'a'.repeat(64),
    passwordHash: 'bcrypt-hash',
    now,
  });

  assert.deepEqual(state.options, [{ isolationLevel: 'Serializable' }]);
  assert.deepEqual(state.lookups, [{
    where: { tokenHash: 'a'.repeat(64) },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      consumedAt: true,
      revokedAt: true,
    },
  }]);
  assert.deepEqual(state.consumptions[0], {
    where: {
      id: 'reset_1',
      tokenHash: 'a'.repeat(64),
      consumedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: { consumedAt: now },
  });
  assert.deepEqual(state.userUpdates, [{
    where: { id: 'usr_1' },
    data: {
      passwordHash: 'bcrypt-hash',
      credentialVersion: { increment: 1 },
    },
    select: { id: true },
  }]);
  assert.deepEqual(state.audits, [{
    data: {
      action: 'password_recovery.reset',
      outcome: 'RESET_COMPLETED',
      subjectUserId: 'usr_1',
    },
    select: { id: true },
  }]);
});

test('nega token ausente, expirado, consumido ou revogado antes de qualquer escrita', async () => {
  const cases = [
    null,
    { ...activeToken, expiresAt: now },
    { ...activeToken, consumedAt: now },
    { ...activeToken, revokedAt: now },
  ];

  for (const token of cases) {
    const { store, state } = createHarness({ token });
    await assert.rejects(
      store.resetPassword({ tokenHash: 'b'.repeat(64), passwordHash: 'hash', now }),
      PasswordResetStoreRejection,
    );
    assert.deepEqual(state.consumptions, []);
    assert.deepEqual(state.userUpdates, []);
    assert.deepEqual(state.audits, []);
  }
});

test('protege corrida concorrente pelo update condicional', async () => {
  const { store, state } = createHarness({ token: activeToken, consumeCount: 0 });

  await assert.rejects(
    store.resetPassword({ tokenHash: 'c'.repeat(64), passwordHash: 'hash', now }),
    PasswordResetStoreRejection,
  );
  assert.deepEqual(state.userUpdates, []);
  assert.deepEqual(state.audits, []);
});

test('repete somente conflito serializável P2034, no máximo três vezes', async () => {
  const recovered = createHarness({ token: activeToken, serializableFailures: 2 });
  await recovered.store.resetPassword({
    tokenHash: 'd'.repeat(64),
    passwordHash: 'hash',
    now,
  });
  assert.equal(recovered.state.attempts, 3);

  const exhausted = createHarness({ token: activeToken, serializableFailures: 3 });
  await assert.rejects(
    exhausted.store.resetPassword({
      tokenHash: 'e'.repeat(64),
      passwordHash: 'hash',
      now,
    }),
    (reason) => reason?.code === 'P2034',
  );
  assert.equal(exhausted.state.attempts, 3);
});

test('migration expande auditoria sem remover evidência existente', async () => {
  const migration = await readFile(
    new URL(
      '../prisma/migrations/20260817221000_password_reset_consumption_audit/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(migration, /ADD VALUE IF NOT EXISTS 'RESET_COMPLETED'/u);
  assert.match(migration, /ADD VALUE IF NOT EXISTS 'RESET_REJECTED'/u);
  assert.match(migration, /password_recovery\.request.*password_recovery\.reset/su);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DELETE FROM/u);
});


test('migration adiciona versão de credencial sem remoção destrutiva', async () => {
  const migration = await readFile(
    new URL(
      '../prisma/migrations/20260825040000_user_credential_version/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS "credentialVersion" INTEGER NOT NULL DEFAULT 0/u,
  );
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/u);
});
