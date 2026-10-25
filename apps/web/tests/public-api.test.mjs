import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  EMPTY_PUBLIC_EVENT_PROFILE,
  publicApiBaseUrl,
  publicApiUrl,
  readPublicEventProfile,
} from '../lib/public-api.ts';

test('a base pública remove barra final e monta o caminho sem duplicar barra', () => {
  assert.equal(publicApiBaseUrl('http://api:4000/'), 'http://api:4000');
  assert.equal(publicApiBaseUrl('http://api:4000///'), 'http://api:4000');
  assert.equal(publicApiUrl('/public/events'), 'http://api:4000/public/events');
  assert.equal(publicApiUrl('public/events', 'http://api:4000/'), 'http://api:4000/public/events');
});

test('perfil público vazio não quebra a página quando a API falha ou devolve lixo', () => {
  assert.deepEqual(readPublicEventProfile(null), EMPTY_PUBLIC_EVENT_PROFILE);
  assert.deepEqual(readPublicEventProfile('x'), EMPTY_PUBLIC_EVENT_PROFILE);
  assert.deepEqual(readPublicEventProfile({ event: { profileCode: 'SCIENTIFIC_EVENT', eventType: 'Congresso' } }), {
    profileCode: 'SCIENTIFIC_EVENT',
    eventType: 'Congresso',
  });
  assert.deepEqual(readPublicEventProfile({ event: { profileCode: 1, eventType: true } }), EMPTY_PUBLIC_EVENT_PROFILE);
});

test('páginas públicas e o sitemap usam o helper com timeout', async () => {
  const files = [
    '../app/evento/[slug]/page.tsx',
    '../app/eventos/page.tsx',
    '../app/sitemap.ts',
    '../app/evento/[slug]/inscricao/page.tsx',
    '../app/evento/[slug]/inscricao/fila/page.tsx',
    '../app/evento/[slug]/participante/page.tsx',
  ];
  const sources = await Promise.all(files.map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  for (const [path, source] of files.map((path, index) => [path, sources[index]])) {
    assert.match(source, /from ['"].*public-api['"]/u, path);
    assert.doesNotMatch(source, /EVOLVIA_API_INTERNAL_URL \?\? 'http:\/\/api:4000'/u, path);
  }
  assert.match(sources[0], /publicApiUrl\(`\/public\/events\/\$\{encodeURIComponent\(slug\)\}`\)/u);
  assert.match(sources[0], /publicApiSignal\(\)/u);
  assert.match(sources[1], /publicApiUrl\(`\/public\/events\?\$\{params\.toString\(\)\}`\)/u);
  assert.match(sources[2], /publicApiUrl\('\/public\/events\/meta\/sitemap'\)/u);
});
