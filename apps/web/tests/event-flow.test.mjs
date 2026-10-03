import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEventFlow, eventTimeZoneLabel, maskTaxId } from '../lib/event-flow.ts';

test('o caminho marca divulgação como etapa atual antes da publicação', () => {
  const steps = buildEventFlow({ eventId: 'evt', status: 'SETUP', section: 'overview', scientific: false });
  assert.deepEqual(steps.map((step) => [step.id, step.state]), [
    ['foundation', 'done'],
    ['disclosure', 'current'],
    ['registration', 'available'],
    ['release', 'available'],
    ['operation', 'available'],
  ]);
  assert.equal(steps.some((step) => step.id === 'scientific'), false);
});

test('evento científico publicado mostra a grade como etapa própria', () => {
  const steps = buildEventFlow({ eventId: 'evt', status: 'PUBLISHED', section: 'scientific', scientific: true });
  assert.equal(steps.find((step) => step.id === 'release')?.state, 'done');
  assert.equal(steps.find((step) => step.id === 'scientific')?.state, 'current');
  assert.match(steps.find((step) => step.id === 'scientific')?.href ?? '', /\/eventos\/evt\/cientifico$/u);
});

test('fuso e documento usam rótulos seguros para a interface', () => {
  assert.equal(eventTimeZoneLabel('America/Sao_Paulo'), 'Brasília, São Paulo, Rio de Janeiro');
  assert.equal(eventTimeZoneLabel(null), 'Não confirmado');
  assert.equal(maskTaxId('12345678901'), 'terminado em 01');
  assert.doesNotMatch(maskTaxId('12345678901'), /123456789/);
});
