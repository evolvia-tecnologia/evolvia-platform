import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPublicationRichTextSafe as web } from '../lib/publication-text-style.ts';
import { parsePublicRichInlines } from '../lib/public-rich-text.ts';

const open = '[[fmt sans 16 text]]';
const close = '[[/fmt]]';
for (const [label, check] of [['Web', web]]) {
  test(`${label}: rejeita marcadores órfãos, aninhados e incompletos`, () => {
    for (const value of [close, close + open + 'x' + close, open + 'x' + close + close,
      open + open + 'x' + close + close, open + 'x', '[[fmt sans 16 text',
      '[[fmt comic 99 purple]]x' + close]) assert.throws(() => check(value), value);
  });
  test(`${label}: mantém texto legado e aceita spans adjacentes`, () => {
    for (const value of ['Texto legado https://exemplo.com', '[site](https://exemplo.com)',
      open + '**Olá**' + close + open + 'mundo' + close]) assert.doesNotThrow(() => check(value));
    assert.throws(() => check('http://exemplo.com'));
  });
}

test('parser encontra estilo depois de texto simples e antes do negrito', () => {
  assert.deepEqual(parsePublicRichInlines('Olá ' + open + '**Ana**' + close + '!'), [
    { type: 'text', value: 'Olá ' },
    { type: 'styled', font: 'sans', size: 16, color: 'text', inlines: [{ type: 'strong', value: 'Ana' }] },
    { type: 'text', value: '!' },
  ]);
});

test('parser não perde formatação entre chamadas ou após spans adjacentes', () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = parsePublicRichInlines('**Antes** ' + open + 'A' + close + open + 'B' + close + ' *fim*');
    assert.equal(result.filter((part) => part.type === 'styled').length, 2);
    assert.deepEqual(parsePublicRichInlines('**Depois**'), [{ type: 'strong', value: 'Depois' }]);
  }
});

test('fonte, tamanho e cor se acumulam sem aninhar marcadores', async () => {
  const { applyFormat } = await import('../lib/publication-rich-text-format.ts');
  let result = { next: 'Olá mundo', from: 4, to: 9 };
  for (const mode of ['font:serif', 'size:20', 'color:blue']) {
    result = applyFormat(result.next, result.from, result.to, mode);
    assert.ok(result);
    assert.doesNotThrow(() => web(result.next));
    assert.equal(result.next.slice(result.from, result.to), 'mundo');
  }
  assert.equal(result.next, 'Olá [[fmt serif 20 blue]]mundo[[/fmt]]');
});

test('alterar parte do span preserva estilos das partes vizinhas', async () => {
  const { applyFormat } = await import('../lib/publication-rich-text-format.ts');
  const value = '[[fmt serif 20 navy]]ABC[[/fmt]]';
  const start = value.indexOf('ABC') + 1;
  const result = applyFormat(value, start, start + 1, 'color:blue');
  assert.equal(result.next, '[[fmt serif 20 navy]]A[[/fmt]][[fmt serif 20 blue]]B[[/fmt]][[fmt serif 20 navy]]C[[/fmt]]');
  assert.equal(result.next.slice(result.from, result.to), 'B');
  assert.doesNotThrow(() => web(result.next));
});
