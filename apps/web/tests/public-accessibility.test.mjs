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
  const headerStyles = await readFile(new URL('../components/public-site-header.module.css', import.meta.url), 'utf8');
  const catalogStyles = await readFile(new URL('../app/eventos/page.module.css', import.meta.url), 'utf8');
  const eventStyles = await readFile(new URL('../app/evento/[slug]/page.module.css', import.meta.url), 'utf8');

  assert.match(globalStyles, /\.skip-link\{[^}]*min-height:44px/u);
  assert.match(globalStyles, /\.skip-link:focus\{[^}]*transform:translateY\(0\)/u);
  assert.match(globalStyles, /\.brand\{[^}]*min-height:44px/u);
  assert.match(globalStyles, /\.btn-link\{[^}]*min-height:44px/u);
  assert.match(headerStyles, /\.brand \{[\s\S]*min-height: var\(--space-44\)/u);
  assert.match(headerStyles, /\.action,[\s\S]*\.primaryAction \{[\s\S]*min-height: var\(--space-44\)/u);
  assert.match(eventStyles, /\.brand \{[^}]*min-height: 44px/u);
  assert.match(catalogStyles, /\.filters button \{[\s\S]*min-height: 48px/u);
});

test('public navigation exposes distinct hover, focus and active feedback', async () => {
  const globalStyles = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');

  assert.match(globalStyles, /\.btn-link\{[^}]*padding:0 var\(--space-8\)[^}]*border-radius:var\(--radius-sm\)/u);
  assert.match(globalStyles, /\.btn-link:hover\{[^}]*color:var\(--color-surface\)[^}]*background:var\(--color-surface-on-dark-hover\)/u);
  assert.match(globalStyles, /\.btn-link:focus-visible\{[^}]*outline:3px solid var\(--color-focus-on-dark\)[^}]*outline-offset:2px/u);
  assert.match(globalStyles, /\.btn-link:active\{[^}]*transform:translateY\(1px\)/u);
});

