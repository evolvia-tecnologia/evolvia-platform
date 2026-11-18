import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificStationPolicyError, normalizeStationPage, normalizeStationSearch, stationFileName, stationAvailable } from '../src/scientific-station-policy.ts';

test('a busca da estação aceita os campos públicos e recusa conteúdo inseguro', () => {
  assert.deepEqual(normalizeStationSearch('author', '  Ana  '), { field: 'AUTHOR', text: 'Ana' });
  assert.deepEqual(normalizeStationSearch('', ''), { field: null, text: '' });
  assert.deepEqual(normalizeStationSearch('code', '12'), { field: 'CODE', text: '12' });
  assert.equal(stationFileName(12), 'eposter-12.pdf');
  assert.throws(() => normalizeStationSearch('email', 'ana'), ScientificStationPolicyError);
  assert.throws(() => normalizeStationSearch('title', '<script>'), ScientificStationPolicyError);
  assert.throws(() => normalizeStationSearch('code', '12a'), ScientificStationPolicyError);
});

test('a disponibilidade da estação exige publicação, perfil científico e endereço público', () => {
  const event = { status: 'PUBLISHED', profileCode: 'SCIENTIFIC_EVENT', slug: 'congresso' };
  assert.equal(stationAvailable(event), true);
  for (const status of ['DRAFT', 'CONFIGURATION', 'READY_TO_PUBLISH', 'CANCELLED']) {
    assert.equal(stationAvailable({ ...event, status }), false);
  }
  for (const profileCode of ['CORPORATE_TRAINING', 'FAIR_EXHIBITION', 'ENTERTAINMENT', 'SOCIAL_COMMUNITY']) {
    assert.equal(stationAvailable({ ...event, profileCode }), false);
  }
  assert.equal(stationAvailable({ ...event, slug: ' ' }), false);
  assert.equal(stationAvailable({ ...event, profileCode: null }), false);
});

test('a página da estação começa em 1 e recusa zero, texto e número alto', () => {
  assert.equal(normalizeStationPage(undefined), 1);
  assert.equal(normalizeStationPage(''), 1);
  assert.equal(normalizeStationPage('2'), 2);
  assert.equal(normalizeStationPage('500'), 500);
  assert.throws(() => normalizeStationPage('0'), /Página inválida/u);
  assert.throws(() => normalizeStationPage('01'), /Página inválida/u);
  assert.throws(() => normalizeStationPage('501'), /Página inválida/u);
  assert.throws(() => normalizeStationPage('duas'), /Página inválida/u);
});

test('id vazio retorna lista sem filtro e id preenchido permanece numérico', () => {
  assert.deepEqual(normalizeStationSearch('CODE', '  '), { field: null, text: '' });
  assert.deepEqual(normalizeStationSearch('CODE', '001'), { field: 'CODE', text: '001' });
  assert.throws(() => normalizeStationSearch('CODE', 'abc'));
});
