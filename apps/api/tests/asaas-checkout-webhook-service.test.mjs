import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AsaasCheckoutGateway } from '../dist/asaas-checkout.gateway.js';
import { AsaasCheckoutService } from '../dist/asaas-checkout.service.js';
import {
  ASAAS_STUB_WEBHOOK_TOKEN,
  asaasStubPaidWebhook,
  webhookFingerprint,
  normalizeAsaasCheckoutWebhook,
} from '../src/asaas-checkout-policy.ts';

const REAL_TOKEN = 'webhook-token-sandbox-com-mais-de-32-caracteres';
const payload = asaasStubPaidWebhook('ci_svc_000000000000000000000000000001', 15_000);

function withEnv(env, run) {
  const keys = ['NODE_ENV', 'ASAAS_MODE', 'EVOLVIA_CI_MODE', 'ASAAS_WEBHOOK_TOKEN', 'ASAAS_ENVIRONMENT'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    return run();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function serviceWith(prisma) {
  return new AsaasCheckoutService(prisma, new AsaasCheckoutGateway(), {
    notifyRegistrationConfirmed: async () => {
      throw new Error('notificação não deveria correr');
    },
  });
}

test('receiveWebhook recusa sentinel fora do stub sem gravar', async () => {
  let writes = 0;
  const prisma = {
    $transaction: async () => {
      writes += 1;
      throw new Error('transação não deveria abrir');
    },
    asaasCheckoutWebhookEvent: {
      findUnique: async () => {
        writes += 1;
        return null;
      },
    },
  };
  const service = serviceWith(prisma);
  await withEnv({
    NODE_ENV: 'production',
    ASAAS_MODE: 'sandbox',
    ASAAS_WEBHOOK_TOKEN: ASAAS_STUB_WEBHOOK_TOKEN,
  }, async () => {
    await assert.rejects(
      () => service.receiveWebhook(ASAAS_STUB_WEBHOOK_TOKEN, payload),
      (error) => error instanceof UnauthorizedException,
    );
  });
  await withEnv({
    NODE_ENV: 'staging',
    ASAAS_MODE: 'sandbox',
    ASAAS_WEBHOOK_TOKEN: ASAAS_STUB_WEBHOOK_TOKEN,
  }, async () => {
    await assert.rejects(
      () => service.receiveWebhook(ASAAS_STUB_WEBHOOK_TOKEN, payload),
      (error) => error instanceof UnauthorizedException,
    );
  });
  assert.equal(writes, 0);
});

test('receiveWebhook aceita token real em transação serializável e rejeita duplicata divergente', async () => {
  const event = normalizeAsaasCheckoutWebhook(payload);
  const sameHash = webhookFingerprint(event);
  let isolation = null;
  let created = 0;
  let updated = 0;
  const prisma = {
    $transaction: async (callback, options) => {
      isolation = options.isolationLevel;
      return callback({
        asaasCheckoutWebhookEvent: {
          findUnique: async () => null,
          create: async () => {
            created += 1;
            return { id: 'stored-1' };
          },
          update: async () => {
            updated += 1;
          },
        },
        eventRegistrationCheckout: {
          findFirst: async () => null,
        },
      });
    },
  };
  const service = serviceWith(prisma);
  await withEnv({
    NODE_ENV: 'development',
    ASAAS_ENVIRONMENT: 'sandbox',
    ASAAS_MODE: undefined,
    ASAAS_WEBHOOK_TOKEN: REAL_TOKEN,
  }, async () => {
    const accepted = await service.receiveWebhook(REAL_TOKEN, payload);
    assert.deepEqual(accepted, { accepted: true, duplicate: false, queued: true });
    await assert.rejects(
      () => service.receiveWebhook(ASAAS_STUB_WEBHOOK_TOKEN, payload),
      (error) => error instanceof UnauthorizedException,
    );
  });
  assert.equal(isolation, 'Serializable');
  assert.equal(created, 1);
  assert.equal(updated, 0);

  const conflictPrisma = {
    $transaction: async (callback, options) => {
      isolation = options.isolationLevel;
      return callback({
        asaasCheckoutWebhookEvent: {
          findUnique: async () => ({
            id: 'dup-1',
            payloadHash: `not-${sameHash}`,
            processedAt: null,
            externalCheckoutId: event.externalCheckoutId,
          }),
          create: async () => {
            created += 1;
          },
          update: async () => {
            updated += 1;
          },
        },
        eventRegistrationCheckout: {
          findFirst: async () => {
            throw new Error('checkout não deveria ser lido em conflito');
          },
        },
      });
    },
  };
  const conflicting = serviceWith(conflictPrisma);
  await withEnv({
    NODE_ENV: 'development',
    ASAAS_ENVIRONMENT: 'sandbox',
    ASAAS_WEBHOOK_TOKEN: REAL_TOKEN,
  }, async () => {
    await assert.rejects(
      () => conflicting.receiveWebhook(REAL_TOKEN, payload),
      (error) => error instanceof ConflictException,
    );
  });
  assert.equal(created, 1);
  assert.equal(updated, 0);
});
