import assert from 'node:assert/strict';
import test from 'node:test';
import {
  earliestLotClose,
  lotDisplayName,
  normalizeLotDisplayMode,
  readLotDisplayMode,
  selectDisplayedLots,
} from '../src/registration-lot-display.policy.ts';

const now = new Date('2026-10-10T15:00:00.000Z');
const lot = (id, startsAt, endsAt) => ({ id, startsAt: new Date(startsAt), endsAt: new Date(endsAt) });

test('a exibição só aceita o lote atual ou a escada', () => {
  assert.equal(normalizeLotDisplayMode({ mode: 'CURRENT' }), 'CURRENT');
  assert.equal(normalizeLotDisplayMode({ mode: 'LADDER' }), 'LADDER');
  assert.equal(readLotDisplayMode(null), 'LADDER');
  assert.equal(readLotDisplayMode({ mode: 'CURRENT' }), 'CURRENT');
  assert.equal(readLotDisplayMode({ mode: 'outro' }), 'LADDER');
  assert.throws(() => normalizeLotDisplayMode({ mode: 'CURRENT', extra: true }), /Escolha como a página mostra os lotes/u);
  assert.throws(() => normalizeLotDisplayMode({ mode: 'AMBOS' }), /Escolha o lote atual ou a escada/u);
  assert.equal(lotDisplayName('<script>'), 'Lote');
  assert.equal(lotDisplayName('Primeiro lote'), 'Primeiro lote');
});

test('o lote atual esconde os seguintes e a escada mostra os que ainda vão abrir', () => {
  const lots = [
    lot('atual', '2026-10-01T00:00:00.000Z', '2026-10-20T18:00:00.000Z'),
    lot('seguinte', '2026-10-01T00:00:00.000Z', '2026-11-01T18:00:00.000Z'),
    lot('futuro', '2026-11-01T00:00:00.000Z', '2026-12-01T18:00:00.000Z'),
    lot('encerrado', '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
  ];
  const current = selectDisplayedLots('CURRENT', lots, now);
  assert.deepEqual(current.open.map((item) => item.id), ['atual']);
  assert.deepEqual(current.upcoming, []);
  const ladder = selectDisplayedLots('LADDER', lots, now);
  assert.deepEqual(ladder.open.map((item) => item.id), ['atual', 'seguinte']);
  assert.deepEqual(ladder.upcoming.map((item) => item.id), ['futuro']);
  assert.equal(earliestLotClose(current.open), '2026-10-20T18:00:00.000Z');
  assert.equal(earliestLotClose([]), null);
});
