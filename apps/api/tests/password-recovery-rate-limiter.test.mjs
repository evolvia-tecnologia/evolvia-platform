import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PASSWORD_RECOVERY_IDENTITY_LIMIT,
  PASSWORD_RECOVERY_ORIGIN_LIMIT,
  PasswordRecoveryRateLimitExceededError,
  PrismaPasswordRecoveryRateLimiter,
} from '../dist/auth/password-recovery-rate-limiter.js';

const ORIGIN_KEY = 'a'.repeat(64);
const IDENTITY_KEY = 'b'.repeat(64);
const NOW = new Date('2026-08-17T18:40:00.000Z');

function bucketKey(input) {
  const key = input.dimension_keyHash_windowStartedAt;
  return [key.dimension, key.keyHash, key.windowStartedAt.toISOString()].join(':');
}

function createHarness({ serializableFailures = 0, initial = {} } = {}) {
  const state = {
    attempts: 0,
    options: [],
    deletes: [],
    buckets: new Map(Object.entries(initial)),
  };

  const tx = {
    passwordRecoveryRateLimitBucket: {
      async deleteMany(input) {
        state.deletes.push(input);
        return { count: 0 };
      },
      async findUnique(input) {
        const count = state.buckets.get(bucketKey(input.where));
        return count === undefined ? null : { requestCount: count };
      },
      async upsert(input) {
        const key = bucketKey(input.where);
        const current = state.buckets.get(key);
        state.buckets.set(
          key,
          current === undefined
            ? input.create.requestCount
            : current + input.update.requestCount.increment,
        );
        return { id: 'bucket_1' };
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

  return {
    limiter: new PrismaPasswordRecoveryRateLimiter(prisma),
    state,
  };
}

test('incrementa origem e identidade atomicamente sem persistir endereço ou e-mail', async () => {
  const { limiter, state } = createHarness();

  await limiter.assertAllowed({ originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY }, NOW);

  assert.equal(state.attempts, 1);
  assert.deepEqual(state.options, [{ isolationLevel: 'Serializable' }]);
  assert.equal(state.buckets.size, 2);
  assert.equal(JSON.stringify([...state.buckets.keys()]).includes('@'), false);
  assert.equal(JSON.stringify([...state.buckets.keys()]).includes('127.0.0.1'), false);
  assert.equal(state.deletes.length, 1);
});

test('nega antes de incrementar quando qualquer dimensão atingiu o limite', async () => {
  const window = new Date(
    Math.floor(NOW.getTime() / (15 * 60 * 1000)) * (15 * 60 * 1000),
  ).toISOString();
  const { limiter, state } = createHarness({
    initial: {
      [`ORIGIN:${ORIGIN_KEY}:${window}`]: PASSWORD_RECOVERY_ORIGIN_LIMIT,
      [`IDENTITY:${IDENTITY_KEY}:${window}`]:
        PASSWORD_RECOVERY_IDENTITY_LIMIT - 1,
    },
  });

  await assert.rejects(
    limiter.assertAllowed({ originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY }, NOW),
    (reason) =>
      reason instanceof PasswordRecoveryRateLimitExceededError &&
      reason.retryAfterMs > 0,
  );

  assert.equal(
    state.buckets.get(`IDENTITY:${IDENTITY_KEY}:${window}`),
    PASSWORD_RECOVERY_IDENTITY_LIMIT - 1,
  );
});

test('repete somente conflito serializável com limite determinístico', async () => {
  const recovered = createHarness({ serializableFailures: 2 });
  await recovered.limiter.assertAllowed(
    { originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY },
    NOW,
  );
  assert.equal(recovered.state.attempts, 3);

  const exhausted = createHarness({ serializableFailures: 3 });
  await assert.rejects(
    exhausted.limiter.assertAllowed(
      { originKey: ORIGIN_KEY, identityKey: IDENTITY_KEY },
      NOW,
    ),
    (reason) => reason?.code === 'P2034',
  );
  assert.equal(exhausted.state.attempts, 3);
});

test('recusa chave não pseudonimizada antes de acessar o banco', async () => {
  const { limiter, state } = createHarness();

  await assert.rejects(
    limiter.assertAllowed(
      { originKey: '127.0.0.1', identityKey: IDENTITY_KEY },
      NOW,
    ),
    /HMAC SHA-256 sanitizado/u,
  );
  assert.equal(state.attempts, 0);
});
