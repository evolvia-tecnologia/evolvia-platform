import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/planejar-identidade-visual/page.tsx';
const PLANNER = '../app/ajuda/planejar-identidade-visual/visual-identity-planner.tsx';
const CSS = '../app/ajuda/planejar-identidade-visual/planejar-identidade-visual.module.css';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const ELEMENT_IDS = [
  'nome-publico',
  'logotipo',
  'paleta',
  'tipografia',
  'imagem-principal',
  'alternativas-textuais',
  'direitos-de-uso',
  'versoes-fundos',
];

const ELEMENT_LEGENDS = [
  'Nome público',
  'Logotipo',
  'Paleta',
  'Tipografia',
  'Imagem principal',
  'Alternativas textuais',
  'Direitos de uso',
  'Versões para fundos claro e escuro',
];

const READINESS_IDS = ['pronto-para-revisar', 'ainda-falta', 'nao-se-aplica'];
const READINESS_LABELS = ['Pronto para revisar', 'Ainda falta', 'Não se aplica'];
const STOP_IDS = [
  'imagem-sem-direito',
  'info-so-imagem-cor',
  'contraste-nao-verificado',
  'logotipo-ilegivel',
  'ausencia-alternativa-textual',
];
const VIEWPORTS = [320, 768, 1280, 1440];

const ANTI_CLAIM_FORBIDDEN = [
  /certifica[cç][aã]o WCAG/iu,
  /conforme à WCAG/iu,
  /WCAG 2\.2 AA certificado/iu,
  /selo de acessibilidade/iu,
  /certifica[cç][aã]o de marca/iu,
  /marca validada/iu,
  /publicar guideline oficial/iu,
  /manual de marca publicado/iu,
  /paleta oficial criada/iu,
  /logotipo gerado/iu,
  /homologa automaticamente/iu,
  /publicação habilitada/iu,
  /publique agora/iu,
  /botão real de publicar/iu,
  /upload concluído/iu,
  /arquivo enviado/iu,
  /garantimos/iu,
  /100\s*%/u,
  /validação jurídica concluída/iu,
  /aconselhamento jurídico conclusivo/iu,
  /conforme à LGPD certificado/iu,
  /custa R\$/iu,
  /Inter,?\s*sans/iu,
  /hexadecimal da marca/iu,
  /1920\s*[x×]\s*1080/iu,
  /proporção 16:9 obrigatória/iu,
];

const ELEMENT_PATTERN = /id: '([^']+)',\s*legend: '([^']+)',\s*purpose: '([^']+)'/gu;
const OPTION_PATTERN = /id: '([^']+)',\s*label: '([^']+)',\s*help: '([^']+)'/gu;
const STOP_PATTERN = /id: '([^']+)',\s*title: '([^']+)',\s*detail: '([^']+)'/gu;

function parseList(plannerSource, startMarker, endMarker, pattern) {
  const start = plannerSource.indexOf(startMarker);
  const end = plannerSource.indexOf(endMarker, start + 1);
  assert.ok(start >= 0 && end > start, `${startMarker} … ${endMarker}`);
  return [...plannerSource.slice(start, end).matchAll(pattern)].map((match) => ({
    id: match[1],
    second: match[2],
    third: match[3],
  }));
}

function emptyChoices() {
  return Object.fromEntries(ELEMENT_IDS.map((id) => [id, '']));
}

function isReady(choices, id) {
  return choices[id] === 'pronto-para-revisar';
}

function isMissing(choices, id) {
  return choices[id] === 'ainda-falta';
}

function lacksConfirmation(choices, id) {
  return choices[id] === 'ainda-falta' || choices[id] === 'nao-se-aplica';
}

function hasVisualAssetReady(choices) {
  return isReady(choices, 'imagem-principal') || isReady(choices, 'logotipo');
}

