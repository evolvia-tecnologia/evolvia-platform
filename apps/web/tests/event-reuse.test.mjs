import assert from 'node:assert/strict';
import test from 'node:test';
import { eventReuseClientIssue, eventReuseInstant, eventReuseLocalValue } from '../lib/event-reuse.ts';

const now = new Date('2026-10-07T12:00:00.000Z');
const valid = { name: 'Evento 2027', confirmationName: 'Evento 2026', startDate: '2027-01-10T10:00', endDate: '2027-01-11T18:00', timeZone: 'America/Sao_Paulo' };

test('aceita rascunho de reutilização com intervalo futuro', () => assert.equal(eventReuseClientIssue(valid, now), null));
test('recusa passado e término anterior no cliente', () => {
  assert.match(eventReuseClientIssue({ ...valid, startDate: '2026-01-01T10:00' }, now), /futuro/u);
  assert.match(eventReuseClientIssue({ ...valid, endDate: '2027-01-09T10:00' }, now), /anterior/u);
});

test('prefill e envio usam São Paulo mesmo quando o processo usa outro fuso', () => {
  assert.equal(eventReuseLocalValue('2027-01-10T13:00:00.000Z', 'America/Sao_Paulo'), '2027-01-10T10:00');
  assert.equal(eventReuseInstant('2027-01-10T10:00', 'America/Sao_Paulo'), '2027-01-10T13:00:00.000Z');
});

test('UTC, deslocamento fracionário e meia-noite preservam o instante', () => {
  assert.equal(eventReuseInstant('2027-01-10T00:00', 'UTC'), '2027-01-10T00:00:00.000Z');
  assert.equal(eventReuseInstant('2027-01-10T10:00', 'Asia/Kathmandu'), '2027-01-10T04:15:00.000Z');
  assert.equal(eventReuseLocalValue('2027-01-10T18:15:00.000Z', 'Asia/Kathmandu'), '2027-01-11T00:00');
});

test('horários inexistentes e ambíguos de DST são recusados explicitamente', () => {
  assert.throws(() => eventReuseInstant('2027-03-14T02:30', 'America/New_York'), /não existe/u);
  assert.throws(() => eventReuseInstant('2027-11-07T01:30', 'America/New_York'), /ambíguo/u);
  assert.equal(eventReuseInstant('2027-03-14T03:30', 'America/New_York'), '2027-03-14T07:30:00.000Z');
  assert.equal(eventReuseInstant('2027-11-07T02:30', 'America/New_York'), '2027-11-07T07:30:00.000Z');
});

test('transição de meia hora também recusa os dois casos de DST', () => {
  assert.throws(() => eventReuseInstant('2027-10-03T02:15', 'Australia/Lord_Howe'), /não existe/u);
  assert.throws(() => eventReuseInstant('2027-04-04T01:45', 'Australia/Lord_Howe'), /ambíguo/u);
});

test('fuso inválido e datas normalizadas silenciosamente pelo Date são recusados', () => {
  assert.throws(() => eventReuseInstant('2027-01-10T10:00', 'Invalido/Evento'), /fuso horário válido/u);
  for (const value of ['2027-02-30T10:00', '2027-01-10T24:00', '', '2027-01-10T10:00Z']) {
    assert.throws(() => eventReuseInstant(value, 'UTC'), /datas e horários válidos/u);
  }
  assert.match(eventReuseClientIssue({ ...valid, timeZone: '' }, now), /fuso horário válido/u);
});

test('a comparação com agora usa o instante do evento e não a hora do navegador', () => {
  const instant = new Date('2027-01-10T12:30:00Z');
  assert.equal(eventReuseClientIssue(valid, instant), null); // 10h de SP = 13h UTC.
  assert.match(eventReuseClientIssue({ ...valid, timeZone: 'Asia/Tokyo' }, instant), /futuro/u);
});

