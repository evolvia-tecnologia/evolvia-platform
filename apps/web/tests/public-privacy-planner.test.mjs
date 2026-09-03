import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/planejar-privacidade/page.tsx';
const PLANNER = '../app/ajuda/planejar-privacidade/privacy-planner.tsx';
const CSS = '../app/ajuda/planejar-privacidade/planejar-privacidade.module.css';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const PURPOSE_IDS = ['inscricao', 'comunicacao-operacional', 'credenciamento', 'certificado', 'decidir-depois'];
const DATA_IDS = ['identificacao-basica', 'contato', 'vinculo-profissional', 'acessibilidade', 'decidir-depois'];
const RETENTION_IDS = ['excluir-apos-finalidade', 'manter-prazo-definido', 'decidir-depois'];
const SHARING_IDS = ['sem-compartilhamento', 'com-compartilhamento', 'decidir-depois'];
const STOP_IDS = [
  'finalidade-ausente',
  'dado-sem-necessidade',
  'retencao-indefinida',
  'compartilhamento-sem-responsavel',
  'dado-sensivel-sem-revisao',
];
const STATUS_IDS = ['planned', 'later', 'stop'];
const STATUS_LABELS = {
  planned: 'definido para planejar',
  later: 'decidir depois',
  stop: 'pare e confirme',
};

const NEEDED_DATA = {
  inscricao: ['identificacao-basica', 'contato'],
  'comunicacao-operacional': ['contato'],
  credenciamento: ['identificacao-basica'],
  certificado: ['identificacao-basica', 'vinculo-profissional'],
};

const VIEWPORTS = [320, 768, 1280, 1440];

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
  /ficha criada/iu,
  /inscrição criada/iu,
  /tratamento autorizado/iu,
  /política alterada/iu,
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
  if (!choices.purpose) return 'Escolha a finalidade inicial.';
  if (!choices.data) return 'Indique a categoria mínima de dados prevista.';
  if (!choices.retention) return 'Escolha a diretriz preliminar de retenção.';
  if (!choices.sharing) return 'Indique se haverá compartilhamento operacional com fornecedor.';
  return null;
}

function dataHasNeed(purpose, data) {
  if (data === 'acessibilidade' || data === 'decidir-depois' || !data) return true;
  if (purpose === 'decidir-depois' || !purpose) return false;
  return NEEDED_DATA[purpose].includes(data);
}

function stopRulesFor(choices) {
  const rules = [];
  if (choices.purpose === 'decidir-depois') {
    rules.push('finalidade-ausente');
  }
  if (choices.data && choices.data !== 'decidir-depois' && choices.data !== 'acessibilidade' && !dataHasNeed(choices.purpose, choices.data)) {
    rules.push('dado-sem-necessidade');
  }
  if (choices.retention === 'decidir-depois') {
    rules.push('retencao-indefinida');
  }
  if (choices.sharing === 'com-compartilhamento') {
    rules.push('compartilhamento-sem-responsavel');
  }
  if (choices.data === 'acessibilidade') {
    rules.push('dado-sensivel-sem-revisao');
  }
  return rules;
}

function overallStatusFor(choices, rules) {
  if (rules.length > 0) return 'stop';
  if (
    choices.purpose === 'decidir-depois'
    || choices.data === 'decidir-depois'
    || choices.retention === 'decidir-depois'
    || choices.sharing === 'decidir-depois'
  ) {
    return 'later';
  }
  return 'planned';
}

