import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { EVENT_PROFILE_GROUPS } from '../lib/event-profile-catalog.ts';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/planejar-expositores/page.tsx';
const PLANNER = '../app/ajuda/planejar-expositores/exhibitors-planner.tsx';
const CSS = '../app/ajuda/planejar-expositores/planejar-expositores.module.css';
const CATALOG = '../lib/event-profile-catalog.ts';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const MODEL_IDS = ['estande-fisico', 'presenca-digital', 'patrocinio-sem-estande', 'decidir-depois'];
const ORIGIN_IDS = ['convite', 'venda-futura', 'curadoria', 'decidir-depois'];
const PROFILE_IDS = ['perfil-previsto', 'sem-perfil-publico', 'decidir-depois'];
const INFRASTRUCTURE_IDS = ['infraestrutura-prevista', 'sem-infraestrutura', 'decidir-depois'];
const TEAM_IDS = ['credenciais-previstas', 'sem-credenciais-equipe', 'decidir-depois'];
const LEADS_IDS = ['leads-previstos', 'sem-coleta-de-leads', 'decidir-depois'];
const CONCURRENCY_IDS = ['simultaneidade-espacada', 'simultaneidade-moderada', 'pico'];
const STOP_IDS = [
  'responsavel-ausente',
  'espaco-sem-capacidade',
  'infraestrutura-sem-validacao',
  'perfil-sem-autorizacao',
  'equipe-sem-regra-de-credenciamento',
  'leads-sem-finalidade-consentimento',
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
  /estande vendido/iu,
  /espaço reservado/iu,
  /expositor cadastrado/iu,
  /lead coletado/iu,
  /lead capturado/iu,
  /reserva confirmada/iu,
  /contratação concluída/iu,
  /disponibilidade comprovada/iu,
  /autorização concedida/iu,
  /conformidade certificada/iu,
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
  if (!choices.model) return 'Escolha o modelo preliminar de presença.';
  if (!choices.origin) return 'Escolha a origem conceitual.';
  if (!choices.publicProfile) return 'Indique a necessidade futura de perfil público.';
  if (!choices.infrastructure) return 'Indique a necessidade conceitual de infraestrutura.';
  if (!choices.teamCredentials) return 'Indique a necessidade conceitual de credenciais de equipe.';
  if (!choices.leads) return 'Indique a necessidade conceitual de coleta de leads.';
  if (!choices.concurrency) return 'Escolha a faixa genérica de simultaneidade.';
  return null;
}

function stopRulesFor(choices) {
  const rules = [];
  if (choices.model === 'estande-fisico') {
    rules.push('responsavel-ausente');
  }
  if (
    choices.model === 'estande-fisico'
    || choices.concurrency === 'simultaneidade-moderada'
    || choices.concurrency === 'pico'
  ) {
    rules.push('espaco-sem-capacidade');
  }
  if (choices.infrastructure === 'infraestrutura-prevista') {
    rules.push('infraestrutura-sem-validacao');
  }
  if (choices.publicProfile === 'perfil-previsto') {
    rules.push('perfil-sem-autorizacao');
  }
  if (choices.teamCredentials === 'credenciais-previstas') {
    rules.push('equipe-sem-regra-de-credenciamento');
  }
  if (choices.leads === 'leads-previstos') {
    rules.push('leads-sem-finalidade-consentimento');
  }
  return rules;
}

function statusForDimension(dimension, value) {
  if (value === 'decidir-depois') return 'later';
  if (dimension === 'model' && value === 'estande-fisico') return 'stop';
  if (dimension === 'publicProfile' && value === 'perfil-previsto') return 'stop';
  if (dimension === 'infrastructure' && value === 'infraestrutura-prevista') return 'stop';
  if (dimension === 'teamCredentials' && value === 'credenciais-previstas') return 'stop';
  if (dimension === 'leads' && value === 'leads-previstos') return 'stop';
  if (dimension === 'concurrency' && (value === 'simultaneidade-moderada' || value === 'pico')) return 'stop';
  return 'planned';
}

function overallStatusFor(choices, rules) {
  if (rules.length > 0) return 'stop';
  if (
    choices.model === 'decidir-depois'
    || choices.origin === 'decidir-depois'
    || choices.publicProfile === 'decidir-depois'
    || choices.infrastructure === 'decidir-depois'
    || choices.teamCredentials === 'decidir-depois'
    || choices.leads === 'decidir-depois'
  ) {
    return 'later';
  }
  return 'planned';
}

