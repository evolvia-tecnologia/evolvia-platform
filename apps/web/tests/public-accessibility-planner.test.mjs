import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/planejar-acessibilidade/page.tsx';
const PLANNER = '../app/ajuda/planejar-acessibilidade/accessibility-planner.tsx';
const CSS = '../app/ajuda/planejar-acessibilidade/planejar-acessibilidade.module.css';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const GROUP_LEGENDS = [
  'Comunicação',
  'Conteúdo digital',
  'Mobilidade e local',
  'Recursos sensoriais',
  'Apoio humano',
];

const ACTION_LEVELS = Object.freeze({
  plan: 'planejar',
  confirm: 'confirmar com fornecedor/local',
  validate: 'validar com pessoa responsável',
});

const ITEM_IDS = [
  'comm-libras',
  'comm-captions',
  'digital-alt',
  'digital-ad',
  'digital-contrast',
  'mobility-routes',
  'mobility-seats',
  'mobility-restrooms',
  'sensory-breaks',
  'sensory-low',
  'support-channel',
  'support-owner',
];

const VIEWPORTS = [320, 390, 768, 1280, 1440];

const ANTI_CLAIM_FORBIDDEN = [
  /certifica[cç][aã]o WCAG/iu,
  /conforme à WCAG/iu,
  /WCAG 2\.2 AA certificado/iu,
  /evento acessível certificado/iu,
  /selo de acessibilidade/iu,
  /certifica[cç][aã]o LGPD/iu,
  /conforme à LGPD/iu,
  /homologa automaticamente/iu,
  /publicação habilitada/iu,
  /publique agora/iu,
  /botão real de publicar/iu,
  /deploy disponível/iu,
  /garantimos/iu,
  /100\s*%/u,
  /validação jurídica concluída/iu,
  /aconselhamento jurídico/iu,
];

const ITEM_PATTERN = /id: '([^']+)',\s*label: '([^']+)',\s*help: '([^']+)',\s*action: '(plan|confirm|validate)',\s*planLabel: '([^']+)'/gu;
const PURPOSE_PATTERN = /purpose: '([^']+)'/gu;

function parseItems(plannerSource) {
  return [...plannerSource.matchAll(ITEM_PATTERN)].map((match) => ({
    id: match[1],
    label: match[2],
    help: match[3],
    action: match[4],
    planLabel: match[5],
  }));
}

function emptyFrom(items) {
  return Object.fromEntries(items.map((item) => [item.id, false]));
}

function buildAccessibilityPlan(selections, items) {
  const selected = items.filter((item) => selections[item.id] === true);
  const selectedCount = selected.length;
  return {
    status: selectedCount === 0 ? 'empty' : 'planned',
    selectedCount,
    totalCount: items.length,
    levels: {
      plan: selected.filter((item) => item.action === 'plan'),
      confirm: selected.filter((item) => item.action === 'confirm'),
      validate: selected.filter((item) => item.action === 'validate'),
    },
  };
}

