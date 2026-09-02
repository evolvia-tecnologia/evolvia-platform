import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PrismaPasswordRecoveryRequestStore } from '../dist/auth/password-recovery-prisma.store.js';

const FOUNDATION_MIGRATION = new URL(
  '../prisma/migrations/20260902010000_auth_recovery_verification_foundation/migration.sql',
  import.meta.url,
);

function createHarness({ serializableFailures = 0, identity = null } = {}) {
  const state = {
    transactionAttempts: 0,
    transactionOptions: [],
    operations: [],
    directRevocations: [],
    identityLookups: [],
  };

  const transactionClient = {
    passwordResetToken: {
      async updateMany(input) {
        state.operations.push({ operation: 'updateMany', input });
        return { count: 1 };
      },
      async create(input) {
        state.operations.push({ operation: 'create', input });
        return { id: 'reset_2' };
      },
    },
  };

  const prisma = {
    user: {
      async findUnique(input) {
        state.identityLookups.push(input);
        return identity;
      },
    },
    async $transaction(operation, options) {
      state.transactionAttempts += 1;
      state.transactionOptions.push(options);
      if (state.transactionAttempts <= serializableFailures) {
        throw { code: 'P2034' };
      }
      return operation(transactionClient);
    },
    passwordResetToken: {
      async updateMany(input) {
        state.directRevocations.push(input);
        return { count: 1 };
      },
    },
  };

  return {
    store: new PrismaPasswordRecoveryRequestStore(prisma),
    state,
  };
}

test('elegibilidade permanece deny-by-default para conta ausente ou não verificada', async () => {
  const missing = createHarness();
  const unverified = createHarness({
    identity: {
      id: 'usr_1',
      email: 'pessoa@exemplo.com',
      emailVerifiedAt: null,
    },
  });

  assert.equal(await missing.store.findEligibleIdentityByEmail('pessoa@exemplo.com'), null);
  assert.equal(await unverified.store.findEligibleIdentityByEmail('pessoa@exemplo.com'), null);
  assert.deepEqual(unverified.state.identityLookups, [{
    where: { email: 'pessoa@exemplo.com' },
    select: { id: true, email: true, emailVerifiedAt: true },
  }]);
  assert.equal(unverified.state.transactionAttempts, 0);
});

test('elegibilidade retorna DTO mínimo apenas para e-mail canonicamente verificado', async () => {
  const { store } = createHarness({
    identity: {
      id: 'usr_1',
      email: 'pessoa@exemplo.com',
      emailVerifiedAt: new Date('2026-08-17T17:00:00.000Z'),
      passwordHash: 'não deve sair do adaptador',
    },
  });

  assert.deepEqual(
    await store.findEligibleIdentityByEmail('pessoa@exemplo.com'),
    { id: 'usr_1', verifiedEmail: 'pessoa@exemplo.com' },
  );
});

test('substitui token dentro de transação serializável e persiste somente o hash', async () => {
  const { store, state } = createHarness();
  const expiresAt = new Date('2026-08-17T13:00:00.000Z');
  const rawToken = 'token-puro-que-nao-pode-ser-persistido';

  const result = await store.replaceActiveToken({
    identityId: 'usr_1',
    tokenHash: 'a'.repeat(64),
    expiresAt,
  });

  assert.deepEqual(result, { id: 'reset_2' });
  assert.deepEqual(state.transactionOptions, [{ isolationLevel: 'Serializable' }]);
  assert.deepEqual(
    state.operations.map((item) => item.operation),
    ['updateMany', 'create'],
  );
  assert.deepEqual(state.operations[0].input.where, {
    userId: 'usr_1',
    consumedAt: null,
    revokedAt: null,
  });
  assert.ok(state.operations[0].input.data.revokedAt instanceof Date);
  assert.deepEqual(state.operations[1].input, {
    data: {
      userId: 'usr_1',
      tokenHash: 'a'.repeat(64),
      expiresAt,
    },
    select: { id: true },
  });
  assert.equal(JSON.stringify(state.operations).includes('pessoa@exemplo.com'), false);
  assert.equal(JSON.stringify(state.operations).includes(rawToken), false);
  assert.equal(JSON.stringify(state.operations).includes('pepper'), false);
});

test('repete apenas conflito serializável P2034 com limite determinístico', async () => {
  const recovered = createHarness({ serializableFailures: 2 });

  assert.deepEqual(
    await recovered.store.replaceActiveToken({
      identityId: 'usr_1',
      tokenHash: 'b'.repeat(64),
      expiresAt: new Date('2026-08-17T13:00:00.000Z'),
    }),
    { id: 'reset_2' },
  );
  assert.equal(recovered.state.transactionAttempts, 3);

  const exhausted = createHarness({ serializableFailures: 3 });
  await assert.rejects(
    exhausted.store.replaceActiveToken({
      identityId: 'usr_1',
      tokenHash: 'c'.repeat(64),
      expiresAt: new Date('2026-08-17T13:00:00.000Z'),
    }),
    (reason) => reason?.code === 'P2034',
  );
  assert.equal(exhausted.state.transactionAttempts, 3);
});

test('revogação é idempotente e não altera token consumido ou já revogado', async () => {
  const { store, state } = createHarness();

  await store.revokeToken('reset_1');

  assert.equal(state.directRevocations.length, 1);
  assert.deepEqual(state.directRevocations[0].where, {
    id: 'reset_1',
    consumedAt: null,
    revokedAt: null,
  });
  assert.ok(state.directRevocations[0].data.revokedAt instanceof Date);
});

test('migration impede mais de um token não resolvido por usuário', async () => {
  const migration = await readFile(FOUNDATION_MIGRATION, 'utf8');

  assert.match(migration, /CREATE UNIQUE INDEX "PasswordResetToken_one_unresolved_per_user_key"/u);
  assert.match(
    migration,
    /ON "PasswordResetToken"\("userId"\)\s+WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL/u,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "EmailVerificationToken_one_unresolved_per_user_key"/u,
  );
  assert.match(
    migration,
    /ON "EmailVerificationToken"\("userId"\)\s+WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL/u,
  );
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE|UPDATE "User"/u);
});
