import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { DEFAULT_LOCALE, LOCALE_METADATA } from '../lib/i18n.ts';
import manifest from '../app/manifest.ts';

const WEB_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PRIVATE_PATH_MARKERS = [
  '/login',
  '/cadastro',
  '/painel',
  '/convites',
  '/eventos/novo',
  '/configuracao',
  '/cientifico',
];
const PWA_PROMISE_KEYS = [
  'display_override',
  'prefer_related_applications',
  'related_applications',
  'shortcuts',
  'share_target',
  'protocol_handlers',
  'file_handlers',
  'launch_handler',
  'screenshots',
];

function tokenHex(css, name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, 'iu'));
  assert.ok(match?.[1], `token canônico ausente: --${name}`);
  return match[1].toLowerCase();
}

const URL_KEYS = new Set(['src', 'start_url', 'scope', 'url', 'action', 'id']);

function collectUrls(value, bag = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, bag);
    return bag;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (URL_KEYS.has(key) && typeof nested === 'string') {
        bag.push(nested);
      } else {
        collectUrls(nested, bag);
      }
    }
  }
  return bag;
}

function assertSafeRelativeUrl(value, label) {
  assert.equal(typeof value, 'string', label);
  assert.match(value, /^\/(?!\/)/u, `${label} deve ser relativa à origem`);
  assert.doesNotMatch(value, /[:\\]|\/\/|\.\./u, `${label} não pode sair da origem pública`);
  assert.doesNotMatch(value, /[?#]/u, `${label} não pode carregar query ou fragmento`);
  for (const marker of PRIVATE_PATH_MARKERS) {
    assert.equal(
      value === marker || value.startsWith(`${marker}/`),
      false,
      `${label} aponta para superfície privada: ${value}`,
    );
  }
}

function resolveExistingAsset(src) {
  const relative = src.replace(/^\//u, '');
  return [
    path.join(WEB_ROOT, 'app', relative),
    path.join(WEB_ROOT, 'public', relative),
  ];
}

const manifestContract = manifest();
const [tokens, layout, manifestSource] = await Promise.all([
  readFile(new URL('../app/design-tokens.css', import.meta.url), 'utf8'),
  readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/manifest.ts', import.meta.url), 'utf8'),
]);

test('manifesto público declara identidade PT-BR sem modo aplicativo', () => {
  assert.equal(manifestContract.name, 'Evolvia');
  assert.equal(manifestContract.short_name, 'Evolvia');
  assert.equal(manifestContract.lang, 'pt-BR');
  assert.equal(manifestContract.lang, DEFAULT_LOCALE);
  assert.equal(manifestContract.dir, 'ltr');
  assert.equal(manifestContract.dir, LOCALE_METADATA[DEFAULT_LOCALE].direction);
  assert.equal(manifestContract.start_url, '/');
  assert.equal(manifestContract.scope, '/');
  assert.equal(manifestContract.display, 'browser');
});

test('cores do manifesto derivam dos tokens canônicos', () => {
  assert.equal(manifestContract.theme_color?.toLowerCase(), tokenHex(tokens, 'color-brand-navy-950'));
  assert.equal(manifestContract.background_color?.toLowerCase(), tokenHex(tokens, 'color-canvas'));
});

test('URLs do manifesto são relativas, públicas e sem escopo privado', () => {
  assertSafeRelativeUrl(manifestContract.start_url, 'start_url');
  assertSafeRelativeUrl(manifestContract.scope, 'scope');

  const urls = collectUrls(manifestContract);
  assert.ok(urls.length > 0);
  for (const url of urls) {
    assertSafeRelativeUrl(url, url);
  }
});

test('ícones existentes apontam só para ativos comprovados', async () => {
  const icons = manifestContract.icons ?? [];
  assert.equal(icons.length, 1);
  assert.equal(icons[0]?.src, '/icon.svg');
  assert.equal(icons[0]?.type, 'image/svg+xml');
  assert.equal(icons[0]?.sizes, 'any');
  assert.equal(icons[0]?.purpose, 'any');

  for (const icon of icons) {
    assertSafeRelativeUrl(icon.src, `icon ${icon.src}`);
    const candidates = resolveExistingAsset(icon.src);
    const found = [];
    for (const candidate of candidates) {
      try {
        await access(candidate);
        found.push(candidate);
      } catch {
        // candidato inexistente
      }
    }
    assert.equal(found.length, 1, `ativo inexistente ou duplicado para ${icon.src}: ${found.join(', ')}`);
  }
});

test('manifesto não promete PWA, instalação, offline nem metadata paralela', () => {
  for (const key of PWA_PROMISE_KEYS) {
    assert.equal(key in manifestContract, false, key);
  }
  assert.doesNotMatch(manifestSource, /service[- ]?worker|workbox|offline|cache|push|analytics/iu);
  assert.doesNotMatch(layout, /\bmanifest\s*:/u);
  assert.match(layout, /url: '\/icon\.svg'/u);
});
