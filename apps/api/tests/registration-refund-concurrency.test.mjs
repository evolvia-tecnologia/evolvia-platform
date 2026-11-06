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

test('CD04: conflito de aceite não aborta a transação nem atravessa tenant', async () => {
  const scoped = { eventId: 'event-qa', organizationId: 'org-qa', reservationId: 'reservation-qa' };
  const queried = [];
  let writes = 0;
  const tx = {
    registrationRefundAcceptance: {
      findFirst: async ({ where }) => {
        queried.push(where);
        return null;
      },
      createMany: async ({ skipDuplicates, data }) => {
        assert.equal(skipDuplicates, true);
        assert.equal(data[0].organizationId, 'org-qa');
        writes += 1;
        return { count: 0 };
      },
    },
    eventRefundPolicy: { findUnique: async () => ({ window: 'ANYTIME', version: 1 }) },
    eventRefundPolicyVersion: { findUnique: async () => ({ id: 'version-qa', window: 'ANYTIME', version: 1 }) },
    event: { findUnique: async () => ({ startDate: null, timeZone: 'America/Sao_Paulo' }) },
    auditLog: { create: async () => { throw new Error('conflito não deve gerar auditoria de novo aceite'); } },
  };
  const service = new RegistrationRefundService({}, {});
  await assert.rejects(
    () => service.recordAcceptance(tx, scoped, new Date()),
    (error) => error.getStatus?.() === 409 && /outra inscrição ou organização/u.test(error.message),
  );
  assert.equal(writes, 1);
  assert.deepEqual(queried, [scoped, scoped]);
});

