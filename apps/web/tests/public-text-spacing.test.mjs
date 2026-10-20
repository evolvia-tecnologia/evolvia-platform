import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ownedStyles = [
  '../app/home-viewport.module.css',
  '../app/auth-layout.module.css',
  '../app/eventos/page.module.css',
  '../app/evento/[slug]/page.module.css',
  '../components/legal-document-page.module.css',
  '../components/public-site-header.module.css',
];

const publicHeaderRoutes = [
  ['../app/page.tsx', 'home'],
  ['../app/login/page.tsx', 'login'],
  ['../app/cadastro/page.tsx', 'cadastro'],
  ['../app/eventos/page.tsx', 'eventos'],
  ['../app/evento/[slug]/page.tsx', 'evento'],
];

const legalPageRoutes = [
  ['../app/termos-de-uso/page.tsx', '/termos-de-uso'],
  ['../app/privacidade/page.tsx', '/privacidade'],
];

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

export const TEXT_SPACING_VIEWPORTS = [320, 390, 768, 1366];
export const TEXT_SPACING_PATHS = [
  '/',
  '/login',
  '/cadastro',
  '/eventos',
  '/evento/[slug]',
  '/termos-de-uso',
  '/privacidade',
];

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

test('contrato SC 1.4.12 documenta override, rotas e viewports públicas', () => {
  assert.match(TEXT_SPACING_OVERRIDE, /line-height: 1\.5 !important/u);
  assert.match(TEXT_SPACING_OVERRIDE, /letter-spacing: 0\.12em !important/u);
  assert.match(TEXT_SPACING_OVERRIDE, /word-spacing: 0\.16em !important/u);
  assert.match(TEXT_SPACING_OVERRIDE, /p \{[\s\S]*margin-block-end: 2em !important/u);
  assert.deepEqual(TEXT_SPACING_VIEWPORTS, [320, 390, 768, 1366]);
  assert.equal(TEXT_SPACING_PATHS.length, 7);
});

test('módulos públicos owned não cortam texto com nowrap, ellipsis ou line-clamp', async () => {
  for (const path of ownedStyles) {
    const css = await source(path);
    if (path.endsWith('public-site-header.module.css')) {
      assert.match(css, /\.searchButton \{[\s\S]*?white-space:\s*nowrap/u, path);
      const withoutSearchButton = css.replace(/\.searchButton \{[\s\S]*?\n\}/u, '');
      assert.doesNotMatch(withoutSearchButton, /white-space:\s*nowrap/u, path);
    } else {
      assert.doesNotMatch(css, /white-space:\s*nowrap/u, path);
    }
    assert.doesNotMatch(css, /text-overflow:\s*ellipsis/u, path);
    assert.doesNotMatch(css, /-webkit-line-clamp/u, path);
    assert.doesNotMatch(css, /overflow:\s*hidden[^}]*text-overflow/u, path);
  }
});

test('módulos públicos owned não reduzem fonte nem espaçamento para passar no SC 1.4.12', async () => {
  for (const path of ownedStyles) {
    const css = await source(path);
    assert.doesNotMatch(css, /letter-spacing:\s*0\s*!important/u, path);
    assert.doesNotMatch(css, /word-spacing:\s*0\s*!important/u, path);
    assert.doesNotMatch(css, /line-height:\s*1(?:\.0+)?\s*!important/u, path);
    assert.doesNotMatch(css, /font-size:\s*(?:0|1px|2px)\s*!important/u, path);
    assert.doesNotMatch(css, /text-spacing|sc-1\.4\.12|wcag-spacing/iu, path);
  }
});

test('as sete rotas públicas continuam com ações nomeadas no cabeçalho canônico', async () => {
  assert.equal(publicHeaderRoutes.length + legalPageRoutes.length, TEXT_SPACING_PATHS.length);

  for (const [path, current] of publicHeaderRoutes) {
    const page = await source(path);
    assert.match(page, /from ['"].*public-site-header['"]/u, path);
    assert.match(page, new RegExp(`<PublicSiteHeader current="${current}" />`, 'u'), path);
  }

  for (const [path, route] of legalPageRoutes) {
    const page = await source(path);
    assert.match(page, /from ['"].*legal-document-page['"]/u, path);
    assert.match(page, /<LegalDocumentPage /u, path);
    assert.ok(TEXT_SPACING_PATHS.includes(route), route);
  }

  const legal = await source('../components/legal-document-page.tsx');
  assert.match(legal, /from ['"].*public-site-header['"]/u);
  assert.match(legal, /<PublicSiteHeader current="legal" \/>/u);

  const header = await source('../components/public-site-header.tsx');
  assert.match(header, /aria-label="Evolvia — início"/u);
  assert.match(header, /aria-label="Navegação principal"/u);
  assert.match(header, /label: 'Eventos'/u);
  assert.match(header, /label: 'Entrar'|label: 'Criar conta'|label: 'Área do organizador'/u);
});

test('cabeçalho público reflui com min-width 0, wrap e altura automática em 320px', async () => {
  const css = await source('../components/public-site-header.module.css');
  assert.match(css, /\.header \{[\s\S]*flex-wrap: wrap/u);
  assert.match(css, /\.brand \{[\s\S]*min-width: 0/u);
  assert.match(css, /\.nav \{[\s\S]*flex-wrap: wrap[\s\S]*min-width: 0/u);
  assert.match(css, /\.action,[\s\S]*\.primaryAction \{[\s\S]*min-width: 0[\s\S]*min-height: var\(--space-44\)/u);
  assert.match(css, /@media \(max-width: 520px\) \{[\s\S]*\.header \{[\s\S]*height: auto;[\s\S]*\.nav \{[\s\S]*display: grid;[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 10rem\), 1fr\)\)/u);
});

test('home cresce no viewport estreito e o rodapé jurídico quebra linha', async () => {
  const css = await source('../app/home-viewport.module.css');
  assert.match(css, /\.legalFooter \{[\s\S]*flex-wrap: wrap/u);
  assert.match(css, /\.legalFooter nav \{[\s\S]*flex-wrap: wrap/u);
  assert.match(css, /\.legalFooter a \{[\s\S]*min-height: 44px/u);
  assert.match(css, /@media \(max-width: 520px\) \{[\s\S]*\.viewport :global\(\.hero\) \{[\s\S]*min-height: auto/u);
  assert.doesNotMatch(css, /overflow:\s*hidden/u);
});

test('autenticação preserva reflow vertical, colunas fluidas e rodapé quebra-linha', async () => {
  const css = await source('../app/auth-layout.module.css');
  assert.match(css, /\.page \{[\s\S]*display: flex;[\s\S]*flex-direction: column;/u);
  assert.match(css, /\.workspace \{[\s\S]*flex: 1 1 auto;[\s\S]*min-height: 0;/u);
  assert.match(css, /\.benefits \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/u);
  assert.match(css, /\.requirements \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(css, /\.requirements li \{[\s\S]*min-width: 0/u);
  assert.match(css, /\.footerLinks \{[\s\S]*flex-wrap: wrap/u);
  assert.match(css, /\.footerLinks a \{[\s\S]*min-height: 44px/u);
  assert.match(css, /@media \(max-width: 1050px\) \{[\s\S]*\.workspace \{[\s\S]*min-height: auto;[\s\S]*\.hero \{[\s\S]*min-height: auto/u);
  assert.match(css, /@media \(max-width: 720px\) \{[\s\S]*\.benefits \{[\s\S]*grid-template-columns: 1fr/u);
  assert.match(css, /@media \(max-width: 720px\) \{[\s\S]*\.requirements \{[\s\S]*grid-template-columns: 1fr/u);
});

test('catálogo público usa faixas minmax(0) e libera a altura do card no estreito', async () => {
  const css = await source('../app/eventos/page.module.css');
  assert.match(css, /repeat\(auto-fit, minmax\(min\(100%, 14rem\), 1fr\)\)/u);
  assert.match(css, /\.filters \{[\s\S]*min-width: 0/u);
  assert.match(css, /\.field,[\s\S]*min-width: 0;[\s\S]*width: 100%/u);
  assert.match(css, /\.grid \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/u);
  assert.match(css, /\.cardMeta \{[\s\S]*flex-wrap: wrap/u);
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*\.filters \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)[\s\S]*\.card \{[\s\S]*min-height: 0/u);
  assert.doesNotMatch(css, /overflow:\s*hidden/u);
  assert.doesNotMatch(css, /white-space:\s*nowrap/u);
});

test('ficha pública de evento quebra título, contato e apoio da EVA', async () => {
  const css = await source('../app/evento/[slug]/page.module.css');
  assert.match(css, /\.hero h1 \{[\s\S]*overflow-wrap: anywhere/u);
  assert.match(css, /\.facts \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(css, /\.contact div \{[\s\S]*flex-wrap: wrap[\s\S]*min-width: 0/u);
  assert.match(css, /\.contact a,[\s\S]*overflow-wrap: anywhere[\s\S]*word-break: break-word/u);
  assert.match(css, /\.evaSupport \{[\s\S]*grid-template-columns: minmax\(220px, \.8fr\) minmax\(0, 1\.2fr\)/u);
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*\.facts \{[\s\S]*grid-template-columns: 1fr/u);
  assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*\.evaSupport \{[\s\S]*grid-template-columns: 1fr/u);
});

test('documentos jurídicos usam faixas fluidas e navegação que quebra linha', async () => {
  const css = await source('../components/legal-document-page.module.css');
  assert.match(css, /\.docNav \{[\s\S]*flex-wrap: wrap/u);
  assert.match(css, /\.docNav,[\s\S]*min-height: var\(--space-44\)/u);
  assert.match(css, /\.article \{[\s\S]*width: min\(920px, 100%\)/u);
  assert.match(css, /\.metadata \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(css, /\.sections \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(css, /@media \(max-width: 680px\) \{[\s\S]*\.metadata,[\s\S]*\.sections \{[\s\S]*grid-template-columns: 1fr/u);
  assert.doesNotMatch(css, /overflow:\s*hidden/u);
});
