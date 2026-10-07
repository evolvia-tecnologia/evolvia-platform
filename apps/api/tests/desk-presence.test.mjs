import assert from 'node:assert/strict';
import test from 'node:test';
import { eventCalendarDay, presenceReversalReason } from '../dist/desk-presence.policy.js';
import { recordCheckIn, recordDayPresence, reverseCheckIn, reverseDayPresence, reverseMaterial, recordMaterial } from '../dist/check-in-record.js';

test('o dia da presença usa o fuso do evento', () => {
  assert.equal(eventCalendarDay('America/Sao_Paulo', new Date('2026-10-07T02:30:00.000Z')), '2026-10-06');
  assert.equal(eventCalendarDay('America/Sao_Paulo', new Date('2026-10-07T03:30:00.000Z')), '2026-10-07');
  assert.throws(() => presenceReversalReason('ok'), /3 e 160/);
  assert.equal(presenceReversalReason('  entrada   duplicada  '), 'entrada duplicada');
});

function memory() {
  const checkIns = new Map();
  const materials = new Map();
  const days = new Map();
  const audits = [];
  const tx = {
    eventRegistrationCheckIn: {
      async findUnique({ where }) { return checkIns.get(where.reservationId) ?? null; },
      async create({ data }) {
        if (checkIns.has(data.reservationId)) {
          const error = new Error('unique');
          error.code = 'P2002';
          throw error;
        }
        checkIns.set(data.reservationId, { ...data, reversedAt: null, reversalReason: null });
      },
      async update({ where, data }) {
        const current = checkIns.get(where.reservationId);
        checkIns.set(where.reservationId, { ...current, ...data });
      },
    },
    eventMaterialDelivery: {
      async findUnique({ where }) { return materials.get(where.reservationId) ?? null; },
      async create({ data }) { materials.set(data.reservationId, { ...data, reversedAt: null, reversalReason: null }); },
      async update({ where, data }) {
        materials.set(where.reservationId, { ...materials.get(where.reservationId), ...data });
      },
    },
    eventDayPresence: {
      async findUnique({ where }) { return days.get(`${where.reservationId_day.reservationId}|${where.reservationId_day.day.toISOString()}`) ?? null; },
      async create({ data }) { days.set(`${data.reservationId}|${data.day.toISOString()}`, { ...data, reversedAt: null, reversalReason: null }); },
      async update({ where, data }) {
        const key = `${where.reservationId_day.reservationId}|${where.reservationId_day.day.toISOString()}`;
        days.set(key, { ...days.get(key), ...data });
      },
    },
    auditLog: { async create({ data }) { audits.push(data); } },
  };
  return { tx, checkIns, materials, days, audits };
}

const scope = { reservationId: 'res-1', eventId: 'event-1', organizationId: 'org-1' };

test('estorno de entrada e material mantém a linha e a nova marcação reativa', async () => {
  const store = memory();
  const first = await recordCheckIn(store.tx, scope, 'user-1', { source: 'desk' });
  const repeat = await recordCheckIn(store.tx, scope, 'user-1', { source: 'desk' });
  assert.equal(repeat.alreadyCheckedIn, true);
  assert.equal(repeat.checkedInAt.toISOString(), first.checkedInAt.toISOString());
  const reversed = await reverseCheckIn(store.tx, scope, 'user-2', 'entrada duplicada');
  assert.equal(store.checkIns.size, 1);
  assert.equal(store.checkIns.get('res-1').reversedAt.toISOString(), reversed.reversedAt.toISOString());
  assert.equal(store.checkIns.get('res-1').reversalReason, 'entrada duplicada');
  const restored = await recordCheckIn(store.tx, scope, 'user-3', { source: 'desk' });
  assert.equal(restored.restored, true);
  assert.equal(store.checkIns.get('res-1').reversedAt, null);
  assert.equal(store.audits.some((item) => item.action === 'registration.check_in_reversed'), true);
  assert.equal(store.audits.some((item) => item.action === 'registration.checked_in_restored' && item.metadata.previousReason === 'entrada duplicada'), true);
  assert.equal(store.audits.some((item) => JSON.stringify(item).includes('email')), false);

  await recordMaterial(store.tx, scope, 'user-1');
  await reverseMaterial(store.tx, scope, 'user-2', 'material errado');
  assert.equal(store.materials.size, 1);
  assert.ok(store.materials.get('res-1').reversedAt);
  const materialAgain = await recordMaterial(store.tx, scope, 'user-3');
  assert.equal(materialAgain.restored, true);
});

test('presença do dia não apaga o dia estornado e recusa outro evento', async () => {
  const store = memory();
  const day = new Date('2026-10-06T00:00:00.000Z');
  const dayScope = { ...scope, day };
  await recordDayPresence(store.tx, dayScope, 'user-1');
  await reverseDayPresence(store.tx, dayScope, 'user-2', 'dia errado');
  assert.equal(store.days.size, 1);
  const again = await recordDayPresence(store.tx, dayScope, 'user-3');
  assert.equal(again.restored, true);
  await recordCheckIn(store.tx, scope, 'user-1', { source: 'desk' });
  await assert.rejects(
    () => reverseCheckIn(store.tx, { ...scope, eventId: 'event-2' }, 'user-2', 'outro evento'),
    (error) => error.code === 'SCOPE',
  );
});
