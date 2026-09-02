import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PASSWORD_RECOVERY_IDENTITY_LIMIT,
  PASSWORD_RECOVERY_ORIGIN_LIMIT,
  PASSWORD_RECOVERY_RATE_LIMIT_WINDOW_MS,
  PasswordRecoveryRateLimitExceededError,
  PrismaPasswordRecoveryRateLimiter,
} from '../dist/auth/password-recovery-rate-limiter.js';

const ORIGIN_KEY = 'a'.repeat(64);
const IDENTITY_KEY = 'b'.repeat(64);
const OTHER_IDENTITY_KEY = 'c'.repeat(64);
const OTHER_ORIGIN_KEY = 'd'.repeat(64);
const NOW = new Date('2026-08-17T18:40:00.000Z');
const EMAIL = 'pessoa@exemplo.com';
const IP = '203.0.113.10';
const TOKEN = 'token-opaco-que-nao-pode-aparecer';
const PEPPER = 'password-recovery-origin-pepper-secret';

function windowOf(now) {
  const startedAt = new Date(
    Math.floor(now.getTime() / PASSWORD_RECOVERY_RATE_LIMIT_WINDOW_MS) *
      PASSWORD_RECOVERY_RATE_LIMIT_WINDOW_MS,
  );
  return {
    startedAt,
    expiresAt: new Date(startedAt.getTime() + PASSWORD_RECOVERY_RATE_LIMIT_WINDOW_MS),
  };
}

function bucketMapKey(dimension, keyHash, windowStartedAt) {
  return [dimension, keyHash, windowStartedAt.toISOString()].join(':');
}

function uniqueWhereKey(input) {
  const key = input.dimension_keyHash_windowStartedAt;
  return bucketMapKey(key.dimension, key.keyHash, key.windowStartedAt);
}

function createHarness({
  serializableFailures = 0,
  initial = {},
  failWith = null,
  onBeforeTransaction = null,
} = {}) {
  const state = {
    attempts: 0,
    options: [],
    operations: [],
    deletes: [],
    buckets: new Map(),
  };

  for (const [key, value] of Object.entries(initial)) {
    state.buckets.set(
      key,
      typeof value === 'number' ? { requestCount: value, expiresAt: windowOf(NOW).expiresAt } : value,
    );
  }

  let transactionChain = Promise.resolve();

  const tx = {
    passwordRecoveryRateLimitBucket: {
      async deleteMany(input) {
        state.operations.push({ operation: 'deleteMany', input });
        state.deletes.push(input);
        const cutoff = input.where.expiresAt.lte.getTime();
        for (const [key, bucket] of [...state.buckets.entries()]) {
          if (bucket.expiresAt.getTime() <= cutoff) {
            state.buckets.delete(key);
          }
        }
        return { count: 0 };
      },
      async findUnique(input) {
        state.operations.push({ operation: 'findUnique', input });
        const current = state.buckets.get(uniqueWhereKey(input.where));
        return current === undefined ? null : { requestCount: current.requestCount };
      },
      async upsert(input) {
        state.operations.push({ operation: 'upsert', input });
        const key = uniqueWhereKey(input.where);
        const current = state.buckets.get(key);
        state.buckets.set(key, {
          requestCount:
            current === undefined
              ? input.create.requestCount
              : current.requestCount + input.update.requestCount.increment,
          expiresAt: current === undefined ? input.create.expiresAt : input.update.expiresAt,
        });
        return { id: 'bucket_1' };
      },
    },
  };

  const prisma = {
    async $transaction(operation, options) {
      const previous = transactionChain;
      let release;
      transactionChain = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        state.attempts += 1;
        state.options.push(options);
        if (onBeforeTransaction) {
          await onBeforeTransaction(state.attempts, state);
        }
        if (failWith && state.attempts === 1) {
          throw failWith;
        }
        if (state.attempts <= serializableFailures) {
          throw { code: 'P2034' };
        }
        return await operation(tx);
      } finally {
        release();
      }
    },
  };

  return {
    limiter: new PrismaPasswordRecoveryRateLimiter(prisma),
    state,
  };
}

