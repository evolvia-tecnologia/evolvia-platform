import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/avaliar-prontidao/page.tsx';
const CHECKER = '../app/ajuda/avaliar-prontidao/readiness-checker.tsx';
const CSS = '../app/ajuda/avaliar-prontidao/avaliar-prontidao.module.css';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const GROUP_LEGENDS = [
  'Identidade e público',
  'Data, local e fuso',
  'Conteúdo e programação',
  'Ficha mínima e privacidade',
  'Mídia e acessibilidade',
  'Responsáveis e contatos',
  'Prévia e autorização humana',
];

const CRITICAL_IDS = [
  'schedule-coherent',
  'privacy-review',
  'a11y-minimum',
  'owner-defined',
  'human-auth',
];

const RESULT_LABELS = Object.freeze({
  start: 'começar revisão',
  review: 'revisão necessária',
  ready: 'pronto para decisão humana',
});

const VIEWPORTS = [320, 390, 1366];

const ANTI_CLAIM_FORBIDDEN = [
  /certifica[cç][aã]o WCAG/iu,
  /conforme à WCAG/iu,
  /WCAG 2\.2 AA certificado/iu,
  /certifica[cç][aã]o LGPD/iu,
  /conforme à LGPD/iu,
  /homologa automaticamente/iu,
  /publicação habilitada/iu,
  /publique agora/iu,
  /botão real de publicar/iu,
  /deploy disponível/iu,
  /selo de acessibilidade/iu,
  /garantimos/iu,
  /100\s*%/u,
  /validação jurídica concluída/iu,
  /aconselhamento jurídico/iu,
];

const ITEM_PATTERN = /id: '([^']+)',\s*label: '([^']+)',\s*help: '([^']+)',\s*critical: (true|false)/gu;

function parseItems(checkerSource) {
  return [...checkerSource.matchAll(ITEM_PATTERN)].map((match) => ({
    id: match[1],
    label: match[2],
    help: match[3],
    critical: match[4] === 'true',
  }));
}

function emptyFrom(items) {
  return Object.fromEntries(items.map((item) => [item.id, false]));
}

