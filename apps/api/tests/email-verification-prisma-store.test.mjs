import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  EMAIL_VERIFICATION_RESEND_LIMIT,
  EMAIL_VERIFICATION_RESEND_WINDOW_MS,
  EmailVerificationRateLimitExceededError,
  EmailVerificationStoreRejection,
  PrismaEmailVerificationStore,
} from '../dist/auth/email-verification-prisma.store.js';

const FOUNDATION_MIGRATION = new URL(
  '../prisma/migrations/20260902010000_auth_recovery_verification_foundation/migration.sql',
  import.meta.url,
);

function createHarness({
  user = { id: 'usr_1', email: 'canonical@example.com', emailVerifiedAt: null },
  token = null,
  recentTokens = [],
  serializableFailures = 0,
} = {}) {
  const state = { attempts: 0, options: [], operations: [] };
  const emailVerificationToken = {
    async findMany(input) {
      state.operations.push({ operation: 'findRecentTokens', input });
      return recentTokens;
    },
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
  };
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
    emailVerificationToken,
  };
  const prisma = {
    emailVerificationToken,
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
    user: {
      id: 'usr_1',
      email: 'canonical@example.com',
      emailVerifiedAt: new Date('2026-08-18T20:00:00.000Z'),
    },
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

test('emissão deriva destinatário do usuário canônico e cria somente o novo hash', async () => {
  const { store, state } = createHarness();
  const input = {
    userId: 'usr_1',
    tokenHash: 'b'.repeat(64),
    expiresAt: new Date('2026-08-19T20:00:00.000Z'),
    now: new Date('2026-08-18T20:00:00.000Z'),
  };

  assert.deepEqual(await store.replaceActiveToken(input), {
    id: 'verify_1',
    recipient: 'canonical@example.com',
  });
  assert.deepEqual(state.options, [{ isolationLevel: 'Serializable' }]);
  assert.deepEqual(state.operations.map((item) => item.operation), [
    'findUser',
    'findRecentTokens',
    'updateTokens',
    'createToken',
  ]);
  assert.deepEqual(state.operations[0].input.select, {
    id: true,
    email: true,
    emailVerifiedAt: true,
  });
  assert.deepEqual(state.operations[1].input, {
    where: {
      userId: 'usr_1',
      createdAt: { gte: new Date('2026-08-18T19:45:00.000Z') },
    },
    orderBy: { createdAt: 'desc' },
    take: EMAIL_VERIFICATION_RESEND_LIMIT,
    select: { createdAt: true },
  });
  assert.deepEqual(state.operations[3].input, {
    data: {
      userId: 'usr_1',
      tokenHash: 'b'.repeat(64),
      expiresAt: input.expiresAt,
    },
    select: { id: true },
  });
  assert.equal(JSON.stringify(state.operations[3]).includes('token-puro'), false);
});

test('cooldown bloqueia reenvio sem revogar o token ativo', async () => {
  const now = new Date('2026-08-18T20:00:00.000Z');
  const recentTokens = [{ createdAt: new Date('2026-08-18T19:59:30.000Z') }];
  const { store, state } = createHarness({ recentTokens });

  await assert.rejects(
    store.replaceActiveToken({
      userId: 'usr_1',
      tokenHash: 'c'.repeat(64),
      expiresAt: new Date('2026-08-19T20:00:00.000Z'),
      now,
    }),
    (reason) => {
      assert.ok(reason instanceof EmailVerificationRateLimitExceededError);
      assert.equal(reason.retryAfterMs, 30_000);
      return true;
    },
  );

  assert.deepEqual(state.operations.map((item) => item.operation), [
    'findUser',
    'findRecentTokens',
  ]);
});

test('janela deslizante limita reenvios e calcula retomada pelo token mais antigo', async () => {
  const now = new Date('2026-08-18T20:00:00.000Z');
  const recentTokens = [
    { createdAt: new Date('2026-08-18T19:58:00.000Z') },
    { createdAt: new Date('2026-08-18T19:52:00.000Z') },
    { createdAt: new Date('2026-08-18T19:46:00.000Z') },
  ];
  const { store, state } = createHarness({ recentTokens });

  await assert.rejects(
    store.replaceActiveToken({
      userId: 'usr_1',
      tokenHash: 'd'.repeat(64),
      expiresAt: new Date('2026-08-19T20:00:00.000Z'),
      now,
    }),
    (reason) => {
      assert.ok(reason instanceof EmailVerificationRateLimitExceededError);
      assert.equal(reason.retryAfterMs, 60_000);
      return true;
    },
  );

  assert.equal(EMAIL_VERIFICATION_RESEND_WINDOW_MS, 15 * 60 * 1000);
  assert.equal(state.operations.some((item) => item.operation === 'updateTokens'), false);
  assert.equal(state.operations.some((item) => item.operation === 'createToken'), false);
});

test('revogação é idempotente e preserva token já resolvido', async () => {
  const { store, state } = createHarness();
  const now = new Date('2026-08-18T20:00:00.000Z');

  await store.revokeToken({ tokenId: 'verify_1', now });

  assert.deepEqual(state.operations[0], {
    operation: 'updateTokens',
    input: {
      where: { id: 'verify_1', consumedAt: null, revokedAt: null },
      data: { revokedAt: now },
    },
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

  assert.deepEqual(await store.confirmToken({ tokenHash: 'c'.repeat(64), now }), { verifiedAt: now });
  assert.deepEqual(state.operations.map((item) => item.operation), [
    'findToken', 'updateTokens', 'verifyUser', 'updateTokens',
  ]);
  assert.deepEqual(state.operations[2].input, {
    where: { id: 'usr_1', emailVerifiedAt: null },
    data: { emailVerifiedAt: now },
  });
});

test('token expirado, consumido ou revogado é rejeitado sem alterar usuário', async () => {
  const now = new Date('2026-08-18T20:00:00.000Z');
  const cases = [
    {
      id: 'verify_1', userId: 'usr_1',
      expiresAt: new Date('2026-08-18T19:00:00.000Z'),
      consumedAt: null, revokedAt: null,
    },
    {
      id: 'verify_1', userId: 'usr_1',
      expiresAt: new Date('2026-08-18T21:00:00.000Z'),
      consumedAt: now, revokedAt: null,
    },
    {
      id: 'verify_1', userId: 'usr_1',
      expiresAt: new Date('2026-08-18T21:00:00.000Z'),
      consumedAt: null, revokedAt: now,
    },
  ];

  for (const token of cases) {
    const harness = createHarness({ token });
    await assert.rejects(
      harness.store.confirmToken({ tokenHash: 'd'.repeat(64), now }),
      EmailVerificationStoreRejection,
    );
    assert.equal(harness.state.operations.some((item) => item.operation === 'verifyUser'), false);
  }
});

test('repete somente conflito serializável com limite de três tentativas', async () => {
  const recovered = createHarness({ serializableFailures: 2 });

  await recovered.store.replaceActiveToken({
    userId: 'usr_1', tokenHash: 'e'.repeat(64),
    expiresAt: new Date('2026-08-19T20:00:00.000Z'),
    now: new Date('2026-08-18T20:00:00.000Z'),
  });
  assert.equal(recovered.state.attempts, 3);

  const exhausted = createHarness({ serializableFailures: 3 });
  await assert.rejects(
    exhausted.store.replaceActiveToken({
      userId: 'usr_1', tokenHash: 'f'.repeat(64),
      expiresAt: new Date('2026-08-19T20:00:00.000Z'),
      now: new Date('2026-08-18T20:00:00.000Z'),
    }),
    (reason) => reason?.code === 'P2034',
  );
  assert.equal(exhausted.state.attempts, 3);
});

test('migration é expansiva, preserva histórico e limita token não resolvido', async () => {
  const migration = await readFile(FOUNDATION_MIGRATION, 'utf8');

  assert.match(migration, /CREATE TABLE "EmailVerificationToken"/u);
  assert.match(migration, /ON DELETE CASCADE/u);
  assert.match(migration, /EmailVerificationToken_one_unresolved_per_user_key/u);
  assert.match(migration, /WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL/u);
  assert.match(migration, /ADD COLUMN "emailVerifiedAt" TIMESTAMP\(3\);/u);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/u);
  assert.doesNotMatch(migration, /UPDATE "User"/u);
});
