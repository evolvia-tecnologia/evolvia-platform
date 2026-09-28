import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizedPublicVenue, publicVenueMapUrl } from '../lib/public-event-location.ts';

test('local vazio não cria link externo', () => {
  assert.equal(normalizedPublicVenue('   '), null);
  assert.equal(publicVenueMapUrl(null), null);
});

test('local público é preservado e codificado como parâmetro de busca, sem injeção de URL', () => {
  const venue = 'Av. Paulista, 1000 & Auditório <A> - São Paulo';
  const url = new URL(publicVenueMapUrl(venue));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.pathname, '/maps/search/');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('query'), venue);
  assert.equal(url.searchParams.getAll('query').length, 1);
});
