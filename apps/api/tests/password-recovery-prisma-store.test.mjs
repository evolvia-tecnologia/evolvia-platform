import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PrismaPasswordRecoveryRequestStore } from '../dist/auth/password-recovery-prisma.store.js';

function createHarness({ serializableFailures = 0 } = {}) {
  const state = {
    transactionAttempts: 0,
    transactionOptions: [],
    operations: [],
    directRevocations: [],
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

test('elegibilidade permanece deny-by-default até existir e-mail verificado canônico', async () => {
  const { store, state } = createHarness();

  assert.equal(await store.findEligibleIdentityByEmail('pessoa@exemplo.com'), null);
  assert.equal(state.transactionAttempts, 0);
});

test('substitui token dentro de transação serializável e persiste somente o hash', async () => {
  const { store, state } = createHarness();
  const expiresAt = new Date('2026-08-17T13:00:00.000Z');

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
  const migration = await readFile(
    new URL(
      '../prisma/migrations/20260817074500_password_recovery_foundation/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(
    migration,
    /CREATE UNIQUE INDEX "PasswordResetToken_one_unresolved_per_user_key"/u,
  );
  assert.match(
    migration,
    /WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL/u,
  );
});
