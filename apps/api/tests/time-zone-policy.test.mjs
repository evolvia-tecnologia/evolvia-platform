import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEventTimeZone } from '../dist/time-zone-policy.js';

test('aceita e canonicaliza timezone IANA suportado pelo runtime', () => {
  assert.equal(normalizeEventTimeZone(' America/Sao_Paulo '), 'America/Sao_Paulo');
  assert.equal(normalizeEventTimeZone('America/Manaus'), 'America/Manaus');
});
test('recusa offset fixo, zona Etc/GMT fixa e texto arbitrário', () => {
  assert.equal(normalizeEventTimeZone('-03:00'), undefined);
  assert.equal(normalizeEventTimeZone('Etc/GMT+3'), undefined);
  assert.equal(normalizeEventTimeZone('horário de Brasília'), undefined);
});
test('Intl apresenta o mesmo instante conforme o timezone do evento', () => {
  const instant = new Date('2026-08-25T00:30:00.000Z');
  const saoPaulo = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(instant);
  const lisbon = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'Europe/Lisbon' }).format(instant);
  assert.equal(saoPaulo, '24/08/2026');
  assert.equal(lisbon, '25/08/2026');
  assert.equal(instant.toISOString(), '2026-08-25T00:30:00.000Z');
});