function countOf(state, dimension, keyHash, now = NOW) {
  const bucket = state.buckets.get(bucketMapKey(dimension, keyHash, windowOf(now).startedAt));
  return bucket?.requestCount ?? 0;
}

function assertSensitiveDataAbsent(value) {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes(EMAIL), false);
  assert.equal(serialized.includes(IP), false);
  assert.equal(serialized.includes('127.0.0.1'), false);
  assert.equal(serialized.includes(TOKEN), false);
  assert.equal(serialized.includes(PEPPER), false);
  assert.equal(serialized.toLowerCase().includes('pepper'), false);
}

test('primeira solicitação cria os dois buckets na janela determinística', async () => {
  const { limiter, state } = createHarness();
  const { startedAt, expiresAt } = windowOf(NOW);

  await limiter.assertAllowed({ originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY }, NOW);

  assert.equal(state.buckets.size, 2);
  assert.equal(countOf(state, 'ORIGIN', ORIGIN_KEY), 1);
  assert.equal(countOf(state, 'IDENTITY', IDENTITY_KEY), 1);

  const creates = state.operations
    .filter((item) => item.operation === 'upsert')
    .map((item) => item.input.create);
  assert.deepEqual(creates, [
    {
      dimension: 'ORIGIN',
      keyHash: ORIGIN_KEY,
      windowStartedAt: startedAt,
      requestCount: 1,
      expiresAt,
    },
    {
      dimension: 'IDENTITY',
      keyHash: IDENTITY_KEY,
      windowStartedAt: startedAt,
      requestCount: 1,
      expiresAt,
    },
  ]);
});

test('solicitações seguintes incrementam origem e identidade', async () => {
  const { limiter, state } = createHarness();

  await limiter.assertAllowed({ originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY }, NOW);
  await limiter.assertAllowed({ originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY }, NOW);

  assert.equal(countOf(state, 'ORIGIN', ORIGIN_KEY), 2);
  assert.equal(countOf(state, 'IDENTITY', IDENTITY_KEY), 2);
  const updates = state.operations.filter((item) => item.operation === 'upsert').slice(2);
  assert.deepEqual(
    updates.map((item) => item.input.update),
    [
      { requestCount: { increment: 1 }, expiresAt: windowOf(NOW).expiresAt },
      { requestCount: { increment: 1 }, expiresAt: windowOf(NOW).expiresAt },
    ],
  );
});

test('origem atinge o limite independentemente da identidade', async () => {
  const { startedAt, expiresAt } = windowOf(NOW);
  const { limiter, state } = createHarness({
    initial: {
      [bucketMapKey('ORIGIN', ORIGIN_KEY, startedAt)]: {
        requestCount: PASSWORD_RECOVERY_ORIGIN_LIMIT,
        expiresAt,
      },
      [bucketMapKey('IDENTITY', IDENTITY_KEY, startedAt)]: {
        requestCount: 1,
        expiresAt,
      },
    },
  });

  await assert.rejects(
    limiter.assertAllowed({ originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY }, NOW),
    (reason) => reason instanceof PasswordRecoveryRateLimitExceededError,
  );
  assert.equal(countOf(state, 'ORIGIN', ORIGIN_KEY), PASSWORD_RECOVERY_ORIGIN_LIMIT);
  assert.equal(countOf(state, 'IDENTITY', IDENTITY_KEY), 1);

  await limiter.assertAllowed(
    { originKey: OTHER_ORIGIN_KEY, identityKey: IDENTITY_KEY },
    NOW,
  );
  assert.equal(countOf(state, 'ORIGIN', OTHER_ORIGIN_KEY), 1);
  assert.equal(countOf(state, 'IDENTITY', IDENTITY_KEY), 2);
});

