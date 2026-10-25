import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePublicRichText } from '../lib/public-rich-text.ts';

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