function planExhibitors(choices) {
  if (nextStepFor(choices)) return null;
  const rules = stopRulesFor(choices);
  return {
    overall: overallStatusFor(choices, rules),
    dimensions: {
      model: statusForDimension('model', choices.model),
      origin: statusForDimension('origin', choices.origin),
      publicProfile: statusForDimension('publicProfile', choices.publicProfile),
      infrastructure: statusForDimension('infrastructure', choices.infrastructure),
      teamCredentials: statusForDimension('teamCredentials', choices.teamCredentials),
      leads: statusForDimension('leads', choices.leads),
      concurrency: statusForDimension('concurrency', choices.concurrency),
    },
    stopRules: rules,
  };
}

const plannedBase = {
  model: 'presenca-digital',
  origin: 'convite',
  publicProfile: 'sem-perfil-publico',
  infrastructure: 'sem-infraestrutura',
  teamCredentials: 'sem-credenciais-equipe',
  leads: 'sem-coleta-de-leads',
  concurrency: 'simultaneidade-espacada',
};

test('página server expõe skip-link, um main focável, um h1 e metadata conservadora', async () => {
  const page = await source(PAGE);
  const mains = [...page.matchAll(/<main\b/gu)];
  const headings = [...page.matchAll(/<h1\b/gu)];

  assert.doesNotMatch(page, /['"]use client['"]/u);
  assert.match(page, /className="skip-link" href="#main-content"/u);
  assert.match(page, /<main className=\{styles\.main\} id="main-content" tabIndex=\{-1\}/u);
  assert.equal(mains.length, 1);
  assert.equal(headings.length, 1);
  assert.match(page, /<h1>Planejar expositores<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
  assert.match(page, /title: 'Planejar expositores — orientação local'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /from ['"].*public-site-header['"]/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /<ExhibitorsPlanner \/>/u);
});

test('componente cliente isola as sete dimensões com fieldset, legend, hint, rádios e decidir depois', async () => {
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

  assert.match(planner, /legend: 'Modelo preliminar de presença'/u);
  assert.match(planner, /legend: 'Origem conceitual'/u);
  assert.match(planner, /legend: 'Necessidade futura de perfil público'/u);
  assert.match(planner, /legend: 'Necessidade conceitual de infraestrutura'/u);
  assert.match(planner, /legend: 'Necessidade conceitual de credenciais de equipe'/u);
  assert.match(planner, /legend: 'Necessidade conceitual de coleta de leads'/u);
  assert.match(planner, /legend: 'Faixa genérica de simultaneidade'/u);
  assert.match(planner, /hintId: 'model-hint'/u);
  assert.match(planner, /hintId: 'origin-hint'/u);
  assert.match(planner, /hintId: 'publicProfile-hint'/u);
  assert.match(planner, /hintId: 'infrastructure-hint'/u);
  assert.match(planner, /hintId: 'teamCredentials-hint'/u);
  assert.match(planner, /hintId: 'leads-hint'/u);
  assert.match(planner, /hintId: 'concurrency-hint'/u);
  assert.match(planner, /id: 'decidir-depois'/u);
});

test('catálogos fechados das sete dimensões, com decidir depois e sem campo livre', async () => {
  const planner = await source(PLANNER);
  const model = parseOptions(planner, 'export const MODEL_OPTIONS', 'export const ORIGIN_OPTIONS');
  const origin = parseOptions(planner, 'export const ORIGIN_OPTIONS', 'export const PROFILE_OPTIONS');
  const profile = parseOptions(planner, 'export const PROFILE_OPTIONS', 'export const INFRASTRUCTURE_OPTIONS');
  const infrastructure = parseOptions(planner, 'export const INFRASTRUCTURE_OPTIONS', 'export const TEAM_OPTIONS');
  const team = parseOptions(planner, 'export const TEAM_OPTIONS', 'export const LEADS_OPTIONS');
  const leads = parseOptions(planner, 'export const LEADS_OPTIONS', 'export const CONCURRENCY_OPTIONS');
  const concurrency = parseOptions(planner, 'export const CONCURRENCY_OPTIONS', 'export const STOP_RULES');

  assert.deepEqual(model.map((item) => item.id), MODEL_IDS);
  assert.deepEqual(origin.map((item) => item.id), ORIGIN_IDS);
  assert.deepEqual(profile.map((item) => item.id), PROFILE_IDS);
  assert.deepEqual(infrastructure.map((item) => item.id), INFRASTRUCTURE_IDS);
  assert.deepEqual(team.map((item) => item.id), TEAM_IDS);
  assert.deepEqual(leads.map((item) => item.id), LEADS_IDS);
  assert.deepEqual(concurrency.map((item) => item.id), CONCURRENCY_IDS);
  assert.deepEqual(
    model.map((item) => item.label),
    ['Estande físico', 'Presença digital', 'Patrocínio sem estande', 'Decidir depois'],
  );
  assert.deepEqual(
    origin.map((item) => item.label),
    ['Convite', 'Venda futura', 'Curadoria', 'Decidir depois'],
  );
  assert.deepEqual(
    profile.map((item) => item.label),
    ['Haverá perfil público futuro', 'Sem perfil público previsto', 'Decidir depois'],
  );
  assert.deepEqual(
    infrastructure.map((item) => item.label),
    ['Infraestrutura prevista', 'Sem infraestrutura prevista', 'Decidir depois'],
  );
  assert.deepEqual(
    team.map((item) => item.label),
    ['Credenciais de equipe previstas', 'Sem credenciais de equipe previstas', 'Decidir depois'],
  );
  assert.deepEqual(
    leads.map((item) => item.label),
    ['Coleta de leads prevista', 'Sem coleta de leads prevista', 'Decidir depois'],
  );
  assert.deepEqual(
    concurrency.map((item) => item.label),
    ['Simultaneidade espaçada', 'Simultaneidade moderada', 'Pico'],
  );

  for (const option of [...model, ...origin, ...profile, ...infrastructure, ...team, ...leads, ...concurrency]) {
    assert.ok(option.help.length > 20, option.id);
  }

  assert.match(planner, /não reserva espaço, não vende estande/u);
  assert.match(planner, /não cadastra expositor, não publica perfil e não pede marca ou logo/u);
  assert.match(planner, /não cria plano comercial, não contrata patrocínio/u);
  assert.match(planner, /não vende estande, não cobra valor e não reserva espaço/u);
  assert.match(planner, /não pede empresa, marca, logo ou contato e não autoriza publicação/u);
  assert.match(planner, /não configura energia, rede, montagem/u);
  assert.match(planner, /não emite credencial, não pede nome e não cadastra pessoa/u);
  assert.match(planner, /não coleta lead, não usa scanner/u);
  assert.match(planner, /Não informe quantidade, metragem, valor ou mapa/u);
});

test('combinações completas geram resultado determinístico e incompletas orientam o próximo passo', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /if \(choices\.model === 'estande-fisico'\) \{\s*rules\.push\('responsavel-ausente'\)/u);
  assert.match(planner, /if \(\s*choices\.model === 'estande-fisico'\s*\|\| choices\.concurrency === 'simultaneidade-moderada'\s*\|\| choices\.concurrency === 'pico'\s*\) \{\s*rules\.push\('espaco-sem-capacidade'\)/u);
  assert.match(planner, /if \(choices\.infrastructure === 'infraestrutura-prevista'\) \{\s*rules\.push\('infraestrutura-sem-validacao'\)/u);
  assert.match(planner, /if \(choices\.publicProfile === 'perfil-previsto'\) \{\s*rules\.push\('perfil-sem-autorizacao'\)/u);
  assert.match(planner, /if \(choices\.teamCredentials === 'credenciais-previstas'\) \{\s*rules\.push\('equipe-sem-regra-de-credenciamento'\)/u);
  assert.match(planner, /if \(choices\.leads === 'leads-previstos'\) \{\s*rules\.push\('leads-sem-finalidade-consentimento'\)/u);

  assert.equal(planExhibitors({
    model: '', origin: '', publicProfile: '', infrastructure: '', teamCredentials: '', leads: '', concurrency: '',
  }), null);
  assert.equal(
    nextStepFor({
      model: '', origin: '', publicProfile: '', infrastructure: '', teamCredentials: '', leads: '', concurrency: '',
    }),
    'Escolha o modelo preliminar de presença.',
  );
  assert.equal(
    nextStepFor({ ...plannedBase, origin: '', publicProfile: '', infrastructure: '', teamCredentials: '', leads: '', concurrency: '' }),
    'Escolha a origem conceitual.',
  );
  assert.equal(
    nextStepFor({ ...plannedBase, publicProfile: '', infrastructure: '', teamCredentials: '', leads: '', concurrency: '' }),
    'Indique a necessidade futura de perfil público.',
  );
  assert.equal(
    nextStepFor({ ...plannedBase, infrastructure: '', teamCredentials: '', leads: '', concurrency: '' }),
    'Indique a necessidade conceitual de infraestrutura.',
  );
  assert.equal(
    nextStepFor({ ...plannedBase, teamCredentials: '', leads: '', concurrency: '' }),
    'Indique a necessidade conceitual de credenciais de equipe.',
  );
  assert.equal(
    nextStepFor({ ...plannedBase, leads: '', concurrency: '' }),
    'Indique a necessidade conceitual de coleta de leads.',
  );
  assert.equal(
    nextStepFor({ ...plannedBase, concurrency: '' }),
    'Escolha a faixa genérica de simultaneidade.',
  );

  const representative = [
    {
      choices: plannedBase,
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: { ...plannedBase, origin: 'venda-futura' },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: { ...plannedBase, model: 'patrocinio-sem-estande', origin: 'curadoria' },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: {
        ...plannedBase,
        model: 'decidir-depois',
        origin: 'decidir-depois',
        publicProfile: 'decidir-depois',
        infrastructure: 'decidir-depois',
        teamCredentials: 'decidir-depois',
        leads: 'decidir-depois',
      },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: { ...plannedBase, origin: 'decidir-depois' },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: { ...plannedBase, model: 'estande-fisico' },
      overall: 'stop',
      stopRules: ['responsavel-ausente', 'espaco-sem-capacidade'],
    },
    {
      choices: { ...plannedBase, publicProfile: 'perfil-previsto' },
      overall: 'stop',
      stopRules: ['perfil-sem-autorizacao'],
    },
    {
      choices: { ...plannedBase, infrastructure: 'infraestrutura-prevista' },
      overall: 'stop',
      stopRules: ['infraestrutura-sem-validacao'],
    },
    {
      choices: { ...plannedBase, teamCredentials: 'credenciais-previstas' },
      overall: 'stop',
      stopRules: ['equipe-sem-regra-de-credenciamento'],
    },
    {
      choices: { ...plannedBase, leads: 'leads-previstos' },
      overall: 'stop',
      stopRules: ['leads-sem-finalidade-consentimento'],
    },
    {
      choices: { ...plannedBase, concurrency: 'simultaneidade-moderada' },
      overall: 'stop',
      stopRules: ['espaco-sem-capacidade'],
    },
    {
      choices: { ...plannedBase, concurrency: 'pico' },
      overall: 'stop',
      stopRules: ['espaco-sem-capacidade'],
    },
    {
      choices: {
        model: 'estande-fisico',
        origin: 'venda-futura',
        publicProfile: 'perfil-previsto',
        infrastructure: 'infraestrutura-prevista',
        teamCredentials: 'credenciais-previstas',
        leads: 'leads-previstos',
        concurrency: 'pico',
      },
      overall: 'stop',
      stopRules: STOP_IDS,
    },
  ];

  for (const item of representative) {
    const first = planExhibitors(item.choices);
    const second = planExhibitors(item.choices);
    assert.ok(first, JSON.stringify(item.choices));
    assert.deepEqual(first, second);
    assert.equal(first.overall, item.overall, JSON.stringify(item.choices));
    assert.deepEqual(first.stopRules, item.stopRules, JSON.stringify(item.choices));
  }

  let combinations = 0;
  const seenOverall = new Set();
  for (const model of MODEL_IDS) {
    for (const origin of ORIGIN_IDS) {
      for (const publicProfile of PROFILE_IDS) {
        for (const infrastructure of INFRASTRUCTURE_IDS) {
          for (const teamCredentials of TEAM_IDS) {
            for (const leads of LEADS_IDS) {
              for (const concurrency of CONCURRENCY_IDS) {
                const result = planExhibitors({
                  model, origin, publicProfile, infrastructure, teamCredentials, leads, concurrency,
                });
                assert.ok(result, `${model}+${origin}+${publicProfile}+${infrastructure}+${teamCredentials}+${leads}+${concurrency}`);
                assert.ok(STATUS_IDS.includes(result.overall), result.overall);
                seenOverall.add(result.overall);
                combinations += 1;
              }
            }
          }
        }
      }
    }
  }
  assert.equal(combinations, 3888);
  assert.deepEqual([...seenOverall].sort(), [...STATUS_IDS].sort());
});

test('stop rules surgem de forma previsível e nenhuma combinação vende, reserva ou coleta', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /id: 'responsavel-ausente',\s*title: 'Responsável ausente'/u);
  assert.match(planner, /id: 'espaco-sem-capacidade',\s*title: 'Espaço sem capacidade'/u);
  assert.match(planner, /id: 'infraestrutura-sem-validacao',\s*title: 'Infraestrutura sem validação'/u);
  assert.match(planner, /id: 'perfil-sem-autorizacao',\s*title: 'Perfil sem autorização'/u);
  assert.match(planner, /id: 'equipe-sem-regra-de-credenciamento',\s*title: 'Equipe sem regra de credenciamento'/u);
  assert.match(planner, /id: 'leads-sem-finalidade-consentimento',\s*title: 'Leads sem finalidade ou consentimento'/u);
  assert.match(planner, /Regras de parada/u);
  assert.match(planner, /data-stop=\{item\.id\}/u);
  assert.match(planner, /Nenhuma combinação\s+vende, reserva ou coleta/u);

  assert.deepEqual(stopRulesFor(plannedBase), []);
  assert.deepEqual(
    stopRulesFor({ ...plannedBase, model: 'estande-fisico' }),
    ['responsavel-ausente', 'espaco-sem-capacidade'],
  );
  assert.equal(
    stopRulesFor({ ...plannedBase, origin: 'venda-futura' }).includes('leads-sem-finalidade-consentimento'),
    false,
  );
});

test('orientação de feira deriva do catálogo canônico em leitura, sem segunda taxonomia', async () => {
  const [page, planner, catalog] = await Promise.all([
    source(PAGE),
    source(PLANNER),
    source(CATALOG),
  ]);
  const owned = `${page}\n${planner}`;
  const fair = EVENT_PROFILE_GROUPS.find((group) => group.id === 'fair');

  assert.ok(fair);
  assert.equal(EVENT_PROFILE_GROUPS.flatMap((group) => group.options).length, 19);
  assert.deepEqual(
    fair.options.map((option) => option.value),
    ['Feira ou exposição', 'Exposição'],
  );

  assert.match(page, /from ['"].*event-profile-catalog['"]/u);
  assert.match(page, /EVENT_PROFILE_GROUPS\.find\(\(group\) => group\.id === 'fair'\)/u);
  assert.match(page, /fairGroup\.options\.map\(\(option\) =>/u);
  assert.match(page, /\{option\.title\}/u);
  assert.match(page, /\{option\.value\}/u);
  assert.match(page, /\{fairGroup\.label\}/u);
  assert.match(page, /\{fairGroup\.description\}/u);
  assert.doesNotMatch(page, /Feira ou exposição/u);
  assert.doesNotMatch(page, /'Exposição'/u);

  assert.match(catalog, /id: 'fair'/u);
  assert.match(page, /não altera o\s+catálogo e não cria uma regra paralela/u);
  assert.match(planner, /não altera o catálogo dos\s+19 tipos nem cria regra paralela/u);

  assert.doesNotMatch(owned, /WIZARD_REQUIRED_CAPABILITIES/u);
  assert.doesNotMatch(owned, /getRequiredWizardCapabilities/u);
  assert.doesNotMatch(owned, /EventProfileCode/u);
  assert.doesNotMatch(owned, /wizard-policy/u);
  assert.doesNotMatch(planner, /EVENT_PROFILE_GROUPS/u);
  assert.doesNotMatch(owned, /allProfiles:\s*\[/u);
  assert.doesNotMatch(owned, /EVENT_PROFILE_GROUPS\s*=/u);
});

test('reinício restaura o estado inicial e o anuncia via aria-live', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /useState\(emptyChoices\)/u);
  assert.match(planner, /function restart\(\) \{\s*setChoices\(emptyChoices\(\)\);\s*setRestarted\(true\);/u);
  assert.match(planner, /Reiniciar escolhas/u);
  assert.match(planner, /Escolhas reiniciadas\. Nenhum resumo está visível\./u);
  assert.match(planner, /Nenhuma escolha feita\. O resumo aparece quando as sete dimensões estiverem definidas\./u);
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
  assert.doesNotMatch(combined, /CNPJ|razão social|razao social/iu);
  assert.doesNotMatch(combined, /type="file"|<input[^>]*accept=/u);
});

test('texto anti-claims deixa claro que a ferramenta não vende estande, não cadastra expositor, não reserva espaço e não coleta lead', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.match(page, /ferramenta é\s+orientativa/u);
  assert.match(page, /não vende estande, não cadastra\s+expositor, não reserva espaço e não coleta lead/u);
  assert.match(page, /sem persistência/u);
  assert.match(page, /Não afirma reserva, contratação, disponibilidade,\s+conformidade ou autorização/u);
  assert.match(page, /Nenhuma combinação vende, reserva ou coleta/u);
  assert.match(page, /A EVA não decide/u);
  assert.match(page, /não pede empresa, marca, logo, contato, metragem, valor\s+ou mapa/u);
  assert.match(planner, /não vende estande, não cadastra expositor, não reserva espaço e não coleta lead/u);
  assert.match(planner, /não coleta lead, não usa scanner/u);
  assert.match(planner, /não reserva espaço, não vende estande/u);

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
  assert.match(css, /\.article \{[\s\S]*overflow-wrap: anywhere/u);
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
