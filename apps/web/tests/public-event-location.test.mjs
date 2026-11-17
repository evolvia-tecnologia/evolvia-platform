import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { normalizedPublicVenue, publicVenueEmbedUrl, publicVenueMapUrl, publicVenueWazeUrl } from '../lib/public-event-location.ts';

test('local vazio não cria link externo', () => {
  assert.equal(normalizedPublicVenue('   '), null);
  assert.equal(publicVenueMapUrl(null), null);
  assert.equal(publicVenueWazeUrl('   '), null);
});

test('local público é preservado e codificado como parâmetro de busca, sem injeção de URL', () => {
  const venue = 'Av. Paulista, 1000 & Auditório <A> - São Paulo';
  const url = new URL(publicVenueMapUrl(venue));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.pathname, '/maps/search/');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('query'), venue);
  assert.equal(url.searchParams.getAll('query').length, 1);
  const waze = new URL(publicVenueWazeUrl(venue));
  assert.equal(waze.origin, 'https://www.waze.com');
  assert.equal(waze.pathname, '/ul');
  assert.equal(waze.searchParams.get('q'), venue);
  assert.equal(waze.searchParams.get('navigate'), 'yes');
});

test('Waze recebe o local como busca e não aceita injeção de URL', () => {
  const venue = 'Av. Paulista, 1000 & Auditório <A> - São Paulo';
  const url = new URL(publicVenueWazeUrl(venue));
  assert.equal(url.origin, 'https://www.waze.com');
  assert.equal(url.pathname, '/ul');
  assert.equal(url.searchParams.get('q'), venue);
  assert.equal(url.searchParams.get('navigate'), 'yes');
  assert.equal(url.searchParams.getAll('q').length, 1);
});

test('página pública oferece Maps e Waze só para evento com local presencial', async () => {
  const component = await readFile(new URL('../components/public-event-location.tsx', import.meta.url), 'utf8');
  assert.match(component, /format === 'ONLINE'/u);
  assert.match(component, /publicVenueMapUrl/u);
  assert.match(component, /publicVenueWazeUrl/u);
  assert.match(component, /rel="noopener noreferrer"/u);
  assert.match(component, /Abrir no Waze/u);
  assert.match(component, /Ver no Google Maps/u);
  assert.match(component, /publicVenueEmbedUrl/u);
  assert.match(component, /<iframe/u);
  assert.match(component, /Mapa do local/u);
});

test('mapa embutido usa o endereço como busca e não aceita injeção de URL', () => {
  const venue = 'Av. Paulista, 1000 & Auditório <A> - São Paulo';
  const url = new URL(publicVenueEmbedUrl(venue));
  assert.equal(url.origin, 'https://maps.google.com');
  assert.equal(url.pathname, '/maps');
  assert.equal(url.searchParams.get('q'), venue);
  assert.equal(url.searchParams.get('output'), 'embed');
  assert.equal(url.searchParams.get('hl'), 'pt-BR');
  assert.equal(url.searchParams.getAll('q').length, 1);
  assert.equal(publicVenueEmbedUrl('   '), null);
});
