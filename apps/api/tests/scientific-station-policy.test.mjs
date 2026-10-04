import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificStationPolicyError, normalizeStationSearch, stationFileName, stationAvailable } from '../src/scientific-station-policy.ts';

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
});
