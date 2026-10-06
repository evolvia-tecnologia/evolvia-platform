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

test('o cabeçalho público busca eventos sem sair do fluxo canônico', () => {
  const header = readFileSync(new URL('../components/public-site-header.tsx', import.meta.url), 'utf8');
  assert.match(header, /action="\/eventos"/u);
  assert.match(header, /name="q"/u);
  assert.match(header, /SEARCHABLE/u);
  assert.match(header, /maxLength=\{120\}/u);
});

test('a home abre pela descoberta de eventos', () => {
  const home = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(home, /PublicDiscoveryStrip/u);
  assert.ok(home.indexOf('PublicEventsPreview') < home.indexOf('PublicPlatformGuide'));
});

test('o painel do evento mostra data, local e cópia do link', () => {
  const presentation = readFileSync(new URL('../components/public-event-presentation.tsx', import.meta.url), 'utf8');
  assert.match(presentation, /PublicEventShare/u);
  assert.match(presentation, /ticketWhen/u);
  assert.match(presentation, /ticketWhere/u);
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
