// Executa contra um PostgreSQL descartável com as migrations aplicadas (DATABASE_URL).
// No CI roda dentro do contêiner da API, depois do smoke; localmente, após `npm run build`.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test, { after, before } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { AuthorizationService } from '../dist/authorization.service.js';
import { RegistrationReservationsService } from '../dist/registration-reservations.service.js';
import { RegistrationWaitlistService } from '../dist/registration-waitlist.service.js';

const migrationSql = await readFile(
  new URL('../prisma/migrations/20261007060000_registration_waitlist/migration.sql', import.meta.url),
  'utf8',
);
const run = randomBytes(5).toString('hex');
const token = `Filapg${run}`;
const prisma = new PrismaClient();
const authorization = new AuthorizationService(prisma);
const reservations = new RegistrationReservationsService(
  prisma,
  { isConfigured: () => false },
  { notifyRegistrationConfirmed: async () => {} },
);
const waitlist = new RegistrationWaitlistService(prisma, authorization, reservations);
const people = {};
let organizationId;
let externalOrganizationId;
let cpfSeed = 100_000_000 + Math.floor(Math.random() * 800_000_000);

function cpf() {
  cpfSeed += 1;
  const base = String(cpfSeed).padStart(9, '0').split('').map(Number);
  for (const size of [9, 10]) {
    const sum = base.slice(0, size).reduce((total, digit, index) => total + digit * (size + 1 - index), 0);
    const rest = (sum * 10) % 11;
    base.push(rest === 10 ? 0 : rest);
  }
  return base.join('');
}

async function user(key, verified = true) {
  people[key] = await prisma.user.create({
    data: {
      name: `PG ${key}`, email: `${key}-${run}@evolvia-ci.local`, passwordHash: 'x',
      emailVerifiedAt: verified ? new Date() : null,
    },
  });
  people[key].document = cpf();
  return people[key];
}

async function rejects(promise, status, pattern) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.getStatus?.(), status, `esperado ${status}, recebido ${error.getStatus?.()}: ${error.message}`);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

async function scenario({ quantity = 1, mode = 'PAID', priceCents = 5000, org = organizationId, owner = 'owner' } = {}) {
  const suffix = randomBytes(4).toString('hex');
  const event = await prisma.event.create({
    data: {
      ownerId: people[owner].id, organizationId: org, name: `${token} evento`, slug: `${token.toLowerCase()}-${suffix}`,
      eventType: 'Outro tipo de evento', format: 'IN_PERSON', registrationMode: mode, status: 'PUBLISHED',
    },
  });
  const catalog = await prisma.eventRegistrationCatalog.create({ data: { organizationId: org, eventId: event.id } });
  const category = await prisma.eventRegistrationCategory.create({
    data: { organizationId: org, eventId: event.id, catalogId: catalog.id, code: 'GERAL', name: 'Geral' },
  });
  const lot = await prisma.eventRegistrationLot.create({
    data: {
      organizationId: org, eventId: event.id, categoryId: category.id, code: 'LOTE1', name: 'Lote 1',
      startsAt: new Date(Date.now() - 3_600_000), endsAt: new Date(Date.now() + 7 * 86_400_000),
      quantity, priceCents,
    },
  });
  const terms = await prisma.eventRegistrationTermsDocument.create({
    data: {
      organizationId: org, eventId: event.id, storageKey: `terms/${token}/${suffix}.pdf`, fileName: 'termos.pdf',
      byteSize: 10, checksumSha256: 'a'.repeat(64), version: 1, createdByUserId: people[owner].id,
    },
  });
  return { event, category, lot, terms };
}

function form(ctx, person, overrides = {}) {
  return {
    categoryId: ctx.category.id,
    lotId: ctx.lot.id,
    answers: {
      full_name: `Pessoa ${person.name}`, preferred_name: 'Pessoa', identity_document: person.document,
      email: person.email, phone: '81999990000', terms_acceptance: true, registration_type: ctx.category.id,
      ...overrides,
    },
  };
}

async function enable(ctx, offerMinutes = 30) {
  return waitlist.configure(people.owner.id, ctx.event.id, ctx.lot.id, { enabled: true, offerMinutes });
}

