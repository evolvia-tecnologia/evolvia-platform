import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  collectReadableText,
  readingChunks,
  startLocalReading,
  stopLocalReading,
} from '../lib/accessibility-reading.ts';

function element(tag, attributes = {}, children = []) {
  const values = new Map(Object.entries(attributes));
  return {
    nodeType: 1,
    tagName: tag,
    childNodes: children,
    getAttribute: (name) => values.has(name) ? values.get(name) : null,
    hasAttribute: (name) => values.has(name),
  };
}

function text(value) {
  return { nodeType: 3, nodeValue: value, childNodes: [] };
}

test('a leitura ignora código, mídia sem texto e imagens decorativas', () => {
  const root = element('div', {}, [
    text('  Credencial visível  '),
    element('img', { alt: '' }),
    element('img', { alt: 'Mapa do evento' }),
    element('svg', { 'data-a11y-speak': 'off' }, [text('M10 10h1v1')]),
    element('p', { 'data-a11y-speak': 'off' }, [text('EVQ1.segredo')]),
    element('p', { hidden: '' }, [text('oculto')]),
    element('div', { 'aria-hidden': 'true' }, [text('invisível')]),
    element('div', { 'data-a11y-chrome': '' }, [text('painel')]),
    element('script', {}, [text('alert(1)')]),
    element('input', { value: 'segredo' }, [text('campo')]),
  ]);
  assert.equal(collectReadableText(root), 'Credencial visível Mapa do evento');
  assert.equal(collectReadableText(null), '');
});

test('a leitura parte o texto e não passa do limite', () => {
  assert.deepEqual(readingChunks('   '), []);
  assert.deepEqual(readingChunks('Olá, participante.'), ['Olá, participante.']);
  const long = 'palavra '.repeat(400);
  const chunks = readingChunks(long, 40, 40);
  assert.equal(chunks.length, 40);
  assert.ok(chunks.every((chunk) => chunk.length <= 40));
});

test('iniciar cancela a fala anterior e parar não continua a fila', async () => {
  const calls = [];
  const engine = {
    cancel() { calls.push('cancel'); },
    speak(text, lang, onEnd) { calls.push(['speak', text, lang, onEnd]); },
  };
  assert.equal(startLocalReading(engine, '   '), 'empty');
  assert.deepEqual(calls, ['cancel']);
  calls.length = 0;
  let finished = 0;
  assert.equal(startLocalReading(engine, 'Texto da página', () => { finished += 1; }), 'started');
  assert.equal(calls[0], 'cancel');
  assert.deepEqual(calls.slice(1), []);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(calls[1][0], 'speak');
  assert.equal(calls[1][1], 'Texto da página');
  assert.equal(calls[1][2], 'pt-BR');
  calls[1][3]();
  assert.equal(finished, 1);
  stopLocalReading(engine);
  calls[1][3]();
  assert.equal(calls.at(-1), 'cancel');
  assert.equal(finished, 1);
  const before = calls.length;
  startLocalReading(engine, 'Outra página');
  stopLocalReading(engine);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(calls.length, before + 2);
  assert.equal(calls.at(-1), 'cancel');
});

test('erro da voz interrompe a fila sem concluir a leitura', async () => {
  const calls = [];
  let failed = '';
  const engine = {
    cancel() { calls.push('cancel'); },
    speak(_text, _lang, _onEnd, onError) { calls.push('speak'); onError('not-allowed'); },
  };
  const long = 'frase curta. '.repeat(40);
  assert.equal(startLocalReading(engine, long, () => { calls.push('done'); }, (reason) => { failed = reason; }), 'started');
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(failed, 'not-allowed');
  assert.equal(calls.filter((call) => call === 'speak').length, 1);
  assert.equal(calls.includes('done'), false);
});

test('a voz fica no dispositivo e o modo de leitura não esconde imagens nem credenciais', async () => {
  const [reading, sheet, qr, barcode, label, area] = await Promise.all([
    readFile(new URL('../lib/accessibility-reading.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/accessibility.css', import.meta.url), 'utf8'),
    readFile(new URL('../components/credential-qr.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/credential-barcode.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/credential-label.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/participant-area.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(reading, /SpeechSynthesisUtterance/u);
  assert.match(reading, /pt-BR/u);
  assert.doesNotMatch(reading, /fetch\(|XMLHttpRequest|sendBeacon|https?:\/\//u);
  assert.match(qr, /data-a11y-speak="off"/u);
  assert.match(qr, /fill="#111"/u);
  assert.match(barcode, /data-a11y-speak="off"/u);
  assert.match(label, /data-a11y-speak="off"/u);
  assert.match(area, /data-a11y-speak="off"/u);
  assert.match(sheet, /@media print[\s\S]*\[data-a11y-chrome\]/u);
  const readingRule = sheet.slice(sheet.indexOf('html[data-a11y-reading="on"]'));
  assert.doesNotMatch(readingRule, /\bimg\b|\bsvg\b|\bcanvas\b|\bvideo\b/u);
});
