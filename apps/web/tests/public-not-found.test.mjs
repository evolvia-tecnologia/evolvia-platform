import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

test('not-found fornece skip-link e foco no main', async () => {
  const src = await source('../app/not-found.tsx');
  assert.match(src, /className="skip-link" href="#main-content"/u);
  assert.match(src, /<main id="main-content"[^>]*tabIndex=\{-1\}/u);
});

test('not-found contém título PT-BR e ações para Home e Explorar', async () => {
  const src = await source('../app/not-found.tsx');
  assert.match(src, /Página não encontrada/u);
  assert.match(src, /href="\//u);
  assert.match(src, /href="\/eventos"/u);
});

test('not-found não vaza URL, query, slug, token ou stack', async () => {
  const src = await source('../app/not-found.tsx');
  assert.doesNotMatch(src, /usePathname|useSearchParams|useParams|headers\(\)|cookies\(\)/u);
  assert.doesNotMatch(src, /searchParams|notFoundError|stack/u);
  assert.doesNotMatch(src, /token|secret|key/iu);
});

test('not-found define robots noindex/nofollow', async () => {
  const src = await source('../app/not-found.tsx');
  assert.match(src, /robots.*index: false/u);
  assert.match(src, /robots.*follow: false/u);
});

test('not-found não exibe o caminho ou parâmetros da requisição', async () => {
  const src = await source('../app/not-found.tsx');
  assert.doesNotMatch(src, /\{[^}]*params[^}]*\}/u);
  assert.doesNotMatch(src, /\{[^}]*url[^}]*\}/u);
  assert.doesNotMatch(src, /\{[^}]*path[^}]*\}/u);
});

test('not-found.module.css suporta forced-colors e reflow em 320px', async () => {
  const css = await source('../app/not-found.module.css');
  assert.match(css, /forced-colors/u);
  assert.match(css, /max-width.*3[0-2]\d/u);
});

test('not-found usa apenas ações permitidas: Home e Explorar eventos', async () => {
  const src = await source('../app/not-found.tsx');
  const links = [...src.matchAll(/href="([^"]+)"/gu)].map((m) => m[1]);
  const allowed = ['#main-content', '/', '/eventos'];
  for (const href of links) {
    assert.ok(allowed.includes(href), `href não autorizado encontrado: ${href}`);
  }
});
