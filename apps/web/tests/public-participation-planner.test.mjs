import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/planejar-participacao/page.tsx';
const PLANNER = '../app/ajuda/planejar-participacao/participation-planner.tsx';
const CSS = '../app/ajuda/planejar-participacao/planejar-participacao.module.css';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const ACCESS_IDS = ['aberto', 'aprovacao-humana', 'somente-convite', 'decidir-depois'];
const COMPANION_IDS = ['individual', 'com-acompanhante', 'decidir-depois'];
const CATEGORY_IDS = ['sem-categorias', 'com-categorias', 'decidir-depois'];
const PROOF_IDS = ['sem-comprovante', 'com-comprovante', 'decidir-depois'];
const STOP_IDS = [
  'responsavel-ausente',
  'criterio-aprovacao-indefinido',
  'acompanhante-sem-regra',
  'categoria-sem-finalidade',
  'comprovante-sem-necessidade',
];
const STATUS_IDS = ['planned', 'later', 'stop'];
const STATUS_LABELS = {
  planned: 'definido para planejar',
  later: 'decidir depois',
  stop: 'pare e confirme',
};

const VIEWPORTS = [320, 768, 1280, 1440];

const ANTI_CLAIM_FORBIDDEN = [
  /certifica[cç][aã]o WCAG/iu,
  /conforme à WCAG/iu,
  /WCAG 2\.2 AA certificado/iu,
  /certifica[cç][aã]o LGPD/iu,
  /homologa automaticamente/iu,
  /publicação habilitada/iu,
  /publique agora/iu,
  /botão real de publicar/iu,
  /deploy disponível/iu,
  /selo de acessibilidade/iu,
  /garantimos/iu,
  /100\s*%/u,
  /validação jurídica concluída/iu,
  /aconselhamento jurídico conclusivo/iu,
  /\bSLA\b/u,
  /tempo de resposta contratado/iu,
  /custa R\$/iu,
  /preço estimado/iu,
  /prazo de \d+ dias/iu,
  /equipe de \d+/iu,
  /lotação máxima/iu,
  /é obrigatório por lei/iu,
  /obrigação jurídica de/iu,
  /inscrição criada/iu,
  /convite enviado/iu,
  /aprovação registrada/iu,
];

const OPTION_PATTERN = /id: '([^']+)',\s*label: '([^']+)',\s*help: '([^']+)'/gu;

function parseOptions(plannerSource, startMarker, endMarker) {
  const start = plannerSource.indexOf(startMarker);
  const end = plannerSource.indexOf(endMarker, start + 1);
  assert.ok(start >= 0 && end > start, `${startMarker} … ${endMarker}`);
  return [...plannerSource.slice(start, end).matchAll(OPTION_PATTERN)].map((match) => ({
    id: match[1],
    label: match[2],
    help: match[3],
  }));
}

function nextStepFor(choices) {
  if (!choices.access) return 'Escolha o modelo de acesso.';
  if (!choices.companion) return 'Indique se a participação será individual ou poderá admitir acompanhante.';
  if (!choices.categories) return 'Indique se haverá categorias distintas de participação.';
  if (!choices.proof) return 'Indique se algum comprovante poderá ser necessário.';
  return null;
}

function stopRulesFor(choices) {
  const rules = [];
  if (choices.access === 'aprovacao-humana' || choices.access === 'somente-convite') {
    rules.push('responsavel-ausente');
  }
  if (choices.access === 'aprovacao-humana') {
    rules.push('criterio-aprovacao-indefinido');
  }
  if (choices.companion === 'com-acompanhante') {
    rules.push('acompanhante-sem-regra');
  }
  if (choices.categories === 'com-categorias') {
    rules.push('categoria-sem-finalidade');
  }
  if (choices.proof === 'com-comprovante') {
    rules.push('comprovante-sem-necessidade');
  }
  return rules;
}

function statusForDimension(dimension, value) {
  if (value === 'decidir-depois') return 'later';
  if (dimension === 'access' && (value === 'aprovacao-humana' || value === 'somente-convite')) return 'stop';
  if (dimension === 'companion' && value === 'com-acompanhante') return 'stop';
  if (dimension === 'categories' && value === 'com-categorias') return 'stop';
  if (dimension === 'proof' && value === 'com-comprovante') return 'stop';
  return 'planned';
}

function overallStatusFor(choices, rules) {
  if (rules.length > 0) return 'stop';
  if (
    choices.access === 'decidir-depois'
    || choices.companion === 'decidir-depois'
    || choices.categories === 'decidir-depois'
    || choices.proof === 'decidir-depois'
  ) {
    return 'later';
  }
  return 'planned';
}

