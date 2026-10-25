import { loadPublicationSource } from './helpers/publication-source.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { parsePublicRichText } = await loadPublicationSource('public-rich-text');

test('texto simples vira parágrafos e preserva quebra de linha', () => {
  const blocks = parsePublicRichText('Primeira linha\nsegunda linha\n\nOutro parágrafo');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].type, 'paragraph');
  assert.equal(blocks[0].lines.length, 2);
  assert.equal(blocks[0].lines[0][0].value, 'Primeira linha');
  assert.equal(blocks[1].lines[0][0].value, 'Outro parágrafo');
});

test('título, lista, negrito e link https viram estrutura', () => {
  const blocks = parsePublicRichText('## Para quem é\n\n- **Associados** da área\n- Interessados\n\nVeja o [site](https://evento.example.com/pagina).');
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[0].inlines[0].value, 'Para quem é');
  assert.equal(blocks[1].type, 'list');
  assert.equal(blocks[1].ordered, false);
  assert.equal(blocks[1].items[0][0].type, 'strong');
  assert.equal(blocks[1].items[0][0].value, 'Associados');
  assert.equal(blocks[2].type, 'paragraph');
  assert.equal(blocks[2].lines[0][1].type, 'link');
  assert.equal(blocks[2].lines[0][1].href, 'https://evento.example.com/pagina');
});

test('alinhamento e span com fonte, tamanho e cor viram estrutura', () => {
  const blocks = parsePublicRichText('@center [[fmt sans 20 navy]]Título[[/fmt]]');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'paragraph');
  assert.equal(blocks[0].align, 'center');
  assert.equal(blocks[0].lines[0][0].type, 'styled');
  assert.equal(blocks[0].lines[0][0].size, 20);
  assert.equal(blocks[0].lines[0][0].inlines[0].value, 'Título');
});

test('html e link inseguro permanecem texto', () => {
  const blocks = parsePublicRichText('<script>alert(1)</script>\n\n[clique](javascript:alert(1))\n\n[local](https://localhost/mapa)\n\n[credencial](https://user:pass@evento.example.com/a)');
  const values = JSON.stringify(blocks);
  assert.match(values, /<script>alert\(1\)<\\?\/script>/u);
  assert.doesNotMatch(values, /"type":"link"/u);
  assert.match(values, /javascript:alert\(1\)/u);
  assert.match(values, /https:\/\/localhost\/mapa/u);
});

