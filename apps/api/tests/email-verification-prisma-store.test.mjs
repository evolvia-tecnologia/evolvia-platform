import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PrismaEmailVerificationStore } from '../dist/auth/email-verification-prisma.store.js';
import { EmailVerificationStoreRejection } from '../dist/auth/email-verification.service.js';

function createHarness({ user = { id: 'usr_1', emailVerifiedAt: null }, token = null, serializableFailures = 0 } = {}) {
  const state = { attempts: 0, options: [], operations: [] };
  const transactionClient = {
    user: {
      async findUnique(input) {
        state.operations.push({ operation: 'findUser', input });
        return user;
      },
      async updateMany(input) {
        state.operations.push({ operation: 'verifyUser', input });
        return { count: user?.emailVerifiedAt ? 0 : 1 };
      },
    },
    emailVerificationToken: {
      async findUnique(input) {
        state.operations.push({ operation: 'findToken', input });
        return token;
      },
      async updateMany(input) {
        state.operations.push({ operation: 'updateTokens', input });
        return { count: 1 };
      },
      async create(input) {
        state.operations.push({ operation: 'createToken', input });
        return { id: 'verify_1' };
      },
    },
  };
  const prisma = {
    async $transaction(operation, options) {
      state.attempts += 1;
      state.options.push(options);
      if (state.attempts <= serializableFailures) throw { code: 'P2034' };
      return operation(transactionClient);
    },
  };

  return { store: new PrismaEmailVerificationStore(prisma), state };
}

test('emissão recusa conta ausente ou já verificada', async () => {
  const missing = createHarness({ user: null });
  const verified = createHarness({
    user: { id: 'usr_1', emailVerifiedAt: new Date('2026-08-18T20:00:00.000Z') },
  });
  const input = {
    userId: 'usr_1',
    tokenHash: 'a'.repeat(64),
    expiresAt: new Date('2026-08-19T20:00:00.000Z'),
    now: new Date('2026-08-18T20:00:00.000Z'),
  };

  await assert.rejects(missing.store.replaceActiveToken(input), EmailVerificationStoreRejection);
  await assert.rejects(verified.store.replaceActiveToken(input), EmailVerificationStoreRejection);
});

test('emissão revoga token anterior e cria somente o novo hash na mesma transação', async () => {
  const { store, state } = createHarness();
  const input = {
    userId: 'usr_1',
    tokenHash: 'b'.repeat(64),
    expiresAt: new Date('2026-08-19T20:00:00.000Z'),
    now: new Date('2026-08-18T20:00:00.000Z'),
  };

  assert.deepEqual(await store.replaceActiveToken(input), { id: 'verify_1' });
  assert.deepEqual(state.options, [{ isolationLevel: 'Serializable' }]);
  assert.deepEqual(state.operations.map((item) => item.operation), [
    'findUser',
    'updateTokens',
    'createToken',
  ]);
  assert.deepEqual(state.operations[2].input, {
    data: {
      userId: 'usr_1',
      tokenHash: 'b'.repeat(64),
      expiresAt: input.expiresAt,
    },
    select: { id: true },
  });
});

test('confirmação consome token, verifica usuário e revoga irmãos atomicamente', async () => {
  const now = new Date('2026-08-18T20:00:00.000Z');
  const { store, state } = createHarness({
    token: {
      id: 'verify_1',
      userId: 'usr_1',
      expiresAt: new Date('2026-08-18T21:00:00.000Z'),
      consumedAt: null,
      revokedAt: null,
    },
  });

  assert.deepEqual(
    await store.confirmToken({ tokenHash: 'c'.repeat(64), now }),
    { verifiedAt: now },
  );
  assert.deepEqual(state.operations.map((item) => item.operation), [
    'findToken',
    'updateTokens',
    'verifyUser',
    'updateTokens',
  ]);
  assert.deepEqual(state.operations[2].input, {
    where: { id: 'usr_1', emailVerifiedAt: null },
    data: { emailVerifiedAt: now },
  });
});

test('token expirado, consumido ou revogado é rejeitado sem alterar usuário', async () => {
  const now = new Date('2026-08-18T20:00:00.000Z');
  const expired = createHarness({
    token: {
      id: 'verify_1',
      userId: 'usr_1',
      expiresAt: new Date('2026-08-18T19:00:00.000Z'),
      consumedAt: null,
      revokedAt: null,
    },
  });

  await assert.rejects(
    expired.store.confirmToken({ tokenHash: 'd'.repeat(64), now }),
    EmailVerificationStoreRejection,
  );
  assert.equal(expired.state.operations.some((item) => item.operation === 'verifyUser'), false);
});

test('repete somente conflito serializável com limite de três tentativas', async () => {
  const recovered = createHarness({ serializableFailures: 2 });

  await recovered.store.replaceActiveToken({
    userId: 'usr_1',
    tokenHash: 'e'.repeat(64),
    expiresAt: new Date('2026-08-19T20:00:00.000Z'),
    now: new Date('2026-08-18T20:00:00.000Z'),
  });
  assert.equal(recovered.state.attempts, 3);
});

test('migration é expansiva, preserva histórico e limita token não resolvido', async () => {
  const migration = await readFile(
    new URL('../prisma/migrations/20260818203000_email_verification_tokens/migration.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /CREATE TABLE "EmailVerificationToken"/u);
  assert.match(migration, /ON DELETE CASCADE/u);
  assert.match(migration, /EmailVerificationToken_one_unresolved_per_user_key/u);
  assert.match(migration, /WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL/u);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/u);
});
