import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/planejar-ficha/page.tsx';
const PLANNER = '../app/ajuda/planejar-ficha/registration-planner.tsx';
const CSS = '../app/ajuda/planejar-ficha/planejar-ficha.module.css';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const MINIMUM_LABELS = [
  'Nome completo',
  'Como deseja ser chamado',
  'E-mail',
];

const GROUP_LEGENDS = [
  'Campos mínimos recomendados',
  'Operação do evento',
  'Logística e contato extra',
  'Dados que exigem justificativa',
];

const OPTIONAL_OPERATIONAL_IDS = [
  'categoria-inscricao',
  'instituicao',
  'trilha',
  'acessibilidade',
];

const JUSTIFICATION_IDS = [
  'alimentacao',
  'telefone',
  'endereco',
  'documento',
  'nascimento',
  'foto',
  'genero',
  'saude',
];

const SENSITIVE_IDS = [
  'documento',
  'genero',
  'saude',
];

const PLAN_LABELS = Object.freeze({
  minimum: 'só o mínimo recomendado',
  optional: 'mínimo e categorias opcionais',
  justify: 'há itens que exigem justificativa',
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
  /ficha real configurada/iu,
  /validação jurídica concluída/iu,
  /aconselhamento jurídico conclusivo/iu,
  /garantimos/iu,
  /100\s*%/u,
  /selo de acessibilidade/iu,
];

const ITEM_PATTERN = /id: '([^']+)',\s*label: '([^']+)',\s*purpose: '([^']+)',\s*sensitive: (true|false),\s*excessive: (true|false)/gu;
const MINIMUM_PATTERN = /id: '([^']+)',\s*label: '([^']+)',\s*purpose: '([^']+)',/gu;

function parseOptionalItems(plannerSource) {
  return [...plannerSource.matchAll(ITEM_PATTERN)].map((match) => ({
    id: match[1],
    label: match[2],
    purpose: match[3],
    sensitive: match[4] === 'true',
    excessive: match[5] === 'true',
  }));
}

function parseMinimum(plannerSource) {
  const block = plannerSource.match(/export const MINIMUM_FIELDS = Object\.freeze\(\[([\s\S]*?)\]\);/u)?.[1] ?? '';
  return [...block.matchAll(MINIMUM_PATTERN)].map((match) => ({
    id: match[1],
    label: match[2],
    purpose: match[3],
  }));
}

function emptyFrom(items) {
  return Object.fromEntries(items.map((item) => [item.id, false]));
}

function requiresJustification(item) {
  return item.sensitive === true || item.excessive === true;
}

