import assert from 'node:assert/strict';
import test from 'node:test';
import { localDateTimeInputValue } from '../lib/event-time-zone.ts';

test('prazo mantém o instante após edição nos fusos do navegador', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['America/Sao_Paulo', 'UTC', 'Europe/London', 'Asia/Tokyo']) {
      process.env.TZ = zone;
      const instant = '2026-10-04T17:20:30.000Z';
      const local = localDateTimeInputValue(instant);
      assert.equal(new Date(local).toISOString(), instant, zone);
    }
    assert.equal(localDateTimeInputValue(null), '');
    assert.equal(localDateTimeInputValue('invalid'), '');
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