test('default muted text meets WCAG AA on the application background', async () => {
  const [tokens, globalStyles] = await Promise.all([
    readFile(new URL('../app/design-tokens.css', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8'),
  ]);
  const muted = tokens.match(/--color-text-muted: (#[a-f\d]{6})/iu)?.[1];
  const background = tokens.match(/--color-canvas: (#[a-f\d]{6})/iu)?.[1];

  assert.ok(muted && background, 'tokens canônicos de cor pública devem existir');
  assert.match(globalStyles, /--muted:var\(--color-text-muted\)/u);
  assert.match(globalStyles, /--bg:var\(--color-canvas\)/u);
  assert.ok(contrastRatio(muted, background) >= 4.5, 'texto normal precisa atingir contraste AA');
});

test('foco transversal mantém contraste não textual em superfícies claras e escuras', async () => {
  const [tokens, globalStyles] = await Promise.all([
    readFile(new URL('../app/design-tokens.css', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8'),
  ]);
  const color = (name) => tokens.match(new RegExp(`--${name}: (#[a-f\\d]{6})`, 'iu'))?.[1];
  const onLight = color('color-focus-on-light');
  const onDark = color('color-focus-on-dark');
  const surface = color('color-surface');
  const navy = color('color-brand-navy-950');

  assert.ok(onLight && onDark && surface && navy, 'tokens semânticos de foco devem existir');
  assert.ok(contrastRatio(onLight, surface) >= 3, 'foco em superfície clara precisa atingir 3:1');
  assert.ok(contrastRatio(onDark, navy) >= 3, 'foco em superfície escura precisa atingir 3:1');
  assert.match(globalStyles, /\.skip-link:focus\{[^}]*var\(--color-focus-on-light\)/u);
  assert.match(globalStyles, /\.brand:focus-visible\{[^}]*var\(--color-focus-on-dark\)/u);
  assert.match(globalStyles, /\.btn:focus-visible,[^}]*box-shadow:var\(--shadow-focus-visible-dual\)/u);
  assert.match(globalStyles, /\.input:focus,\.select:focus\{[^}]*var\(--color-focus-on-light\)/u);
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

test('home navigation reflows without hiding public actions at 320px', async () => {
  const home = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const headerStyles = await readFile(new URL('../components/public-site-header.module.css', import.meta.url), 'utf8');

  assert.match(home, /<PublicSiteHeader current="home" \/>/u);
  assert.match(headerStyles, /@media \(max-width: 520px\) \{[\s\S]*\.header \{[\s\S]*height: auto;[\s\S]*\.nav \{[\s\S]*display: grid;[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(0, 1fr\)\)/u);
  assert.match(headerStyles, /\.action,[\s\S]*\.primaryAction \{[\s\S]*min-height: var\(--space-44\)/u);
});


test('catálogo de eventos usa a composição visual canônica em desktop e mobile', async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL('../app/eventos/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/eventos/page.module.css', import.meta.url), 'utf8'),
  ]);

  assert.match(page, /<PublicSiteHeader current="eventos" \/>/u);
  assert.match(styles, /font-family: var\(--font-family-sans\)/u);
  assert.match(styles, /linear-gradient\(135deg, var\(--color-brand-navy-800\), var\(--color-brand-blue-700\)\)/u);
  assert.match(styles, /\.hero h1 \{[\s\S]*font-size: var\(--font-size-display-sm\);/u);
  assert.match(styles, /calc\(\(100% - var\(--layout-content-max\)\) \/ 2\)/u);
  assert.match(styles, /\.filters \{[\s\S]*background: var\(--color-surface\);[\s\S]*color: var\(--color-text\);[\s\S]*box-shadow: var\(--shadow-elevated\);[\s\S]*transform: translateY\(50%\);/u);
  assert.match(styles, /\.filters button \{[\s\S]*background: var\(--color-brand-blue-600\);[\s\S]*color: var\(--color-on-dark\);[\s\S]*box-shadow: var\(--shadow-action\);/u);
  assert.match(styles, /\.results \{[\s\S]*width: min\(var\(--layout-content-max\),[\s\S]*margin: 0 auto;/u);
  assert.match(styles, /\.card \{[\s\S]*box-shadow:var\(--shadow-soft\);[\s\S]*transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;/u);
  assert.match(styles, /\.card:hover \{[\s\S]*box-shadow: var\(--shadow-elevated\);[\s\S]*transform: translateY\(-2px\);/u);
  assert.match(styles, /\.card:focus-within \{[\s\S]*border-color: var\(--color-brand-blue-600\);[\s\S]*box-shadow: var\(--shadow-focus\);/u);
  assert.match(styles, /@media \(max-width: 1080px\) \{[\s\S]*\.filters button,[\s\S]*\.clearLink \{[\s\S]*width: 100%;/u);
  assert.match(styles, /@media \(max-width: 640px\) \{[\s\S]*\.filters \{[\s\S]*transform: none;[\s\S]*grid-template-columns: minmax\(0, 1fr\);/u);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}/iu);
});

test('catálogo preserva contraste WCAG do overline e do foco em superfícies claras', async () => {
  const [tokens, styles] = await Promise.all([
    readFile(new URL('../app/design-tokens.css', import.meta.url), 'utf8'),
    readFile(new URL('../app/eventos/page.module.css', import.meta.url), 'utf8'),
  ]);
  const token = (name) => tokens.match(new RegExp(`--${name}: (#[a-f\\d]{6})`, 'iu'))?.[1];
  const overline = token('color-on-dark-muted');
  const navy = token('color-brand-navy-800');
  const blue = token('color-brand-blue-700');
  const focus = token('color-brand-blue-600');
  const surface = token('color-surface');

  assert.ok(overline && navy && blue && focus && surface, 'tokens canônicos do catálogo devem existir');
  assert.ok(contrastRatio(overline, navy) >= 4.5, 'overline precisa atingir AA no início do gradiente');
  assert.ok(contrastRatio(overline, blue) >= 4.5, 'overline precisa atingir AA no fim do gradiente');
  assert.ok(contrastRatio(focus, surface) >= 3, 'indicador de foco precisa atingir 3:1 na superfície clara');
  assert.match(styles, /\.hero \.eyebrow \{[^}]*color: var\(--color-on-dark-muted\);/u);
  assert.match(styles, /outline: 3px solid var\(--color-brand-blue-600\);/u);
});
