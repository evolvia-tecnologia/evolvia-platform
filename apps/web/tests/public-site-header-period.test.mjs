import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routes = [
  ['../app/page.tsx', 'home', ['Eventos', 'Entrar', 'Criar conta']],
  ['../app/login/page.tsx', 'login', ['Eventos', 'Criar conta']],
  ['../app/cadastro/page.tsx', 'cadastro', ['Eventos', 'Entrar']],
  ['../app/eventos/page.tsx', 'eventos', ['Eventos', 'Área do organizador']],
];

const [header, headerStyles, catalog, catalogStyles] = await Promise.all([
  readFile(new URL('../components/public-site-header.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/public-site-header.module.css', import.meta.url), 'utf8'),
  readFile(new URL('../app/eventos/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/eventos/page.module.css', import.meta.url), 'utf8'),
]);

test('as quatro rotas públicas reutilizam o mesmo cabeçalho canônico', async () => {
  for (const [path, current] of routes) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /from ['"].*public-site-header['"]/u, path);
    assert.match(source, new RegExp(`<PublicSiteHeader current="${current}" />`, 'u'), path);
    assert.doesNotMatch(source, /<header className/u, path);
  }

  assert.match(header, /current: PublicSiteHeaderCurrent/u);
  assert.match(header, /aria-label="Evolvia — início"/u);
  assert.match(header, /aria-label="Navegação principal"/u);
  assert.match(header, /home: \[[\s\S]*label: 'Eventos'[\s\S]*label: 'Entrar'[\s\S]*label: 'Criar conta', primary: true/u);
  assert.match(header, /login: \[[\s\S]*label: 'Eventos'[\s\S]*label: 'Criar conta', primary: true/u);
  assert.match(header, /cadastro: \[[\s\S]*label: 'Eventos'[\s\S]*label: 'Entrar'/u);
  assert.match(header, /eventos: \[[\s\S]*label: 'Eventos', current: true[\s\S]*label: 'Área do organizador'/u);
  assert.match(header, /action="\/eventos"/u);
  assert.match(header, /Buscar eventos/u);
});

test('cabeçalho canônico usa tokens, alvo de 44px e reflow sem overflow', () => {
  assert.match(headerStyles, /min-height: var\(--space-64\)/u);
  assert.match(headerStyles, /padding: var\(--space-8\) max\(var\(--space-16\), calc\(\(100% - var\(--layout-content-max\)\) \/ 2\)\)/u);
  assert.match(headerStyles, /background: var\(--color-surface\)/u);
  assert.match(headerStyles, /font-family: var\(--font-family-sans\)/u);
  assert.match(headerStyles, /font-size: var\(--font-size-2xl\)/u);
  assert.match(headerStyles, /font-weight: var\(--font-weight-black\)/u);
  assert.match(headerStyles, /min-height: var\(--space-44\)/u);
  assert.match(headerStyles, /outline: 3px solid var\(--color-focus-on-light\)/u);
  assert.match(headerStyles, /\.primaryAction:focus-visible \{[\s\S]*outline: 3px solid var\(--color-focus-on-dark\)/u);
  assert.match(headerStyles, /flex-wrap: wrap/u);
  assert.match(headerStyles, /min-width: 0/u);
  assert.doesNotMatch(headerStyles, /#[0-9a-f]{3,8}/iu);
  assert.doesNotMatch(headerStyles, /(?:rgb|rgba)\(/iu);
  assert.doesNotMatch(headerStyles, /min-width:\s*(?:1[5-9]\d|[2-9]\d{2})px/u);
});

test('marca canônica é estrutural e não depende de glifo tipográfico', () => {
  assert.match(header, /<span className=\{styles\.brandMark\} aria-hidden="true"><span \/><\/span>/u);
  assert.doesNotMatch(header, /≡/u);
  assert.match(headerStyles, /\.brandMark::before \{ width: var\(--space-28\);/u);
  assert.match(headerStyles, /\.brandMark span \{ width: 22px;/u);
  assert.match(headerStyles, /\.brandMark::after \{ width: 17px;/u);
  assert.match(headerStyles, /linear-gradient\(90deg, var\(--color-brand-blue-600\), var\(--color-brand-blue-400\)\)/u);
});

test('home e autenticação dimensionam o workspace pelo cabeçalho canônico de 64px', async () => {
  const [homeStyles, authStyles] = await Promise.all([
    readFile(new URL('../app/home-viewport.module.css', import.meta.url), 'utf8'),
    readFile(new URL('../app/auth-layout.module.css', import.meta.url), 'utf8'),
  ]);

  assert.match(homeStyles, /min-height: calc\(100vh - var\(--space-64\)\)/u);
  assert.match(homeStyles, /min-height: calc\(100svh - var\(--space-64\)\)/u);
  assert.doesNotMatch(homeStyles, /100vh - 56px/u);
  assert.doesNotMatch(homeStyles, /homeTopbar|homeNav|:global\(\.topbar\)/u);

  assert.match(authStyles, /\.page \{[\s\S]*display: flex;[\s\S]*flex-direction: column;/u);
  assert.match(authStyles, /\.workspace \{[\s\S]*flex: 1 1 auto;[\s\S]*min-height: 0;/u);
  assert.doesNotMatch(authStyles, /100vh - 122px|100vh - 108px|100vh - 56px|100vh - 74px/u);
  assert.doesNotMatch(authStyles, /\.header \{|\.brandMark \{|\.headerLink \{/u);
});

test('matriz de período gera from/until coerentes e preserva from legado', () => {
  assert.match(catalog, /function resolveDiscoveryWindow\(period: DiscoveryPeriod, requestedFrom: string, today: string\)/u);
  assert.match(catalog, /from: requestedFrom \|\| \(period === 'CURRENT' \? today : ''\)/u);
  assert.match(catalog, /until: period === 'PAST' \? today : ''/u);
  assert.doesNotMatch(catalog, /requestedFrom \? 'CURRENT'/u);

  const matrix = [
    { period: 'CURRENT', requestedFrom: '', from: 'today', until: '' },
    { period: 'PAST', requestedFrom: '', from: '', until: 'today' },
    { period: 'ALL', requestedFrom: '', from: '', until: '' },
    { period: 'CURRENT', requestedFrom: '2026-03-01', from: '2026-03-01', until: '' },
    { period: 'PAST', requestedFrom: '2026-03-01', from: '2026-03-01', until: 'today' },
    { period: 'ALL', requestedFrom: '2026-03-01', from: '2026-03-01', until: '' },
  ];

  const resolveDiscoveryWindow = (period, requestedFrom, today) => ({
    from: requestedFrom || (period === 'CURRENT' ? today : ''),
    until: period === 'PAST' ? today : '',
  });

  for (const row of matrix) {
    const resolved = resolveDiscoveryWindow(row.period, row.requestedFrom, 'today');
    assert.deepEqual(resolved, { from: row.from, until: row.until }, `${row.period}:${row.requestedFrom || '∅'}`);
  }

  assert.match(catalog, /if \(input\.period !== 'ALL'\) params\.set\('period', input\.period\)/u);
  assert.match(catalog, /if \(input\.from\) params\.set\('from', input\.from\)/u);
  assert.match(catalog, /from: requestedFrom, page: result\.page - 1/u);
  assert.match(catalog, /from: requestedFrom, page: result\.page \+ 1/u);
  assert.match(catalog, /name="from" value=\{requestedFrom\}/u);
  assert.match(catalog, /name="period" defaultValue=\{period\}/u);
  assert.match(catalog, /htmlFor="discovery-period"/u);
  assert.match(catalog, /id="discovery-period"/u);
});

test('busca por período reflui até 320px e o vazio permite limpar filtros', () => {
  assert.match(catalogStyles, /repeat\(auto-fit, minmax\(min\(100%, 14rem\), 1fr\)\)/u);
  assert.match(catalogStyles, /\.field,[\s\S]*min-width: 0;[\s\S]*width: 100%;/u);
  assert.match(catalogStyles, /\.field input,[\s\S]*min-width: 0;[\s\S]*width: 100%;[\s\S]*max-width: 100%;/u);
  assert.match(catalogStyles, /\.actions \{[\s\S]*min-width: 0/u);
  assert.doesNotMatch(catalogStyles, /minmax\(240px/u);
  assert.doesNotMatch(catalogStyles, /minmax\(150px/u);
  assert.match(catalog, /hasActiveFilters && <Link className=\{styles\.clearLink\} href="\/eventos">Limpar filtros<\/Link>/u);
  assert.match(catalog, /Os filtros atuais de nome, formato, perfil, área, região ou período/u);
  assert.match(catalog, /role="search"/u);
});

test('cabeçalho público sem estado renderiza no servidor no catálogo sem ilha de hidratação', () => {
  assert.doesNotMatch(header, /^['"]use client['"];?/u);
  assert.doesNotMatch(header, /\buse(?:Effect|State|Ref|Memo|Callback|LayoutEffect)\b/u);
  assert.doesNotMatch(header, /\b(?:window|document|localStorage|navigator)\b/u);
  assert.match(catalog, /<PublicSiteHeader current="eventos" \/>/u);
});