test('CD04: aceite registrado uma vez preserva snapshot e auditoria', async () => {
  const scoped = { eventId: 'event-qa', organizationId: 'org-qa', reservationId: 'reservation-qa' };
  let created = null;
  let logs = 0;
  const tx = {
    registrationRefundAcceptance: {
      findFirst: async ({ where }) => {
        assert.deepEqual(where, scoped);
        return created;
      },
      createMany: async ({ data, skipDuplicates }) => {
        assert.equal(skipDuplicates, true);
        created = data[0];
        return { count: 1 };
      },
    },
    eventRefundPolicy: { findUnique: async () => ({ window: 'ANYTIME', version: 4 }) },
    eventRefundPolicyVersion: { findUnique: async () => ({ id: 'version-4', window: 'ANYTIME', version: 4 }) },
    event: { findUnique: async () => ({ startDate: null, timeZone: 'America/Sao_Paulo' }) },
    auditLog: { create: async ({ data }) => {
      logs += 1;
      assert.equal(data.organizationId, scoped.organizationId);
      assert.equal(data.metadata.version, 4);
    } },
  };
  const service = new RegistrationRefundService({}, {});
  const first = await service.recordAcceptance(tx, scoped, new Date('2026-11-06T20:00:00.000Z'));
  const again = await service.recordAcceptance(tx, scoped, new Date('2026-11-06T20:01:00.000Z'));
  assert.equal(first.version, 4);
  assert.equal(first.policyVersionId, 'version-4');
  assert.equal(again.acceptedAt.toISOString(), first.acceptedAt.toISOString());
  assert.equal(logs, 1);
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

test('CD04: conta verificada encontra compra agrupada após mais de 100 inscrições', async () => {
  const pages = [];
  const rows = Array.from({ length: 101 }, (_, index) => ({
    id: `reservation-${String(index).padStart(3, '0')}`,
    eventId: 'event-qa', organizationId: 'org-qa',
    protocol: `P-${index}`, checkout: null,
  }));
  const prisma = {
    eventRegistrationReservation: {
      findMany: async (query) => {
        assert.equal(query.where.status, 'CONFIRMED');
        assert.equal(query.where.finalPriceCents.gt, 0);
        assert.deepEqual(query.where.identityHash, { in: ['identity-qa'] });
        assert.equal(query.where.emailHash, 'email-qa');
        assert.equal(query.take, 100);
        pages.push(query.cursor?.id ?? null);
        return query.cursor ? rows.slice(100) : rows.slice(0, 100);
      },
    },
  };
  const service = new RegistrationRefundService(prisma, {});
  service.groupedPaid = async (_client, reservation) => reservation.id === 'reservation-100';
  const result = await service.paidAccountReservation({
    emailHash: 'email-qa', identityHash: { in: ['identity-qa'] },
    event: { slug: 'evento-qa', status: 'PUBLISHED' },
  });
  assert.equal(result.id, 'reservation-100');
  assert.deepEqual(pages, [null, 'reservation-099']);
});

test('CD04: compra agrupada recente prevalece sobre checkout individual antigo', async () => {
  const prisma = {
    eventRegistrationReservation: {
      findMany: async () => [
        { id: 'recent', eventId: 'event-qa', organizationId: 'org-qa', protocol: 'RECENT', checkout: null },
        { id: 'old', eventId: 'event-qa', organizationId: 'org-qa', protocol: 'OLD', checkout: { status: 'PAID' } },
      ],
    },
  };
  const service = new RegistrationRefundService(prisma, {});
  service.groupedPaid = async (_client, reservation) => reservation.id === 'recent';
  const result = await service.paidAccountReservation({
    emailHash: 'email-qa', identityHash: { in: ['identity-qa'] },
    event: { slug: 'evento-qa', status: 'PUBLISHED' },
  });
  assert.deepEqual(result, { id: 'recent', eventId: 'event-qa', organizationId: 'org-qa', protocol: 'RECENT' });
});

test('G2.11: compra agrupada paga grava um aceite individual por reserva sob o mesmo tenant', async () => {
  const calls = [];
  const rows = [{ id: 'reservation-1', accepted: true, presentedVersion: '4' }, { id: 'reservation-2', accepted: true, presentedVersion: '4' }];
  const tx = {
    eventRefundPolicy: { findUnique: async ({ where }) => {
      assert.deepEqual(where.eventId_organizationId, { eventId: 'event-qa', organizationId: 'org-qa' });
      return { version: 4 };
    } },
    eventRefundPolicyVersion: { findUnique: async () => ({ id: 'version-4' }) },
    $queryRaw: async (strings, ...values) => {
      const query = strings.join('?');
      assert.match(query, /FOR UPDATE OF r/u);
      assert.match(query, /refund_policy_acceptance/u);
      assert.match(query, /"status" = 'PENDING_PAYMENT'/u);
      assert.deepEqual(values, ['order-qa', 'event-qa', 'org-qa']);
      return rows;
    },
  };
  const service = new RegistrationRefundService({}, {});
  service.recordAcceptance = async (_tx, scope) => {
    calls.push(scope);
    return { policyVersionId: 'version-4' };
  };
  const result = await service.recordOrderAcceptances(tx,
    { orderId: 'order-qa', eventId: 'event-qa', organizationId: 'org-qa' }, new Date());
  assert.deepEqual(result, { acceptedCount: 2, policyVersionId: 'version-4' });
  assert.deepEqual(calls.map((value) => value.reservationId), ['reservation-1', 'reservation-2']);
  assert.ok(calls.every((value) => value.organizationId === 'org-qa' && value.eventId === 'event-qa'));
});

test('G2.11: sem consentimento individual a compra agrupada falha antes de qualquer gravação', async () => {
  let writes = 0;
  const tx = {
    eventRefundPolicy: { findUnique: async () => ({ version: 1 }) },
    eventRefundPolicyVersion: { findUnique: async () => ({ id: 'policy-1' }) },
    $queryRaw: async () => [
      { id: 'reservation-1', accepted: true, presentedVersion: '4' },
      { id: 'reservation-2', accepted: false, presentedVersion: '1' },
    ],
  };
  const service = new RegistrationRefundService({}, {});
  service.recordAcceptance = async () => { writes += 1; };
  await assert.rejects(() => service.recordOrderAcceptances(tx,
    { orderId: 'order-qa', eventId: 'event-qa', organizationId: 'org-qa' }, new Date()),
    (error) => error.getStatus?.() === 409 && /expressamente/u.test(error.message));
  assert.equal(writes, 0);
});

test('G2.11: versão divergente da política bloqueia operação transacional', async () => {
  const tx = {
    eventRefundPolicy: { findUnique: async () => ({ version: 5 }) },
    eventRefundPolicyVersion: { findUnique: async () => ({ id: 'policy-5' }) },
    $queryRaw: async () => [
      { id: 'reservation-1', accepted: true, presentedVersion: '5' },
      { id: 'reservation-2', accepted: true, presentedVersion: '5' },
    ],
  };
  const service = new RegistrationRefundService({}, {});
  service.recordAcceptance = async () => ({ policyVersionId: 'policy-4' });
  await assert.rejects(() => service.recordOrderAcceptances(tx,
    { orderId: 'order-qa', eventId: 'event-qa', organizationId: 'org-qa' }, new Date()),
    (error) => error.getStatus?.() === 409 && /mudou/u.test(error.message));
});

test('G2.11: versão exibida ao comprador não pode divergir da política vigente', async () => {
  const tx = {
    eventRefundPolicy: { findUnique: async () => ({ version: 5 }) },
    eventRefundPolicyVersion: { findUnique: async () => ({ id: 'policy-5' }) },
    $queryRaw: async () => [
      { id: 'reservation-1', accepted: true, presentedVersion: '4' },
      { id: 'reservation-2', accepted: true, presentedVersion: '4' },
    ],
  };
  const service = new RegistrationRefundService({}, {});
  service.recordAcceptance = async () => { throw new Error('não gravar consentimento de versão defasada'); };
  await assert.rejects(() => service.recordOrderAcceptances(tx,
    { orderId: 'order-qa', eventId: 'event-qa', organizationId: 'org-qa' }, new Date()),
    (error) => error.getStatus?.() === 409 && /recarregue/u.test(error.message));
});

test('G2.11: política ausente bloqueia o checkout sem consultar ou chamar provedor', async () => {
  const tx = { eventRefundPolicy: { findUnique: async () => null } };
  const service = new RegistrationRefundService({}, {});
  await assert.rejects(() => service.recordOrderAcceptances(tx,
    { orderId: 'order-qa', eventId: 'event-qa', organizationId: 'org-qa' }, new Date()),
    (error) => error.getStatus?.() === 409 && /Publique/u.test(error.message));
});