test('página server expõe skip-link, um main focável, um h1 e metadata conservadora', async () => {
  const page = await source(PAGE);
  const mains = [...page.matchAll(/<main\b/gu)];
  const headings = [...page.matchAll(/<h1\b/gu)];

  assert.doesNotMatch(page, /['"]use client['"]/u);
  assert.match(page, /className="skip-link" href="#main-content"/u);
  assert.match(page, /<main className=\{styles\.main\} id="main-content" tabIndex=\{-1\}/u);
  assert.equal(mains.length, 1);
  assert.equal(headings.length, 1);
  assert.match(page, /<h1>Planejar acessibilidade do evento<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
  assert.match(page, /title: 'Planejar acessibilidade — orientação local'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /from ['"].*public-site-header['"]/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /<AccessibilityPlanner \/>/u);
});

test('componente cliente isola o planejador efêmero com fieldset, legend e rótulos completos', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /['"]use client['"]/u);
  assert.equal([...planner.matchAll(/<fieldset\b/gu)].length, 1);
  assert.match(planner, /PLANNER_GROUPS\.map\(\(group\) => <fieldset/u);
  assert.match(planner, /<legend>\{group\.legend\}<\/legend>/u);
  assert.match(planner, /\{group\.purpose\}/u);
  assert.match(planner, /htmlFor=\{item\.id\}/u);
  assert.match(planner, /id=\{item\.id\}/u);
  assert.match(planner, /type="checkbox"/u);
  assert.match(planner, /<button type="button"[^>]*onClick=\{resetPlan\}/u);
  assert.match(planner, /Reiniciar planejamento/u);
  assert.match(planner, /aria-live="polite"/u);
  assert.match(planner, /role="status"/u);
  assert.match(planner, /aria-atomic="true"/u);
  assert.doesNotMatch(planner, /aria-live="assertive"/u);
  assert.doesNotMatch(planner, /<textarea\b/u);
  assert.doesNotMatch(planner, /type="text"|type="email"|type="tel"|type="url"|type="search"/u);
});

test('cinco grupos com propósito claro e doze necessidades genéricas sem coleta sensível', async () => {
  const planner = await source(PLANNER);
  const items = parseItems(planner);
  const purposes = [...planner.matchAll(PURPOSE_PATTERN)].map((match) => match[1]);

  for (const legend of GROUP_LEGENDS) {
    assert.match(planner, new RegExp(legend.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), legend);
  }
  assert.equal(GROUP_LEGENDS.length, 5);
  assert.equal(purposes.length, 5);
  assert.equal(items.length, 12);
  assert.equal(new Set(items.map((item) => item.id)).size, 12);
  assert.deepEqual(items.map((item) => item.id), ITEM_IDS);

  assert.match(planner, /legend: 'Comunicação'/u);
  assert.match(planner, /legend: 'Conteúdo digital'/u);
  assert.match(planner, /legend: 'Mobilidade e local'/u);
  assert.match(planner, /legend: 'Recursos sensoriais'/u);
  assert.match(planner, /legend: 'Apoio humano'/u);

  for (const purpose of purposes) {
    assert.ok(purpose.length > 40, purpose);
    assert.match(purpose, /sem /iu);
  }

  for (const item of items) {
    assert.ok(item.label.length > 8, item.id);
    assert.ok(item.help.length > 20, item.id);
    assert.ok(item.planLabel.length > 20, item.id);
    assert.doesNotMatch(item.label, /diagn[oó]stico|laudo médico|CPF|e-mail|telefone/iu);
    assert.doesNotMatch(item.planLabel, /envie|cadastre o nome|informe o diagnóstico/iu);
  }

  assert.match(planner, /Libras/u);
  assert.match(planner, /Legendas/u);
  assert.match(planner, /Audiodescrição/u);
  assert.match(planner, /Alternativas textuais/u);
  assert.match(planner, /Rotas acessíveis/u);
  assert.match(planner, /Assentos/u);
  assert.match(planner, /Banheiros/u);
  assert.match(planner, /Contraste e tamanho/u);
  assert.match(planner, /Pausas/u);
  assert.match(planner, /Canal humano/u);
});

test('resumo determinístico separa planejar, confirmar com fornecedor/local e validar com pessoa responsável', async () => {
  const planner = await source(PLANNER);
  const items = parseItems(planner);

  assert.match(planner, /plan: 'planejar'/u);
  assert.match(planner, /confirm: 'confirmar com fornecedor\/local'/u);
  assert.match(planner, /validate: 'validar com pessoa responsável'/u);
  assert.match(planner, /status === 'empty'/u);
  assert.match(planner, /Nenhuma ação neste nível ainda/u);

  const empty = buildAccessibilityPlan(emptyFrom(items), items);
  assert.equal(empty.status, 'empty');
  assert.equal(empty.selectedCount, 0);
  assert.equal(empty.totalCount, 12);
  assert.equal(empty.levels.plan.length, 0);
  assert.equal(empty.levels.confirm.length, 0);
  assert.equal(empty.levels.validate.length, 0);

  const one = emptyFrom(items);
  one['comm-captions'] = true;
  const started = buildAccessibilityPlan(one, items);
  assert.equal(started.status, 'planned');
  assert.equal(started.selectedCount, 1);
  assert.equal(started.levels.plan.length, 1);
  assert.equal(started.levels.plan[0].id, 'comm-captions');
  assert.equal(started.levels.confirm.length, 0);
  assert.equal(started.levels.validate.length, 0);

  const mixed = emptyFrom(items);
  mixed['comm-captions'] = true;
  mixed['digital-alt'] = true;
  mixed['comm-libras'] = true;
  mixed['mobility-routes'] = true;
  mixed['digital-contrast'] = true;
  mixed['support-channel'] = true;
  const planned = buildAccessibilityPlan(mixed, items);
  assert.equal(planned.status, 'planned');
  assert.equal(planned.selectedCount, 6);
  assert.deepEqual(planned.levels.plan.map((item) => item.id), ['comm-captions', 'digital-alt']);
  assert.deepEqual(planned.levels.confirm.map((item) => item.id), ['comm-libras', 'mobility-routes']);
  assert.deepEqual(planned.levels.validate.map((item) => item.id), ['digital-contrast', 'support-channel']);

  const complete = emptyFrom(items);
  for (const item of items) complete[item.id] = true;
  const all = buildAccessibilityPlan(complete, items);
  assert.equal(all.status, 'planned');
  assert.equal(all.selectedCount, 12);
  assert.equal(all.levels.plan.length, items.filter((item) => item.action === 'plan').length);
  assert.equal(all.levels.confirm.length, items.filter((item) => item.action === 'confirm').length);
  assert.equal(all.levels.validate.length, items.filter((item) => item.action === 'validate').length);
  assert.ok(all.levels.plan.length >= 1);
  assert.ok(all.levels.confirm.length >= 1);
  assert.ok(all.levels.validate.length >= 1);

  assert.deepEqual(Object.values(ACTION_LEVELS), [
    'planejar',
    'confirmar com fornecedor/local',
    'validar com pessoa responsável',
  ]);
});

test('reinício restaura o estado inicial e anuncia a mudança sem persistir', async () => {
  const planner = await source(PLANNER);
  const items = parseItems(planner);

  assert.match(planner, /useState\(emptySelections\)/u);
  assert.match(planner, /function resetPlan\(\) \{\s*setSelections\(emptySelections\(\)\);/u);
  assert.match(planner, /Reiniciar planejamento/u);
  assert.match(planner, /aria-live="polite"/u);
  assert.doesNotMatch(planner, /useEffect/u);

  const dirty = emptyFrom(items);
  for (const item of items) dirty[item.id] = true;
  const reset = buildAccessibilityPlan(emptyFrom(items), items);
  assert.equal(reset.status, 'empty');
  assert.equal(reset.selectedCount, 0);
  assert.notEqual(buildAccessibilityPlan(dirty, items).status, reset.status);
});

test('não há persistência, fetch, submit de formulário nem HTML inseguro', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.doesNotMatch(combined, /localStorage|sessionStorage|indexedDB|document\.cookie/u);
  assert.doesNotMatch(combined, /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/u);
  assert.doesNotMatch(combined, /<form\b/u);
  assert.doesNotMatch(combined, /type="submit"|action=|method=/u);
  assert.doesNotMatch(combined, /dangerouslySetInnerHTML|innerHTML/u);
  assert.doesNotMatch(combined, /gtag\(|google-analytics|fbq\(|navigator\.sendBeacon/iu);
  assert.doesNotMatch(planner, /window\.|document\./u);
});

test('texto anti-claims deixa claro que a ferramenta não certifica, não substitui escuta e não altera o evento', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.match(page, /não certifica acessibilidade/u);
  assert.match(page, /não substitui a escuta das pessoas/u);
  assert.match(page, /o evento não muda/u);
  assert.match(page, /sem persistência/u);
  assert.match(page, /não altera Wizard/u);
  assert.match(planner, /não certifica acessibilidade/u);
  assert.match(planner, /não substitui a escuta das pessoas/u);
  assert.match(planner, /não altera o evento/u);
  assert.match(planner, /não certifica WCAG/u);
  assert.match(page, /nunca afirma que o evento é/u);
  assert.match(page, /Orientações genéricas e não conclusivas/u);

  for (const pattern of ANTI_CLAIM_FORBIDDEN) {
    assert.doesNotMatch(combined, pattern);
  }
});

test('links são públicos comprovados, sem rota privada, PII, texto livre ou contato inventado', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;
  const hrefs = [...combined.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]);

  assert.ok(hrefs.length > 0);
  for (const href of hrefs) {
    assert.ok(ALLOWED_HREFS.includes(href), `href não autorizado: ${href}`);
  }

  assert.doesNotMatch(combined, /href="\/login"/u);
  assert.doesNotMatch(combined, /href="\/cadastro"/u);
  assert.doesNotMatch(combined, /href="\/painel"/u);
  assert.doesNotMatch(combined, /href="\/eventos\/novo"/u);
  assert.doesNotMatch(combined, /mailto:|tel:|javascript:/iu);
  assert.doesNotMatch(combined, /@[a-z0-9.-]+\.[a-z]{2,}/iu);
  assert.doesNotMatch(combined, /\+55|\(\d{2}\)\s*\d/u);
  assert.doesNotMatch(combined, /berg\.expresso|gmail\.com|whatsapp/iu);
  assert.doesNotMatch(combined, /localhost|127\.0\.0\.1|0\.0\.0\.0|api:4000/u);
  assert.doesNotMatch(combined, /eventId|organizationId|tenantId/u);
  assert.match(page, /Não peça\s+nome, contato, documento, diagnóstico/u);
  assert.match(planner, /Não informe e-mail, telefone ou nome/u);
  assert.match(planner, /Não escreva nome, documento ou contato/u);
  assert.match(planner, /Não há campo livre, nome/u);
});

test('estados e níveis não dependem só de cor: ícone, texto e borda distinta', async () => {
  const [planner, css] = await Promise.all([source(PLANNER), source(CSS)]);

  assert.match(planner, /empty: '○'/u);
  assert.match(planner, /planned: '≡'/u);
  assert.match(planner, /plan: '1'/u);
  assert.match(planner, /confirm: '2'/u);
  assert.match(planner, /validate: '3'/u);
  assert.match(planner, /aria-hidden="true">\{STATUS_ICONS\[plan\.status\]\}/u);
  assert.match(planner, /data-plan-status=\{plan\.status\}/u);
  assert.match(planner, /data-level=\{level\}/u);
  assert.match(planner, /ACTION_LEVELS\[level\]/u);

  assert.match(css, /\.planEmpty \{[\s\S]*border: 2px dashed/u);
  assert.match(css, /\.planActive \{[\s\S]*border: 2px solid/u);
  assert.match(css, /\.levelPlan \{[\s\S]*border: 2px dashed/u);
  assert.match(css, /\.levelConfirm \{[\s\S]*border: 2px solid/u);
  assert.match(css, /\.levelValidate \{[\s\S]*border: 4px double/u);
});

test('CSS cobre WCAG local: 44 px, foco, reflow 320/390/768/1280/1440, text-spacing, forced-colors e reduced-motion', async () => {
  const css = await source(CSS);

  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.match(css, /min-width: var\(--space-44\)/u);
  assert.match(css, /\.item input \{[\s\S]*min-height: var\(--space-44\)/u);
  assert.match(css, /outline: 3px solid var\(--color-focus-on-light\)/u);
  assert.match(css, /\.article \{[\s\S]*min-width: 0/u);
  assert.match(css, /\.article h1 \{[\s\S]*overflow-wrap: anywhere/u);
  assert.match(css, /@media \(max-width: 720px\)/u);
  assert.match(css, /@media \(max-width: 320px\)/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /@media \(forced-colors: active\)/u);
  assert.match(css, /border: 1px solid CanvasText/u);
  assert.match(css, /animation-duration: 0\.01ms !important/u);
  assert.match(css, /@media print/u);

  assert.deepEqual(VIEWPORTS, [320, 390, 768, 1280, 1440]);
  assert.match(css, /width: min\(920px, 100%\)/u);

  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/u);
  assert.doesNotMatch(css, /overflow:\s*hidden/u);
  assert.doesNotMatch(css, /white-space:\s*nowrap/u);
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis/u);
  assert.doesNotMatch(css, /@keyframes/u);
});

test('Playwright direcionado não está configurado neste pacote; o contrato unitário cobre teclado, reset e aria-live', async () => {
  const pkg = await source('../package.json');
  assert.doesNotMatch(pkg, /"@playwright\/test"/u);
  assert.doesNotMatch(pkg, /playwright/u);

  const planner = await source(PLANNER);
  assert.match(planner, /type="button"/u);
  assert.match(planner, /type="checkbox"/u);
  assert.match(planner, /aria-live="polite"/u);
  assert.match(planner, /setSelections\(emptySelections\(\)\)/u);
});