async function fill(ctx, key) {
  const person = people[key] ?? await user(key);
  return reservations.reserve(ctx.event.slug, form(ctx, person), randomUUID());
}

async function join(ctx, key) {
  const person = people[key] ?? await user(key);
  return waitlist.join(person.id, ctx.event.slug, { lotId: ctx.lot.id, identityDocument: person.document });
}

before(async () => {
  await user('owner');
  await user('operator');
  await user('external');
  const organization = await prisma.organization.create({
    data: { name: `Org ${token}`, slug: `org-${token.toLowerCase()}`, createdById: people.owner.id },
  });
  organizationId = organization.id;
  const external = await prisma.organization.create({
    data: { name: `Externa ${token}`, slug: `ext-${token.toLowerCase()}`, createdById: people.external.id },
  });
  externalOrganizationId = external.id;
  await prisma.organizationMembership.createMany({
    data: [
      { organizationId, userId: people.owner.id, role: 'OWNER' },
      { organizationId, userId: people.operator.id, role: 'OPERATOR' },
      { organizationId: external.id, userId: people.external.id, role: 'OWNER' },
    ],
  });
});

after(async () => {
  await prisma.event.updateMany({ where: { name: { startsWith: token }, status: 'PUBLISHED' }, data: { status: 'CANCELLED' } });
  await prisma.$disconnect();
});

test('lote lotado aparece só na fila, segura a vaga liberada e mostra a posição própria sem PII', async () => {
  const ctx = await scenario();
  await fill(ctx, 'holder1');
  await rejects(join(ctx, 'early'), 409, /fila de espera deste lote não está aberta/u);
  await enable(ctx);
  const options = await reservations.getOptions(ctx.event.slug);
  assert.deepEqual(options.categories, []);
  assert.equal(options.waitlist.length, 1);
  assert.equal(options.waitlist[0].lotId, ctx.lot.id);

  const first = await join(ctx, 'ana');
  const second = await join(ctx, 'bia');
  assert.equal(first.entries[0].position, 1);
  assert.equal(second.entries[0].position, 2);
  assert.equal(second.entries.length, 1, 'só o próprio estado');
  const serialized = JSON.stringify(second);
  for (const secret of [people.ana.email, people.ana.document, people.bia.email, people.bia.document, people.ana.name]) {
    assert.equal(serialized.includes(secret), false, `resposta não revela ${secret}`);
  }

  await prisma.eventRegistrationReservation.updateMany({ where: { eventId: ctx.event.id }, data: { status: 'CANCELLED' } });
  const held = await reservations.getOptions(ctx.event.slug);
  assert.deepEqual(held.categories, [], 'vaga liberada fica com a fila');
  await rejects(fill(ctx, 'outsider'), 409, /fila de espera/u);

  const overview = await waitlist.organizerOverview(people.operator.id, ctx.event.id);
  const lot = overview.lots.find((item) => item.lotId === ctx.lot.id);
  assert.equal(lot.free, 1);
  assert.equal(lot.waiting, 2);
  assert.deepEqual(lot.entries.map((entry) => entry.position), [1, 2]);
  assert.ok(lot.entries.every((entry) => /^FILA-[A-F0-9]{8}$/u.test(entry.code)));
  assert.equal(JSON.stringify(overview).includes(people.ana.email), false);
  assert.equal(overview.canManage, false, 'operador acompanha mas não promove');
});

