import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalEventDateInstant,
  DISCOVERY_CALENDAR_TIME_ZONE,
  formatCalendarDateKey,
  formatEventDate,
} from '../lib/event-time-zone.ts';

const NEAR_MIDNIGHT_UTC = '2026-08-26T01:30:00.000Z';

test('formats the public date in the event timezone near midnight', () => {
  assert.equal(
    formatEventDate(NEAR_MIDNIGHT_UTC, 'America/Sao_Paulo', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }),
    '25/08/2026',
  );
});

test('uses the product calendar timezone for the discovery cutoff', () => {
  assert.equal(
    formatCalendarDateKey(NEAR_MIDNIGHT_UTC, DISCOVERY_CALENDAR_TIME_ZONE),
    '2026-08-25',
  );
});

test('keeps legacy UTC behavior when the timezone is absent or invalid', () => {
  assert.equal(formatCalendarDateKey(NEAR_MIDNIGHT_UTC, null), '2026-08-26');
  assert.equal(formatCalendarDateKey(NEAR_MIDNIGHT_UTC, 'not/a-timezone'), '2026-08-26');
});

test('rejects invalid instants without inventing a calendar date', () => {
  assert.equal(formatEventDate('invalid', DISCOVERY_CALENDAR_TIME_ZONE), null);
  assert.equal(formatCalendarDateKey('invalid', DISCOVERY_CALENDAR_TIME_ZONE), null);
});

test('canonicaliza a data do Wizard sem depender do fuso do navegador', () => {
  assert.equal(
    canonicalEventDateInstant('2026-10-10'),
    '2026-10-10T12:00:00.000Z',
  );
  assert.equal(canonicalEventDateInstant(' 2026-10-10 '), '2026-10-10T12:00:00.000Z');
});

test('não fabrica instante para uma data civil inválida', () => {
  assert.equal(canonicalEventDateInstant('2026-02-31'), null);
  assert.equal(canonicalEventDateInstant(''), null);
});
