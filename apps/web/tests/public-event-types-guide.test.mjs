import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  EVENT_PROFILE_GROUPS,
  listEventProfileOptions,
} from '../lib/event-profile-catalog.ts';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

function toEventTypeSlug(value) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

const PAGE_PATH = '../app/tipos-de-evento/page.tsx';
const CSS_PATH = '../app/tipos-de-evento/tipos-de-evento.module.css';
const CATALOG_PATH = '../lib/event-profile-catalog.ts';

const ALLOWED_EXACT_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/cadastro',
  '/eventos',
  '/termos-de-uso',
  '/privacidade',
]);

const PRIVATE_HREF_FORBIDDEN = [
  /\/painel\b/u,
  /\/eventos\/novo\b/u,
  /\/eventos\/\[/u,
  /\/evento\/\[/u,
  /\/convites\b/u,
  /\/login\b/u,
  /mailto:/iu,
  /tel:/iu,
  /javascript:/iu,
  /https?:\/\//iu,
];

test('catálogo canônico ainda tem 19 slugs únicos e todas as famílias', () => {
  const options = listEventProfileOptions();
  const slugs = options.map((option) => toEventTypeSlug(option.value));
  const familyIds = EVENT_PROFILE_GROUPS.map((group) => group.id);
  const familyLabels = EVENT_PROFILE_GROUPS.map((group) => group.label);

  assert.equal(EVENT_PROFILE_GROUPS.length, 6);
  assert.equal(options.length, 19);
  assert.equal(new Set(options.map((option) => option.value)).size, 19);
  assert.equal(new Set(slugs).size, 19);
  assert.equal(new Set(familyIds).size, 6);
  assert.equal(new Set(familyLabels).size, 6);

  for (const slug of slugs) {
    assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u, slug);
  }

  for (const group of EVENT_PROFILE_GROUPS) {
    assert.ok(group.options.length > 0, group.id);
    assert.ok(familyIds.includes(group.id), group.id);
  }
});

test('página deriva famílias, tipos e slugs do catálogo, sem taxonomia paralela', async () => {
  const [page, catalog] = await Promise.all([source(PAGE_PATH), source(CATALOG_PATH)]);
  const options = listEventProfileOptions();
  const slugs = options.map((option) => toEventTypeSlug(option.value));

  assert.match(page, /from '\.\.\/\.\.\/lib\/event-profile-catalog'/u);
  assert.match(page, /EVENT_PROFILE_GROUPS/u);
  assert.match(page, /listEventProfileOptions/u);
  assert.match(page, /families\.map\(\(group\) =>/u);
  assert.match(page, /group\.options\.map\(\(option\) =>/u);
  assert.match(page, /toEventTypeSlug\(option\.value\)/u);
  assert.match(page, /\{group\.label\}/u);
  assert.match(page, /\{group\.description\}/u);
  assert.match(page, /\{option\.title\}/u);
  assert.match(page, /\{option\.description\}/u);
  assert.match(page, /\{option\.value\}/u);
  assert.match(page, /\{option\.icon\}/u);
  assert.match(page, /id=\{`familia-\$\{group\.id\}`\}/u);
  assert.match(page, /id=\{`tipo-\$\{slug\}`\}/u);
  assert.doesNotMatch(page, /EVENT_PROFILE_GROUPS\s*=/u);
  assert.doesNotMatch(page, /'use client'/u);

  assert.equal(slugs.length, 19);
  assert.equal(new Set(slugs).size, 19);

  for (const option of options) {
    const valuePattern = new RegExp(`['"]${option.value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}['"]`, 'u');
    assert.doesNotMatch(page, valuePattern, `rótulo paralelo: ${option.value}`);
  }

  for (const group of EVENT_PROFILE_GROUPS) {
    const labelPattern = new RegExp(`['"]${group.label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}['"]`, 'u');
    assert.doesNotMatch(page, labelPattern, `família paralela: ${group.label}`);
    assert.ok(catalog.includes(group.id), group.id);
    assert.ok(catalog.includes(group.label), group.label);
  }
});

test('recursos obrigatórios vêm da família do catálogo, não de uma lista manual de tipos', async () => {
  const page = await source(PAGE_PATH);
  const entertainment = EVENT_PROFILE_GROUPS.find((group) => group.id === 'entertainment');
  const otherFamilies = EVENT_PROFILE_GROUPS.filter((group) => group.id !== 'entertainment');

  assert.ok(entertainment);
  assert.equal(entertainment.options.length, 2);
  assert.match(page, /familyId === 'entertainment'/u);
  assert.match(page, /structuralCapabilityLabels\(group\.id\)/u);
  assert.match(page, /Inscrições/u);
  assert.match(page, /Controle de acesso/u);
  assert.doesNotMatch(page, /scientific_submission/u);
  assert.doesNotMatch(page, /WIZARD_REQUIRED_CAPABILITIES/u);

  for (const option of entertainment.options) {
    const quoted = new RegExp(`['"]${option.value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}['"]`, 'u');
    assert.doesNotMatch(page, quoted, option.value);
  }

  for (const group of otherFamilies) {
    assert.notEqual(group.id, 'entertainment');
  }
});

test('página estática tem skip-link, um main focável, um h1 e hierarquia de headings', async () => {
  const page = await source(PAGE_PATH);
  const mains = [...page.matchAll(/<main\b/gu)];
  const headings = [...page.matchAll(/<h1\b/gu)];

  assert.equal(mains.length, 1);
  assert.equal(headings.length, 1);
  assert.match(page, /className="skip-link" href="#main-content"/u);
  assert.match(page, /<main id="main-content"[^>]*tabIndex=\{-1\}/u);
  assert.match(page, /<h1>Escolha o tipo canônico antes de começar<\/h1>/u);
  assert.match(page, /<h2 id="como-escolher-title">/u);
  assert.match(page, /<h2 id=\{headingId\}>\{group\.label\}<\/h2>/u);
  assert.match(page, /<h3 id=\{typeHeadingId\}>\{option\.title\}<\/h3>/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /title: 'Tipos de evento'/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.doesNotMatch(page, /Wizard visual|módulo já publicado|PWA|offline/iu);
});

test('links são relativos, allowlisted e a página não coleta PII', async () => {
  const page = await source(PAGE_PATH);
  const literalHrefs = [...page.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]);
  const templateHrefs = [...page.matchAll(/href=\{`([^`]+)`\}/gu)].map((match) => match[1]);

  assert.ok(literalHrefs.length > 0);
  for (const href of literalHrefs) {
    assert.ok(ALLOWED_EXACT_HREFS.includes(href), `href não autorizado: ${href}`);
  }

  assert.deepEqual(templateHrefs.sort(), ['#familia-${group.id}'].sort());

  for (const pattern of PRIVATE_HREF_FORBIDDEN) {
    assert.doesNotMatch(page, pattern);
  }

  assert.doesNotMatch(page, /<form\b/u);
  assert.doesNotMatch(page, /<input\b/u);
  assert.doesNotMatch(page, /<textarea\b/u);
  assert.doesNotMatch(page, /fetch\(|useState|useEffect|localStorage|document\.cookie/u);
  assert.doesNotMatch(page, /organizationId|eventId|tenantId|organizationSecret/u);
  assert.doesNotMatch(page, /mailto:/iu);
  assert.doesNotMatch(page, /@[a-z0-9.-]+\.[a-z]{2,}/iu);
  assert.doesNotMatch(page, /\+55|\(\d{2}\)\s*\d/u);
  assert.match(page, /href="\/cadastro"/u);
  assert.match(page, /href="\/eventos"/u);
  assert.match(page, /href="\/termos-de-uso"/u);
  assert.match(page, /href="\/privacidade"/u);
  assert.match(page, /Não há formulário/u);
});

test('CSS reflow em 1366/390/320, foco visível, forced-colors e reduced-motion sem corte', async () => {
  const css = await source(CSS_PATH);

  assert.match(css, /@media \(max-width: 320px\)/u);
  assert.match(css, /@media \(max-width: 390px\)/u);
  assert.match(css, /@media \(min-width: 1366px\)/u);
  assert.match(css, /@media \(forced-colors: active\)/u);
  assert.match(css, /border: 1px solid CanvasText/u);
  assert.match(css, /color: LinkText/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.match(css, /outline: 3px solid var\(--color-focus-on-light\)/u);
  assert.match(css, /\.article \{[\s\S]*min-width: 0/u);
  assert.match(css, /\.article h1,[\s\S]*overflow-wrap: anywhere/u);
  assert.match(css, /\.typeGrid \{[\s\S]*minmax\(min\(100%, 20rem\), 1fr\)/u);
  assert.match(css, /@media \(min-width: 1366px\) \{[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/u);
  assert.match(css, /@media \(max-width: 320px\) \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/u);
  assert.doesNotMatch(css, /overflow:\s*hidden/u);
  assert.doesNotMatch(css, /white-space:\s*nowrap/u);
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis/u);
  assert.doesNotMatch(css, /-webkit-line-clamp/u);
});
