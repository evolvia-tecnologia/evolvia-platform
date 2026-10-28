import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PUBLIC_SUBJECT_AREAS, suggestBrazilianRegion } from '../lib/public-discovery.ts';

test('sugestão de região escolhe o menor estado brasileiro que contém o ponto', () => {
  assert.equal(suggestBrazilianRegion(-23.55, -46.63), 'SP');
  assert.equal(suggestBrazilianRegion(-15.78, -47.93), 'DF');
  assert.equal(suggestBrazilianRegion(-3.12, -60.02), 'AM');
  assert.equal(suggestBrazilianRegion(0, 0), null);
  assert.equal(suggestBrazilianRegion(Number.NaN, -46), null);
});

test('áreas públicas cobrem os nove segmentos pedidos, sem coluna nova no banco', async () => {
  assert.deepEqual(PUBLIC_SUBJECT_AREAS.map((area) => area.id), [
    'educacao',
    'saude',
    'direito',
    'entretenimento',
    'espiritualidade',
    'engenharias',
    'empreendedorismo',
    'negocios',
    'tecnologia',
  ]);

  const policy = await readFile(new URL('../../api/src/event-publication/public-discovery.policy.ts', import.meta.url), 'utf8');
  assert.match(policy, /id: 'PA'[\s\S]*?terms: \['Pará'\]/u);
  assert.doesNotMatch(policy, /['"]Para['"]/u);
  assert.match(policy, /region\.id === 'MT'/u);
  assert.match(policy, /NOT: \{ venue: contains\('Mato Grosso do Sul'\) \}/u);
  assert.match(policy, /region\.id === 'PA'/u);
  assert.match(policy, /contains\('Paraíba'\)/u);
  assert.match(policy, /contains\('Paraná'\)/u);
});

test('catálogo e vitrine mostram publicados sem exigir data de término', async () => {
  const [catalog, preview, home, help, suggest] = await Promise.all([
    readFile(new URL('../app/eventos/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/public-events-preview.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/public-help.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/public-region-suggest.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(catalog, /return value === 'CURRENT' \|\| value === 'PAST' \|\| value === 'ALL' \? value : 'ALL'/u);
  assert.match(catalog, /name="area"/u);
  assert.match(catalog, /name="region"/u);
  assert.match(catalog, /<PublicRegionSuggest currentSearch=/u);
  // A fronteira única do catálogo é intencional: o HTML pode chegar fragmentado.
  // Não permitir ilhas Suspense adicionais ou dependência de searchParams no cliente.
  assert.match(catalog, /<Suspense key="public-catalog-content" fallback=\{<section className=\{styles\.results\} role="status"/u);
  assert.equal((catalog.match(/<Suspense\b/gu) ?? []).length, 1);
  assert.ok(catalog.indexOf('<PublicSiteHeader current="eventos" />') < catalog.indexOf('<Suspense key="public-catalog-content"'), 'cabeçalho público estático não deve desaparecer com fallback Suspense');
  assert.match(catalog, /<\/Suspense>/u);
  assert.doesNotMatch(catalog, /useSearchParams/u);
  assert.doesNotMatch(suggest, /useSearchParams/u);
  assert.match(suggest, /currentSearch/u);
  assert.match(suggest, /Sugerir minha região/u);
  assert.match(suggest, /enableHighAccuracy: false/u);
  assert.match(suggest, /if \(!mounted\.current\) return;/u);
  assert.match(home, /aria-label="Documentos jurídicos"/u);
  const [headerCss, catalogCss, homeCss] = await Promise.all([
    readFile(new URL('../components/public-site-header.module.css', import.meta.url), 'utf8'),
    readFile(new URL('../app/eventos/page.module.css', import.meta.url), 'utf8'),
    readFile(new URL('../app/home-viewport.module.css', import.meta.url), 'utf8'),
  ]);
  assert.match(headerCss, /@media \(max-width: 520px\) \{[\s\S]*overflow-wrap: normal;[\s\S]*word-break: normal;/u);
  assert.match(catalogCss, /\.page \{[\s\S]*overflow-wrap: anywhere;/u);
  assert.doesNotMatch(catalogCss, /white-space:\s*nowrap/u);
  assert.match(homeCss, /\.legalFooter > \* \{[\s\S]*min-width: 0;/u);
  assert.doesNotMatch(preview, /from=/u);
  assert.match(preview, /pageSize: '6'/u);
  assert.match(home, /<PublicPlatformGuide \/>/u);
  assert.match(home, /href="\/ajuda"/u);
  assert.match(home, /href="\/acessibilidade"/u);
  assert.match(help, /O download não é cobrado/u);
  assert.match(help, /não envia a coordenada/u);
});
