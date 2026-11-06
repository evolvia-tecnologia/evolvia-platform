import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { RegistrationRefundService } from '../dist/registration-refund.service.js';

const event = { id: 'event-qa', organizationId: 'org-qa', startDate: null, timeZone: 'America/Sao_Paulo' };

test('CD04: política calcula nova versão na transação serializável após conflito P2034', async () => {
  const versions = [];
  let attempts = 0;
  const prisma = {
    $transaction: async (callback, options) => {
      assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
      attempts += 1;
      if (attempts === 1) {
        throw new Prisma.PrismaClientKnownRequestError('serialization conflict', { code: 'P2034', clientVersion: '6.19.3' });
      }
      return callback({
        eventRefundPolicy: {
          findUnique: async ({ where }) => {
            assert.deepEqual(where.eventId_organizationId, { eventId: 'event-qa', organizationId: 'org-qa' });
            return { version: 2, window: 'DAYS_7' };
          },
          upsert: async ({ update }) => {
            assert.equal(update.version, 3);
            assert.equal(update.window, 'DAYS_1');
          },
        },
        eventRefundPolicyVersion: { create: async ({ data }) => versions.push(data) },
        auditLog: { create: async ({ data }) => {
          assert.equal(data.organizationId, 'org-qa');
          assert.equal(data.metadata.version, 3);
        } },
      });
    },
  };
  const service = new RegistrationRefundService(prisma, {});
  service.organizerEvent = async () => event;
  service.livePolicy = async () => ({ version: 3, window: 'DAYS_1' });
  const result = await service.savePolicy('owner-qa', 'event-qa', { window: 'DAYS_1' });
  assert.equal(attempts, 2);
  assert.equal(versions.length, 1);
  assert.equal(versions[0].version, 3);
  assert.equal(result.version, 3);
});

test('CD04: falha persistente de concorrência não publica falsa versão', async () => {
  let attempts = 0;
  const prisma = {
    $transaction: async () => {
      attempts += 1;
      throw new Prisma.PrismaClientKnownRequestError('unique collision', { code: 'P2002', clientVersion: '6.19.3' });
    },
  };
  const service = new RegistrationRefundService(prisma, {});
  service.organizerEvent = async () => event;
  service.livePolicy = async () => { throw new Error('não deve publicar sem commit'); };
  await assert.rejects(() => service.savePolicy('owner-qa', 'event-qa', { window: 'DAYS_1' }),
    (error) => error.code === 'P2002');
  assert.equal(attempts, 3);
});
