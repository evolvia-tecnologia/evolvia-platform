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

test('CD04: snapshot de aceite só pode ser reutilizado dentro do mesmo evento e organização', async () => {
  const scoped = { eventId: 'event-qa', organizationId: 'org-qa', reservationId: 'reservation-qa' };
  const accepted = { reservationId: 'reservation-qa', eventId: 'event-qa', organizationId: 'org-qa' };
  const queried = [];
  const tx = {
    registrationRefundAcceptance: {
      findFirst: async ({ where }) => {
        queried.push(where);
        // Simula registro antigo que não pertence ao tenant solicitado.
        return where.organizationId === 'org-qa' ? accepted : null;
      },
    },
  };
  const service = new RegistrationRefundService({}, {});
  const result = await service.recordAcceptance(tx, scoped, new Date());
  assert.deepEqual(result, accepted);
  assert.deepEqual(queried, [scoped]);
});

test('CD04: replay de unicidade P2002 mantém o escopo da reserva', async () => {
  const scoped = { eventId: 'event-qa', organizationId: 'org-qa', reservationId: 'reservation-qa' };
  const queried = [];
  const tx = {
    registrationRefundAcceptance: {
      findFirst: async ({ where }) => {
        queried.push(where);
        return null;
      },
      create: async () => {
        throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '6.19.3' });
      },
    },
    eventRefundPolicy: { findUnique: async () => ({ window: 'ANYTIME', version: 1 }) },
    eventRefundPolicyVersion: { findUnique: async () => ({ id: 'version-qa', window: 'ANYTIME', version: 1 }) },
    event: { findUnique: async () => ({ startDate: null, timeZone: 'America/Sao_Paulo' }) },
  };
  const service = new RegistrationRefundService({}, {});
  await assert.rejects(
    () => service.recordAcceptance(tx, scoped, new Date()),
    (error) => error.getStatus?.() === 409 && /outra inscrição ou organização/u.test(error.message),
  );
  assert.deepEqual(queried, [scoped, scoped]);
});

test('CD04: checkout agrupado PAID é elegível apenas na mesma reserva, evento e organização', async () => {
  const sql = [];
  const client = {
    $queryRaw: async (parts, ...params) => {
      const statement = parts.join('?');
      sql.push({ statement, params });
      if (statement.includes('to_regclass')) return [{ ready: true }];
      assert.match(statement, /"EventRegistrationOrderEntry"/u);
      assert.match(statement, /"EventRegistrationOrderCheckout"/u);
      assert.match(statement, /c\."status" = 'PAID'/u);
      assert.deepEqual(params, ['reservation-qa', 'event-qa', 'org-qa']);
      return [{ id: 'entry-qa' }];
    },
  };
  const service = new RegistrationRefundService({}, {});
  const paid = await service.groupedPaid(client, {
    id: 'reservation-qa', eventId: 'event-qa', organizationId: 'org-qa',
  });
  assert.equal(paid, true);
  assert.equal(sql.length, 2);
});

test('CD04: sem migração de compra múltipla não considera pagamento quitado', async () => {
  let calls = 0;
  const client = {
    $queryRaw: async () => {
      calls += 1;
      return [{ ready: false }];
    },
  };
  const service = new RegistrationRefundService({}, {});
  assert.equal(await service.groupedPaid(client, {
    id: 'reservation-qa', eventId: 'event-qa', organizationId: 'org-qa',
  }), false);
  assert.equal(calls, 1);
});

test('CD04: conta verificada seleciona inscrição agrupada paga sem expor outra identidade', async () => {
  let offered;
  const reservation = { id: 'reservation-qa', eventId: 'event-qa', organizationId: 'org-qa', protocol: 'EVO-QA' };
  const prisma = {
    eventRegistrationReservation: {
      findFirst: async ({ where }) => {
        assert.equal(where.checkout.is.status, 'PAID');
        return null;
      },
      findMany: async ({ where, take }) => {
        assert.equal(where.status, 'CONFIRMED');
        assert.equal(where.finalPriceCents.gt, 0);
        assert.deepEqual(where.identityHash.in, ['linked-hash']);
        assert.equal(where.emailHash, 'verified-email-hash');
        assert.equal(take, 100);
        return [reservation];
      },
    },
  };
  const service = new RegistrationRefundService(prisma, {});
  service.groupedPaid = async (_db, target) => target.id === reservation.id;
  offered = await service.paidAccountReservation({
    emailHash: 'verified-email-hash',
    identityHash: { in: ['linked-hash'] },
    event: { slug: 'evento-qa', status: 'PUBLISHED' },
  });
  assert.deepEqual(offered, reservation);
});
