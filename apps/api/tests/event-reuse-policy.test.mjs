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


test('recusa calendário e hora impossíveis em UTC e em offsets explícitos', () => {
  for (const startDate of [
    '2027-02-30T10:00:00.000Z',
    '2027-02-29T10:00:00.000-03:00',
    '2027-04-31T10:00:00.000+05:45',
    '2027-01-10T24:00:00.000Z',
    '2027-01-10T24:00:00.000-03:00',
    '2027-01-10T10:60:00.000Z',
    '2027-01-10T10:00:60.000Z',
    '2027-01-10T10:00:00.000+24:00',
    '2027-01-10T10:00:00.000+05:60',
  ]) {
    assert.throws(() => parseEventReuseInput({ ...valid, startDate }, NOW), /Data de início é inválida/u, startDate);
  }
  assert.throws(() => parseEventReuseInput({ ...valid, endDate: '2027-05-12T24:00:00.000-03:00' }, NOW), /Data de término é inválida/u);
});

test('preserva instantes válidos, offsets fracionários e ano bissexto', () => {
  const cases = [
    ['2027-01-10T10:00:00.123-03:00', '2027-01-10T13:00:00.123Z'],
    ['2027-01-10T10:00:00.000+05:45', '2027-01-10T04:15:00.000Z'],
    ['2028-02-29T10:00:00.000Z', '2028-02-29T10:00:00.000Z'],
    ['2027-01-10T10:00Z', '2027-01-10T10:00:00.000Z'],
    ['2027-01-10T10:00:00.123456Z', '2027-01-10T10:00:00.123Z'],
  ];
  for (const [startDate, expected] of cases) {
    const parsed = parseEventReuseInput({ ...valid, startDate, endDate: '2029-01-01T00:00:00.000Z' }, NOW);
    assert.equal(parsed.startDate.toISOString(), expected);
  }
});

test('nome novo respeita o limite canônico de 120 caracteres do wizard', () => {
  assert.equal(parseEventReuseInput({ ...valid, name: 'A'.repeat(120) }, NOW).name, 'A'.repeat(120));
  for (const length of [121, 160]) {
    assert.throws(() => parseEventReuseInput({ ...valid, name: 'A'.repeat(length) }, NOW), /Nome do novo evento deve ter no máximo 120 caracteres/u);
  }
});

