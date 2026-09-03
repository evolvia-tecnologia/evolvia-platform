import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

export const TEXT_SPACING_OVERRIDE = `
  * {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p {
    margin-block-end: 2em !important;
  }
`;

export const LEGAL_TEXT_SPACING_VIEWPORTS = [320, 390, 768, 1366];
export const LEGAL_TEXT_SPACING_PATHS = ['/termos-de-uso', '/privacidade'];

export const LEGAL_SPACING_OFFENDER = Object.freeze({
  tag: 'H1',
  className: 'article',
  display: 'block',
  overflowWrap: 'anywhere',
  minWidth: '0',
});

const css = await readFile(new URL('../components/legal-document-page.module.css', import.meta.url), 'utf8');

export function assertLegalSafeWrap(source) {
  assert.match(source, /\.article \{[\s\S]*min-width: 0/u);
  assert.match(source, /\.article h1 \{[\s\S]*min-width: 0;[\s\S]*overflow-wrap: anywhere/u);
}

function articleContentWidth(viewportWidth) {
  const mainInlinePad = viewportWidth <= 680 ? 12 : 20;
  const articlePad = Math.min(56, Math.max(24, viewportWidth * 0.05));
  const mainContent = viewportWidth - (mainInlinePad * 2);
  const articleBorderBox = Math.min(920, mainContent);
  return articleBorderBox - (articlePad * 2) - 2;
}

function sanitizeOffender(raw) {
  return {
    tag: String(raw?.tag ?? '').slice(0, 32),
    className: String(raw?.className ?? '').slice(0, 120),
    display: String(raw?.display ?? '').slice(0, 32),
    overflowWrap: String(raw?.overflowWrap ?? '').slice(0, 32),
    minWidth: String(raw?.minWidth ?? '').slice(0, 32),
  };
}

test('contrato SC 1.4.12 documenta override, rotas jurídicas e viewports', () => {
  assert.match(TEXT_SPACING_OVERRIDE, /line-height: 1\.5 !important/u);
  assert.match(TEXT_SPACING_OVERRIDE, /letter-spacing: 0\.12em !important/u);
  assert.match(TEXT_SPACING_OVERRIDE, /word-spacing: 0\.16em !important/u);
  assert.match(TEXT_SPACING_OVERRIDE, /p \{[\s\S]*margin-block-end: 2em !important/u);
  assert.deepEqual(LEGAL_TEXT_SPACING_VIEWPORTS, [320, 390, 768, 1366]);
  assert.deepEqual(LEGAL_TEXT_SPACING_PATHS, ['/termos-de-uso', '/privacidade']);
});

test('ofensor horizontal é o h1 do artigo, sem texto nem dado pessoal', () => {
  const sanitized = sanitizeOffender({
    ...LEGAL_SPACING_OFFENDER,
    text: 'owner-1@evolvia-ci.local',
    innerText: 'titulo-do-documento',
  });

  assert.deepEqual(sanitized, { ...LEGAL_SPACING_OFFENDER });
  assert.deepEqual(Object.keys(sanitized), ['tag', 'className', 'display', 'overflowWrap', 'minWidth']);
  assert.equal('text' in sanitized, false);
  assert.equal('innerText' in sanitized, false);
  assert.doesNotMatch(JSON.stringify(sanitized), /@|owner-|titulo-do-documento|Privacidade|Termos/u);
});

test('quebra segura no seletor mínimo impede overflow documental', () => {
  assertLegalSafeWrap(css);
  assert.match(css, /\.article \{[\s\S]*width: min\(920px, 100%\)/u);
});

test('teste negativo rejeita remoção da quebra segura', () => {
  assertLegalSafeWrap(css);
  const stripped = css.replace(/overflow-wrap:\s*anywhere;?\n?/gu, '');
  assert.notEqual(stripped, css);
  assert.throws(
    () => assertLegalSafeWrap(stripped),
    /overflow-wrap/u,
  );
});

test('matriz 320/390/768/1366 dos dois documentos usa a mesma quebra, sem media que a desligue', () => {
  const wrapRule = css.match(/\.article h1 \{[^}]+\}/u)?.[0] ?? '';
  assert.match(wrapRule, /overflow-wrap: anywhere/u);
  assert.doesNotMatch(css, /@media[^{]+\{[\s\S]*\.article h1 \{[\s\S]*overflow-wrap:\s*normal/u);

  for (const path of LEGAL_TEXT_SPACING_PATHS) {
    for (const width of LEGAL_TEXT_SPACING_VIEWPORTS) {
      const contentWidth = articleContentWidth(width);
      assert.ok(contentWidth > 0, `${path} @ ${width}`);
      assert.ok(contentWidth <= width, `${path} @ ${width}`);
      assert.match(articleRule, /min-width: 0/u, `${path} @ ${width}`);
      assert.match(articleRule, /overflow-wrap: anywhere/u, `${path} @ ${width}`);
      assert.match(headingRule, /min-width: 0/u, `${path} @ ${width}`);
    }
  }

  assert.ok(articleContentWidth(320) < 250);
  assert.ok(articleContentWidth(1366) > 800);
});

test('correção não oculta, trunca, reduz fonte/espaçamento nem usa overflow-x hidden', () => {
  assert.doesNotMatch(css, /overflow-x:\s*hidden/u);
  assert.doesNotMatch(css, /overflow:\s*hidden/u);
  assert.doesNotMatch(css, /white-space:\s*nowrap/u);
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis/u);
  assert.doesNotMatch(css, /-webkit-line-clamp/u);
  assert.doesNotMatch(css, /letter-spacing:\s*0\s*!important/u);
  assert.doesNotMatch(css, /word-spacing:\s*0\s*!important/u);
  assert.doesNotMatch(css, /line-height:\s*1(?:\.0+)?\s*!important/u);
  assert.doesNotMatch(css, /font-size:\s*(?:0|1px|2px)\s*!important/u);
});

test('foco, alvo 44px e forced-colors do documento jurídico permanecem', () => {
  assert.match(css, /\.docNav,[\s\S]*\.backLink,[\s\S]*\.references a \{[\s\S]*min-height: var\(--space-44\)/u);
  assert.match(css, /\.docNav a:focus-visible,[\s\S]*outline: 3px solid var\(--color-focus-on-light\)/u);
  assert.match(css, /@media \(forced-colors: active\) \{[\s\S]*border: 1px solid CanvasText/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
});
