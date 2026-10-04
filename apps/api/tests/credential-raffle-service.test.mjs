import assert from 'node:assert/strict';
import test from 'node:test';
import { EventDeskService } from '../dist/event-desk.service.js';

test('sorteios concorrentes usam todo o grupo e todo o histórico dentro do lock do evento', async () => {
  const queries = [];
  const drawn = new Set(Array.from({ length: 201 }, (_, i) => `old-${i}`));
  let tail = Promise.resolve();
  const prisma = {
    async $transaction(callback) {
      let release;
      try {
        return await callback({
          async $queryRaw(query) {
            queries.push(query);
            if (query.sql.includes('FROM "Event"')) {
              const preceding = tail;
              tail = new Promise((resolve) => { release = resolve; });
              await preceding;
              return [{ id: 'event' }];
            }
            assert.match(query.sql, /NOT EXISTS/u);
            assert.match(query.sql, /d\."entityId" = r\."id"/u);
            assert.match(query.sql, /d\."organizationId" = r\."organizationId"/u);
            assert.match(query.sql, /d\."eventId" = r\."eventId"/u);
            assert.doesNotMatch(query.sql, /LIMIT 200|LIMIT 5000/u);
            if (query.sql.includes('COUNT(*)')) return [{ total: 6001n }];
            assert.match(query.sql, /OFFSET.*LIMIT 1 FOR UPDATE OF r/u);
            const offset = query.values.at(-1);
            assert.ok(Number.isInteger(offset) && offset >= 0 && offset < 6001);
            return [{ id: drawn.has('last-6001') ? 'next-6000' : 'last-6001' }];
          },
          eventRegistrationReservation: {
            findFirst: async ({ where }) => ({ id: where.id, protocol: `EVO-${where.id}`, registrationData: {}, category: { name: 'Participante' } }),
          },
          auditLog: { create: async ({ data }) => { assert.ok(!drawn.has(data.entityId)); drawn.add(data.entityId); } },
        });
      } finally { release?.(); }
    },
  };
  const service = new EventDeskService(prisma, {});
  service.eventFor = async () => ({ id: 'event', organizationId: 'org', status: 'PUBLISHED', capabilities: [{ code: 'credential' }] });
  const results = await Promise.all([1, 2].map(() => service.draw('operator', 'event', { scope: 'ALL', allowRepeat: false })));
  assert.deepEqual(results.map((result) => result.winner.reservationId), ['last-6001', 'next-6000']);
  const locks = queries.filter((q) => q.sql.includes('FROM "Event"'));
  assert.equal(locks.length, 2);
  assert.deepEqual(locks[0].values, ['event', 'org']);
});
