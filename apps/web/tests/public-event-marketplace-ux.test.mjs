import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('a página pública guarda a inscrição ao lado do conteúdo', () => {
  const presentation = readFileSync(new URL('../components/public-event-presentation.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../app/evento/[slug]/page.module.css', import.meta.url), 'utf8');
  assert.match(presentation, /className=\{styles\.marketplace\}/u);
  assert.match(presentation, /className=\{styles\.ticket\}/u);
  assert.match(presentation, /formatPublicEventWhen/u);
  assert.match(css, /\.marketplace/u);
  assert.match(css, /position:\s*sticky/u);
});

test('a vitrine e o catálogo oferecem coleções rápidas', () => {
  const preview = readFileSync(new URL('../components/public-events-preview.tsx', import.meta.url), 'utf8');
  const catalog = readFileSync(new URL('../app/eventos/page.tsx', import.meta.url), 'utf8');
  const collections = readFileSync(new URL('../lib/public-event-collections.ts', import.meta.url), 'utf8');
  assert.match(preview, /PublicEventCollections/u);
  assert.match(preview, /slice\(0, 6\)/u);
  assert.match(catalog, /PublicEventCollections/u);
  assert.match(collections, /Próximos/u);
  assert.match(collections, /Científicos/u);
});
