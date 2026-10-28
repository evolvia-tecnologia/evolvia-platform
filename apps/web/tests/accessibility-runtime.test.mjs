import assert from 'node:assert/strict';
import test from 'node:test';
import { pausePageMedia, readableClickTarget, readingMaskBands } from '../lib/accessibility-runtime.ts';

function node(tagName, extra = {}) {
  return { tagName, parent: null, ...extra };
}

test('clique para ouvir lê o parágrafo e ignora botão, painel e texto privado', () => {
  const paragraph = node('p');
  const sentence = node('span', { parent: paragraph });
  assert.equal(readableClickTarget(sentence), paragraph);
  const button = node('button');
  const label = node('span', { parent: button });
  assert.equal(readableClickTarget(label), null);
  const panel = node('div', { hasAttribute: (name) => name === 'data-a11y-chrome' });
  const inside = node('p', { parent: panel });
  assert.equal(readableClickTarget(inside), null);
  const secret = node('p', { getAttribute: (name) => name === 'data-a11y-speak' ? 'off' : null });
  assert.equal(readableClickTarget(secret), null);
  const link = node('a', { parent: paragraph });
  assert.equal(readableClickTarget(link), paragraph);
});

test('desativar som só pausa áudio e vídeo da página', () => {
  const calls = [];
  const paused = pausePageMedia([
    { tagName: 'VIDEO', pause: () => calls.push('video') },
    { tagName: 'AUDIO', pause: () => calls.push('audio') },
    { tagName: 'IMG', pause: () => calls.push('img') },
  ]);
  assert.equal(paused, 2);
  assert.deepEqual(calls, ['video', 'audio']);
});

test('a máscara deixa uma faixa legível e não passa do topo', () => {
  assert.deepEqual(readingMaskBands(40, 800), { topHeight: 0, lowerTop: 84 });
  assert.deepEqual(readingMaskBands(400, 800), { topHeight: 356, lowerTop: 444 });
  assert.deepEqual(readingMaskBands(790, 800), { topHeight: 746, lowerTop: 800 });
});