test('duas promoções simultâneas não usam a mesma última vaga; repetir a chave é idempotente', async () => {
  const outcomes = { retriedThenRefused: 0 };
  for (let round = 0; round < 6; round += 1) {
    const ctx = await scenario();
    await fill(ctx, `h${round}`);
    await enable(ctx);
    await join(ctx, `a${round}`);
    await join(ctx, `b${round}`);
    await prisma.eventRegistrationReservation.updateMany({ where: { eventId: ctx.event.id }, data: { status: 'CANCELLED' } });
    const keys = [randomUUID(), randomUUID()];
    const results = await Promise.allSettled(keys.map((key) => waitlist.promote(people.owner.id, ctx.event.id, { lotId: ctx.lot.id }, key)));
    const fulfilled = results.filter((item) => item.status === 'fulfilled');
    assert.equal(fulfilled.length, 1, `rodada ${round}: exatamente uma promoção`);
    const refused = results.find((item) => item.status === 'rejected');
    assert.equal(refused.reason.getStatus(), 409);
    if (/Não há vaga liberada/u.test(refused.reason.message)) outcomes.retriedThenRefused += 1;
    assert.equal(await prisma.eventRegistrationWaitlistEntry.count({ where: { lotId: ctx.lot.id, status: 'OFFERED' } }), 1);

    const key = keys[results.indexOf(fulfilled[0])];
    const repeated = await waitlist.promote(people.owner.id, ctx.event.id, { lotId: ctx.lot.id }, key);
    assert.equal(repeated.repeated, true);
    assert.equal(repeated.code, fulfilled[0].value.code);
    const state = await waitlist.participantState(people[`a${round}`].id, ctx.event.slug);
    assert.equal(state.entries[0].status, 'OFFERED', 'FIFO: quem entrou primeiro recebe a oferta');
    await rejects(fill(ctx, `late${round}`), 409);
  }
  console.log(`PROMOTION_RACE: ${JSON.stringify(outcomes)}`);
});

test('promoção e reserva pública concorrentes nunca excedem a última vaga', async () => {
  const outcomes = { promotion: 0, reservation: 0 };
  for (let round = 0; round < 8; round += 1) {
    const ctx = await scenario();
    await fill(ctx, `r${round}h`);
    await enable(ctx);
    await join(ctx, `r${round}w`);
    await prisma.eventRegistrationReservation.updateMany({ where: { eventId: ctx.event.id }, data: { status: 'CANCELLED' } });
    await waitlist.configure(people.owner.id, ctx.event.id, ctx.lot.id, { enabled: false, offerMinutes: 30 });
    const outsider = await user(`r${round}o`);
    const [promotion, reservation] = await Promise.allSettled([
      waitlist.promote(people.owner.id, ctx.event.id, { lotId: ctx.lot.id }, randomUUID()),
      reservations.reserve(ctx.event.slug, form(ctx, outsider), randomUUID()),
    ]);
    const occupied = await prisma.eventRegistrationReservation.count({ where: { lotId: ctx.lot.id, status: { in: ['CONFIRMED', 'PENDING_PAYMENT'] } } })
      + await prisma.eventRegistrationWaitlistEntry.count({ where: { lotId: ctx.lot.id, status: 'OFFERED' } });
    assert.equal(occupied, 1, `rodada ${round}: a última vaga é usada uma única vez`);
    assert.equal([promotion, reservation].filter((item) => item.status === 'fulfilled').length, 1);
    for (const item of [promotion, reservation]) if (item.status === 'rejected') assert.equal(item.reason.getStatus(), 409);
    if (promotion.status === 'fulfilled') outcomes.promotion += 1; else outcomes.reservation += 1;
  }
  console.log(`PROMOTION_VS_RESERVATION: ${JSON.stringify(outcomes)}`);
});

