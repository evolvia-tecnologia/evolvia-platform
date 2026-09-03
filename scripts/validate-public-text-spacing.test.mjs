import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHECK_IDS,
  TEXT_SPACING_CSS,
  evaluateTextSpacingSnapshot,
  sanitizeClippedText,
  serializeManifest,
} from './validate-public-text-spacing.mjs';

function passingSnapshot(overrides = {}) {
  return {
    rota: '/',
    viewport: '320x720',
    httpStatus: 200,
    probe: {
      lineHeight: 24,
      letterSpacing: 1.92,
      wordSpacing: 2.56,
      marginBottom: 32,
    },
    clientWidth: 320,
    scrollWidth: 320,
    bodyClientWidth: 320,
    bodyScrollWidth: 320,
    baselineTextCount: 12,
    textCount: 12,
    baselineControlCount: 4,
    controlCount: 4,
    unnamedControlCount: 0,
    mainCount: 1,
    clippedText: [],
    ...overrides,
  };
}

test('override contém os quatro valores do WCAG 2.2 SC 1.4.12', () => {
  assert.match(TEXT_SPACING_CSS, /line-height: 1\.5 !important/u);
  assert.match(TEXT_SPACING_CSS, /margin-block-end: 2em !important/u);
  assert.match(TEXT_SPACING_CSS, /letter-spacing: 0\.12em !important/u);
  assert.match(TEXT_SPACING_CSS, /word-spacing: 0\.16em !important/u);
});

test('snapshot válido aprova o contrato inteiro', () => {
  const result = evaluateTextSpacingSnapshot(passingSnapshot());
  assert.equal(result.falhas.length, 0);
  assert.deepEqual(Object.keys(result.checks), CHECK_IDS);
});

test('overflow horizontal após o espaçamento falha em português', () => {
  const result = evaluateTextSpacingSnapshot(passingSnapshot({ scrollWidth: 480 }));
  assert.equal(result.checks.overflow_horizontal.ok, false);
  assert.match(result.falhas.join('\n'), /overflow horizontal após espaçamento/u);
  assert.match(result.falhas.join('\n'), /A rota \/ em 320x720/u);
});

test('texto cortado por overflow restritivo bloqueia a prova', () => {
  const result = evaluateTextSpacingSnapshot(passingSnapshot({
    clippedText: [{ tag: 'BUTTON', scrollHeight: 52, height: 44 }],
  }));
  assert.equal(result.checks.sem_corte_textual.ok, false);
  assert.match(result.falhas.join('\n'), /conteúdo cortado/u);
});

test('desaparecimento ou perda de nome de controle bloqueia a prova', () => {
  const result = evaluateTextSpacingSnapshot(passingSnapshot({
    baselineControlCount: 4,
    controlCount: 3,
    unnamedControlCount: 1,
  }));
  assert.equal(result.checks.controles_preservados.ok, false);
  assert.match(result.falhas.join('\n'), /controles antes\/depois 4\/3; sem nome 1/u);
});

test('manifesto de ofensores minimiza conteúdo e dados pessoais', () => {
  const result = sanitizeClippedText([{
    tag: 'P',
    id: 'lead',
    className: 'hero',
    width: 280,
    height: 44,
    scrollWidth: 300,
    scrollHeight: 70,
    overflowX: 'hidden',
    overflowY: 'hidden',
    text: 'owner@evolvia.local',
    innerText: 'Evento confidencial',
  }]);
  assert.deepEqual(Object.keys(result[0]), [
    'tag', 'id', 'className', 'width', 'height', 'scrollWidth', 'scrollHeight',
    'overflowX', 'overflowY',
  ]);
  assert.doesNotMatch(JSON.stringify(result), /@|confidencial/u);
});

test('manifesto impõe limite de tamanho', () => {
  assert.throws(
    () => serializeManifest({ value: 'x'.repeat(193 * 1024) }),
    /manifesto de espaçamento excedeu/u,
  );
});
