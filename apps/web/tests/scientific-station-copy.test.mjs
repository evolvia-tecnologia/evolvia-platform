import assert from 'node:assert/strict';
import test from 'node:test';
import { abstractParagraphs, formatStationTitle, stationCodeLabel, stationLabels, stationLanguage } from '../lib/scientific-station-copy.ts';

test('o título do resumo fica em caixa alta e baixa quando veio uniforme', () => {
  assert.equal(formatStationTitle('ANÁLISE CEFALOMÉTRICA'), 'Análise cefalométrica');
  assert.equal(formatStationTitle('análise cefalométrica'), 'Análise cefalométrica');
  assert.equal(formatStationTitle('Coautoria e leitura do ePoster'), 'Coautoria e leitura do ePoster');
  assert.equal(stationCodeLabel(59), '059');
});

test('a tradução muda os rótulos e o idioma desconhecido permanece em português', () => {
  assert.equal(stationLanguage('en'), 'en');
  assert.equal(stationLanguage('javascript:alert(1)'), 'pt');
  assert.equal(stationLabels('es').keywords, 'Palabras clave');
  assert.equal(stationLabels('pt').book, 'Livro de resumo eletrônico');
  assert.deepEqual(abstractParagraphs('Primeiro.\n\nSegundo.'), ['Primeiro.', 'Segundo.']);
});