test('identidade atinge o limite independentemente da origem', async () => {
  const { startedAt, expiresAt } = windowOf(NOW);
  const { limiter, state } = createHarness({
    initial: {
      [bucketMapKey('ORIGIN', ORIGIN_KEY, startedAt)]: {
        requestCount: 1,
        expiresAt,
      },
      [bucketMapKey('IDENTITY', IDENTITY_KEY, startedAt)]: {
        requestCount: PASSWORD_RECOVERY_IDENTITY_LIMIT,
        expiresAt,
      },
    },
  });

  await assert.rejects(
    limiter.assertAllowed({ originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY }, NOW),
    (reason) => reason instanceof PasswordRecoveryRateLimitExceededError,
  );
  assert.equal(countOf(state, 'ORIGIN', ORIGIN_KEY), 1);
  assert.equal(countOf(state, 'IDENTITY', IDENTITY_KEY), PASSWORD_RECOVERY_IDENTITY_LIMIT);

  await limiter.assertAllowed(
    { originKey: ORIGIN_KEY, identityKey: OTHER_IDENTITY_KEY },
    NOW,
  );
  assert.equal(countOf(state, 'ORIGIN', ORIGIN_KEY), 2);
  assert.equal(countOf(state, 'IDENTITY', OTHER_IDENTITY_KEY), 1);
});

test('bloqueio não incrementa parcialmente o outro bucket', async () => {
  const { startedAt, expiresAt } = windowOf(NOW);
  const { limiter, state } = createHarness({
    initial: {
      [bucketMapKey('ORIGIN', ORIGIN_KEY, startedAt)]: {
        requestCount: PASSWORD_RECOVERY_ORIGIN_LIMIT,
        expiresAt,
      },
      [bucketMapKey('IDENTITY', IDENTITY_KEY, startedAt)]: {
        requestCount: PASSWORD_RECOVERY_IDENTITY_LIMIT - 1,
        expiresAt,
      },
    },
  });

  await assert.rejects(
    limiter.assertAllowed({ originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY }, NOW),
    (reason) => reason instanceof PasswordRecoveryRateLimitExceededError,
  );

  assert.equal(countOf(state, 'ORIGIN', ORIGIN_KEY), PASSWORD_RECOVERY_ORIGIN_LIMIT);
  assert.equal(
    countOf(state, 'IDENTITY', IDENTITY_KEY),
    PASSWORD_RECOVERY_IDENTITY_LIMIT - 1,
  );
  assert.equal(
    state.operations.filter((item) => item.operation === 'upsert').length,
    0,
  );
});

test('calcula retryAfterMs da janela atual e nunca o deixa negativo', async () => {
  const { startedAt, expiresAt } = windowOf(NOW);
  const { limiter } = createHarness({
    initial: {
      [bucketMapKey('ORIGIN', ORIGIN_KEY, startedAt)]: {
        requestCount: PASSWORD_RECOVERY_ORIGIN_LIMIT,
        expiresAt,
      },
    },
  });

  await assert.rejects(
    limiter.assertAllowed({ originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY }, NOW),
    (reason) =>
      reason instanceof PasswordRecoveryRateLimitExceededError &&
      reason.retryAfterMs === expiresAt.getTime() - NOW.getTime() &&
      reason.retryAfterMs === 5 * 60 * 1000,
  );

  const lastMillisecond = new Date(expiresAt.getTime() - 1);
  const lastWindow = windowOf(lastMillisecond);
  const nearExpiry = createHarness({
    initial: {
      [bucketMapKey('ORIGIN', ORIGIN_KEY, lastWindow.startedAt)]: {
        requestCount: PASSWORD_RECOVERY_ORIGIN_LIMIT,
        expiresAt: lastWindow.expiresAt,
      },
    },
  });

  await assert.rejects(
    nearExpiry.limiter.assertAllowed(
      { originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY },
      lastMillisecond,
    ),
    (reason) =>
      reason instanceof PasswordRecoveryRateLimitExceededError &&
      reason.retryAfterMs === 1,
  );

  const alreadyNegative = new PasswordRecoveryRateLimitExceededError(-15);
  assert.equal(alreadyNegative.retryAfterMs, 0);
});