test('aceite confirma pela ficha, exige o mesmo documento e não paga nem faz check-in', async () => {
  const ctx = await scenario();
  await fill(ctx, 'c-holder');
  await enable(ctx);
  await join(ctx, 'carla');
  await join(ctx, 'dani');
  await rejects(waitlist.accept(people.carla.id, ctx.event.slug, ctx.lot.id, form(ctx, people.carla), randomUUID()), 409, /expirou ou não está mais ativa/u);
  await prisma.eventRegistrationReservation.updateMany({ where: { eventId: ctx.event.id }, data: { status: 'CANCELLED' } });
  await waitlist.promote(people.owner.id, ctx.event.id, { lotId: ctx.lot.id }, randomUUID());

  const offer = await waitlist.offerOptions(people.carla.id, ctx.event.slug, ctx.lot.id);
  assert.equal(offer.categories[0].lots[0].id, ctx.lot.id);
  await rejects(waitlist.offerOptions(people.dani.id, ctx.event.slug, ctx.lot.id), 404);
  await rejects(waitlist.accept(people.dani.id, ctx.event.slug, ctx.lot.id, form(ctx, people.dani), randomUUID()), 409);
  await rejects(
    waitlist.accept(people.carla.id, ctx.event.slug, ctx.lot.id, form(ctx, people.carla, { identity_document: people.dani.document }), randomUUID()),
    400, /mesmo documento/u,
  );

  const key = randomUUID();
  const [one, two] = await Promise.all([
    waitlist.accept(people.carla.id, ctx.event.slug, ctx.lot.id, form(ctx, people.carla), key),
    waitlist.accept(people.carla.id, ctx.event.slug, ctx.lot.id, form(ctx, people.carla), key),
  ].map((promise) => promise.catch((error) => error)));
  const accepted = [one, two].find((item) => item.protocol);
  assert.ok(accepted, 'uma das repetições confirma');
  for (const item of [one, two]) if (!item.protocol) assert.equal(item.getStatus(), 409);
  const replay = await waitlist.accept(people.carla.id, ctx.event.slug, ctx.lot.id, form(ctx, people.carla), key);
  assert.equal(replay.protocol, accepted.protocol, 'mesma chave devolve a mesma reserva');
  await rejects(waitlist.accept(people.carla.id, ctx.event.slug, ctx.lot.id, form(ctx, people.carla), randomUUID()), 409);

  assert.equal(accepted.status, 'PENDING_PAYMENT', 'evento pago segue para pagamento, sem marcar pago');
  const reservation = await prisma.eventRegistrationReservation.findUniqueOrThrow({
    where: { protocol: accepted.protocol }, include: { checkIn: true, checkout: true, paymentReceipt: true },
  });
  assert.equal(reservation.checkIn, null);
  assert.equal(reservation.checkout, null);
  assert.equal(reservation.paymentReceipt, null);
  assert.equal(await prisma.eventRegistrationReservation.count({ where: { lotId: ctx.lot.id, status: { in: ['CONFIRMED', 'PENDING_PAYMENT'] } } }), 1);
  const entry = await prisma.eventRegistrationWaitlistEntry.findUniqueOrThrow({ where: { lotId_userId: { lotId: ctx.lot.id, userId: people.carla.id } } });
  assert.equal(entry.status, 'ACCEPTED');
  assert.equal(entry.reservationId, reservation.id);
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: reservation.id, action: 'registration.reservation_created' } });
  assert.equal(audit.metadata.channel, 'waitlist');
  await rejects(waitlist.leave(people.carla.id, ctx.event.slug, ctx.lot.id), 409);
});

