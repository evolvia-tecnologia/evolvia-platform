import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSmokeTimeline } from './lib/ci-smoke-timeline.mjs';
import { normalizeRegistrationCatalog } from '../apps/api/src/registration-commercial-policy.ts';

const oldLotEnd = Date.parse('2026-10-22T12:00:00.000Z');
for (const clock of [
  '2026-10-22T11:59:59.000Z',
  '2026-10-22T13:15:57.000Z', // instante da falha no job119844632586
  '2028-01-01T00:00:00.000Z',
  '2032-02-29T23:59:59.000Z',
]) {
  test('lote CAE disponível e limitado ao evento em ' + clock, () => {
    const now = Date.parse(clock);
    const timeline = createSmokeTimeline(now);
    const input = [{
      code: 'participante', name: 'Participante', capacity: 20,
      lots: [{
        code: 'lote_unico', name: 'Lote único', quantity: 10, priceCents: 10000,
        startsAt: timeline.lotStart, endsAt: timeline.lotEnd,
      }],
    }];
    // Usa a política real: lote além do evento continua inválido.
    const [category] = normalizeRegistrationCatalog(input, 'PAID', new Date(timeline.eventEnd));
    const [lot] = category.lots;
    assert.ok(Date.parse(lot.startsAt) <= now && Date.parse(lot.endsAt) > now);
    assert.ok(Date.parse(timeline.eventStart) < now);
    assert.equal(lot.endsAt, timeline.eventEnd);
    assert.throws(() => normalizeRegistrationCatalog([{
      ...input[0], lots: [{ ...input[0].lots[0], endsAt: timeline.afterEventEnd }],
    }], 'PAID', new Date(timeline.eventEnd)), /depois da data final do evento/u);
    assert.equal(now >= oldLotEnd, clock !== '2026-10-22T11:59:59.000Z', 'fixture anterior expira nos cenários posteriores');
  });
}
test('smoke usa a mesma âncora em evento, lote, benefícios e negativo', () => {
  const source = readFileSync(new URL('./ci-smoke-v02.mjs', import.meta.url), 'utf8');
  for (const field of ['eventStart', 'eventEnd', 'lotStart', 'lotEnd', 'afterEventEnd']) {
    assert.ok(source.includes('smokeTimeline.' + field), field);
  }
  assert.doesNotMatch(source, /2026-10-22T12:00:00/u);
});

test('âncora Date ou ISO mantém os mesmos instantes sem alterar a entrada', () => {
  const clock = '2032-02-29T23:59:59.000Z';
  const date = new Date(clock);
  const expected = createSmokeTimeline(date.getTime());
  assert.deepEqual(createSmokeTimeline(date), expected);
  assert.deepEqual(createSmokeTimeline(clock), expected);
  assert.equal(date.toISOString(), clock);
});
