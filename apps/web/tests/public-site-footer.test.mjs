import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { PUBLIC_EVENT_PROFILES, isPublicEventProfile } from '../lib/public-event-profile.ts';
import { PUBLIC_HELP_ARTICLES } from '../lib/public-help.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const data = (text) => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const transpile = (path) => ts.transpileModule(read(path), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const modules = {
  'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'),
  'next/link': data(`import { createElement } from ${JSON.stringify(import.meta.resolve('react'))}; export default function Link({ href, children, ...props }) { return createElement('a', { ...props, href }, children); }`),
  '../lib/public-event-profile': data(transpile('../lib/public-event-profile.ts')),
  './public-site-footer.module.css': data('export default new Proxy({}, {get: (_, key) => String(key)});'),
};
const { default: Footer } = await import(data(transpile('../components/public-site-footer.tsx').replace(
  /from ['"]([^'"]+)['"]/gu, (match, name) => 'from ' + JSON.stringify(modules[name] ?? name),
)));
const html = () => renderToStaticMarkup(Footer());
const links = () => [...html().matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gu)]
  .map((match) => ({ href: match[1].replaceAll('&amp;', '&'), label: match[2].replace(/<[^>]+>/gu, '').trim() }));

test('rodapé oferece acesso público real e não inventa destinos comerciais', () => {
  const helpSlugs = new Set(PUBLIC_HELP_ARTICLES.map((article) => article.slug));
  for (const { href, label } of links()) {
    assert.ok(label, 'todo link tem nome visível');
    const url = new URL(href, 'https://evolvia.invalid');
    assert.equal(url.origin, 'https://evolvia.invalid', 'nenhum rastreador ou rede social fictícia');
    if (url.pathname.startsWith('/ajuda/')) {
      assert.ok(helpSlugs.has(url.pathname.slice('/ajuda/'.length)), href);
    } else {
      assert.ok(existsSync(new URL(`../app${url.pathname === '/' ? '' : url.pathname}/page.tsx`, import.meta.url)), href);
    }
    assert.notEqual(href, '#');
  }
  for (const href of ['/cadastro', '/login', '/participante', '/eventos', '/ajuda', '/termos-de-uso', '/privacidade', '/acessibilidade']) {
    assert.ok(links().some((link) => link.href === href), href);
  }
});

test('links por contexto usam somente os perfis e filtros canônicos do catálogo', () => {
  const profiles = links().filter(({ href }) => href.startsWith('/eventos?profile='));
  assert.equal(profiles.length, PUBLIC_EVENT_PROFILES.length);
  assert.deepEqual(profiles.map(({ href }) => new URL(href, 'https://evolvia.invalid').searchParams.get('profile')), PUBLIC_EVENT_PROFILES.map(({ value }) => value));
  for (const { href } of profiles) {
    const value = new URL(href, 'https://evolvia.invalid').searchParams.get('profile');
    assert.ok(isPublicEventProfile(value));
  }
});

test('SSR estável preserva grupos nomeados, textos próprios e informação de idioma sem seletor fictício', () => {
  const rendered = html();
  assert.equal(rendered, html());
  assert.equal((rendered.match(/<footer\b/gu) ?? []).length, 1);
  for (const label of ['Contextos de evento', 'Recursos da Evolvia', 'Acessos da Evolvia', 'Documentos jurídicos']) {
    assert.ok(rendered.includes(`aria-label="${label}"`), label);
  }
  assert.match(rendered, /Seu próximo evento começa aqui/u);
  assert.match(rendered, /Português \(Brasil\)/u);
  assert.doesNotMatch(rendered, /Even3|ReclameAqui|CNPJ|ISBN|\b10 milhões\b|<select|role="button"/iu);
  assert.doesNotMatch(rendered, /target="_blank"|<form|<script/iu);
});

test('home usa um rodapé contentinfo fora do main sem alterar catálogo ou prestart', () => {
  const home = read('../app/page.tsx');
  assert.equal((home.match(/<PublicSiteFooter \/>/gu) ?? []).length, 1);
  assert.ok(home.indexOf('</main>') < home.indexOf('<PublicSiteFooter />'));
  assert.match(home, /<PublicEventsPreview \/>/u);
  assert.match(home, /<PublicPlatformGuide \/>/u);
  assert.match(home, /evolvia_wizard_prestart_v2/u);
  assert.match(home, /<main id="main-content"[^>]*tabIndex=\{-1\}/u);
});

function luminance(hex) {
  const [r, g, b] = hex.match(/[\da-f]{2}/giu).map((value) => parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test('cores e foco do rodapé atendem contraste; mídia print exclui navegação institucional', () => {
  const tokens = read('../app/design-tokens.css');
  const token = (name) => tokens.match(new RegExp(`--${name}: (#[a-f\\d]{6})`, 'iu'))?.[1];
  const bg = token('color-brand-navy-950');
  assert.ok(ratio(token('color-on-dark-muted'), bg) >= 4.5);
  assert.ok(ratio(token('color-on-dark'), bg) >= 4.5);
  assert.ok(ratio(token('color-focus-on-dark'), bg) >= 3);
  const css = read('../components/public-site-footer.module.css');
  assert.match(css, /\.footer a:focus-visible\s*\{[^}]*outline: 3px solid var\(--color-focus-on-dark\)/u);
  assert.match(css, /@media print\s*\{\s*\.footer\s*\{\s*display: none !important/u);
  assert.match(css, /@media \(forced-colors: active\)/u);
});
