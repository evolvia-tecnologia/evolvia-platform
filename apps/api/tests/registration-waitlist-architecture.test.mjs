import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('migration da fila é aditiva, tenant-scoped e com rollback documentado', async () => {
  const [schema, migration] = await Promise.all([
    read('../prisma/schema.prisma'),
    read('../prisma/migrations/20261007060000_registration_waitlist/migration.sql'),
  ]);
  assert.match(schema, /model EventRegistrationWaitlistEntry/u);
  assert.match(schema, /@@unique\(\[lotId, userId\]\)/u);
  assert.match(schema, /@@unique\(\[lotId, promotionKeyHash\]\)/u);
  assert.match(schema, /@@unique\(\[eventId, identityHash\]\)/u, 'a unique compartilhada das reservas segue intacta');
  assert.match(migration, /FOREIGN KEY \("lotId", "eventId", "organizationId"\)/u);
  assert.match(migration, /FOREIGN KEY \("reservationId", "eventId", "organizationId"\)/u);
  assert.match(migration, /"waitlistEnabled" BOOLEAN NOT NULL DEFAULT false/u);
  assert.match(migration, /^-- .*rollback:/imu);
  const executable = migration.replace(/^\s*--.*$/gmu, '');
  assert.doesNotMatch(executable, /DROP\s+(TABLE|COLUMN|TYPE)|DELETE\s+FROM|UPDATE\s+"/iu);
});

test('rotas exigem sessão, papel de organização e chave de idempotência', async () => {
  const [controller, service] = await Promise.all([
    read('../src/registration-waitlist.controller.ts'),
    read('../src/registration-waitlist.service.ts'),
  ]);
  assert.match(controller, /@UseGuards\(AuthGuard\)\s*@Controller\(\)/u);
  assert.match(controller, /participant\/events\/:slug\/waitlist/u);
  assert.match(controller, /events\/:eventId\/registration-waitlist/u);
  assert.equal((controller.match(/@Headers\('idempotency-key'\)/gu) ?? []).length, 2);
  assert.match(service, /requireRole\(userId, event\.organizationId, roles\)/u);
  assert.match(service, /EVENT_EDITOR_ROLES\)/u);
  assert.match(service, /TransactionIsolationLevel\.Serializable/u);
  assert.match(service, /P2034/u);
  assert.match(service, /lotId_promotionKeyHash/u);
  assert.match(service, /emailVerifiedAt/u);
});

test('promoção é explícita, FIFO, e nunca marca pagamento ou check-in', async () => {
  const service = await read('../src/registration-waitlist.service.ts');
  assert.match(service, /orderBy: \[\{ queuedAt: 'asc' \}, \{ id: 'asc' \}\]/u);
  assert.doesNotMatch(service, /checkIn|eventRegistrationCheckIn|paymentReceipt|RegistrationReservationStatus\.CONFIRMED,\s*confirmedAt|status: 'PUBLISHED'/u);
  assert.doesNotMatch(service, /eventRegistrationReservation\.(create|update)/u, 'a fila só cria reserva pelo fluxo de reserve()');
  assert.match(service, /this\.reservations\.reserve\(slug, input, idempotencyKey, \{ waitlistUserId: userId \}\)/u);
});

test('promoção e painel não fazem uma consulta por candidato ou por lote', async () => {
  const service = await read('../src/registration-waitlist.service.ts');
  const promote = service.slice(service.indexOf('async promote'), service.indexOf('private promotionResult'));
  assert.doesNotMatch(promote, /for \([^)]*candidates\)[\s\S]*?await tx\./u);
  assert.match(promote, /identityHash: \{ in: /u);
  const overview = service.slice(service.indexOf('async organizerOverview'), service.indexOf('async configure'));
  assert.doesNotMatch(overview, /this\.seats\(|lots\.map\(async/u);
  assert.match(overview, /this\.eventSeats\(event\.id, now\)/u);
  assert.match(service, /groupBy\(\{ by: \['categoryId'\]/u);
});

test('estoque conta ofertas ativas e segura vaga liberada para a fila', async () => {
  const service = await read('../src/registration-reservations.service.ts');
  assert.match(service, /activeWaitlistOfferWhere/u);
  assert.match(service, /eventRegistrationWaitlistEntry\.count\(\{ where: \{ \.\.\.otherOffers, lotId: lot\.id \} \}\)/u);
  assert.match(service, /eventRegistrationWaitlistEntry\.count\(\{ where: \{ \.\.\.otherOffers, categoryId: category\.id \} \}\)/u);
  assert.match(service, /Este lote tem fila de espera/u);
  assert.match(service, /status: RegistrationWaitlistStatus\.ACCEPTED, reservationId: reservation\.id/u);
});

test('respostas e auditoria da fila não carregam PII', async () => {
  const service = await read('../src/registration-waitlist.service.ts');
  for (const metadata of service.match(/metadata: \{[\s\S]*?\} as Prisma\.InputJsonObject/gu) ?? []) {
    assert.doesNotMatch(metadata, /identity|email|document|name/iu);
  }
  const state = service.slice(service.indexOf('async participantState'), service.indexOf('async join'));
  assert.doesNotMatch(state, /identityHash: true|emailHash: true|userId: true|user: \{/u);
  const overview = service.slice(service.indexOf('async organizerOverview'), service.indexOf('async configure'));
  assert.doesNotMatch(overview, /identityHash|emailHash|userId: true|registrationData|user: \{/u);
  assert.match(overview, /waitlistEntryCode\(entry\.id\)/u);
});
