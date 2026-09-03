import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [catalog, catalogStyles] = await Promise.all([
  readFile(new URL('../app/eventos/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/eventos/page.module.css', import.meta.url), 'utf8'),
]);

const FORMAT_LABELS = {
  IN_PERSON: 'Presencial',
  ONLINE: 'Online',
  HYBRID: 'Híbrido',
};

const PROFILE_LABELS = {
  SCIENTIFIC_EVENT: 'Científico ou acadêmico',
  CORPORATE_TRAINING: 'Corporativo ou capacitação',
  FAIR_EXHIBITION: 'Feira ou exposição',
  ENTERTAINMENT: 'Entretenimento',
  SOCIAL_COMMUNITY: 'Social, comunitário ou esportivo',
  OTHER: 'Outro perfil',
};

const PERIOD_LABELS = {
  CURRENT: 'Próximos e em andamento',
  PAST: 'Eventos realizados',
  ALL: 'Todos os publicados',
};

const PERIOD_SUMMARY = {
  CURRENT: 'Próximos eventos e eventos em andamento',
  PAST: 'Eventos já realizados, do mais recente para o mais antigo',
  ALL: 'Todos os eventos publicados',
};

function queryString(input) {
  const params = new URLSearchParams();
  if (input.q) params.set('q', input.q);
  if (input.format) params.set('format', input.format);
  if (input.profile) params.set('profile', input.profile);
  if (input.period !== 'CURRENT') params.set('period', input.period);
  if (input.from) params.set('from', input.from);
  if (input.page > 1) params.set('page', String(input.page));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

function periodLabel(period) {
  return PERIOD_LABELS[period];
}

function resultsHeading(total) {
  return total === 1 ? '1 evento encontrado' : `${total} eventos encontrados`;
}

function describeActiveFilters(input) {
  const parts = [];
  if (input.q) parts.push(`nome «${input.q}»`);
  if (input.format) parts.push(`formato ${FORMAT_LABELS[input.format]}`);
  if (input.profile) parts.push(`perfil ${PROFILE_LABELS[input.profile]}`);
  if (input.from) parts.push(`a partir de ${input.from}`);
  parts.push(`período ${periodLabel(input.period)}`);
  return parts.join(', ');
}

function filterStatus(input) {
  const hasActiveFilters = Boolean(
    input.q || input.format || input.profile || input.from || input.period !== 'CURRENT',
  );
  return hasActiveFilters
    ? `Filtros ativos: ${describeActiveFilters(input)}.`
    : `Período atual: ${periodLabel(input.period)}.`;
}

const SEARCH_MATRIX = [
  {
    id: 'busca-vazia-current',
    q: '',
    format: '',
    profile: '',
    period: 'CURRENT',
    from: '',
    total: 0,
    page: 1,
    totalPages: 1,
    empty: true,
    clearFilters: false,
    pagination: false,
  },
  {
    id: 'sem-resultado-com-filtros',
    q: 'congresso inexistente',
    format: 'ONLINE',
    profile: '',
    period: 'CURRENT',
    from: '',
    total: 0,
    page: 1,
    totalPages: 1,
    empty: true,
    clearFilters: true,
    pagination: false,
  },
  {
    id: 'um-resultado-past',
    q: '',
    format: '',
    profile: 'SCIENTIFIC_EVENT',
    period: 'PAST',
    from: '',
    total: 1,
    page: 1,
    totalPages: 1,
    empty: false,
    clearFilters: true,
    pagination: false,
  },
  {
    id: 'muitos-resultados-all',
    q: 'são paulo',
    format: 'HYBRID',
    profile: '',
    period: 'ALL',
    from: '',
    total: 18,
    page: 1,
    totalPages: 2,
    empty: false,
    clearFilters: true,
    pagination: true,
  },
  {
    id: 'segunda-pagina-preserva-periodo',
    q: 'workshop',
    format: 'IN_PERSON',
    profile: 'CORPORATE_TRAINING',
    period: 'PAST',
    from: '2026-01-15',
    total: 24,
    page: 2,
    totalPages: 2,
    empty: false,
    clearFilters: true,
    pagination: true,
  },
];

test('matriz da busca cobre vazio, sem resultado, um/muitos resultados e duas páginas', () => {
  assert.deepEqual(SEARCH_MATRIX.map((row) => row.id), [
    'busca-vazia-current',
    'sem-resultado-com-filtros',
    'um-resultado-past',
    'muitos-resultados-all',
    'segunda-pagina-preserva-periodo',
  ]);

  for (const row of SEARCH_MATRIX) {
    const status = filterStatus(row);
    const heading = resultsHeading(row.total);
    const previousHref = row.page > 1
      ? `/eventos${queryString({ ...row, page: row.page - 1 })}`
      : null;
    const nextHref = row.page < row.totalPages
      ? `/eventos${queryString({ ...row, page: row.page + 1 })}`
      : null;

    if (row.id === 'busca-vazia-current') {
      assert.equal(status, 'Período atual: Próximos e em andamento.');
      assert.equal(heading, '0 eventos encontrados');
      assert.equal(previousHref, null);
      assert.equal(nextHref, null);
    }

    if (row.id === 'sem-resultado-com-filtros') {
      assert.match(status, /Filtros ativos: nome «congresso inexistente», formato Online, período Próximos e em andamento\./u);
      assert.equal(heading, '0 eventos encontrados');
      assert.equal(row.empty, true);
      assert.equal(row.clearFilters, true);
    }

    if (row.id === 'um-resultado-past') {
      assert.equal(heading, '1 evento encontrado');
      assert.match(status, /perfil Científico ou acadêmico/u);
      assert.match(status, /período Eventos realizados/u);
      assert.equal(PERIOD_SUMMARY.PAST, 'Eventos já realizados, do mais recente para o mais antigo');
    }

    if (row.id === 'muitos-resultados-all') {
      assert.equal(heading, '18 eventos encontrados');
      assert.equal(nextHref, '/eventos?q=s%C3%A3o+paulo&format=HYBRID&period=ALL&page=2');
      assert.match(nextHref, /period=ALL/u);
      assert.doesNotMatch(nextHref, /(?:\?|&)page=1(?:&|$)/u);
    }

    if (row.id === 'segunda-pagina-preserva-periodo') {
      assert.equal(heading, '24 eventos encontrados');
      assert.equal(
        previousHref,
        '/eventos?q=workshop&format=IN_PERSON&profile=CORPORATE_TRAINING&period=PAST&from=2026-01-15',
      );
      assert.match(previousHref, /period=PAST/u);
      assert.match(previousHref, /from=2026-01-15/u);
      assert.doesNotMatch(previousHref, /(?:\?|&)page=/u);
      assert.equal(nextHref, null);
    }

    assert.match(catalog, /function resultsHeading\(total: number\): string/u, row.id);
    assert.match(catalog, /function describeActiveFilters\(/u, row.id);
    assert.match(catalog, /function periodLabel\(period: DiscoveryPeriod\): string/u, row.id);
  }
});

test('formulário de busca tem nome, instrução e período atual acessíveis', () => {
  assert.match(catalog, /role="search" aria-label="Buscar eventos publicados" aria-describedby="discovery-search-help discovery-active-filters"/u);
  assert.match(catalog, /<p id="discovery-search-help">Busque apenas entre eventos que já estão publicados\./u);
  assert.match(catalog, /<p id="discovery-active-filters" className=\{styles\.filterStatus\} role="status">\{filterStatus\}<\/p>/u);
  assert.match(catalog, /htmlFor="discovery-q"/u);
  assert.match(catalog, /id="discovery-q"/u);
  assert.match(catalog, /htmlFor="discovery-period"/u);
  assert.match(catalog, /id="discovery-period"/u);
  assert.match(catalog, /hasActiveFilters[\s\S]*Filtros ativos: \$\{activeFiltersSummary\}\./u);
  assert.match(catalog, /Período atual: \$\{periodLabel\(period\)\}\./u);
  assert.match(catalog, /parts\.push\(`período \$\{periodLabel\(input\.period\)\}`\)/u);
});

test('título e contagem do resultado permanecem identificáveis após a navegação', () => {
  assert.match(catalog, /aria-labelledby="results-title" aria-describedby="discovery-active-filters results-period"/u);
  assert.match(catalog, /<h2 id="results-title" tabIndex=\{-1\}>\{resultsHeading\(result\.total\)\}<\/h2>/u);
  assert.match(catalog, /<p id="results-period" className=\{styles\.periodSummary\}>/u);
  assert.match(catalog, /return total === 1 \? '1 evento encontrado' : `\$\{total\} eventos encontrados`/u);
  assert.match(catalogStyles, /\.resultsHeading h2:focus-visible/u);
});

test('estado vazio e limpeza de filtros deixam a próxima ação inequívoca', () => {
  assert.match(catalog, /role="status"/u);
  assert.match(catalog, /Nenhum evento publicado corresponde à busca\./u);
  assert.match(catalog, /Os filtros atuais de nome, formato, perfil ou período não encontraram eventos publicados/u);
  assert.match(catalog, /Ainda não há eventos publicados neste catálogo\./u);
  assert.match(catalog, /hasActiveFilters && <Link className=\{styles\.clearLink\} href="\/eventos">Limpar filtros<\/Link>/u);
  assert.match(catalog, /aria-label="Limpar filtros e ver o catálogo publicado"/u);
  assert.match(catalog, /href="\/eventos"/u);
  assert.doesNotMatch(catalog, /href="\/eventos\?/u);
});

test('paginação preserva todos os filtros e expõe o estado atual', () => {
  assert.match(catalog, /from: requestedFrom, page: result\.page - 1/u);
  assert.match(catalog, /from: requestedFrom, page: result\.page \+ 1/u);
  assert.match(catalog, /if \(input\.period !== 'CURRENT'\) params\.set\('period', input\.period\)/u);
  assert.match(catalog, /if \(input\.from\) params\.set\('from', input\.from\)/u);
  assert.match(catalog, /if \(input\.q\) params\.set\('q', input\.q\)/u);
  assert.match(catalog, /if \(input\.format\) params\.set\('format', input\.format\)/u);
  assert.match(catalog, /if \(input\.profile\) params\.set\('profile', input\.profile\)/u);
  assert.match(catalog, /<p className=\{styles\.pageStatus\} aria-current="page">Página \{result\.page\} de \{result\.totalPages\}<\/p>/u);
  assert.match(catalog, /aria-label="Paginação dos eventos"/u);
  assert.match(catalog, /\{previousHref \? <Link href=\{previousHref\}>← Página anterior<\/Link> : <span \/>\}/u);
  assert.match(catalog, /\{nextHref \? <Link href=\{nextHref\}>Próxima página →<\/Link> : <span \/>\}/u);
});

test('cards evitam tab stops redundantes e nomes ambíguos', () => {
  assert.match(catalog, /<h3>\{event\.name\}<\/h3>/u);
  assert.doesNotMatch(catalog, /<h3><Link href=/u);
  assert.match(catalog, /aria-label=\{`Ver informações de \$\{event\.name\}`\}/u);
  assert.equal(catalog.split('encodeURIComponent(event.slug)').length - 1, 1);
});

test('datas, formato, andamento e público estimado não dependem só de cor', () => {
  assert.match(catalog, /Andamento: em curso/u);
  assert.match(catalog, /Formato: \{formatLabel\(event\.format\)\}/u);
  assert.match(catalog, /Data: \{startsAt\}/u);
  assert.match(catalog, /Público estimado: \{formatEstimatedAudience\(event\.estimatedAudience\)\} pessoas/u);
  assert.match(catalogStyles, /\.cardMeta \.live \{[\s\S]*border: 1px solid var\(--color-success\)/u);
  assert.match(catalogStyles, /@media \(forced-colors: active\) \{[\s\S]*\.cardMeta \.live/u);
});

test('reflow 320/390 e foco visível não geram overflow', () => {
  assert.match(catalogStyles, /\.page \{[\s\S]*min-width: 0;/u);
  assert.match(catalogStyles, /\.hero h1 \{[\s\S]*overflow-wrap: anywhere;/u);
  assert.match(catalogStyles, /\.resultsHeading h2 \{[\s\S]*overflow-wrap: anywhere;/u);
  assert.match(catalogStyles, /\.card h3 \{[\s\S]*overflow-wrap: anywhere;/u);
  assert.match(catalogStyles, /\.filterStatus \{[\s\S]*overflow-wrap: anywhere;/u);
  assert.match(catalogStyles, /@media \(max-width: 390px\) \{[\s\S]*overflow-wrap: anywhere;/u);
  assert.match(catalogStyles, /@media \(max-width: 640px\) \{[\s\S]*\.filters \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/u);
  assert.match(catalogStyles, /outline: 3px solid var\(--color-brand-blue-600\);/u);
  assert.match(catalogStyles, /outline-offset: 3px;/u);
  assert.doesNotMatch(catalogStyles, /minmax\(240px/u);
  assert.doesNotMatch(catalogStyles, /#[0-9a-f]{3,8}/iu);
});

test('regressões negativas: perda de período, nome acessível e paginação incompleta', () => {
  assert.match(catalog, /if \(input\.period !== 'CURRENT'\) params\.set\('period', input\.period\)/u);
  assert.doesNotMatch(catalog, /period:\s*'CURRENT',\s*from: requestedFrom, page: result\.page/u);
  assert.doesNotMatch(catalog, /queryString\(\{ q, format, profile, page:/u);
  assert.match(catalog, /aria-label="Buscar eventos publicados"/u);
  assert.doesNotMatch(catalog, /<form className=\{styles\.filters\} method="get" action="\/eventos" role="search">/u);
  assert.doesNotMatch(catalog, /<h3><Link href=/u);
  assert.match(catalog, /aria-current="page"/u);
  assert.doesNotMatch(catalog, /\{nextHref && <Link href=\{nextHref\}>Próxima página/u);
});

test('consulta, API e SEO do catálogo permanecem intactos', () => {
  assert.match(catalog, /const params = new URLSearchParams\(\{ page: String\(input\.page\), pageSize: '12' \}\)/u);
  assert.match(catalog, /fetch\(`\$\{API_BASE_URL\}\/public\/events\?\$\{params\.toString\(\)\}`/u);
  assert.match(catalog, /from: requestedFrom \|\| \(period === 'CURRENT' \? today : ''\)/u);
  assert.match(catalog, /until: period === 'PAST' \? today : ''/u);
  assert.match(catalog, /title: 'Eventos publicados'/u);
  assert.match(catalog, /const canonical = `\$\{PUBLIC_BASE_URL\}\/eventos`/u);
  assert.match(catalog, /alternates: \{ canonical \}/u);
  assert.doesNotMatch(catalog, /title: q \?/u);
  assert.doesNotMatch(catalog, /canonical.*q=/u);
  assert.doesNotMatch(catalog, /items:\s*\[/u);
});
