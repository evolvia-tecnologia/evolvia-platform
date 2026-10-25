import { loadPublicationSource } from './helpers/publication-source.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { parsePublicRichText } = await loadPublicationSource('public-rich-text');

test('estilo persistido atravessa quebras e parágrafos sem expor marcadores', () => {
  const blocks = parsePublicRichText('Antes [[fmt serif 20 blue]]um\ndois\n\ntrês[[/fmt]] depois');
  assert.equal(blocks.length, 2);
  const lines = blocks.flatMap((block) => block.lines);
  assert.equal(lines.length, 3);
  for (const [index, word] of ['um', 'dois', 'três'].entries()) {
    const style = lines[index].find((inline) => inline.type === 'styled');
    assert.deepEqual(style, { type: 'styled', font: 'serif', size: 20, color: 'blue', inlines: [{ type: 'text', value: word }] });
  }
  const serialized = JSON.stringify(blocks);
  assert.doesNotMatch(serialized, /\[\[fmt|\[\[\/fmt/u);
  assert.match(serialized, /Antes /u);
  assert.match(serialized, / depois/u);
});

test('span sobre título e listas preserva blocos e estilo de cada item', () => {
  const blocks = parsePublicRichText('[[fmt serif 20 blue]]## Título\n- Primeiro\n- Segundo\n\n1. Um\n2. Dois[[/fmt]]');
  assert.deepEqual(blocks.map((block) => block.type), ['heading', 'list', 'list']);
  assert.equal(blocks[1].ordered, false);
  assert.equal(blocks[2].ordered, true);
  const inlines = [blocks[0].inlines, ...blocks[1].items, ...blocks[2].items];
  assert.deepEqual(inlines.map((line) => line[0].inlines[0].value), ['Título', 'Primeiro', 'Segundo', 'Um', 'Dois']);
  assert.ok(inlines.every((line) => line[0].type === 'styled' && line[0].font === 'serif' && line[0].color === 'blue'));
});