test('início de nova janela libera solicitações', async () => {
  const current = windowOf(NOW);
  const nextNow = current.expiresAt;
  const next = windowOf(nextNow);
  const { limiter, state } = createHarness({
    initial: {
      [bucketMapKey('ORIGIN', ORIGIN_KEY, current.startedAt)]: {
        requestCount: PASSWORD_RECOVERY_ORIGIN_LIMIT,
        expiresAt: current.expiresAt,
      },
      [bucketMapKey('IDENTITY', IDENTITY_KEY, current.startedAt)]: {
        requestCount: PASSWORD_RECOVERY_IDENTITY_LIMIT,
        expiresAt: current.expiresAt,
      },
    },
  });

  await limiter.assertAllowed(
    { originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY },
    nextNow,
  );

  assert.equal(
    state.buckets.has(bucketMapKey('ORIGIN', ORIGIN_KEY, current.startedAt)),
    false,
  );
  assert.equal(countOf(state, 'ORIGIN', ORIGIN_KEY, nextNow), 1);
  assert.equal(countOf(state, 'IDENTITY', IDENTITY_KEY, nextNow), 1);
  assert.deepEqual(next.startedAt, current.expiresAt);
});

test('buckets expirados podem ser removidos', async () => {
  const current = windowOf(NOW);
  const expiredNow = new Date(current.startedAt.getTime() - 1);
  const expired = windowOf(expiredNow);
  const { limiter, state } = createHarness({
    initial: {
      [bucketMapKey('ORIGIN', OTHER_ORIGIN_KEY, expired.startedAt)]: {
        requestCount: PASSWORD_RECOVERY_ORIGIN_LIMIT,
        expiresAt: expired.expiresAt,
      },
    },
  });

  await limiter.assertAllowed({ originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY }, NOW);

  assert.deepEqual(state.deletes, [{ where: { expiresAt: { lte: NOW } } }]);
  assert.equal(
    state.buckets.has(bucketMapKey('ORIGIN', OTHER_ORIGIN_KEY, expired.startedAt)),
    false,
  );
  assert.equal(countOf(state, 'ORIGIN', ORIGIN_KEY), 1);
});

test('chave fora de [a-f0-9]{64} é recusada antes da transação', async () => {
  const { limiter, state } = createHarness();
  const rejected = [
    IP,
    EMAIL,
    TOKEN,
    'A'.repeat(64),
    'g'.repeat(64),
    'a'.repeat(63),
    'a'.repeat(65),
    '',
  ];

  for (const originKey of rejected) {
    await assert.rejects(
      limiter.assertAllowed({ originKey, identityKey: IDENTITY_KEY }, NOW),
      /HMAC SHA-256 sanitizado/u,
    );
  }

  await assert.rejects(
    limiter.assertAllowed({ originKey: ORIGIN_KEY, identityKey: EMAIL }, NOW),
    /HMAC SHA-256 sanitizado/u,
  );
  assert.equal(state.attempts, 0);
  assert.equal(state.operations.length, 0);
});

test('IP, e-mail, token e pepper nunca aparecem nas operações Prisma', async () => {
  const { limiter, state } = createHarness();

  await limiter.assertAllowed({ originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY }, NOW);

  assertSensitiveDataAbsent(state.operations);
  assertSensitiveDataAbsent([...state.buckets.keys()]);
  assert.equal(state.operations.some((item) => JSON.stringify(item).includes(ORIGIN_KEY)), true);
});

test('usa transação serializável', async () => {
  const { limiter, state } = createHarness();

  await limiter.assertAllowed({ originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY }, NOW);

  assert.deepEqual(state.options, [{ isolationLevel: 'Serializable' }]);
});