function planPrivacy(choices) {
  if (nextStepFor(choices)) return null;
  const rules = stopRulesFor(choices);
  return {
    overall: overallStatusFor(choices, rules),
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
  assert.match(page, /<h1>Planejar privacidade<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
  assert.match(page, /title: 'Planejar privacidade — orientação local'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /from ['"].*public-site-header['"]/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /<PrivacyPlanner \/>/u);
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

  assert.match(planner, /legend: 'Finalidade inicial'/u);
  assert.match(planner, /legend: 'Categoria mínima de dados'/u);
  assert.match(planner, /legend: 'Diretriz preliminar de retenção'/u);
  assert.match(planner, /legend: 'Compartilhamento operacional'/u);
  assert.match(planner, /hintId: 'purpose-hint'/u);
  assert.match(planner, /hintId: 'data-hint'/u);
  assert.match(planner, /hintId: 'retention-hint'/u);
  assert.match(planner, /hintId: 'sharing-hint'/u);
  assert.match(planner, /id: 'decidir-depois'/u);
});

test('catálogos fechados das quatro dimensões, com decidir depois e sem campo livre', async () => {
  const planner = await source(PLANNER);
  const purpose = parseOptions(planner, 'export const PURPOSE_OPTIONS', 'export const DATA_OPTIONS');
  const data = parseOptions(planner, 'export const DATA_OPTIONS', 'export const RETENTION_OPTIONS');
  const retention = parseOptions(planner, 'export const RETENTION_OPTIONS', 'export const SHARING_OPTIONS');
  const sharing = parseOptions(planner, 'export const SHARING_OPTIONS', 'export const STOP_RULES');

  assert.deepEqual(purpose.map((item) => item.id), PURPOSE_IDS);
  assert.deepEqual(data.map((item) => item.id), DATA_IDS);
  assert.deepEqual(retention.map((item) => item.id), RETENTION_IDS);
  assert.deepEqual(sharing.map((item) => item.id), SHARING_IDS);
  assert.deepEqual(
    purpose.map((item) => item.label),
    ['Inscrição', 'Comunicação operacional', 'Credenciamento ou acesso', 'Emissão de certificado', 'Decidir depois'],
  );
  assert.deepEqual(
    data.map((item) => item.label),
    ['Identificação básica', 'Contato', 'Vínculo profissional', 'Necessidade de acessibilidade', 'Decidir depois'],
  );
  assert.deepEqual(
    retention.map((item) => item.label),
    ['Excluir após a finalidade', 'Manter por prazo definido', 'Decidir depois'],
  );
  assert.deepEqual(
    sharing.map((item) => item.label),
    ['Sem compartilhamento operacional', 'Haverá compartilhamento operacional', 'Decidir depois'],
  );

  for (const option of [...purpose, ...data, ...retention, ...sharing]) {
    assert.ok(option.help.length > 20, option.id);
  }

  assert.match(planner, /Categoria potencialmente sensível/u);
  assert.match(planner, /Não define prazo jurídico/u);
  assert.match(planner, /Não nomeia fornecedor/u);
});

test('combinações completas geram resultado determinístico e incompletas orientam o próximo passo', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /if \(choices\.purpose === 'decidir-depois'\) \{\s*rules\.push\('finalidade-ausente'\)/u);
  assert.match(planner, /if \(choices\.retention === 'decidir-depois'\) \{\s*rules\.push\('retencao-indefinida'\)/u);
  assert.match(planner, /if \(choices\.sharing === 'com-compartilhamento'\) \{\s*rules\.push\('compartilhamento-sem-responsavel'\)/u);
  assert.match(planner, /if \(choices\.data === 'acessibilidade'\) \{\s*rules\.push\('dado-sensivel-sem-revisao'\)/u);
  assert.match(planner, /rules\.push\('dado-sem-necessidade'\)/u);

  assert.equal(planPrivacy({ purpose: '', data: '', retention: '', sharing: '' }), null);
  assert.equal(nextStepFor({ purpose: '', data: '', retention: '', sharing: '' }), 'Escolha a finalidade inicial.');
  assert.equal(
    nextStepFor({ purpose: 'inscricao', data: '', retention: '', sharing: '' }),
    'Indique a categoria mínima de dados prevista.',
  );
  assert.equal(
    nextStepFor({ purpose: 'inscricao', data: 'identificacao-basica', retention: '', sharing: '' }),
    'Escolha a diretriz preliminar de retenção.',
  );
  assert.equal(
    nextStepFor({ purpose: 'inscricao', data: 'identificacao-basica', retention: 'excluir-apos-finalidade', sharing: '' }),
    'Indique se haverá compartilhamento operacional com fornecedor.',
  );

  const representative = [
    {
      choices: { purpose: 'inscricao', data: 'identificacao-basica', retention: 'excluir-apos-finalidade', sharing: 'sem-compartilhamento' },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: { purpose: 'comunicacao-operacional', data: 'contato', retention: 'manter-prazo-definido', sharing: 'sem-compartilhamento' },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: { purpose: 'credenciamento', data: 'identificacao-basica', retention: 'excluir-apos-finalidade', sharing: 'decidir-depois' },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: { purpose: 'certificado', data: 'decidir-depois', retention: 'manter-prazo-definido', sharing: 'sem-compartilhamento' },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: { purpose: 'decidir-depois', data: 'decidir-depois', retention: 'excluir-apos-finalidade', sharing: 'sem-compartilhamento' },
      overall: 'stop',
      stopRules: ['finalidade-ausente'],
    },
    {
      choices: { purpose: 'comunicacao-operacional', data: 'identificacao-basica', retention: 'excluir-apos-finalidade', sharing: 'sem-compartilhamento' },
      overall: 'stop',
      stopRules: ['dado-sem-necessidade'],
    },
    {
      choices: { purpose: 'inscricao', data: 'vinculo-profissional', retention: 'excluir-apos-finalidade', sharing: 'sem-compartilhamento' },
      overall: 'stop',
      stopRules: ['dado-sem-necessidade'],
    },
    {
      choices: { purpose: 'inscricao', data: 'identificacao-basica', retention: 'decidir-depois', sharing: 'sem-compartilhamento' },
      overall: 'stop',
      stopRules: ['retencao-indefinida'],
    },
    {
      choices: { purpose: 'inscricao', data: 'identificacao-basica', retention: 'excluir-apos-finalidade', sharing: 'com-compartilhamento' },
      overall: 'stop',
      stopRules: ['compartilhamento-sem-responsavel'],
    },
    {
      choices: { purpose: 'inscricao', data: 'acessibilidade', retention: 'excluir-apos-finalidade', sharing: 'sem-compartilhamento' },
      overall: 'stop',
      stopRules: ['dado-sensivel-sem-revisao'],
    },
    {
      choices: { purpose: 'decidir-depois', data: 'vinculo-profissional', retention: 'decidir-depois', sharing: 'com-compartilhamento' },
      overall: 'stop',
      stopRules: ['finalidade-ausente', 'dado-sem-necessidade', 'retencao-indefinida', 'compartilhamento-sem-responsavel'],
    },
    {
      choices: { purpose: 'certificado', data: 'contato', retention: 'manter-prazo-definido', sharing: 'sem-compartilhamento' },
      overall: 'stop',
      stopRules: ['dado-sem-necessidade'],
    },
  ];

  for (const item of representative) {
    const first = planPrivacy(item.choices);
    const second = planPrivacy(item.choices);
    assert.ok(first, JSON.stringify(item.choices));
    assert.deepEqual(first, second);
    assert.equal(first.overall, item.overall, JSON.stringify(item.choices));
    assert.deepEqual(first.stopRules, item.stopRules, JSON.stringify(item.choices));
  }

  let combinations = 0;
  const seenOverall = new Set();
  const seenStops = new Set();
  for (const purpose of PURPOSE_IDS) {
    for (const data of DATA_IDS) {
      for (const retention of RETENTION_IDS) {
        for (const sharing of SHARING_IDS) {
          const result = planPrivacy({ purpose, data, retention, sharing });
          assert.ok(result, `${purpose}+${data}+${retention}+${sharing}`);
          assert.ok(STATUS_IDS.includes(result.overall), result.overall);
          seenOverall.add(result.overall);
          for (const rule of result.stopRules) seenStops.add(rule);
          combinations += 1;
        }
      }
    }
  }
  assert.equal(combinations, 225);
  assert.deepEqual([...seenOverall].sort(), [...STATUS_IDS].sort());
  assert.deepEqual([...seenStops].sort(), [...STOP_IDS].sort());
});

test('stop rules surgem de forma previsível e nenhuma combinação afirma conformidade automática', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /id: 'finalidade-ausente',\s*title: 'Finalidade ausente'/u);
  assert.match(planner, /id: 'dado-sem-necessidade',\s*title: 'Dado sem necessidade'/u);
  assert.match(planner, /id: 'retencao-indefinida',\s*title: 'Retenção indefinida'/u);
  assert.match(planner, /id: 'compartilhamento-sem-responsavel',\s*title: 'Compartilhamento sem responsável ou base documentada'/u);
  assert.match(planner, /id: 'dado-sensivel-sem-revisao',\s*title: 'Dado sensível sem revisão humana'/u);
  assert.match(planner, /Regras de parada/u);
  assert.match(planner, /data-stop=\{item\.id\}/u);
  assert.match(planner, /não afirma conformidade/u);

  assert.deepEqual(
    stopRulesFor({ purpose: 'inscricao', data: 'contato', retention: 'excluir-apos-finalidade', sharing: 'sem-compartilhamento' }),
    [],
  );
  assert.deepEqual(
    stopRulesFor({ purpose: 'credenciamento', data: 'contato', retention: 'excluir-apos-finalidade', sharing: 'sem-compartilhamento' }),
    ['dado-sem-necessidade'],
  );
  assert.equal(
    stopRulesFor({ purpose: 'inscricao', data: 'identificacao-basica', retention: 'excluir-apos-finalidade', sharing: 'sem-compartilhamento' }).includes('dado-sensivel-sem-revisao'),
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

test('texto anti-claims deixa claro que a ferramenta não coleta, não autoriza tratamento e não configura o evento', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.match(page, /ferramenta é orientativa/u);
  assert.match(page, /não coleta, não salva, não transmite, não\s*autoriza tratamento, não altera política e não configura o evento/u);
  assert.match(page, /sem persistência/u);
  assert.match(page, /Não escolhe base legal/u);
  assert.match(page, /A EVA não decide/u);
  assert.match(page, /não afirma conformidade/u);
  assert.match(planner, /não coleta, não salva, não transmite, não autoriza tratamento, não altera política e não configura o evento/u);
  assert.match(planner, /Categoria potencialmente sensível/u);
  assert.match(planner, /exige revisão humana/u);
  assert.match(planner, /não afirma conformidade/u);

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
