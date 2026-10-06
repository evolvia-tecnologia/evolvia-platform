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

function routeBlock(source, name) {
  const match = source.match(new RegExp(`\\n  ${name}: \\[[\\s\\S]*?\\n  \\]`, 'u'));
  assert.ok(match, `bloco NAV_BY_ROUTE.${name} deve existir`);
  return match[0];
}

test('contrato 0: estado atual só no destino corrente e nunca duplicado', () => {
  const currents = [...header.matchAll(/current: true/gu)];
  assert.equal(currents.length, 1, 'apenas um item da matriz pode ser current: true');
  assert.match(routeBlock(header, 'eventos'), /label: 'Eventos', current: true/u);
  assert.doesNotMatch(routeBlock(header, 'home'), /current: true/u);
  assert.doesNotMatch(routeBlock(header, 'login'), /current: true/u);
  assert.doesNotMatch(routeBlock(header, 'cadastro'), /current: true/u);
  assert.doesNotMatch(routeBlock(header, 'evento'), /current: true/u);
  assert.doesNotMatch(routeBlock(header, 'legal'), /current: true/u);
  assert.match(header, /aria-current=\{uniquePageCurrent\(Boolean\(item\.current\), currentFlags\)\}/u);
  assert.match(header, /aria-current=\{current === 'home' \? 'page' : undefined\}/u);
  assert.match(header, /return flag && currentFlags\.filter\(Boolean\)\.length === 1 \? 'page' : undefined/u);
  assert.equal([...header.matchAll(/aria-current=/gu)].length, 2);
});

test('contrato 1: landmark e marca com nomes acessíveis únicos', () => {
  assert.equal([...header.matchAll(/aria-label="Navegação principal"/gu)].length, 1);
  assert.equal([...header.matchAll(/aria-label="Evolvia — início"/gu)].length, 1);
  assert.equal([...header.matchAll(/aria-label=/gu)].length, 2);
  assert.match(header, /<nav className=\{styles\.nav\} aria-label="Navegação principal">/u);
  assert.match(header, /<Link[\s\S]*className=\{styles\.brand\}[\s\S]*aria-label="Evolvia — início"/u);
  assert.doesNotMatch(header, /aria-label="Evolvia — página inicial"/u);
  assert.doesNotMatch(header, /aria-label=""/u);
  assert.match(header, /<Link[\s\S]*className=\{styles\.brand\}[\s\S]*<\/Link>[\s\S]*<nav className=\{styles\.nav\}/u);
});

test('contrato 2: decoração da marca fora da árvore acessível', () => {
  assert.match(header, /<span className=\{styles\.brandMark\} aria-hidden="true"><span \/><\/span>/u);
  assert.match(header, /<span className=\{styles\.brandName\} aria-hidden="true">EVOLVIA<\/span>/u);
  assert.doesNotMatch(header, />EVOLVIA<\/Link>/u);
  assert.doesNotMatch(header, /≡/u);
  assert.doesNotMatch(header, /aria-hidden="false"/u);
  assert.match(headerStyles, /\.brandMark::before \{ width: var\(--space-28\);/u);
  assert.match(headerStyles, /\.brandMark span \{ width: 22px;/u);
  assert.match(headerStyles, /\.brandMark::after \{ width: 17px;/u);
});

test('contrato negativo: navegação sem nome, estado duplicado e alvo/reflow inválido', () => {
  assert.doesNotMatch(header, /<nav(?![^>]*aria-label="Navegação principal")/u);
  assert.doesNotMatch(header, /current: true[\s\S]*current: true/u);
  assert.doesNotMatch(header, /aria-current="page"[\s\S]*aria-current="page"/u);
  assert.doesNotMatch(headerStyles, /min-height:\s*(?:[1-9]|[1-3]\d|4[0-3])px/u);
  assert.doesNotMatch(headerStyles, /white-space:\s*nowrap/u);
  assert.doesNotMatch(headerStyles, /flex-wrap:\s*nowrap/u);
  assert.doesNotMatch(headerStyles, /overflow-x:\s*(?:scroll|auto|hidden)/u);
  assert.doesNotMatch(headerStyles, /text-overflow:\s*ellipsis/u);
  assert.doesNotMatch(headerStyles, /-webkit-line-clamp/u);
  assert.match(headerStyles, /\.header \{[\s\S]*flex-wrap: wrap/u);
  assert.match(headerStyles, /\.brand \{[\s\S]*min-width: 0[\s\S]*min-height: var\(--space-44\)/u);
  assert.match(headerStyles, /\.nav \{[\s\S]*flex-wrap: wrap[\s\S]*min-width: 0/u);
  assert.match(headerStyles, /\.action,[\s\S]*\.primaryAction \{[\s\S]*min-width: 0[\s\S]*min-height: var\(--space-44\)/u);
  assert.match(headerStyles, /@media \(max-width: 520px\) \{[\s\S]*\.header \{[\s\S]*height: auto;[\s\S]*\.nav \{[\s\S]*display: grid;[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(0, 1fr\)\)/u);
  assert.match(headerStyles, /@media \(forced-colors: active\) \{[\s\S]*\.action\[aria-current='page'\],[\s\S]*\.brand\[aria-current='page'\]/u);
  assert.match(headerStyles, /\.brand:focus-visible,[\s\S]*outline: 3px solid var\(--color-focus-on-light\)/u);
});

