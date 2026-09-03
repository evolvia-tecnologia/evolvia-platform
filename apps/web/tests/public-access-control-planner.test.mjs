import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { EVENT_PROFILE_GROUPS } from '../lib/event-profile-catalog.ts';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/planejar-controle-acesso/page.tsx';
const PLANNER = '../app/ajuda/planejar-controle-acesso/access-control-planner.tsx';
const CSS = '../app/ajuda/planejar-controle-acesso/planejar-controle-acesso.module.css';
const WIZARD = '../components/event-wizard.tsx';
const CATALOG = '../lib/event-profile-catalog.ts';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const SCENARIO_IDS = ['entrada-unica', 'multiplos-pontos', 'entrada-e-reentrada'];
const VALIDATION_IDS = ['lista-nominal', 'qr-emitido', 'decidir-depois'];
const AREAS_IDS = ['sem-acesso-distinto', 'com-acesso-distinto', 'decidir-depois'];
const FLOW_IDS = ['fluxo-distribuido', 'fluxo-moderado', 'pico'];
const CONTINGENCY_IDS = ['contingencia-prevista', 'sem-contingencia', 'decidir-depois'];
const STOP_IDS = [
  'responsavel-ausente',
  'ponto-sem-capacidade-definida',
  'reentrada-sem-politica',
  'area-restrita-sem-autorizacao',
  'contingencia-inexistente',
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
  /QR validado/iu,
  /permissão concedida/iu,
  /catraca aberta/iu,
  /presença registrada/iu,
  /disponibilidade operacional comprovada/iu,
  /compatibilidade de hardware certificada/iu,
  /acesso autorizado automaticamente/iu,
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
  if (!choices.scenario) return 'Escolha o cenário preliminar de entrada.';
  if (!choices.validation) return 'Escolha a forma conceitual de validação.';
  if (!choices.areas) return 'Indique se haverá áreas ou atividades com acesso distinto.';
  if (!choices.flow) return 'Escolha a faixa genérica de fluxo.';
  if (!choices.contingency) return 'Indique se haverá contingência manual ou offline.';
  return null;
}

function stopRulesFor(choices) {
  const rules = [];
  if (choices.scenario === 'multiplos-pontos') {
    rules.push('responsavel-ausente');
  }
  if (
    choices.flow === 'fluxo-moderado'
    || choices.flow === 'pico'
    || choices.scenario === 'multiplos-pontos'
  ) {
    rules.push('ponto-sem-capacidade-definida');
  }
  if (choices.scenario === 'entrada-e-reentrada') {
    rules.push('reentrada-sem-politica');
  }
  if (choices.areas === 'com-acesso-distinto') {
    rules.push('area-restrita-sem-autorizacao');
  }
  if (choices.contingency === 'sem-contingencia') {
    rules.push('contingencia-inexistente');
  }
  return rules;
}

function statusForDimension(dimension, value) {
  if (value === 'decidir-depois') return 'later';
  if (dimension === 'scenario' && (value === 'multiplos-pontos' || value === 'entrada-e-reentrada')) return 'stop';
  if (dimension === 'areas' && value === 'com-acesso-distinto') return 'stop';
  if (dimension === 'flow' && (value === 'fluxo-moderado' || value === 'pico')) return 'stop';
  if (dimension === 'contingency' && value === 'sem-contingencia') return 'stop';
  return 'planned';
}

function overallStatusFor(choices, rules) {
  if (rules.length > 0) return 'stop';
  if (
    choices.validation === 'decidir-depois'
    || choices.areas === 'decidir-depois'
    || choices.contingency === 'decidir-depois'
  ) {
    return 'later';
  }
  return 'planned';
}

