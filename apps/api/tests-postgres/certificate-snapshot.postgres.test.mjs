import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
after(async () => prisma.$disconnect());

async function insert(model, values) {
  return prisma.$transaction(async tx => {
    // LIKE copies CHECK/defaults but not FKs: test the real migrated constraints
    // without creating or deleting tenant fixtures in shared tables.
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE snapshot_constraint_probe (LIKE "${model}" INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP`);
    const data = { id: 'probe', organizationId: 'org-a', eventId: 'event-a', code: 'a'.repeat(32), displayName: 'Ana Souza', ...model === 'EventCertificate' ? { reservationId: 'reservation-a' } : { role: 'activity', subjectLabel: 'Atividade', reservationId: 'reservation-a', activityId: 'activity-a' }, ...values };
    const keys = Object.keys(data);
    await tx.$executeRawUnsafe(`INSERT INTO snapshot_constraint_probe (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, ...Object.values(data));
    return tx.$queryRawUnsafe('SELECT "snapshotVersion", "snapshotEventName" FROM snapshot_constraint_probe');
  });
}
const complete = { snapshotVersion: 1, snapshotEventName: 'Evento original', snapshotTitle: 'Original', snapshotBody: 'Participou' };
for (const model of ['EventCertificate', 'EventRoleCertificate']) {
  test(`${model}: legado sem backfill e snapshot completo são aceitos`, async () => {
    assert.equal((await insert(model, {}))[0].snapshotVersion, null);
    assert.equal((await insert(model, complete))[0].snapshotEventName, 'Evento original');
    const longName = 'Congresso internacional '.repeat(30);
    assert.equal((await insert(model, { ...complete, snapshotEventName: longName }))[0].snapshotEventName, longName);
  });
  test(`${model}: versão desconhecida ou snapshot parcial são recusados`, async () => {
    for (const values of [{ snapshotVersion: 1 }, { ...complete, snapshotVersion: 2 }, { ...complete, snapshotVersion: null }, { ...complete, snapshotBody: null }]) {
      await assert.rejects(insert(model, values), /snapshot_complete/);
    }
  });
}
test('arte histórica exige MIME permitido e escopo exato, inclusive identificadores com underscore', async () => {
  for (const values of [
    { snapshotArtKey: 'org-b/event-a/hash.png', snapshotArtMime: 'image/png' },
    { organizationId: 'org_a', snapshotArtKey: 'orgXa/event-a/hash.png', snapshotArtMime: 'image/png' },
    { snapshotArtKey: 'org-a/event-a/hash.svg', snapshotArtMime: 'image/svg+xml' },
    { snapshotArtKey: 'org-a/event-a/hash.png', snapshotArtMime: null },
  ]) await assert.rejects(insert('EventCertificate', { ...complete, ...values }), /snapshot_complete/);
  assert.equal((await insert('EventCertificate', { ...complete, snapshotArtKey: 'org-a/event-a/hash.png', snapshotArtMime: 'image/png' }))[0].snapshotVersion, 1);
});