function buildPlan(selected, minimum, optionals) {
  const chosen = optionals.filter((item) => selected[item.id] === true);
  const optional = chosen.filter((item) => !requiresJustification(item));
  const justification = chosen.filter((item) => requiresJustification(item));
  let status = 'minimum';
  if (justification.length > 0) {
    status = 'justify';
  } else if (optional.length > 0) {
    status = 'optional';
  }
  return {
    status,
    label: PLAN_LABELS[status],
    minimum,
    optional,
    justification,
    minimumCount: minimum.length,
    optionalCount: optional.length,
    justificationCount: justification.length,
    selectedCount: chosen.length,
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
  assert.match(page, /<h1>Planeje os campos mínimos da ficha de inscrição<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
  assert.match(page, /title: 'Planejar ficha mínima — orientação local'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /from ['"].*public-site-header['"]/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /<RegistrationPlanner \/>/u);
});

test('componente cliente isola o planejador efêmero com fieldset, legend e rótulos completos', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /['"]use client['"]/u);
  assert.match(planner, /OPTIONAL_GROUPS\.map\(\(group\) => <fieldset/u);
  assert.match(planner, /<legend>\{group\.legend\}<\/legend>/u);
  assert.match(planner, /<legend>Campos mínimos recomendados<\/legend>/u);
  assert.match(planner, /htmlFor=\{item\.id\}/u);
  assert.match(planner, /id=\{item\.id\}/u);
  assert.match(planner, /type="checkbox"/u);
  assert.match(planner, /<button type="button"[^>]*onClick=\{resetPlan\}/u);
  assert.match(planner, /Reiniciar plano/u);
  assert.match(planner, /aria-live="polite"/u);
  assert.match(planner, /role="status"/u);
  assert.match(planner, /aria-atomic="true"/u);
  assert.doesNotMatch(planner, /aria-live="assertive"/u);
  assert.doesNotMatch(planner, /<textarea\b/u);
  assert.doesNotMatch(planner, /type="text"|type="email"|type="tel"|type="url"|type="search"|type="password"/u);
  assert.doesNotMatch(planner, /contentEditable/u);
});

test('três campos mínimos são fixos no resumo e não têm controle de remoção', async () => {
  const planner = await source(PLANNER);
  const minimum = parseMinimum(planner);
  const optionals = parseOptionalItems(planner);

  assert.equal(minimum.length, 3);
  assert.deepEqual(minimum.map((item) => item.label), MINIMUM_LABELS);
  assert.deepEqual(minimum.map((item) => item.id), ['nome-completo', 'tratamento', 'email']);
  assert.match(planner, /minimum: MINIMUM_FIELDS/u);
  assert.match(planner, /minimumCount: MINIMUM_FIELDS\.length/u);
  assert.match(planner, /Não pode ser removido/u);
  assert.match(planner, /Fixo no plano mínimo/u);
  const beforeOptionals = planner.split('OPTIONAL_GROUPS.map')[0];
  assert.match(beforeOptionals, /MINIMUM_FIELDS\.map/u);
  assert.doesNotMatch(beforeOptionals, /type="checkbox"/u);
  assert.doesNotMatch(beforeOptionals, /onChange/u);

  for (const field of minimum) {
    assert.ok(field.purpose.length > 20, field.id);
    assert.equal(optionals.some((item) => item.id === field.id), false, field.id);
  }

  const empty = buildPlan(emptyFrom(optionals), minimum, optionals);
  assert.equal(empty.minimumCount, 3);
  assert.deepEqual(empty.minimum.map((item) => item.label), MINIMUM_LABELS);

  const allOn = emptyFrom(optionals);
  for (const item of optionals) allOn[item.id] = true;
  const full = buildPlan(allOn, minimum, optionals);
  assert.equal(full.minimumCount, 3);
  assert.deepEqual(full.minimum.map((item) => item.id), ['nome-completo', 'tratamento', 'email']);
});

test('doze categorias opcionais cobrem o contrato, com avisos de coleta sensível ou excessiva', async () => {
  const planner = await source(PLANNER);
  const optionals = parseOptionalItems(planner);

  for (const legend of GROUP_LEGENDS) {
    assert.match(planner, new RegExp(legend.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), legend);
  }
  assert.equal(GROUP_LEGENDS.length, 4);
  assert.equal(optionals.length, 12);
  assert.equal(new Set(optionals.map((item) => item.id)).size, 12);
  assert.deepEqual(optionals.filter((item) => !requiresJustification(item)).map((item) => item.id), OPTIONAL_OPERATIONAL_IDS);
  assert.deepEqual(optionals.filter((item) => requiresJustification(item)).map((item) => item.id), JUSTIFICATION_IDS);
  assert.deepEqual(optionals.filter((item) => item.sensitive).map((item) => item.id), SENSITIVE_IDS);

  assert.match(planner, /legend: 'Operação do evento'/u);
  assert.match(planner, /legend: 'Logística e contato extra'/u);
  assert.match(planner, /legend: 'Dados que exigem justificativa'/u);
  assert.match(planner, /Coleta sensível/u);
  assert.match(planner, /Potencialmente excessivo/u);
  assert.match(planner, /Peça justificativa de finalidade sem bloquear o planejamento/u);

  for (const item of optionals) {
    assert.ok(item.label.length > 4, item.id);
    assert.ok(item.purpose.length > 20, item.id);
  }
});

test('resumo determinístico distingue mínimo, opcional e itens que exigem justificativa', async () => {
  const planner = await source(PLANNER);
  const minimum = parseMinimum(planner);
  const optionals = parseOptionalItems(planner);

  assert.match(planner, /minimum: 'só o mínimo recomendado'/u);
  assert.match(planner, /optional: 'mínimo e categorias opcionais'/u);
  assert.match(planner, /justify: 'há itens que exigem justificativa'/u);
  assert.match(planner, /justification\.length > 0/u);
  assert.match(planner, /optional\.length > 0/u);
  assert.match(planner, /não bloqueia o planejamento/u);

  const empty = buildPlan(emptyFrom(optionals), minimum, optionals);
  assert.equal(empty.status, 'minimum');
  assert.equal(empty.label, 'só o mínimo recomendado');
  assert.equal(empty.minimumCount, 3);
  assert.equal(empty.optionalCount, 0);
  assert.equal(empty.justificationCount, 0);
  assert.equal(empty.selectedCount, 0);

  const oneOptional = emptyFrom(optionals);
  oneOptional['categoria-inscricao'] = true;
  const started = buildPlan(oneOptional, minimum, optionals);
  assert.equal(started.status, 'optional');
  assert.equal(started.label, 'mínimo e categorias opcionais');
  assert.equal(started.optionalCount, 1);
  assert.equal(started.justificationCount, 0);
  assert.equal(started.minimumCount, 3);
  assert.deepEqual(started.optional.map((item) => item.id), ['categoria-inscricao']);

  const operational = emptyFrom(optionals);
  for (const id of OPTIONAL_OPERATIONAL_IDS) operational[id] = true;
  const ops = buildPlan(operational, minimum, optionals);
  assert.equal(ops.status, 'optional');
  assert.equal(ops.optionalCount, 4);
  assert.equal(ops.justificationCount, 0);
  assert.equal(ops.minimumCount, 3);

  const sensitiveOnly = emptyFrom(optionals);
  sensitiveOnly.documento = true;
  const warned = buildPlan(sensitiveOnly, minimum, optionals);
  assert.equal(warned.status, 'justify');
  assert.equal(warned.label, 'há itens que exigem justificativa');
  assert.equal(warned.optionalCount, 0);
  assert.equal(warned.justificationCount, 1);
  assert.equal(warned.minimumCount, 3);
  assert.equal(warned.justification[0].id, 'documento');

  const mixed = emptyFrom(optionals);
  mixed['categoria-inscricao'] = true;
  mixed.acessibilidade = true;
  mixed.telefone = true;
  mixed.saude = true;
  const mixedPlan = buildPlan(mixed, minimum, optionals);
  assert.equal(mixedPlan.status, 'justify');
  assert.equal(mixedPlan.optionalCount, 2);
  assert.equal(mixedPlan.justificationCount, 2);
  assert.deepEqual(mixedPlan.optional.map((item) => item.id), ['categoria-inscricao', 'acessibilidade']);
  assert.deepEqual(mixedPlan.justification.map((item) => item.id), ['telefone', 'saude']);
  assert.equal(mixedPlan.minimumCount, 3);

  const complete = emptyFrom(optionals);
  for (const item of optionals) complete[item.id] = true;
  const full = buildPlan(complete, minimum, optionals);
  assert.equal(full.status, 'justify');
  assert.equal(full.optionalCount, 4);
  assert.equal(full.justificationCount, 8);
  assert.equal(full.minimumCount, 3);
  assert.equal(full.selectedCount, 12);
});

test('reiniciar restaura o estado inicial e o recarregar não persiste seleções', async () => {
  const planner = await source(PLANNER);
  const minimum = parseMinimum(planner);
  const optionals = parseOptionalItems(planner);

  assert.match(planner, /useState\(emptySelection\)/u);
  assert.match(planner, /function resetPlan\(\) \{\s*setSelected\(emptySelection\(\)\);/u);
  assert.match(planner, /Reiniciar plano/u);
  assert.doesNotMatch(planner, /useEffect/u);

  const dirty = emptyFrom(optionals);
  for (const item of optionals) dirty[item.id] = true;
  const reset = buildPlan(emptyFrom(optionals), minimum, optionals);
  assert.equal(reset.status, 'minimum');
  assert.equal(reset.optionalCount, 0);
  assert.equal(reset.justificationCount, 0);
  assert.equal(reset.minimumCount, 3);
  assert.notEqual(buildPlan(dirty, minimum, optionals).status, reset.status);
});

test('não há persistência, fetch, submit de formulário nem HTML inseguro', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.doesNotMatch(combined, /localStorage|sessionStorage|indexedDB|IndexedDB|document\.cookie/u);
  assert.doesNotMatch(combined, /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/u);
  assert.doesNotMatch(combined, /<form\b/u);
  assert.doesNotMatch(combined, /type="submit"|action=|method=/u);
  assert.doesNotMatch(combined, /dangerouslySetInnerHTML|innerHTML/u);
  assert.doesNotMatch(combined, /gtag\(|google-analytics|fbq\(|amplitude|mixpanel|hotjar/iu);
  assert.doesNotMatch(planner, /window\.|document\./u);
});

test('texto anti-claims deixa claro que a ferramenta não coleta, não configura a ficha e não aconselha juridicamente', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.match(page, /minimização e finalidade/u);
  assert.match(page, /sem aconselhamento jurídico/u);
  assert.match(page, /não configura a ficha real/u);
  assert.match(page, /não afirma conformidade/u);
  assert.match(page, /Não há conta, cookie, armazenamento local, telemetria/u);
  assert.match(planner, /Não há campo de texto nem envio/u);
  assert.match(planner, /não é aconselhamento jurídico/u);
  assert.match(planner, /não bloqueia o planejamento/u);
  assert.match(page, /não bloqueiam o uso/u);

  for (const pattern of ANTI_CLAIM_FORBIDDEN) {
    assert.doesNotMatch(combined, pattern);
  }
});

test('links são públicos comprovados, sem rota privada, PII ou contato inventado', async () => {
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
  assert.match(planner, /Não são campos para preencher dados reais/u);
});

test('estados não dependem só de cor: ícone, texto e borda distinta', async () => {
  const [planner, css] = await Promise.all([source(PLANNER), source(CSS)]);

  assert.match(planner, /minimum: '○'/u);
  assert.match(planner, /optional: '✓'/u);
  assert.match(planner, /justify: '!'/u);
  assert.match(planner, /aria-hidden="true">\{PLAN_ICONS\[plan\.status\]\}/u);
  assert.match(planner, /data-plan=\{plan\.status\}/u);
  assert.match(planner, / — coleta sensível/u);
  assert.match(planner, / — potencialmente excessivo/u);

  assert.match(css, /\.planMinimum \{[\s\S]*border: 2px dashed/u);
  assert.match(css, /\.planOptional \{[\s\S]*border: 2px solid/u);
  assert.match(css, /\.planJustify \{[\s\S]*border: 4px double/u);
});

test('CSS cobre WCAG local: 44 px, foco, reflow 320/390/1366, forced-colors e reduced-motion', async () => {
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

  const planner = await source(PLANNER);
  assert.match(planner, /type="button"/u);
  assert.match(planner, /type="checkbox"/u);
  assert.match(planner, /aria-live="polite"/u);
  assert.match(planner, /setSelected\(emptySelection\(\)\)/u);
});
