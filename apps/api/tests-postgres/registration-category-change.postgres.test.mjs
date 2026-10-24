// Somente PostgreSQL descartável com migrations aplicadas (DATABASE_URL), sem provedor externo.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test, { after } from 'node:test';
import { PrismaClient, Prisma } from '@prisma/client';
import { AuthorizationService } from '../dist/authorization.service.js';
import { RegistrationOperationsService } from '../dist/registration-operations.service.js';

const db = new PrismaClient();
after(() => db.$disconnect());
const hash = (text) => createHash('sha256').update(text).digest('hex');

async function fixture() {
  const run = randomBytes(8).toString('hex');
  const owner = await db.user.create({ data: { name: 'QA categoria', email: `category-${run}@evolvia-ci.local`, passwordHash: 'x' } });
  const organization = await db.organization.create({ data: { name: 'QA categoria', slug: `category-${run}`, createdById: owner.id } });
  await db.organizationMembership.create({ data: { organizationId: organization.id, userId: owner.id, role: 'OWNER' } });
  const event = await db.event.create({ data: {
    ownerId: owner.id, organizationId: organization.id, name: 'QA troca paga', slug: `category-event-${run}`,
    eventType: 'Outro tipo de evento', format: 'IN_PERSON', registrationMode: 'FREE', status: 'PUBLISHED', timeZone: 'America/Sao_Paulo',
  } });
  const scope = { eventId: event.id, organizationId: organization.id };
  const catalog = await db.eventRegistrationCatalog.create({ data: scope });
  async function category(code, capacity = null) {
    const category = await db.eventRegistrationCategory.create({ data: { ...scope, catalogId: catalog.id, code, name: code, capacity } });
    const lot = await db.eventRegistrationLot.create({ data: {
      ...scope, categoryId: category.id, code: `LOT-${code}`, name: code, quantity: capacity,
      startsAt: new Date('2026-01-01T00:00:00Z'), endsAt: new Date('2027-01-01T00:00:00Z'), priceCents: 10000,
    } });
    return { categoryId: category.id, lotId: lot.id };
  }
  const origin = await category('ORIGIN');
  const target = await category('TARGET', 1);
  const rows = [];
  for (const index of [0, 1]) {
    const protocol = `EVO-${hash(`${run}-${index}`).slice(0, 16).toUpperCase()}`;
    const row = await db.eventRegistrationReservation.create({ data: {
      ...scope, ...origin, protocol, idempotencyKeyHash: hash(`id-${run}-${index}`), payloadHash: hash(`payload-${run}-${index}`),
      identityHash: hash(`identity-${run}-${index}`), emailHash: hash(`email-${run}-${index}`),
      registrationData: { registration_type: origin.categoryId, full_name: `Pessoa ${index}` },
      basePriceCents: 10000, discountPercent: 20, finalPriceCents: 8000, status: 'CONFIRMED', confirmedAt: new Date(),
    } });
    await db.eventRegistrationCheckout.create({ data: {
      ...scope, reservationId: row.id, idempotencyKeyHash: hash(`checkout-${run}-${index}`), requestHash: hash(`request-${run}-${index}`),
      status: 'PAID', amountCents: 8000, expiresAt: new Date('2027-01-01T00:00:00Z'), paidAt: new Date(),
    } });
    rows.push(row);
  }
  return { ownerId: owner.id, ...scope, origin, target, rows };
}

function service(client) {
  return new RegistrationOperationsService(client, new AuthorizationService(client));
}

test('duas trocas pagas na última vaga confirmam uma só e preservam o pagamento', { timeout: 30000 }, async () => {
  const f = await fixture();
  const clients = [new PrismaClient(), new PrismaClient()];
  const snapshots = await db.eventRegistrationReservation.findMany({ where: { eventId: f.eventId }, include: { checkout: true }, orderBy: { id: 'asc' } });
  let arrivals = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const isolationLevels = [];
  let conflicts = 0;
  const instruments = clients.map((client) => {
    let firstRead = true;
    return new Proxy(client, { get(target, key) {
      if (key !== '$transaction') return Reflect.get(target, key);
      return (callback, options) => {
        isolationLevels.push(options?.isolationLevel);
        return client.$transaction((tx) => callback(new Proxy(tx, { get(targetTx, model) {
          if (model !== 'eventRegistrationReservation') return Reflect.get(targetTx, model);
          return new Proxy(tx.eventRegistrationReservation, { get(delegate, method) {
            if (method !== 'count') return Reflect.get(delegate, method);
            return async (args) => {
              const count = await delegate.count(args);
              if (args.where.categoryId === f.target.categoryId && firstRead) {
                firstRead = false;
                arrivals += 1;
                if (arrivals === 2) release();
                let timer;
                try {
                  await Promise.race([barrier, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('As duas transações não leram a mesma vaga.')), 8000); })]);
                } finally { clearTimeout(timer); }
              }
              return count;
            };
          } });
        } })), { ...options, timeout: 15000 }).catch((error) => {
          if (error.code === 'P2034') conflicts += 1;
          throw error;
        });
      };
    } });
  });
  try {
    const results = await Promise.allSettled(instruments.map((client, i) => service(client).changeCategory(f.ownerId, f.eventId, f.rows[i].protocol, f.target)));
    assert.equal(arrivals, 2);
    assert.ok(isolationLevels.every((level) => level === Prisma.TransactionIsolationLevel.Serializable));
    assert.ok(conflicts >= 1, 'a colisão deve ser resolvida pelo PostgreSQL, sem erro simulado');
    assert.equal(results.filter((r) => r.status === 'fulfilled' && r.value.changed).length, 1);
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.getStatus(), 409);
    assert.equal(await db.eventRegistrationReservation.count({ where: { eventId: f.eventId, categoryId: f.target.categoryId } }), 1);
    const finalRows = await db.eventRegistrationReservation.findMany({ where: { eventId: f.eventId }, include: { checkout: true }, orderBy: { id: 'asc' } });
    for (let i = 0; i < finalRows.length; i += 1) {
      const financial = ({ basePriceCents, discountPercent, finalPriceCents, status, checkout }) => ({ basePriceCents, discountPercent, finalPriceCents, status, checkout });
      assert.deepEqual(financial(finalRows[i]), financial(snapshots[i]));
    }
    const audits = await db.auditLog.findMany({ where: { eventId: f.eventId, action: 'registration.category_changed' } });
    assert.equal(audits.length, 1);
    assert.equal(JSON.stringify(audits[0].metadata).includes('Pessoa'), false);
    const winner = finalRows.find((row) => row.categoryId === f.target.categoryId);
    assert.equal((await service(db).changeCategory(f.ownerId, f.eventId, winner.protocol, f.target)).changed, false);
    assert.equal(await db.auditLog.count({ where: { eventId: f.eventId, action: 'registration.category_changed' } }), 1);
  } finally { await Promise.all(clients.map((client) => client.$disconnect())); }
});