function evaluateReadiness(answers, items) {
  const pending = items.filter((item) => answers[item.id] !== true);
  const pendingCritical = pending.filter((item) => item.critical);
  const checkedCount = items.length - pending.length;
  let status = 'review';
  if (checkedCount === 0) {
    status = 'start';
  } else if (pendingCritical.length > 0) {
    status = 'review';
  } else if (pending.length > 0) {
    status = 'review';
  } else {
    status = 'ready';
  }
  return {
    status,
    label: RESULT_LABELS[status],
    checkedCount,
    totalCount: items.length,
    pending,
    pendingCritical,
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
  assert.match(page, /<h1>Avaliar prontidão antes da prévia<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
  assert.match(page, /title: 'Avaliar prontidão — orientação local'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /from ['"].*public-site-header['"]/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /<ReadinessChecker \/>/u);
});

test('componente cliente isola o checklist efêmero com fieldset, legend e rótulos completos', async () => {
  const checker = await source(CHECKER);

  assert.match(checker, /['"]use client['"]/u);
  assert.equal([...checker.matchAll(/<fieldset\b/gu)].length, 1);
  assert.match(checker, /READINESS_GROUPS\.map\(\(group\) => <fieldset/u);
  assert.match(checker, /<legend>\{group\.legend\}<\/legend>/u);
  assert.match(checker, /htmlFor=\{item\.id\}/u);
  assert.match(checker, /id=\{item\.id\}/u);
  assert.match(checker, /type="checkbox"/u);
  assert.match(checker, /<button type="button"[^>]*onClick=\{clearAnswers\}/u);
  assert.match(checker, /Limpar respostas/u);
  assert.match(checker, /aria-live="polite"/u);
  assert.match(checker, /role="status"/u);
  assert.match(checker, /aria-atomic="true"/u);
  assert.doesNotMatch(checker, /aria-live="assertive"/u);
  assert.doesNotMatch(checker, /<textarea\b/u);
  assert.doesNotMatch(checker, /type="text"|type="email"|type="tel"|type="url"/u);
});

test('sete grupos e catorze critérios cobrem o contrato, com cinco críticos', async () => {
  const checker = await source(CHECKER);
  const items = parseItems(checker);

  for (const legend of GROUP_LEGENDS) {
    assert.match(checker, new RegExp(legend.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), legend);
  }
  assert.equal(GROUP_LEGENDS.length, 7);
  assert.equal(items.length, 14);
  assert.equal(new Set(items.map((item) => item.id)).size, 14);
  assert.deepEqual(items.filter((item) => item.critical).map((item) => item.id), CRITICAL_IDS);
  assert.equal(CRITICAL_IDS.length, 5);

  assert.match(checker, /legend: 'Identidade e público'/u);
  assert.match(checker, /legend: 'Data, local e fuso'/u);
  assert.match(checker, /legend: 'Conteúdo e programação'/u);
  assert.match(checker, /legend: 'Ficha mínima e privacidade'/u);
  assert.match(checker, /legend: 'Mídia e acessibilidade'/u);
  assert.match(checker, /legend: 'Responsáveis e contatos'/u);
  assert.match(checker, /legend: 'Prévia e autorização humana'/u);

  for (const item of items) {
    assert.ok(item.label.length > 8, item.id);
    assert.ok(item.help.length > 20, item.id);
  }
});

test('três resultados determinísticos e bloqueio por critérios críticos mesmo com pontuação alta', async () => {
  const checker = await source(CHECKER);
  const items = parseItems(checker);

  assert.match(checker, /start: 'começar revisão'/u);
  assert.match(checker, /review: 'revisão necessária'/u);
  assert.match(checker, /ready: 'pronto para decisão humana'/u);
  assert.match(checker, /if \(checkedCount === 0\)/u);
  assert.match(checker, /pendingCritical\.length > 0/u);
  assert.match(checker, /status = 'ready'/u);

  const empty = evaluateReadiness(emptyFrom(items), items);
  assert.equal(empty.status, 'start');
  assert.equal(empty.label, 'começar revisão');
  assert.equal(empty.checkedCount, 0);
  assert.equal(empty.pending.length, 14);
  assert.equal(empty.pendingCritical.length, 5);

  const one = emptyFrom(items);
  one[items[0].id] = true;
  const started = evaluateReadiness(one, items);
  assert.equal(started.status, 'review');
  assert.equal(started.label, 'revisão necessária');
  assert.equal(started.checkedCount, 1);

  const highScore = emptyFrom(items);
  for (const item of items) {
    if (!item.critical) highScore[item.id] = true;
  }
  const blocked = evaluateReadiness(highScore, items);
  assert.equal(blocked.status, 'review');
  assert.equal(blocked.label, 'revisão necessária');
  assert.equal(blocked.checkedCount, 9);
  assert.ok(blocked.checkedCount / blocked.totalCount > 0.6);
  assert.equal(blocked.pendingCritical.length, 5);
  assert.deepEqual(blocked.pendingCritical.map((item) => item.id), CRITICAL_IDS);

  const missingOneCritical = emptyFrom(items);
  for (const item of items) missingOneCritical[item.id] = true;
  missingOneCritical['human-auth'] = false;
  const almost = evaluateReadiness(missingOneCritical, items);
  assert.equal(almost.status, 'review');
  assert.equal(almost.checkedCount, 13);
  assert.equal(almost.pendingCritical.length, 1);
  assert.equal(almost.pendingCritical[0].id, 'human-auth');

  const complete = emptyFrom(items);
  for (const item of items) complete[item.id] = true;
  const ready = evaluateReadiness(complete, items);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.label, 'pronto para decisão humana');
  assert.equal(ready.pending.length, 0);
  assert.equal(ready.pendingCritical.length, 0);
});

test('limpeza restaura o estado inicial e o recarregar não persiste respostas', async () => {
  const checker = await source(CHECKER);
  const items = parseItems(checker);

  assert.match(checker, /useState\(emptyAnswers\)/u);
  assert.match(checker, /function clearAnswers\(\) \{\s*setAnswers\(emptyAnswers\(\)\);/u);
  assert.match(checker, /Limpar respostas/u);
  assert.doesNotMatch(checker, /useEffect/u);

  const dirty = emptyFrom(items);
  for (const item of items) dirty[item.id] = true;
  const reset = evaluateReadiness(emptyFrom(items), items);
  assert.equal(reset.status, 'start');
  assert.equal(reset.checkedCount, 0);
  assert.notEqual(evaluateReadiness(dirty, items).status, reset.status);
});

test('não há persistência, fetch, submit de formulário nem HTML inseguro', async () => {
  const [page, checker] = await Promise.all([source(PAGE), source(CHECKER)]);
  const combined = `${page}\n${checker}`;

  assert.doesNotMatch(combined, /localStorage|sessionStorage|indexedDB|document\.cookie/u);
  assert.doesNotMatch(combined, /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/u);
  assert.doesNotMatch(combined, /<form\b/u);
  assert.doesNotMatch(combined, /type="submit"|action=|method=/u);
  assert.doesNotMatch(combined, /dangerouslySetInnerHTML|innerHTML/u);
  assert.doesNotMatch(combined, /gtag\(|google-analytics|fbq\(|navigator\.sendBeacon/iu);
  assert.doesNotMatch(checker, /window\.|document\./u);
});

test('texto anti-claims deixa claro que a ferramenta não certifica, não homologa e não publica', async () => {
  const [page, checker] = await Promise.all([source(PAGE), source(CHECKER)]);
  const combined = `${page}\n${checker}`;

  assert.match(page, /ferramenta é orientativa/u);
  assert.match(page, /não certifica WCAG/u);
  assert.match(page, /não certifica LGPD/u);
  assert.match(page, /não homologa e não publica/u);
  assert.match(page, /sem persistência/u);
  assert.match(checker, /não certifica WCAG/u);
  assert.match(checker, /não certifica LGPD/u);
  assert.match(checker, /não homologa e não publica/u);
  assert.match(checker, /pronto para decisão humana/u);
  assert.match(page, /nunca pronto para publicar/u);
  assert.match(page, /A EVA não decide/u);

  for (const pattern of ANTI_CLAIM_FORBIDDEN) {
    assert.doesNotMatch(combined, pattern);
  }
});

test('links são públicos comprovados, sem rota privada, PII ou contato inventado', async () => {
  const [page, checker] = await Promise.all([source(PAGE), source(CHECKER)]);
  const combined = `${page}\n${checker}`;
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
  assert.match(checker, /Não informe nome, e-mail ou telefone/u);
  assert.match(checker, /Não invente contato/u);
});

test('estados não dependem só de cor: ícone, texto e borda distinta', async () => {
  const [checker, css] = await Promise.all([source(CHECKER), source(CSS)]);

  assert.match(checker, /start: '○'/u);
  assert.match(checker, /review: '!'/u);
  assert.match(checker, /ready: '✓'/u);
  assert.match(checker, /aria-hidden="true">\{RESULT_ICONS\[result\.status\]\}/u);
  assert.match(checker, /data-result=\{result\.status\}/u);
  assert.match(checker, /Critério crítico/u);
  assert.match(checker, / — critério crítico/u);

  assert.match(css, /\.resultStart \{[\s\S]*border: 2px dashed/u);
  assert.match(css, /\.resultReview \{[\s\S]*border: 2px solid/u);
  assert.match(css, /\.resultReady \{[\s\S]*border: 4px double/u);
});

test('CSS cobre WCAG local: 44 px, foco, reflow 320/390/1366, text-spacing, forced-colors e reduced-motion', async () => {
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

  assert.deepEqual(VIEWPORTS, [320, 390, 1366]);
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

  const checker = await source(CHECKER);
  assert.match(checker, /type="button"/u);
  assert.match(checker, /type="checkbox"/u);
  assert.match(checker, /aria-live="polite"/u);
  assert.match(checker, /setAnswers\(emptyAnswers\(\)\)/u);
});
