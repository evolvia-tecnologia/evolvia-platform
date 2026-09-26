import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const webRoot = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

async function evaluateSeoHelper(expression, env = {}) {
  const script = `
    import {
      buildPublicDiscoveryUrl,
      isPublicEventSlug,
      resolvePublicOrigin,
    } from './app/robots.ts';

    try {
      const value = (${expression});
      console.log(JSON.stringify({ value }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(JSON.stringify({ error: message }));
    }
  `;

  const { stdout } = await execFileAsync('node', [
    '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
    '--experimental-strip-types',
    '--input-type=module',
    '-e',
    script,
  ], {
    cwd: webRoot,
    env: { ...process.env, ...env },
  });

  return JSON.parse(stdout.trim());
}

test('layout expõe metadataBase, canonical e conteúdo PT-BR sem dados pessoais', async () => {
  const layout = await source('../app/layout.tsx');

  assert.match(layout, /metadataBase: new URL\(resolvePublicOrigin\(\)\)/u);
  assert.match(layout, /alternates:\s*\{\s*canonical: '\/'/u);
  assert.match(layout, /locale: 'pt_BR'/u);
  assert.match(layout, /Plataforma brasileira para criar, divulgar e operar eventos com autonomia\./u);
  assert.doesNotMatch(layout, /@[a-z0-9.-]+\.[a-z]{2,}/iu);
  assert.doesNotMatch(layout, /senha|cpf|telefone|e-mail pessoal/u);
});

test('robots bloqueia rotas privadas, preview e superfícies administrativas', async () => {
  const robots = await source('../app/robots.ts');

  for (const route of [
    '/login',
    '/cadastro',
    '/painel',
    '/convites',
    '/eventos/novo',
    '/eventos/*/painel',
    '/eventos/*/painel/divulgacao/preview',
    '/eventos/*/cientifico',
    '/eventos/*/configuracao',
  ]) {
    assert.match(robots, new RegExp(`'${route.replace(/\*/gu, '\\*')}'`, 'u'), route);
  }

  assert.match(robots, /allow: \['\/', '\/eventos', '\/evento\/'\]/u);
  assert.match(robots, /sitemap: `\$\{origin\}\/sitemap\.xml`/u);
});

test('sitemap limita URLs à origem pública e às rotas estáveis', async () => {
  const sitemap = await source('../app/sitemap.ts');

  assert.match(sitemap, /resolvePublicOrigin\(\)/u);
  assert.match(sitemap, /buildPublicDiscoveryUrl\('\/', origin\)/u);
  assert.match(sitemap, /buildPublicDiscoveryUrl\('\/eventos', origin\)/u);
  assert.match(sitemap, /isPublicEventSlug\(event\.slug\)/u);
  assert.match(sitemap, /buildPublicDiscoveryUrl\(`\/evento\/\$\{event\.slug\}`, origin\)/u);
  assert.doesNotMatch(sitemap, /'\/(?:login|cadastro|painel|convites|termos-de-uso|privacidade)/u);
  assert.doesNotMatch(sitemap, /buildPublicDiscoveryUrl\([^)]*(?:\?|#)/u);
});

test('resolvePublicOrigin usa fallback seguro de desenvolvimento', async () => {
  const result = await evaluateSeoHelper('resolvePublicOrigin()', {
    EVOLVIA_PUBLIC_BASE_URL: '',
  });

  assert.equal(result.value, 'http://localhost:3000');
});

test('resolvePublicOrigin normaliza origem allowlisted configurada', async () => {
  const result = await evaluateSeoHelper('resolvePublicOrigin()', {
    EVOLVIA_PUBLIC_BASE_URL: 'https://homolog.evolvia.example/',
  });

  assert.equal(result.value, 'https://homolog.evolvia.example');
});

test('resolvePublicOrigin falha fechada para origem inválida', async () => {
  for (const configured of [
    'ftp://homolog.evolvia.example',
    'https://homolog.evolvia.example/path',
    'https://homolog.evolvia.example?token=abc',
    'https://homolog.evolvia.example#frag',
    'not-a-url',
  ]) {
    const result = await evaluateSeoHelper('resolvePublicOrigin()', {
      EVOLVIA_PUBLIC_BASE_URL: configured,
    });
    assert.match(String(result.error), /EVOLVIA_PUBLIC_BASE_URL inválida\./u, configured);
  }
});

test('buildPublicDiscoveryUrl aceita rotas públicas estáveis na origem configurada', async () => {
  const env = { EVOLVIA_PUBLIC_BASE_URL: 'https://homolog.evolvia.example' };
  const home = await evaluateSeoHelper("buildPublicDiscoveryUrl('/')", env);
  const catalog = await evaluateSeoHelper("buildPublicDiscoveryUrl('/eventos')", env);
  const event = await evaluateSeoHelper("buildPublicDiscoveryUrl('/evento/congresso-evolvia')", env);

  assert.equal(home.value, 'https://homolog.evolvia.example/');
  assert.equal(catalog.value, 'https://homolog.evolvia.example/eventos');
  assert.equal(event.value, 'https://homolog.evolvia.example/evento/congresso-evolvia');
});

test('buildPublicDiscoveryUrl rejeita origem externa, query, token e rotas privadas', async () => {
  const env = { EVOLVIA_PUBLIC_BASE_URL: 'https://homolog.evolvia.example' };

  for (const expression of [
    "(() => { try { buildPublicDiscoveryUrl('/login'); return 'unexpected'; } catch (error) { return error.message; } })()",
    "(() => { try { buildPublicDiscoveryUrl('/eventos?page=2'); return 'unexpected'; } catch (error) { return error.message; } })()",
    "(() => { try { buildPublicDiscoveryUrl('/evento/congresso-evolvia?token=abc'); return 'unexpected'; } catch (error) { return error.message; } })()",
    "(() => { try { buildPublicDiscoveryUrl('/convites/cientificos/abc123'); return 'unexpected'; } catch (error) { return error.message; } })()",
    "(() => { try { buildPublicDiscoveryUrl('https://evil.example/eventos'); return 'unexpected'; } catch (error) { return error.message; } })()",
  ]) {
    const result = await evaluateSeoHelper(expression, env);
    assert.match(String(result.value), /inválid|fora da origem/u);
  }
});

test('isPublicEventSlug aceita slug público e rejeita identificadores internos', async () => {
  const valid = await evaluateSeoHelper("isPublicEventSlug('congresso-evolvia')");
  const invalidToken = await evaluateSeoHelper("isPublicEventSlug('evt_01JABC123TOKEN')");
  const invalidQueryLike = await evaluateSeoHelper("isPublicEventSlug('abc?token=1')");

  assert.equal(valid.value, true);
  assert.equal(invalidToken.value, false);
  assert.equal(invalidQueryLike.value, false);
});