test('retry P2034 recupera nas duas primeiras tentativas', async () => {
  const { limiter, state } = createHarness({ serializableFailures: 2 });

  await limiter.assertAllowed({ originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY }, NOW);

  assert.equal(state.attempts, 3);
  assert.equal(countOf(state, 'ORIGIN', ORIGIN_KEY), 1);
  assert.equal(countOf(state, 'IDENTITY', IDENTITY_KEY), 1);
});

test('terceiro P2034 é propagado', async () => {
  const { limiter, state } = createHarness({ serializableFailures: 3 });

  await assert.rejects(
    limiter.assertAllowed({ originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY }, NOW),
    (reason) => reason?.code === 'P2034',
  );
  assert.equal(state.attempts, 3);
  assert.equal(state.buckets.size, 0);
});

test('outros erros não são repetidos', async () => {
  const operational = createHarness({ failWith: Object.assign(new Error('falha operacional'), { code: 'P2002' }) });

  await assert.rejects(
    operational.limiter.assertAllowed(
      { originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY },
      NOW,
    ),
    (reason) => reason?.code === 'P2002',
  );
  assert.equal(operational.state.attempts, 1);

  const generic = createHarness({ failWith: new Error('indisponível') });
  await assert.rejects(
    generic.limiter.assertAllowed(
      { originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY },
      NOW,
    ),
    /indisponível/u,
  );
  assert.equal(generic.state.attempts, 1);
});

test('concorrência não ultrapassa silenciosamente o limite', async () => {
  const { startedAt, expiresAt } = windowOf(NOW);
  const serialized = createHarness({
    initial: {
      [bucketMapKey('ORIGIN', ORIGIN_KEY, startedAt)]: {
        requestCount: PASSWORD_RECOVERY_ORIGIN_LIMIT - 1,
        expiresAt,
      },
      [bucketMapKey('IDENTITY', IDENTITY_KEY, startedAt)]: {
        requestCount: 1,
        expiresAt,
      },
    },
  });

  const results = await Promise.allSettled([
    serialized.limiter.assertAllowed(
      { originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY },
      NOW,
    ),
    serialized.limiter.assertAllowed(
      { originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY },
      NOW,
    ),
  ]);

  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(results.filter((item) => item.status === 'rejected').length, 1);
  const rejected = results.find((item) => item.status === 'rejected');
  assert.ok(rejected.reason instanceof PasswordRecoveryRateLimitExceededError);
  assert.equal(countOf(serialized.state, 'ORIGIN', ORIGIN_KEY), PASSWORD_RECOVERY_ORIGIN_LIMIT);
  assert.equal(countOf(serialized.state, 'IDENTITY', IDENTITY_KEY), 2);

  const raced = createHarness({
    serializableFailures: 1,
    initial: {
      [bucketMapKey('ORIGIN', ORIGIN_KEY, startedAt)]: {
        requestCount: PASSWORD_RECOVERY_ORIGIN_LIMIT - 1,
        expiresAt,
      },
    },
    onBeforeTransaction(attempt, state) {
      if (attempt === 2) {
        state.buckets.set(bucketMapKey('ORIGIN', ORIGIN_KEY, startedAt), {
          requestCount: PASSWORD_RECOVERY_ORIGIN_LIMIT,
          expiresAt,
        });
      }
    },
  });

  await assert.rejects(
    raced.limiter.assertAllowed({ originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY }, NOW),
    (reason) => reason instanceof PasswordRecoveryRateLimitExceededError,
  );
  assert.equal(countOf(raced.state, 'ORIGIN', ORIGIN_KEY), PASSWORD_RECOVERY_ORIGIN_LIMIT);
  assert.equal(
    raced.state.operations.filter((item) => item.operation === 'upsert').length,
    0,
  );
});
