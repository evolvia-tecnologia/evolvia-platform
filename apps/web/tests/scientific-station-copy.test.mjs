import assert from 'node:assert/strict';
import test from 'node:test';
import { abstractParagraphs, formatStationTitle, stationCodeLabel, stationCodeMark, stationLabels, stationLanguage, stationWorkHeading } from '../lib/scientific-station-copy.ts';

test('o título do resumo fica em caixa alta e baixa quando veio uniforme', () => {
  assert.equal(formatStationTitle('ANÁLISE CEFALOMÉTRICA'), 'Análise cefalométrica');
  assert.equal(formatStationTitle('análise cefalométrica'), 'Análise cefalométrica');
  assert.equal(formatStationTitle('Coautoria e leitura do ePoster'), 'Coautoria e leitura do ePoster');
  assert.equal(stationCodeLabel(59), '059');
  assert.equal(stationCodeMark(3, 'ORAL'), '003-AO');
  assert.equal(stationCodeMark(5, 'EPOSTER'), '005-PD');
  assert.equal(stationWorkHeading(3, 'ORAL', 'TRATAMENTO COMPENSATÓRIO'), '003-AO-Tratamento compensatório');
  assert.equal(stationCodeMark(8, '<script>'), '008');
});

test('a tradução muda os rótulos e o idioma desconhecido permanece em português', () => {
  assert.equal(stationLanguage('en'), 'en');
  assert.equal(stationLanguage('javascript:alert(1)'), 'pt');
  assert.equal(stationLabels('es').keywords, 'Palabras clave');
  assert.equal(stationLabels('pt').book, 'Livro de resumo eletrônico');
  assert.equal(stationLabels('pt').back, 'Voltar');
  assert.equal(stationLabels('es').back, 'Volver');
  assert.equal(stationLabels('en').back, 'Back');
  assert.equal(stationLabels('es').noResults, 'Ningún trabajo publicado coincide con esta búsqueda.');
  assert.equal(stationLabels('en').publishedMany, 'published works');
  assert.equal(stationLabels('pt').next, 'Próxima página');
  assert.equal(stationLabels('es').previous, 'Página anterior');
  assert.equal(stationLabels('en').skip, 'Skip to the list');
  assert.deepEqual(abstractParagraphs('Primeiro.\n\nSegundo.'), ['Primeiro.', 'Segundo.']);
});