function stopRuleActive(id, choices) {
  if (id === 'imagem-sem-direito') {
    return hasVisualAssetReady(choices) && lacksConfirmation(choices, 'direitos-de-uso');
  }
  if (id === 'info-so-imagem-cor') {
    return (isReady(choices, 'paleta') || isReady(choices, 'imagem-principal'))
      && lacksConfirmation(choices, 'alternativas-textuais');
  }
  if (id === 'contraste-nao-verificado') {
    return (isReady(choices, 'paleta') || isReady(choices, 'tipografia') || isReady(choices, 'logotipo'))
      && isMissing(choices, 'versoes-fundos');
  }
  if (id === 'logotipo-ilegivel') {
    return isReady(choices, 'logotipo') && isMissing(choices, 'versoes-fundos');
  }
  return hasVisualAssetReady(choices) && lacksConfirmation(choices, 'alternativas-textuais');
}

function planVisualIdentity(choices, catalogs) {
  const ready = catalogs.elements.filter((element) => choices[element.id] === 'pronto-para-revisar');
  const adjust = catalogs.elements.filter((element) => choices[element.id] === 'ainda-falta');
  const skipped = catalogs.elements.filter((element) => choices[element.id] === 'nao-se-aplica');
  const pending = catalogs.elements.filter((element) => choices[element.id] === '');
  const stop = catalogs.stops.filter((rule) => stopRuleActive(rule.id, choices));
  return {
    ready: ready.map((item) => item.id),
    adjust: adjust.map((item) => item.id),
    skipped: skipped.map((item) => item.id),
    pending: pending.map((item) => item.id),
    stop: stop.map((item) => item.id),
    answered: catalogs.elements.length - pending.length,
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
  assert.match(page, /<h1>Planejar identidade visual do evento<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
  assert.match(page, /title: 'Planejar identidade visual — orientação local'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /from ['"].*public-site-header['"]/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /<VisualIdentityPlanner \/>/u);
});

test('componente cliente isola oito grupos com fieldset, legend, hint e rádios fechados', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /['"]use client['"]/u);
  assert.match(planner, /IDENTITY_ELEMENTS\.map\(\(element\) => <fieldset/u);
  assert.match(planner, /<legend>\{element\.legend\}<\/legend>/u);
  assert.match(planner, /aria-describedby=\{`\$\{element\.id\}-purpose`\}/u);
  assert.match(planner, /htmlFor=\{`\$\{element\.id\}-\$\{option\.id\}`\}/u);
  assert.match(planner, /type="radio"/u);
  assert.match(planner, /name=\{`visual-identity-\$\{element\.id\}`\}/u);
  assert.match(planner, /<button type="button"[^>]*onClick=\{restart\}/u);
  assert.match(planner, /Reiniciar planejamento/u);
  assert.match(planner, /aria-live="polite"/u);
  assert.match(planner, /role="status"/u);
  assert.match(planner, /aria-atomic="true"/u);
  assert.doesNotMatch(planner, /aria-live="assertive"/u);
  assert.doesNotMatch(planner, /<textarea\b/u);
  assert.doesNotMatch(planner, /type="text"|type="email"|type="tel"|type="url"|type="number"|type="search"|type="password"|type="file"/u);
  assert.doesNotMatch(planner, /<select\b/u);
  assert.doesNotMatch(planner, /contentEditable/u);
  assert.doesNotMatch(planner, /<input(?![^>]*type="radio")/u);
});

test('oito elementos genéricos e três escolhas fechadas, sem campo livre nem dado de marca', async () => {
  const planner = await source(PLANNER);
  const elements = parseList(planner, 'export const IDENTITY_ELEMENTS', 'export const STOP_RULES', ELEMENT_PATTERN);
  const options = parseList(planner, 'export const READINESS_OPTIONS', 'export const IDENTITY_ELEMENTS', OPTION_PATTERN);

  assert.deepEqual(elements.map((item) => item.id), ELEMENT_IDS);
  assert.deepEqual(elements.map((item) => item.second), ELEMENT_LEGENDS);
  assert.deepEqual(options.map((item) => item.id), READINESS_IDS);
  assert.deepEqual(options.map((item) => item.second), READINESS_LABELS);

  for (const element of elements) {
    assert.ok(element.third.length > 20, element.id);
    assert.doesNotMatch(element.third, /#[0-9a-f]{3,8}/iu);
    assert.doesNotMatch(element.third, /https?:\/\//iu);
  }
  for (const option of options) {
    assert.ok(option.third.length > 20, option.id);
  }

  assert.match(planner, /Não escreva o nome da marca/u);
  assert.match(planner, /Não envie arquivo/u);
  assert.match(planner, /Não informe código de cor/u);
  assert.match(planner, /Não nomeie fonte nem tamanho/u);
  assert.match(planner, /não analisa direito autoral/u);
});

test('resumo determinístico diferencia os três estados e dispara stop rules representativas', async () => {
  const planner = await source(PLANNER);
  const catalogs = {
    elements: parseList(planner, 'export const IDENTITY_ELEMENTS', 'export const STOP_RULES', ELEMENT_PATTERN),
    stops: parseList(planner, 'export const STOP_RULES', 'const BUCKET_CLASS', STOP_PATTERN).map((item) => ({
      id: item.id,
      title: item.second,
      detail: item.third,
    })),
  };

  assert.deepEqual(catalogs.stops.map((item) => item.id), STOP_IDS);
  assert.match(planner, /ready: Object\.freeze\(\{ id: 'ready', label: 'Pronto para revisão', icon: '✓' \}\)/u);
  assert.match(planner, /adjust: Object\.freeze\(\{ id: 'adjust', label: 'Precisa de ajuste', icon: '○' \}\)/u);
  assert.match(planner, /stop: Object\.freeze\(\{ id: 'stop', label: 'Pare e confirme', icon: '!' \}\)/u);
  assert.match(planner, /data-bucket="ready"/u);
  assert.match(planner, /data-bucket="adjust"/u);
  assert.match(planner, /data-bucket="stop"/u);
  assert.match(planner, /nunca só por cor/u);

  const empty = planVisualIdentity(emptyChoices(), catalogs);
  assert.deepEqual(empty, {
    ready: [],
    adjust: [],
    skipped: [],
    pending: ELEMENT_IDS,
    stop: [],
    answered: 0,
  });

  const allReady = emptyChoices();
  for (const id of ELEMENT_IDS) allReady[id] = 'pronto-para-revisar';
  const happy = planVisualIdentity(allReady, catalogs);
  assert.deepEqual(happy.ready, ELEMENT_IDS);
  assert.deepEqual(happy.adjust, []);
  assert.deepEqual(happy.stop, []);
  assert.equal(happy.answered, 8);

  const allMissing = emptyChoices();
  for (const id of ELEMENT_IDS) allMissing[id] = 'ainda-falta';
  const missing = planVisualIdentity(allMissing, catalogs);
  assert.deepEqual(missing.adjust, ELEMENT_IDS);
  assert.deepEqual(missing.ready, []);
  assert.deepEqual(missing.stop, []);

  const skipped = emptyChoices();
  for (const id of ELEMENT_IDS) skipped[id] = 'nao-se-aplica';
  const skippedPlan = planVisualIdentity(skipped, catalogs);
  assert.deepEqual(skippedPlan.skipped, ELEMENT_IDS);
  assert.deepEqual(skippedPlan.stop, []);

  const imageWithoutRights = emptyChoices();
  imageWithoutRights['imagem-principal'] = 'pronto-para-revisar';
  imageWithoutRights['direitos-de-uso'] = 'ainda-falta';
  const rightsStop = planVisualIdentity(imageWithoutRights, catalogs);
  assert.deepEqual(rightsStop.ready, ['imagem-principal']);
  assert.deepEqual(rightsStop.adjust, ['direitos-de-uso']);
  assert.equal(rightsStop.stop.includes('imagem-sem-direito'), true);
  assert.deepEqual(planVisualIdentity(imageWithoutRights, catalogs), rightsStop);

  const rightsNa = emptyChoices();
  rightsNa.logotipo = 'pronto-para-revisar';
  rightsNa['direitos-de-uso'] = 'nao-se-aplica';
  assert.equal(planVisualIdentity(rightsNa, catalogs).stop.includes('imagem-sem-direito'), true);

  const unansweredRights = emptyChoices();
  unansweredRights['imagem-principal'] = 'pronto-para-revisar';
  assert.equal(planVisualIdentity(unansweredRights, catalogs).stop.includes('imagem-sem-direito'), false);

  const colorOnly = emptyChoices();
  colorOnly.paleta = 'pronto-para-revisar';
  colorOnly['alternativas-textuais'] = 'ainda-falta';
  const colorPlan = planVisualIdentity(colorOnly, catalogs);
  assert.equal(colorPlan.stop.includes('info-so-imagem-cor'), true);
  assert.equal(colorPlan.stop.includes('ausencia-alternativa-textual'), false);
  assert.deepEqual(colorPlan.ready, ['paleta']);
  assert.deepEqual(colorPlan.adjust, ['alternativas-textuais']);

  const contrast = emptyChoices();
  contrast.paleta = 'pronto-para-revisar';
  contrast.tipografia = 'pronto-para-revisar';
  contrast['versoes-fundos'] = 'ainda-falta';
  const contrastPlan = planVisualIdentity(contrast, catalogs);
  assert.equal(contrastPlan.stop.includes('contraste-nao-verificado'), true);
  assert.equal(contrastPlan.stop.includes('logotipo-ilegivel'), false);

  const illegibleLogo = emptyChoices();
  illegibleLogo.logotipo = 'pronto-para-revisar';
  illegibleLogo['versoes-fundos'] = 'ainda-falta';
  const logoPlan = planVisualIdentity(illegibleLogo, catalogs);
  assert.equal(logoPlan.stop.includes('logotipo-ilegivel'), true);
  assert.equal(logoPlan.stop.includes('contraste-nao-verificado'), true);

  const missingAlt = emptyChoices();
  missingAlt['imagem-principal'] = 'pronto-para-revisar';
  missingAlt['alternativas-textuais'] = 'nao-se-aplica';
  const altPlan = planVisualIdentity(missingAlt, catalogs);
  assert.equal(altPlan.stop.includes('ausencia-alternativa-textual'), true);
  assert.equal(altPlan.stop.includes('info-so-imagem-cor'), true);

  const mixed = emptyChoices();
  mixed['nome-publico'] = 'pronto-para-revisar';
  mixed.logotipo = 'pronto-para-revisar';
  mixed.paleta = 'ainda-falta';
  mixed.tipografia = 'nao-se-aplica';
  mixed['imagem-principal'] = 'pronto-para-revisar';
  mixed['alternativas-textuais'] = 'ainda-falta';
  mixed['direitos-de-uso'] = 'ainda-falta';
  mixed['versoes-fundos'] = 'ainda-falta';
  const mixedPlan = planVisualIdentity(mixed, catalogs);
  assert.deepEqual(mixedPlan.ready, ['nome-publico', 'logotipo', 'imagem-principal']);
  assert.deepEqual(mixedPlan.adjust, ['paleta', 'alternativas-textuais', 'direitos-de-uso', 'versoes-fundos']);
  assert.deepEqual(mixedPlan.skipped, ['tipografia']);
  assert.deepEqual(mixedPlan.stop, STOP_IDS);
});

test('reinício restaura o estado inicial e o anuncia via aria-live', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /useState\(emptyChoices\)/u);
  assert.match(planner, /function restart\(\) \{\s*setChoices\(emptyChoices\(\)\);\s*setRestarted\(true\);/u);
  assert.match(planner, /Reiniciar planejamento/u);
  assert.match(planner, /Planejamento reiniciado\. Nenhuma escolha permanece visível\./u);
  assert.match(planner, /Nenhuma escolha feita\. Marque o estado de cada elemento/u);
  assert.match(planner, /aria-live="polite"/u);
  assert.doesNotMatch(planner, /useEffect/u);
});

test('não há persistência, fetch, upload, submit de formulário nem HTML inseguro', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.doesNotMatch(combined, /localStorage|sessionStorage|indexedDB|IndexedDB|document\.cookie/u);
  assert.doesNotMatch(combined, /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/u);
  assert.doesNotMatch(combined, /<form\b/u);
  assert.doesNotMatch(combined, /type="submit"|type="file"|accept=|action=|method=/u);
  assert.doesNotMatch(combined, /dangerouslySetInnerHTML|innerHTML/u);
  assert.doesNotMatch(combined, /gtag\(|google-analytics|fbq\(|amplitude|mixpanel|hotjar/iu);
  assert.doesNotMatch(combined, /<canvas\b|FileReader|createObjectURL|webkitdirectory|capture=/u);
  assert.doesNotMatch(combined, /download=|new Blob|FormData/u);
  assert.doesNotMatch(planner, /window\.|document\./u);
});

test('texto anti-claims deixa claro que a ferramenta não valida marca, não certifica acessibilidade, não faz upload e não altera o evento', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.match(page, /não valida marca, não certifica acessibilidade, não faz upload e não altera o evento/u);
  assert.match(page, /Não envie logotipo, imagem, paleta, fonte, URL, nome da marca, contato/u);
  assert.match(page, /Não há campo livre, recorte, conversão, armazenamento ou download/u);
  assert.match(page, /não inventam dimensão, paleta, fonte ou requisito proprietário/u);
  assert.match(page, /A EVA não decide/u);
  assert.match(page, /não escolhe cor real, não altera o design system/u);
  assert.match(planner, /não valida marca, não certifica acessibilidade, não faz upload e não altera o evento/u);
  assert.match(planner, /Não há campo livre, envio de arquivo nem persistência/u);
  assert.match(planner, /sem certificar acessibilidade/u);
  assert.match(planner, /não analisa copyright/u);

  for (const pattern of ANTI_CLAIM_FORBIDDEN) {
    assert.doesNotMatch(combined, pattern);
  }
});

test('links são públicos comprovados, sem rota privada, PII, upload ou contato inventado', async () => {
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
});

test('estados não dependem só de cor: texto, ícone e borda distinta', async () => {
  const [planner, css] = await Promise.all([source(PLANNER), source(CSS)]);

  assert.match(planner, /aria-hidden="true">\{BUCKETS\.ready\.icon\}/u);
  assert.match(planner, /aria-hidden="true">\{bucket\.icon\}/u);
  assert.match(planner, /data-stop-rule=\{rule\.id\}/u);
  assert.match(planner, /Selecionado/u);
  assert.match(planner, /Estados do resumo/u);

  assert.match(css, /\.bucketReady \{[\s\S]*border: 2px solid/u);
  assert.match(css, /\.bucketAdjust \{[\s\S]*border: 2px dashed/u);
  assert.match(css, /\.bucketStop \{[\s\S]*border: 4px double/u);
  assert.match(css, /\.option \{[\s\S]*border: 1px dashed/u);
  assert.match(css, /\.option:has\(input:checked\) \{[\s\S]*border: 2px solid/u);
});

test('CSS cobre WCAG local: 44 px, foco, reflow 320/768/1280/1440, text-spacing, forced-colors e reduced-motion', async () => {
  const css = await source(CSS);

  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.match(css, /min-width: var\(--space-44\)/u);
  assert.match(css, /\.option input \{[\s\S]*min-height: var\(--space-44\)/u);
  assert.match(css, /outline: 3px solid var\(--color-focus-on-light\)/u);
  assert.match(css, /\.article \{[\s\S]*min-width: 0/u);
  assert.match(css, /\.article h1 \{[\s\S]*overflow-wrap: anywhere/u);
  assert.match(css, /@media \(max-width: 768px\)/u);
  assert.match(css, /@media \(max-width: 320px\)/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /@media \(forced-colors: active\)/u);
  assert.match(css, /border: 1px solid CanvasText/u);
  assert.match(css, /animation-duration: 0\.01ms !important/u);
  assert.match(css, /@media print/u);

  assert.deepEqual(VIEWPORTS, [320, 768, 1280, 1440]);
  assert.match(css, /width: min\(920px, 100%\)/u);
  assert.match(css, /overflow-wrap: anywhere/u);

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
  assert.match(planner, /type="radio"/u);
  assert.match(planner, /aria-live="polite"/u);
  assert.match(planner, /setChoices\(emptyChoices\(\)\)/u);
});
