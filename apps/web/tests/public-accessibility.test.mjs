import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routeFiles = [
  'app/page.tsx',
  'app/eventos/page.tsx',
  'app/evento/[slug]/page.tsx',
];

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/giu).map((value) => Number.parseInt(value, 16) / 255);
  const [red, green, blue] = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function contrastRatio(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('public Gate 1 routes provide a keyboard skip link and focusable main target', async () => {
  for (const path of routeFiles) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(source, /className="skip-link" href="#main-content"/u, path);
    assert.match(source, /<main id="main-content"[^>]*tabIndex=\{-1\}/u, path);
  }
});

test('public navigation targets and skip link keep the 44px interaction baseline', async () => {
  const globalStyles = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  const catalogStyles = await readFile(new URL('../app/eventos/page.module.css', import.meta.url), 'utf8');
  const eventStyles = await readFile(new URL('../app/evento/[slug]/page.module.css', import.meta.url), 'utf8');

  assert.match(globalStyles, /\.skip-link\{[^}]*min-height:44px/u);
  assert.match(globalStyles, /\.skip-link:focus\{[^}]*transform:translateY\(0\)/u);
  assert.match(globalStyles, /\.brand\{[^}]*min-height:44px/u);
  assert.match(globalStyles, /\.btn-link\{[^}]*min-height:44px/u);
  assert.match(catalogStyles, /\.nav a \{[^}]*min-height: 44px/u);
  assert.match(eventStyles, /\.brand \{[^}]*min-height: 44px/u);
});

test('public navigation exposes distinct hover, focus and active feedback', async () => {
  const globalStyles = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');

  assert.match(globalStyles, /\.btn-link\{[^}]*padding:0 10px[^}]*border-radius:10px/u);
  assert.match(globalStyles, /\.btn-link:hover\{[^}]*color:#fff[^}]*background:rgba\(255,255,255,\.10\)/u);
  assert.match(globalStyles, /\.btn-link:focus-visible\{[^}]*outline:3px solid #8fc5ff[^}]*outline-offset:2px/u);
  assert.match(globalStyles, /\.btn-link:active\{[^}]*transform:translateY\(1px\)/u);
});

test('default muted text meets WCAG AA on the application background', async () => {
  const globalStyles = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  const muted = globalStyles.match(/--muted:(#[a-f\d]{6})/iu)?.[1];
  const background = globalStyles.match(/--bg:(#[a-f\d]{6})/iu)?.[1];

  assert.ok(muted && background, 'tokens de cor pública devem existir');
  assert.ok(contrastRatio(muted, background) >= 4.5, 'texto normal precisa atingir contraste AA');
});

test('public experience honors the reduced-motion preference', async () => {
  const globalStyles = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');

  assert.match(globalStyles, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(globalStyles, /html \{ scroll-behavior: auto; \}/u);
  assert.match(globalStyles, /animation-duration: 0\.01ms !important/u);
  assert.match(globalStyles, /animation-iteration-count: 1 !important/u);
  assert.match(globalStyles, /scroll-behavior: auto !important/u);
  assert.match(globalStyles, /transition-duration: 0\.01ms !important/u);
});
