import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('a migration da fila de atividade é aditiva e separada da fila de lote', async () => {
  const [schema, migration] = await Promise.all([
    read('../prisma/schema.prisma'),
    read('../prisma/migrations/20261011140000_activity_waitlist/migration.sql'),
  ]);
  assert.match(schema, /model EventActivityWaitlistEntry/u);
  assert.match(schema, /enum EventActivityWaitlistStatus/u);
  assert.match(schema, /@@unique\(\[reservationId, activityId\], map: "ActivityWaitlist_reservation_activity_key"\)/u);
  assert.match(migration, /FOREIGN KEY \("reservationId", "eventId", "organizationId"\)/u);
  assert.match(migration, /FOREIGN KEY \("activityId", "eventId", "organizationId"\)/u);
  assert.match(migration, /FOREIGN KEY \("eventId", "organizationId"\)/u);
  assert.match(migration, /^-- .*rollback:/imu);
  const executable = migration.replace(/^\s*--.*$/gmu, '');
  assert.doesNotMatch(executable, /DROP\s+(TABLE|COLUMN|TYPE)|DELETE\s+FROM|UPDATE\s+"/iu);
  assert.doesNotMatch(migration, /EventRegistrationWaitlistEntry|waitlistEnabled/u);
  const indexMigration = await read('../prisma/migrations/20261012040000_activity_waitlist_activity_index/migration.sql');
  assert.match(schema, /ActivityWaitlist_activity_queue_idx/u);
  assert.match(indexMigration, /CREATE INDEX IF NOT EXISTS "ActivityWaitlist_activity_queue_idx"/u);
  assert.match(indexMigration, /^-- .*rollback:/imu);
  const indexSql = indexMigration.replace(/^\s*--.*$/gmu, '');
  assert.doesNotMatch(indexSql, /DROP\s+(TABLE|COLUMN|TYPE|INDEX)|DELETE\s+FROM|UPDATE\s+"/iu);
});

test('a fila da atividade não altera a agenda nem a área do participante', async () => {
  const [controller, moduleSource, agenda, area] = await Promise.all([
    read('../src/activity-waitlist.controller.ts'),
    read('../src/app.module.ts'),
    read('../src/participant-agenda.service.ts'),
    read('../src/participant-area.controller.ts'),
  ]);
  assert.match(controller, /public\/events\/:slug\/participant\/activity-waitlist/u);
  assert.match(controller, /events\/:eventId\/activity-waitlist/u);
  assert.match(controller, /@UseGuards\(AuthGuard\)/u);
  assert.match(moduleSource, /ActivityWaitlistService/u);
  assert.doesNotMatch(agenda, /activity-waitlist|EventActivityWaitlist/u);
  assert.doesNotMatch(area, /activity-waitlist|EventActivityWaitlist/u);
  const waitlist = await read('../src/activity-waitlist.service.ts');
  assert.match(agenda, /email: \{ equals: email, mode: 'insensitive' \}/u);
  assert.match(waitlist, /email: \{ equals: email, mode: 'insensitive' \}/u);
});

test('promoção é explícita, serializável e sem pagamento', async () => {
  const service = await read('../src/activity-waitlist.service.ts');
  assert.match(service, /TransactionIsolationLevel\.Serializable/u);
  assert.match(service, /P2034/u);
  assert.match(service, /requireRole\(userId, event\.organizationId, EVENT_EDITOR_ROLES\)/u);
  assert.match(service, /requireConfirmedScope\(slug, authorization\)/u);
  assert.match(service, /status: EventActivityEnrollmentStatus\.ENROLLED/u);
  assert.doesNotMatch(service, /paymentReceipt|checkout|checkIn|finalPrice|waitlistEnabled/u);
});

test('resposta e auditoria da fila não devolvem e-mail nem documento', async () => {
  const service = await read('../src/activity-waitlist.service.ts');
  for (const metadata of service.match(/metadata: \{[\s\S]*?\}/gu) ?? []) {
    assert.doesNotMatch(metadata, /email|name|document|protocol|registrationData/iu);
  }
  const participant = service.slice(service.indexOf('private async participantPayload'), service.indexOf('private async positions'));
  const organizer = service.slice(service.indexOf('private async organizerPayload'), service.indexOf('private activityId'));
  assert.doesNotMatch(participant, /protocol|identityDocument/u);
  assert.doesNotMatch(participant.slice(participant.lastIndexOf('return {')), /organizationId|email|protocol|emailHash|registrationData/u);
  assert.match(organizer, /waitlistParticipantName\(item\.registrationData\)/u);
  assert.doesNotMatch(organizer, /participantName: item\.registrationData|emailHash|protocol:|identityDocument/u);
  assert.equal((service.match(/action: 'participant\.activity_waitlist_joined'|action: 'participant\.activity_waitlist_left'|action: 'activity\.waitlist_promoted'/gu) ?? []).length, 3);
  const positions = service.slice(service.indexOf('private async positions'), service.indexOf('private async organizerPayload'));
  assert.doesNotMatch(positions, /take: QUEUE_LIMIT/u);
  assert.match(positions, /\$queryRaw/u);
  assert.match(positions, /entry\."organizationId" = \$\{scope\.organizationId\}/u);
  assert.match(positions, /ahead\."queuedAt" < entry\."queuedAt"/u);
  assert.match(positions, /ahead\."id" < entry\."id"/u);
});
