import assert from 'node:assert/strict';
import test from 'node:test';
import { eventReuseClientIssue } from '../lib/event-reuse.ts';

const now = new Date('2026-10-07T12:00:00.000Z');
const valid = { name: 'Evento 2027', confirmationName: 'Evento 2026', startDate: '2027-01-10T10:00:00.000Z', endDate: '2027-01-11T18:00:00.000Z', timeZone: 'America/Sao_Paulo' };

test('aceita rascunho de reutilização com intervalo futuro', () => assert.equal(eventReuseClientIssue(valid, now), null));
test('recusa passado e término anterior no cliente', () => {
  assert.match(eventReuseClientIssue({ ...valid, startDate: '2026-01-01T10:00:00.000Z' }, now), /futuro/u);
  assert.match(eventReuseClientIssue({ ...valid, endDate: '2027-01-09T10:00:00.000Z' }, now), /anterior/u);
});