function planAccessControl(choices) {
  if (nextStepFor(choices)) return null;
  const rules = stopRulesFor(choices);
  return {
    overall: overallStatusFor(choices, rules),
    dimensions: {
      scenario: statusForDimension('scenario', choices.scenario),
      validation: statusForDimension('validation', choices.validation),
      areas: statusForDimension('areas', choices.areas),
      flow: statusForDimension('flow', choices.flow),
      contingency: statusForDimension('contingency', choices.contingency),
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
  assert.match(page, /<h1>Planejar controle de acesso<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
  assert.match(page, /title: 'Planejar controle de acesso — orientação local'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /from ['"].*public-site-header['"]/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /<AccessControlPlanner \/>/u);
});

test('componente cliente isola as cinco dimensões com fieldset, legend, hint, rádios e decidir depois', async () => {
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
  assert.doesNotMatch(planner, /type="text"|type="email"|type="tel"|type="url"|type="number"|type="file"|type="search"/u);
  assert.doesNotMatch(planner, /<select\b/u);
  assert.doesNotMatch(planner, /<form\b/u);
  assert.doesNotMatch(planner, /type="checkbox"/u);

  assert.match(planner, /legend: 'Cenário preliminar de entrada'/u);
  assert.match(planner, /legend: 'Forma conceitual de validação'/u);
  assert.match(planner, /legend: 'Áreas ou atividades com acesso distinto'/u);
  assert.match(planner, /legend: 'Faixa genérica de fluxo'/u);
  assert.match(planner, /legend: 'Contingência manual ou offline'/u);
  assert.match(planner, /hintId: 'scenario-hint'/u);
  assert.match(planner, /hintId: 'validation-hint'/u);
  assert.match(planner, /hintId: 'areas-hint'/u);
  assert.match(planner, /hintId: 'flow-hint'/u);
  assert.match(planner, /hintId: 'contingency-hint'/u);
  assert.match(planner, /id: 'decidir-depois'/u);
});

test('catálogos fechados das cinco dimensões, com decidir depois e sem campo livre', async () => {
  const planner = await source(PLANNER);
  const scenario = parseOptions(planner, 'export const SCENARIO_OPTIONS', 'export const VALIDATION_OPTIONS');
  const validation = parseOptions(planner, 'export const VALIDATION_OPTIONS', 'export const AREAS_OPTIONS');
  const areas = parseOptions(planner, 'export const AREAS_OPTIONS', 'export const FLOW_OPTIONS');
  const flow = parseOptions(planner, 'export const FLOW_OPTIONS', 'export const CONTINGENCY_OPTIONS');
  const contingency = parseOptions(planner, 'export const CONTINGENCY_OPTIONS', 'export const STOP_RULES');

  assert.deepEqual(scenario.map((item) => item.id), SCENARIO_IDS);
  assert.deepEqual(validation.map((item) => item.id), VALIDATION_IDS);
  assert.deepEqual(areas.map((item) => item.id), AREAS_IDS);
  assert.deepEqual(flow.map((item) => item.id), FLOW_IDS);
  assert.deepEqual(contingency.map((item) => item.id), CONTINGENCY_IDS);
  assert.deepEqual(
    scenario.map((item) => item.label),
    ['Entrada única', 'Múltiplos pontos', 'Entrada e reentrada'],
  );
  assert.deepEqual(
    validation.map((item) => item.label),
    ['Lista nominal', 'QR previamente emitido', 'Decidir depois'],
  );
  assert.deepEqual(
    areas.map((item) => item.label),
    ['Sem áreas ou atividades de acesso distinto', 'Haverá áreas ou atividades com acesso distinto', 'Decidir depois'],
  );
  assert.deepEqual(
    flow.map((item) => item.label),
    ['Fluxo distribuído', 'Fluxo moderado', 'Pico'],
  );
  assert.deepEqual(
    contingency.map((item) => item.label),
    ['Contingência manual ou offline prevista', 'Sem contingência prevista', 'Decidir depois'],
  );

  for (const option of [...scenario, ...validation, ...areas, ...flow, ...contingency]) {
    assert.ok(option.help.length > 20, option.id);
  }

  assert.match(planner, /Não peça nome, documento ou dado pessoal nesta página/u);
  assert.match(planner, /não lê, não valida e não pede QR/u);
  assert.match(planner, /não cria autorização, não nomeia área e não concede permissão/u);
  assert.match(planner, /Não informe quantidade real de pessoas/u);
  assert.match(planner, /não sincroniza e não implementa fallback/u);
});

test('combinações completas geram resultado determinístico e incompletas orientam o próximo passo', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /if \(choices\.scenario === 'multiplos-pontos'\) \{\s*rules\.push\('responsavel-ausente'\)/u);
  assert.match(planner, /if \(\s*choices\.flow === 'fluxo-moderado'\s*\|\| choices\.flow === 'pico'\s*\|\| choices\.scenario === 'multiplos-pontos'\s*\) \{\s*rules\.push\('ponto-sem-capacidade-definida'\)/u);
  assert.match(planner, /if \(choices\.scenario === 'entrada-e-reentrada'\) \{\s*rules\.push\('reentrada-sem-politica'\)/u);
  assert.match(planner, /if \(choices\.areas === 'com-acesso-distinto'\) \{\s*rules\.push\('area-restrita-sem-autorizacao'\)/u);
  assert.match(planner, /if \(choices\.contingency === 'sem-contingencia'\) \{\s*rules\.push\('contingencia-inexistente'\)/u);

  assert.equal(planAccessControl({
    scenario: '', validation: '', areas: '', flow: '', contingency: '',
  }), null);
  assert.equal(
    nextStepFor({ scenario: '', validation: '', areas: '', flow: '', contingency: '' }),
    'Escolha o cenário preliminar de entrada.',
  );
  assert.equal(
    nextStepFor({ scenario: 'entrada-unica', validation: '', areas: '', flow: '', contingency: '' }),
    'Escolha a forma conceitual de validação.',
  );
  assert.equal(
    nextStepFor({
      scenario: 'entrada-unica', validation: 'lista-nominal', areas: '', flow: '', contingency: '',
    }),
    'Indique se haverá áreas ou atividades com acesso distinto.',
  );
  assert.equal(
    nextStepFor({
      scenario: 'entrada-unica',
      validation: 'lista-nominal',
      areas: 'sem-acesso-distinto',
      flow: '',
      contingency: '',
    }),
    'Escolha a faixa genérica de fluxo.',
  );
  assert.equal(
    nextStepFor({
      scenario: 'entrada-unica',
      validation: 'lista-nominal',
      areas: 'sem-acesso-distinto',
      flow: 'fluxo-distribuido',
      contingency: '',
    }),
    'Indique se haverá contingência manual ou offline.',
  );

  const representative = [
    {
      choices: {
        scenario: 'entrada-unica',
        validation: 'lista-nominal',
        areas: 'sem-acesso-distinto',
        flow: 'fluxo-distribuido',
        contingency: 'contingencia-prevista',
      },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: {
        scenario: 'entrada-unica',
        validation: 'qr-emitido',
        areas: 'sem-acesso-distinto',
        flow: 'fluxo-distribuido',
        contingency: 'contingencia-prevista',
      },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: {
        scenario: 'entrada-unica',
        validation: 'decidir-depois',
        areas: 'decidir-depois',
        flow: 'fluxo-distribuido',
        contingency: 'decidir-depois',
      },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: {
        scenario: 'multiplos-pontos',
        validation: 'lista-nominal',
        areas: 'sem-acesso-distinto',
        flow: 'fluxo-distribuido',
        contingency: 'contingencia-prevista',
      },
      overall: 'stop',
      stopRules: ['responsavel-ausente', 'ponto-sem-capacidade-definida'],
    },
    {
      choices: {
        scenario: 'entrada-e-reentrada',
        validation: 'lista-nominal',
        areas: 'sem-acesso-distinto',
        flow: 'fluxo-distribuido',
        contingency: 'contingencia-prevista',
      },
      overall: 'stop',
      stopRules: ['reentrada-sem-politica'],
    },
    {
      choices: {
        scenario: 'entrada-unica',
        validation: 'lista-nominal',
        areas: 'com-acesso-distinto',
        flow: 'fluxo-distribuido',
        contingency: 'contingencia-prevista',
      },
      overall: 'stop',
      stopRules: ['area-restrita-sem-autorizacao'],
    },
    {
      choices: {
        scenario: 'entrada-unica',
        validation: 'lista-nominal',
        areas: 'sem-acesso-distinto',
        flow: 'fluxo-moderado',
        contingency: 'contingencia-prevista',
      },
      overall: 'stop',
      stopRules: ['ponto-sem-capacidade-definida'],
    },
    {
      choices: {
        scenario: 'entrada-unica',
        validation: 'lista-nominal',
        areas: 'sem-acesso-distinto',
        flow: 'pico',
        contingency: 'contingencia-prevista',
      },
      overall: 'stop',
      stopRules: ['ponto-sem-capacidade-definida'],
    },
    {
      choices: {
        scenario: 'entrada-unica',
        validation: 'lista-nominal',
        areas: 'sem-acesso-distinto',
        flow: 'fluxo-distribuido',
        contingency: 'sem-contingencia',
      },
      overall: 'stop',
      stopRules: ['contingencia-inexistente'],
    },
    {
      choices: {
        scenario: 'multiplos-pontos',
        validation: 'qr-emitido',
        areas: 'com-acesso-distinto',
        flow: 'pico',
        contingency: 'sem-contingencia',
      },
      overall: 'stop',
      stopRules: [
        'responsavel-ausente',
        'ponto-sem-capacidade-definida',
        'area-restrita-sem-autorizacao',
        'contingencia-inexistente',
      ],
    },
    {
      choices: {
        scenario: 'entrada-unica',
        validation: 'decidir-depois',
        areas: 'sem-acesso-distinto',
        flow: 'fluxo-distribuido',
        contingency: 'contingencia-prevista',
      },
      overall: 'later',
      stopRules: [],
    },
  ];

  for (const item of representative) {
    const first = planAccessControl(item.choices);
    const second = planAccessControl(item.choices);
    assert.ok(first, JSON.stringify(item.choices));
    assert.deepEqual(first, second);
    assert.equal(first.overall, item.overall, JSON.stringify(item.choices));
    assert.deepEqual(first.stopRules, item.stopRules, JSON.stringify(item.choices));
  }

  let combinations = 0;
  const seenOverall = new Set();
  for (const scenario of SCENARIO_IDS) {
    for (const validation of VALIDATION_IDS) {
      for (const areas of AREAS_IDS) {
        for (const flow of FLOW_IDS) {
          for (const contingency of CONTINGENCY_IDS) {
            const result = planAccessControl({
              scenario, validation, areas, flow, contingency,
            });
            assert.ok(result, `${scenario}+${validation}+${areas}+${flow}+${contingency}`);
            assert.ok(STATUS_IDS.includes(result.overall), result.overall);
            seenOverall.add(result.overall);
            combinations += 1;
          }
        }
      }
    }
  }
  assert.equal(combinations, 243);
  assert.deepEqual([...seenOverall].sort(), [...STATUS_IDS].sort());
});

test('stop rules surgem de forma previsível e nenhuma combinação autoriza operação real', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /id: 'responsavel-ausente',\s*title: 'Responsável ausente'/u);
  assert.match(planner, /id: 'ponto-sem-capacidade-definida',\s*title: 'Ponto sem capacidade definida'/u);
  assert.match(planner, /id: 'reentrada-sem-politica',\s*title: 'Reentrada sem política'/u);
  assert.match(planner, /id: 'area-restrita-sem-autorizacao',\s*title: 'Área restrita sem autorização'/u);
  assert.match(planner, /id: 'contingencia-inexistente',\s*title: 'Contingência inexistente'/u);
  assert.match(planner, /Regras de parada/u);
  assert.match(planner, /data-stop=\{item\.id\}/u);
  assert.match(planner, /Nenhuma combinação\s+autoriza operação real/u);

  assert.deepEqual(
    stopRulesFor({
      scenario: 'entrada-unica',
      validation: 'lista-nominal',
      areas: 'sem-acesso-distinto',
      flow: 'fluxo-distribuido',
      contingency: 'contingencia-prevista',
    }),
    [],
  );
  assert.deepEqual(
    stopRulesFor({
      scenario: 'multiplos-pontos',
      validation: 'lista-nominal',
      areas: 'sem-acesso-distinto',
      flow: 'fluxo-distribuido',
      contingency: 'contingencia-prevista',
    }),
    ['responsavel-ausente', 'ponto-sem-capacidade-definida'],
  );
  assert.equal(
    stopRulesFor({
      scenario: 'entrada-unica',
      validation: 'qr-emitido',
      areas: 'sem-acesso-distinto',
      flow: 'fluxo-distribuido',
      contingency: 'contingencia-prevista',
    }).includes('area-restrita-sem-autorizacao'),
    false,
  );
});

test('orientação de entretenimento deriva da política canônica em leitura, sem segunda taxonomia', async () => {
  const [page, planner, wizard, catalog] = await Promise.all([
    source(PAGE),
    source(PLANNER),
    source(WIZARD),
    source(CATALOG),
  ]);
  const owned = `${page}\n${planner}`;
  const entertainment = EVENT_PROFILE_GROUPS.find((group) => group.id === 'entertainment');

  assert.ok(entertainment);
  assert.equal(EVENT_PROFILE_GROUPS.flatMap((group) => group.options).length, 19);
  assert.deepEqual(
    entertainment.options.map((option) => option.value),
    ['Show ou entretenimento', 'Festival'],
  );

  assert.match(page, /from ['"].*event-profile-catalog['"]/u);
  assert.match(page, /EVENT_PROFILE_GROUPS\.find\(\(group\) => group\.id === 'entertainment'\)/u);
  assert.match(page, /entertainmentGroup\.options\.map\(\(option\) =>/u);
  assert.match(page, /\{option\.title\}/u);
  assert.match(page, /\{option\.value\}/u);
  assert.doesNotMatch(page, /Show ou entretenimento/u);
  assert.doesNotMatch(page, /'Festival'/u);

  assert.match(wizard, /entertainment: \['access_control'\]/u);
  assert.match(wizard, /const WIZARD_REQUIRED_CAPABILITIES = \{[\s\S]*allProfiles: \['registration'\],[\s\S]*entertainment: \['access_control'\],[\s\S]*\} as const;/u);
  assert.match(catalog, /id: 'entertainment'/u);

  assert.match(page, /<code>access_control<\/code>/u);
  assert.match(page, /estrutural/u);
  assert.match(page, /família \{entertainmentGroup\.label\}/u);
  assert.match(page, /não altera o\s+catálogo e não cria uma regra paralela/u);
  assert.match(planner, /não altera o catálogo dos\s+19 tipos nem cria regra paralela/u);

  assert.doesNotMatch(owned, /WIZARD_REQUIRED_CAPABILITIES/u);
  assert.doesNotMatch(owned, /getRequiredWizardCapabilities/u);
  assert.doesNotMatch(owned, /EventProfileCode/u);
  assert.doesNotMatch(owned, /wizard-policy/u);
  assert.doesNotMatch(planner, /EVENT_PROFILE_GROUPS/u);
  assert.doesNotMatch(owned, /allProfiles:\s*\[/u);
});

test('reinício restaura o estado inicial e o anuncia via aria-live', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /useState\(emptyChoices\)/u);
  assert.match(planner, /function restart\(\) \{\s*setChoices\(emptyChoices\(\)\);\s*setRestarted\(true\);/u);
  assert.match(planner, /Reiniciar escolhas/u);
  assert.match(planner, /Escolhas reiniciadas\. Nenhum resumo está visível\./u);
  assert.match(planner, /Nenhuma escolha feita\. O resumo aparece quando as cinco dimensões estiverem definidas\./u);
  assert.match(planner, /aria-live="polite"/u);
  assert.doesNotMatch(planner, /useEffect/u);
});

test('não há persistência, fetch, submit, hardware, câmera, PII nem HTML inseguro', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.doesNotMatch(combined, /localStorage|sessionStorage|indexedDB|document\.cookie/u);
  assert.doesNotMatch(combined, /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/u);
  assert.doesNotMatch(combined, /<form\b/u);
  assert.doesNotMatch(combined, /type="submit"|action=|method=/u);
  assert.doesNotMatch(combined, /dangerouslySetInnerHTML|innerHTML/u);
  assert.doesNotMatch(combined, /gtag\(|google-analytics|fbq\(|navigator\.sendBeacon/iu);
  assert.doesNotMatch(planner, /window\.|document\./u);
  assert.doesNotMatch(combined, /getUserMedia|mediaDevices|BarcodeDetector|webkitGetUserMedia/u);
  assert.doesNotMatch(combined, /navigator\.usb|navigator\.serial|navigator\.bluetooth|WebUSB|WebNFC/u);
  assert.doesNotMatch(combined, /RFID|reconhecimento facial|face-api|kiosk/iu);
  assert.doesNotMatch(combined, /placeholder="[^"]*"|autocomplete=/u);
});

test('texto anti-claims deixa claro que a ferramenta não valida QR, não concede permissão, não abre catraca e não registra presença', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.match(page, /ferramenta é\s+orientativa/u);
  assert.match(page, /não valida QR, não concede permissão, não abre catraca e\s+não registra presença/u);
  assert.match(page, /sem persistência/u);
  assert.match(page, /Não configura ponto,\s*leitor, câmera, rede/u);
  assert.match(page, /Nenhuma combinação autoriza operação real/u);
  assert.match(page, /A EVA não decide/u);
  assert.match(page, /não afirma disponibilidade operacional, compatibilidade\s*de hardware, segurança de acesso nem certificação/u);
  assert.match(planner, /não valida QR, não concede permissão, não abre catraca e não registra presença/u);
  assert.match(planner, /não lê, não valida e não pede QR/u);
  assert.match(planner, /não cria ACL, não concede permissão/u);

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
