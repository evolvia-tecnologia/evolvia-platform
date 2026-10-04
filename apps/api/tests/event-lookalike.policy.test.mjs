import assert from 'node:assert/strict';
import test from 'node:test';
import { lookalikeSignals } from '../src/event-publication/event-lookalike.policy.ts';

const current = {
  logoChecksum: 'abc123',
  categoryNames: ['Profissional', 'Estudante'],
  priceCents: [25000, 0],
};

test('evento no mesmo local e dia só alerta com logo, categorias e preços parecidos', () => {
  assert.deepEqual(lookalikeSignals(current, {
    logoChecksum: 'abc123',
    categoryNames: ['Outra'],
    priceCents: [100],
  }), ['venue', 'dates', 'logo']);

  assert.deepEqual(lookalikeSignals(current, {
    logoChecksum: null,
    categoryNames: ['estudante', ' Profissional '],
    priceCents: [25000],
  }), ['venue', 'dates', 'categories', 'prices']);

  assert.equal(lookalikeSignals(current, {
    logoChecksum: 'outro',
    categoryNames: ['Profissional'],
    priceCents: [25000],
  }), null);

  assert.equal(lookalikeSignals(current, {
    logoChecksum: null,
    categoryNames: ['Visitante', 'Imprensa'],
    priceCents: [25000, 9000],
  }), null);
});
