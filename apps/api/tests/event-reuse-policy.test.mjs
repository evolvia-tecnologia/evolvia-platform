import assert from 'node:assert/strict';
import test from 'node:test';
import { eventReuseHash, parseEventReuseInput, requireEventReuseKey } from '../dist/event-reuse.policy.js';

const NOW = new Date('2026-10-07T12:00:00.000Z');
const valid = {
  name: 'Congresso Evolvia 2027',
  confirmationName: 'Congresso Evolvia 2026',
  startDate: '2027-05-10T09:00:00.000-03:00',
  endDate: '2027-05-12T18:00:00.000-03:00',
  timeZone: 'America/Sao_Paulo',
};

test('aceita datas futuras absolutas e normaliza opções seguras', () => {
  const parsed = parseEventReuseInput(valid, NOW);
  assert.equal(parsed.name, valid.name);
  assert.equal(parsed.timeZone, 'America/Sao_Paulo');
  assert.equal(parsed.copyVenue, true);
  assert.equal(parsed.copyCapabilities, true);
});

test('nega data local ambígua, passado, intervalo invertido e timezone inválido', () => {
  assert.throws(() => parseEventReuseInput({ ...valid, startDate: '2027-05-10T09:00' }, NOW), /fuso horário/u);
  assert.throws(() => parseEventReuseInput({ ...valid, startDate: '2026-01-01T10:00:00.000Z' }, NOW), /futuro/u);
  assert.throws(() => parseEventReuseInput({ ...valid, endDate: '2027-05-09T10:00:00.000Z' }, NOW), /anterior/u);
  assert.throws(() => parseEventReuseInput({ ...valid, timeZone: '-03:00' }, NOW), /Fuso horário/u);
});

test('exige chave idempotente forte e produz hash sem expor a chave', () => {
  assert.equal(requireEventReuseKey('reuse:1234567890abcdef'), 'reuse:1234567890abcdef');
  assert.throws(() => requireEventReuseKey('curta'), /idempotência/u);
  const hash = eventReuseHash('segredo-operacional');
  assert.match(hash, /^[a-f0-9]{64}$/u);
  assert.equal(hash.includes('segredo'), false);
});