test('oferta vencida e inscrição cancelada não promovem a pessoa errada', async () => {
  const ctx = await scenario();
  await fill(ctx, 'e-holder');
  await enable(ctx);
  await join(ctx, 'edu');
  await join(ctx, 'fabi');
  await join(ctx, 'gil');
  await prisma.eventRegistrationReservation.updateMany({ where: { eventId: ctx.event.id }, data: { status: 'CANCELLED' } });
  await waitlist.promote(people.owner.id, ctx.event.id, { lotId: ctx.lot.id }, randomUUID());
  await prisma.eventRegistrationWaitlistEntry.updateMany({
    where: { lotId: ctx.lot.id, userId: people.edu.id }, data: { offerExpiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal((await waitlist.participantState(people.edu.id, ctx.event.slug)).entries[0].status, 'OFFER_EXPIRED');
  await rejects(waitlist.accept(people.edu.id, ctx.event.slug, ctx.lot.id, form(ctx, people.edu), randomUUID()), 409);

  const promoted = await waitlist.promote(people.owner.id, ctx.event.id, { lotId: ctx.lot.id }, randomUUID());
  assert.equal(promoted.status, 'OFFERED');
  const fabi = await prisma.eventRegistrationWaitlistEntry.findUniqueOrThrow({ where: { lotId_userId: { lotId: ctx.lot.id, userId: people.fabi.id } } });
  assert.equal(fabi.status, 'OFFERED', 'segue a ordem depois da oferta vencida');
  assert.equal((await prisma.eventRegistrationWaitlistEntry.findUniqueOrThrow({ where: { lotId_userId: { lotId: ctx.lot.id, userId: people.edu.id } } })).status, 'OFFER_EXPIRED');

  const accepted = await waitlist.accept(people.fabi.id, ctx.event.slug, ctx.lot.id, form(ctx, people.fabi), randomUUID());
  await prisma.eventRegistrationReservation.update({ where: { protocol: accepted.protocol }, data: { status: 'CANCELLED' } });
  await prisma.eventRegistrationReservation.create({
    data: {
      organizationId, eventId: ctx.event.id, categoryId: ctx.category.id, lotId: ctx.lot.id,
      protocol: `EVO-${randomBytes(8).toString('hex').toUpperCase()}`, idempotencyKeyHash: randomBytes(32).toString('hex'),
      payloadHash: 'b'.repeat(64), identityHash: (await prisma.eventRegistrationWaitlistEntry.findUniqueOrThrow({
        where: { lotId_userId: { lotId: ctx.lot.id, userId: people.gil.id } },
      })).identityHash, emailHash: 'c'.repeat(64), registrationData: {}, basePriceCents: 0, finalPriceCents: 0,
      status: 'CANCELLED',
    },
  });
  await rejects(waitlist.promote(people.owner.id, ctx.event.id, { lotId: ctx.lot.id }, randomUUID()), 409, /Ninguém elegível/u);
  const fabiAfter = await prisma.eventRegistrationWaitlistEntry.findUniqueOrThrow({ where: { lotId_userId: { lotId: ctx.lot.id, userId: people.fabi.id } } });
  assert.equal(fabiAfter.status, 'ACCEPTED', 'quem já aceitou não volta a ser promovido');
});

test('entrar e sair são idempotentes; quem volta perde a posição; reserva histórica recusa a entrada', async () => {
  const ctx = await scenario();
  await fill(ctx, 'i-holder');
  await enable(ctx);
  await join(ctx, 'iara');
  await join(ctx, 'iara');
  await join(ctx, 'jose');
  assert.equal(await prisma.eventRegistrationWaitlistEntry.count({ where: { lotId: ctx.lot.id } }), 2);
  await rejects(waitlist.join(people.iara.id, ctx.event.slug, { lotId: ctx.lot.id, identityDocument: people.jose.document }), 409);

  await waitlist.leave(people.iara.id, ctx.event.slug, ctx.lot.id);
  const left = await waitlist.leave(people.iara.id, ctx.event.slug, ctx.lot.id);
  assert.equal(left.entries[0].status, 'LEFT');
  const back = await join(ctx, 'iara');
  assert.equal(back.entries[0].position, 2, 'quem sai e volta vai para o fim');

  await rejects(join(ctx, 'i-holder'), 409, /já tem inscrição/u);
  await prisma.eventRegistrationReservation.updateMany({ where: { eventId: ctx.event.id }, data: { status: 'CANCELLED' } });
  await rejects(join(ctx, 'i-holder'), 409, /cancelada ou expirada/u);

  const unverified = await user('unverified', false);
  await rejects(waitlist.join(unverified.id, ctx.event.slug, { lotId: ctx.lot.id, identityDocument: unverified.document }), 403);
  await rejects(waitlist.participantState(`sem-sessao-${run}`, ctx.event.slug), 401);
  await rejects(waitlist.join(people.jose.id, ctx.event.slug, { lotId: ctx.lot.id, identityDocument: '<script>' }), 400);
});

test('organizador só configura e promove a própria organização e evento; prazo validado no backend', async () => {
  const ctx = await scenario();
  const other = await scenario({ org: externalOrganizationId, owner: 'external' });
  for (const actor of [people.external, people.ana ?? await user('ana2')]) {
    await rejects(waitlist.organizerOverview(actor.id, ctx.event.id), 404);
    await rejects(waitlist.configure(actor.id, ctx.event.id, ctx.lot.id, { enabled: true, offerMinutes: 30 }), 404);
    await rejects(waitlist.promote(actor.id, ctx.event.id, { lotId: ctx.lot.id }, randomUUID()), 404);
  }
  await rejects(waitlist.configure(people.operator.id, ctx.event.id, ctx.lot.id, { enabled: true, offerMinutes: 30 }), 404);
  await rejects(waitlist.configure(people.owner.id, ctx.event.id, other.lot.id, { enabled: true, offerMinutes: 30 }), 404);
  await rejects(waitlist.promote(people.owner.id, ctx.event.id, { lotId: other.lot.id }, randomUUID()), 404);
  for (const body of [{ enabled: true }, { enabled: true, offerMinutes: 5 }, { enabled: true, offerMinutes: 20_000 }, { enabled: 'sim' },
    { enabled: true, offerMinutes: 30, closesAt: new Date(Date.now() - 1000).toISOString() },
    { enabled: true, offerMinutes: 30, closesAt: new Date(Date.now() + 30 * 86_400_000).toISOString() }]) {
    await rejects(waitlist.configure(people.owner.id, ctx.event.id, ctx.lot.id, body), 400);
  }
  await rejects(waitlist.promote(people.owner.id, ctx.event.id, { lotId: ctx.lot.id }, 'curta'), 400);
  assert.equal((await prisma.eventRegistrationLot.findUniqueOrThrow({ where: { id: ctx.lot.id } })).waitlistEnabled, false);

  await fill(ctx, 'k-holder');
  await waitlist.configure(people.owner.id, ctx.event.id, ctx.lot.id, {
    enabled: true, offerMinutes: 30, closesAt: new Date(Date.now() + 60_000).toISOString(),
  });
  await join(ctx, 'kaio');
  await rejects(waitlist.join(people.kaio.id, other.event.slug, { lotId: ctx.lot.id, identityDocument: people.kaio.document }), 404);
  await rejects(waitlist.offerOptions(people.kaio.id, other.event.slug, ctx.lot.id), 404);
  await prisma.eventRegistrationLot.update({ where: { id: ctx.lot.id }, data: { waitlistClosesAt: new Date(Date.now() - 1000) } });
  await rejects(join(ctx, 'lia'), 409, /não está aberta/u);
  assert.equal((await reservations.getOptions(ctx.event.slug).catch(() => ({ waitlist: [] }))).waitlist.length, 0);
  const audits = await prisma.auditLog.findMany({ where: { eventId: ctx.event.id, action: { startsWith: 'registration.waitlist_' } } });
  assert.ok(audits.length >= 2);
  for (const audit of audits) assert.doesNotMatch(JSON.stringify(audit.metadata), /@|\d{11}/u);
});

test('migration é aditiva: rollback documentado remove só a fila e reaplicar é limpo', async () => {
  const rollback = new Error('rollback intencional');
  const statements = (sql) => sql.split(/;\s*\n/u).map((part) => part.replace(/^\s*--.*$/gmu, '').trim()).filter(Boolean);
  const before = await prisma.eventRegistrationLot.count();
  await assert.rejects(prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('DROP TABLE "EventRegistrationWaitlistEntry"');
    await tx.$executeRawUnsafe('DROP TYPE "RegistrationWaitlistStatus"');
    await tx.$executeRawUnsafe('ALTER TABLE "EventRegistrationLot" DROP COLUMN "waitlistEnabled", DROP COLUMN "waitlistOfferMinutes", DROP COLUMN "waitlistClosesAt"');
    const [{ count }] = await tx.$queryRawUnsafe('SELECT count(*)::int AS count FROM "EventRegistrationLot"');
    assert.equal(count, before, 'rollback não apaga lotes');
    for (const statement of statements(migrationSql)) await tx.$executeRawUnsafe(statement);
    const [{ enabled }] = await tx.$queryRawUnsafe('SELECT count(*)::int AS enabled FROM "EventRegistrationLot" WHERE "waitlistEnabled"');
    assert.equal(enabled, 0, 'lotes existentes voltam com a fila desligada');
    throw rollback;
  }, { timeout: 30_000 }), (error) => error === rollback);
  const [{ exists }] = await prisma.$queryRaw`SELECT to_regclass('public."EventRegistrationWaitlistEntry"') IS NOT NULL AS exists`;
  assert.equal(exists, true);
});