function planParticipation(choices) {
  if (nextStepFor(choices)) return null;
  const rules = stopRulesFor(choices);
  return {
    overall: overallStatusFor(choices, rules),
    dimensions: {
      access: statusForDimension('access', choices.access),
      companion: statusForDimension('companion', choices.companion),
      categories: statusForDimension('categories', choices.categories),
      proof: statusForDimension('proof', choices.proof),
    },
    stopRules: rules,
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
  assert.match(page, /<h1>Planejar participação<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
  assert.match(page, /title: 'Planejar participação — orientação local'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /from ['"].*public-site-header['"]/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /<ParticipationPlanner \/>/u);
});

test('componente cliente isola as quatro dimensões com fieldset, legend, hint, rádios e decidir depois', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /['"]use client['"]/u);
  assert.equal([...planner.matchAll(/<fieldset\b/gu)].length, 1);
  assert.match(planner, /DIMENSIONS\.map\(\(dimension\) => <fieldset/u);
  assert.match(planner, /<legend>\{dimension\.legend\}<\/legend>/u);
  assert.match(planner, /aria-describedby=\{dimension\.hintId\}/u);
  assert.match(planner, /htmlFor=\{`\$\{dimension\.id\}-\$\{option\.id\}`\}/u);
  assert.match(planner, /type="radio"/u);
  assert.match(planner, /<button type="button"[^>]*onClick=\{restart\}/u);
  assert.match(planner, /Reiniciar escolhas/u);
  assert.match(planner, /aria-live="polite"/u);
  assert.match(planner, /role="status"/u);
  assert.match(planner, /aria-atomic="true"/u);
  assert.doesNotMatch(planner, /aria-live="assertive"/u);
  assert.doesNotMatch(planner, /<textarea\b/u);
  assert.doesNotMatch(planner, /type="text"|type="email"|type="tel"|type="url"|type="number"/u);
  assert.doesNotMatch(planner, /<select\b/u);
  assert.doesNotMatch(planner, /<form\b/u);

  assert.match(planner, /legend: 'Modelo de acesso'/u);
  assert.match(planner, /legend: 'Composição da participação'/u);
  assert.match(planner, /legend: 'Categorias de participação'/u);
  assert.match(planner, /legend: 'Comprovante'/u);
  assert.match(planner, /hintId: 'access-hint'/u);
  assert.match(planner, /hintId: 'companion-hint'/u);
  assert.match(planner, /hintId: 'categories-hint'/u);
  assert.match(planner, /hintId: 'proof-hint'/u);
  assert.match(planner, /id: 'decidir-depois'/u);
});

test('catálogos fechados das quatro dimensões, com decidir depois e sem campo livre', async () => {
  const planner = await source(PLANNER);
  const access = parseOptions(planner, 'export const ACCESS_OPTIONS', 'export const COMPANION_OPTIONS');
  const companion = parseOptions(planner, 'export const COMPANION_OPTIONS', 'export const CATEGORY_OPTIONS');
  const categories = parseOptions(planner, 'export const CATEGORY_OPTIONS', 'export const PROOF_OPTIONS');
  const proof = parseOptions(planner, 'export const PROOF_OPTIONS', 'export const STOP_RULES');

  assert.deepEqual(access.map((item) => item.id), ACCESS_IDS);
  assert.deepEqual(companion.map((item) => item.id), COMPANION_IDS);
  assert.deepEqual(categories.map((item) => item.id), CATEGORY_IDS);
  assert.deepEqual(proof.map((item) => item.id), PROOF_IDS);
  assert.deepEqual(
    access.map((item) => item.label),
    ['Aberto', 'Sujeito a aprovação humana', 'Somente por convite', 'Decidir depois'],
  );
  assert.deepEqual(
    companion.map((item) => item.label),
    ['Participação individual', 'Poderá admitir acompanhante', 'Decidir depois'],
  );
  assert.deepEqual(
    categories.map((item) => item.label),
    ['Sem categorias distintas', 'Haverá categorias distintas', 'Decidir depois'],
  );
  assert.deepEqual(
    proof.map((item) => item.label),
    ['Nenhum comprovante previsto', 'Algum comprovante poderá ser necessário', 'Decidir depois'],
  );

  for (const option of [...access, ...companion, ...categories, ...proof]) {
    assert.ok(option.help.length > 20, option.id);
  }

  assert.match(planner, /Finalidade, necessidade e tratamento devem ser definidos antes de qualquer coleta/u);
  assert.match(planner, /Decisão preliminar: não cria acompanhante/u);
  assert.match(planner, /Não peça nomes, preços ou regras aqui/u);
});

test('combinações completas geram resultado determinístico e incompletas orientam o próximo passo', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /if \(choices\.access === 'aprovacao-humana' \|\| choices\.access === 'somente-convite'\)/u);
  assert.match(planner, /if \(choices\.access === 'aprovacao-humana'\) \{\s*rules\.push\('criterio-aprovacao-indefinido'\)/u);
  assert.match(planner, /if \(choices\.companion === 'com-acompanhante'\) \{\s*rules\.push\('acompanhante-sem-regra'\)/u);
  assert.match(planner, /if \(choices\.categories === 'com-categorias'\) \{\s*rules\.push\('categoria-sem-finalidade'\)/u);
  assert.match(planner, /if \(choices\.proof === 'com-comprovante'\) \{\s*rules\.push\('comprovante-sem-necessidade'\)/u);

  assert.equal(planParticipation({ access: '', companion: '', categories: '', proof: '' }), null);
  assert.equal(nextStepFor({ access: '', companion: '', categories: '', proof: '' }), 'Escolha o modelo de acesso.');
  assert.equal(
    nextStepFor({ access: 'aberto', companion: '', categories: '', proof: '' }),
    'Indique se a participação será individual ou poderá admitir acompanhante.',
  );
  assert.equal(
    nextStepFor({ access: 'aberto', companion: 'individual', categories: '', proof: '' }),
    'Indique se haverá categorias distintas de participação.',
  );
  assert.equal(
    nextStepFor({ access: 'aberto', companion: 'individual', categories: 'sem-categorias', proof: '' }),
    'Indique se algum comprovante poderá ser necessário.',
  );

  const representative = [
    {
      choices: { access: 'aberto', companion: 'individual', categories: 'sem-categorias', proof: 'sem-comprovante' },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: { access: 'decidir-depois', companion: 'decidir-depois', categories: 'decidir-depois', proof: 'decidir-depois' },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: { access: 'aprovacao-humana', companion: 'individual', categories: 'sem-categorias', proof: 'sem-comprovante' },
      overall: 'stop',
      stopRules: ['responsavel-ausente', 'criterio-aprovacao-indefinido'],
    },
    {
      choices: { access: 'somente-convite', companion: 'individual', categories: 'sem-categorias', proof: 'sem-comprovante' },
      overall: 'stop',
      stopRules: ['responsavel-ausente'],
    },
    {
      choices: { access: 'aberto', companion: 'com-acompanhante', categories: 'sem-categorias', proof: 'sem-comprovante' },
      overall: 'stop',
      stopRules: ['acompanhante-sem-regra'],
    },
    {
      choices: { access: 'aberto', companion: 'individual', categories: 'com-categorias', proof: 'sem-comprovante' },
      overall: 'stop',
      stopRules: ['categoria-sem-finalidade'],
    },
    {
      choices: { access: 'aberto', companion: 'individual', categories: 'sem-categorias', proof: 'com-comprovante' },
      overall: 'stop',
      stopRules: ['comprovante-sem-necessidade'],
    },
    {
      choices: { access: 'aprovacao-humana', companion: 'com-acompanhante', categories: 'com-categorias', proof: 'com-comprovante' },
      overall: 'stop',
      stopRules: STOP_IDS,
    },
    {
      choices: { access: 'decidir-depois', companion: 'individual', categories: 'sem-categorias', proof: 'sem-comprovante' },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: { access: 'aprovacao-humana', companion: 'decidir-depois', categories: 'sem-categorias', proof: 'sem-comprovante' },
      overall: 'stop',
      stopRules: ['responsavel-ausente', 'criterio-aprovacao-indefinido'],
    },
  ];

  for (const item of representative) {
    const first = planParticipation(item.choices);
    const second = planParticipation(item.choices);
    assert.ok(first, JSON.stringify(item.choices));
    assert.deepEqual(first, second);
    assert.equal(first.overall, item.overall, JSON.stringify(item.choices));
    assert.deepEqual(first.stopRules, item.stopRules, JSON.stringify(item.choices));
  }

  let combinations = 0;
  const seenOverall = new Set();
  for (const access of ACCESS_IDS) {
    for (const companion of COMPANION_IDS) {
      for (const categories of CATEGORY_IDS) {
        for (const proof of PROOF_IDS) {
          const result = planParticipation({ access, companion, categories, proof });
          assert.ok(result, `${access}+${companion}+${categories}+${proof}`);
          assert.ok(STATUS_IDS.includes(result.overall), result.overall);
          seenOverall.add(result.overall);
          combinations += 1;
        }
      }
    }
  }
  assert.equal(combinations, 108);
  assert.deepEqual([...seenOverall].sort(), [...STATUS_IDS].sort());
});

test('stop rules surgem de forma previsível para escolhas que exigem decisão humana', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /id: 'responsavel-ausente',\s*title: 'Responsável ausente'/u);
  assert.match(planner, /id: 'criterio-aprovacao-indefinido',\s*title: 'Critério de aprovação indefinido'/u);
  assert.match(planner, /id: 'acompanhante-sem-regra',\s*title: 'Acompanhante sem regra própria'/u);
  assert.match(planner, /id: 'categoria-sem-finalidade',\s*title: 'Categoria sem finalidade'/u);
  assert.match(planner, /id: 'comprovante-sem-necessidade',\s*title: 'Comprovante sem necessidade justificada'/u);
  assert.match(planner, /Regras de parada/u);
  assert.match(planner, /data-stop=\{item\.id\}/u);

  assert.deepEqual(
    stopRulesFor({ access: 'aberto', companion: 'individual', categories: 'sem-categorias', proof: 'sem-comprovante' }),
    [],
  );
  assert.deepEqual(
    stopRulesFor({ access: 'somente-convite', companion: 'individual', categories: 'sem-categorias', proof: 'sem-comprovante' }),
    ['responsavel-ausente'],
  );
  assert.equal(
    stopRulesFor({ access: 'aberto', companion: 'individual', categories: 'sem-categorias', proof: 'sem-comprovante' }).includes('criterio-aprovacao-indefinido'),
    false,
  );
});

test('reinício restaura o estado inicial e o anuncia via aria-live', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /useState\(emptyChoices\)/u);
  assert.match(planner, /function restart\(\) \{\s*setChoices\(emptyChoices\(\)\);\s*setRestarted\(true\);/u);
  assert.match(planner, /Reiniciar escolhas/u);
  assert.match(planner, /Escolhas reiniciadas\. Nenhum resumo está visível\./u);
  assert.match(planner, /Nenhuma escolha feita\. O resumo aparece quando as quatro dimensões estiverem definidas\./u);
  assert.match(planner, /aria-live="polite"/u);
  assert.doesNotMatch(planner, /useEffect/u);
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

test('texto anti-claims deixa claro que a ferramenta não cria inscrição, convite, aprovação, categoria, acompanhante ou publicação', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.match(page, /ferramenta é orientativa/u);
  assert.match(page, /não cria inscrição, convite, aprovação,\s*categoria, acompanhante ou publicação/u);
  assert.match(page, /sem persistência/u);
  assert.match(page, /Não define permissão, autenticação/u);
  assert.match(page, /A EVA não decide/u);
  assert.match(planner, /não cria inscrição, convite, aprovação, categoria, acompanhante ou publicação/u);
  assert.match(planner, /Finalidade, necessidade e tratamento devem ser definidos antes de qualquer coleta/u);
  assert.match(planner, /Isso não é orientação jurídica conclusiva/u);

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
});

test('os três estados não dependem só de cor: texto, ícone e borda distinta', async () => {
  const [planner, css] = await Promise.all([source(PLANNER), source(CSS)]);

  assert.match(planner, /planned: Object\.freeze\(\{ id: 'planned', label: 'definido para planejar', icon: '●' \}\)/u);
  assert.match(planner, /later: Object\.freeze\(\{ id: 'later', label: 'decidir depois', icon: '○' \}\)/u);
  assert.match(planner, /stop: Object\.freeze\(\{ id: 'stop', label: 'pare e confirme', icon: '!' \}\)/u);
  assert.match(planner, /aria-hidden="true">\{item\.icon\}/u);
  assert.match(planner, /data-status=\{item\.status\}/u);
  assert.match(planner, /\{item\.statusLabel\}/u);
  assert.match(planner, /Estados do planejamento/u);
  assert.match(planner, /nunca só por cor/u);
  assert.match(planner, /Selecionado/u);

  for (const label of Object.values(STATUS_LABELS)) {
    assert.match(planner, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), label);
  }

  assert.match(css, /\.statusPlanned \{[\s\S]*border: 2px solid/u);
  assert.match(css, /\.statusLater \{[\s\S]*border: 2px dashed/u);
  assert.match(css, /\.statusStop \{[\s\S]*border: 4px double/u);
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