test('outro evento e usuário sem vínculo não trocam categoria nem gravam auditoria', async () => {
  const home = await fixture();
  const foreign = await fixture();
  const operations = service(db);
  await assert.rejects(() => operations.changeCategory(foreign.ownerId, home.eventId, home.rows[0].protocol, home.target), (error) => error.getStatus() === 404);
  await assert.rejects(() => operations.changeCategory(home.ownerId, home.eventId, home.rows[0].protocol, foreign.target), (error) => error.getStatus() === 404);
  await assert.rejects(() => operations.changeCategory(home.ownerId, home.eventId, foreign.rows[0].protocol, home.target), (error) => error.getStatus() === 404);
  assert.equal((await db.eventRegistrationReservation.findUnique({ where: { id: home.rows[0].id } })).categoryId, home.origin.categoryId);
  assert.equal(await db.auditLog.count({ where: { eventId: home.eventId, action: 'registration.category_changed' } }), 0);
});

test('falha após gravar auditoria desfaz categoria e auditoria no PostgreSQL', async () => {
  const f = await fixture();
  const failure = new Error('falha controlada após auditoria');
  const failing = new Proxy(db, { get(target, key) {
    if (key !== '$transaction') return Reflect.get(target, key);
    return (callback, options) => db.$transaction((tx) => callback(new Proxy(tx, { get(targetTx, model) {
      if (model !== 'auditLog') return Reflect.get(targetTx, model);
      return { create: async (args) => { await tx.auditLog.create(args); throw failure; } };
    } })), options);
  } });
  await assert.rejects(() => service(failing).changeCategory(f.ownerId, f.eventId, f.rows[0].protocol, f.target), (error) => error === failure);
  const row = await db.eventRegistrationReservation.findUnique({ where: { id: f.rows[0].id } });
  assert.equal(row.categoryId, f.origin.categoryId);
  assert.equal(row.lotId, f.origin.lotId);
  assert.deepEqual(row.registrationData, f.rows[0].registrationData);
  assert.equal(row.finalPriceCents, 8000);
  assert.equal(await db.auditLog.count({ where: { eventId: f.eventId, action: 'registration.category_changed' } }), 0);
});

test('banco recusa pendência sem prazo e reserva pendente válida segura a última vaga', async () => {
  const f = await fixture();
  await assert.rejects(
    () => db.eventRegistrationReservation.update({
      where: { id: f.rows[1].id },
      data: { ...f.target, status: 'PENDING_PAYMENT', expiresAt: null, confirmedAt: null },
    }),
    (error) => error.message.includes('EventRegistrationReservation_expiry_check'),
  );
  const rejectedRow = await db.eventRegistrationReservation.findUnique({ where: { id: f.rows[1].id } });
  assert.equal(rejectedRow.status, 'CONFIRMED');
  assert.equal(rejectedRow.categoryId, f.origin.categoryId);
  await db.eventRegistrationReservation.update({
    where: { id: f.rows[1].id },
    data: { ...f.target, status: 'PENDING_PAYMENT', expiresAt: new Date(Date.now() + 15 * 60 * 1000), confirmedAt: null },
  });
  await assert.rejects(
    () => service(db).changeCategory(f.ownerId, f.eventId, f.rows[0].protocol, f.target),
    (error) => error.getStatus() === 409,
  );
  const unchanged = await db.eventRegistrationReservation.findUnique({ where: { id: f.rows[0].id }, include: { checkout: true } });
  assert.equal(unchanged.categoryId, f.origin.categoryId);
  assert.equal(unchanged.finalPriceCents, 8000);
  assert.equal(unchanged.checkout.status, 'PAID');
  assert.equal(await db.auditLog.count({ where: { eventId: f.eventId, action: 'registration.category_changed' } }), 0);
});

