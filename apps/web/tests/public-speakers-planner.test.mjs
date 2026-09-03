import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/planejar-palestrantes/page.tsx';
const PLANNER = '../app/ajuda/planejar-palestrantes/speakers-planner.tsx';
const CSS = '../app/ajuda/planejar-palestrantes/planejar-palestrantes.module.css';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const FORMAT_IDS = ['palestra-individual', 'painel', 'oficina', 'decidir-depois'];
const ORIGIN_IDS = ['convite', 'curadoria', 'submissao-futura', 'decidir-depois'];
const PROFILE_IDS = ['com-perfil-publico', 'sem-perfil-publico', 'decidir-depois'];
const MATERIALS_IDS = ['com-materiais', 'sem-materiais', 'decidir-depois'];
const AUTHORIZATION_IDS = ['com-autorizacao', 'sem-autorizacao', 'decidir-depois'];
const ACCESSIBILITY_IDS = ['com-acessibilidade', 'sem-acessibilidade', 'decidir-depois'];
const CONCURRENCY_IDS = ['uma-atividade', 'poucas-paralelas', 'varias-paralelas', 'decidir-depois'];
const STOP_IDS = [
  'responsavel-ausente',
  'conteudo-sem-curadoria',
  'painel-sem-mediacao',
  'oficina-sem-capacidade',
  'perfil-sem-autorizacao',
  'material-sem-acessibilidade',
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
  /palestrante cadastrado/iu,
  /convite enviado/iu,
  /sessão criada/iu,
  /agenda publicada/iu,
  /aceite registrado/iu,
  /direito de uso confirmado/iu,
  /acessibilidade certificada nesta página/iu,
  /disponibilidade confirmada/iu,
];

const PII_FORBIDDEN = [
  /type="file"/iu,
  /type="email"/iu,
  /type="tel"/iu,
  /type="url"/iu,
  /type="number"/iu,
  /type="text"/iu,
  /type="password"/iu,
  /type="date"/iu,
  /type="time"/iu,
  /type="datetime-local"/iu,
  /accept=/iu,
  /capture=/iu,
  /<textarea\b/iu,
  /<select\b/iu,
  /<form\b/iu,
  /placeholder=/iu,
  /autoComplete=/iu,
  /getUserMedia/iu,
  /FileReader/iu,
  /FormData/iu,
  /new File\b/iu,
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
  if (!choices.format) return 'Escolha o formato preliminar de participação.';
  if (!choices.origin) return 'Indique a origem conceitual do conteúdo.';
  if (!choices.profile) return 'Indique se haverá perfil público da pessoa participante.';
  if (!choices.materials) return 'Indique a necessidade futura de materiais.';
  if (!choices.authorization) return 'Indique a necessidade futura de autorização de uso de imagem ou conteúdo.';
  if (!choices.accessibility) return 'Indique a necessidade futura de acessibilidade.';
  if (!choices.concurrency) return 'Escolha a faixa genérica de simultaneidade.';
  return null;
}

function stopRulesFor(choices) {
  const rules = [];
  if (choices.origin === 'convite') {
    rules.push('responsavel-ausente');
  }
  if (choices.origin === 'submissao-futura') {
    rules.push('conteudo-sem-curadoria');
  }
  if (choices.format === 'painel') {
    rules.push('painel-sem-mediacao');
  }
  if (choices.format === 'oficina') {
    rules.push('oficina-sem-capacidade');
  }
  if (choices.profile === 'com-perfil-publico' && choices.authorization !== 'com-autorizacao') {
    rules.push('perfil-sem-autorizacao');
  }
  if (choices.materials === 'com-materiais' && choices.accessibility !== 'com-acessibilidade') {
    rules.push('material-sem-acessibilidade');
  }
  return rules;
}

function statusForDimension(dimension, value) {
  if (value === 'decidir-depois') return 'later';
  if (dimension === 'format' && (value === 'painel' || value === 'oficina')) return 'stop';
  if (dimension === 'origin' && (value === 'convite' || value === 'submissao-futura')) return 'stop';
  return 'planned';
}

function overallStatusFor(choices, rules) {
  if (rules.length > 0) return 'stop';
  if (
    choices.format === 'decidir-depois'
    || choices.origin === 'decidir-depois'
    || choices.profile === 'decidir-depois'
    || choices.materials === 'decidir-depois'
    || choices.authorization === 'decidir-depois'
    || choices.accessibility === 'decidir-depois'
    || choices.concurrency === 'decidir-depois'
  ) {
    return 'later';
  }
  return 'planned';
}

function planSpeakers(choices) {
  if (nextStepFor(choices)) return null;
  const rules = stopRulesFor(choices);
  return {
    overall: overallStatusFor(choices, rules),
    dimensions: {
      format: statusForDimension('format', choices.format),
      origin: statusForDimension('origin', choices.origin),
      profile: statusForDimension('profile', choices.profile),
      materials: statusForDimension('materials', choices.materials),
      authorization: statusForDimension('authorization', choices.authorization),
      accessibility: statusForDimension('accessibility', choices.accessibility),
      concurrency: statusForDimension('concurrency', choices.concurrency),
    },
    stopRules: rules,
  };
}

const plannedBase = Object.freeze({
  format: 'palestra-individual',
  origin: 'curadoria',
  profile: 'sem-perfil-publico',
  materials: 'sem-materiais',
  authorization: 'sem-autorizacao',
  accessibility: 'sem-acessibilidade',
  concurrency: 'uma-atividade',
});

test('página server expõe skip-link, um main focável, um h1 e metadata conservadora', async () => {
  const page = await source(PAGE);
  const mains = [...page.matchAll(/<main\b/gu)];
  const headings = [...page.matchAll(/<h1\b/gu)];

  assert.doesNotMatch(page, /['"]use client['"]/u);
  assert.match(page, /className="skip-link" href="#main-content"/u);
  assert.match(page, /<main className=\{styles\.main\} id="main-content" tabIndex=\{-1\}/u);
  assert.equal(mains.length, 1);
  assert.equal(headings.length, 1);
  assert.match(page, /<h1>Planejar palestrantes<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
  assert.match(page, /title: 'Planejar palestrantes — orientação local'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /from ['"].*public-site-header['"]/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /<SpeakersPlanner \/>/u);
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
  assert.doesNotMatch(planner, /type="text"|type="email"|type="tel"|type="url"|type="number"/u);
  assert.doesNotMatch(planner, /<select\b/u);
  assert.doesNotMatch(planner, /<form\b/u);

  assert.match(planner, /legend: 'Formato preliminar de participação'/u);
  assert.match(planner, /legend: 'Origem conceitual do conteúdo'/u);
  assert.match(planner, /legend: 'Perfil público da pessoa participante'/u);
  assert.match(planner, /legend: 'Materiais futuros'/u);
  assert.match(planner, /legend: 'Autorização de uso de imagem ou conteúdo'/u);
  assert.match(planner, /legend: 'Acessibilidade'/u);
  assert.match(planner, /legend: 'Faixa genérica de simultaneidade'/u);
  assert.match(planner, /hintId: 'format-hint'/u);
  assert.match(planner, /hintId: 'origin-hint'/u);
  assert.match(planner, /hintId: 'profile-hint'/u);
  assert.match(planner, /hintId: 'materials-hint'/u);
  assert.match(planner, /hintId: 'authorization-hint'/u);
  assert.match(planner, /hintId: 'accessibility-hint'/u);
  assert.match(planner, /hintId: 'concurrency-hint'/u);
  assert.match(planner, /id: 'decidir-depois'/u);
});

test('catálogos fechados das sete dimensões, com decidir depois e sem campo livre', async () => {
  const planner = await source(PLANNER);
  const format = parseOptions(planner, 'export const FORMAT_OPTIONS', 'export const ORIGIN_OPTIONS');
  const origin = parseOptions(planner, 'export const ORIGIN_OPTIONS', 'export const PROFILE_OPTIONS');
  const profile = parseOptions(planner, 'export const PROFILE_OPTIONS', 'export const MATERIALS_OPTIONS');
  const materials = parseOptions(planner, 'export const MATERIALS_OPTIONS', 'export const AUTHORIZATION_OPTIONS');
  const authorization = parseOptions(planner, 'export const AUTHORIZATION_OPTIONS', 'export const ACCESSIBILITY_OPTIONS');
  const accessibility = parseOptions(planner, 'export const ACCESSIBILITY_OPTIONS', 'export const CONCURRENCY_OPTIONS');
  const concurrency = parseOptions(planner, 'export const CONCURRENCY_OPTIONS', 'export const STOP_RULES');

  assert.deepEqual(format.map((item) => item.id), FORMAT_IDS);
  assert.deepEqual(origin.map((item) => item.id), ORIGIN_IDS);
  assert.deepEqual(profile.map((item) => item.id), PROFILE_IDS);
  assert.deepEqual(materials.map((item) => item.id), MATERIALS_IDS);
  assert.deepEqual(authorization.map((item) => item.id), AUTHORIZATION_IDS);
  assert.deepEqual(accessibility.map((item) => item.id), ACCESSIBILITY_IDS);
  assert.deepEqual(concurrency.map((item) => item.id), CONCURRENCY_IDS);
  assert.deepEqual(
    format.map((item) => item.label),
    ['Palestra individual', 'Painel', 'Oficina', 'Decidir depois'],
  );
  assert.deepEqual(
    origin.map((item) => item.label),
    ['Convite', 'Curadoria', 'Submissão futura', 'Decidir depois'],
  );
  assert.deepEqual(
    profile.map((item) => item.label),
    ['Haverá perfil público', 'Sem perfil público previsto', 'Decidir depois'],
  );
  assert.deepEqual(
    materials.map((item) => item.label),
    ['Haverá materiais futuros', 'Sem materiais previstos', 'Decidir depois'],
  );
  assert.deepEqual(
    authorization.map((item) => item.label),
    ['Haverá autorização de uso', 'Sem autorização prevista', 'Decidir depois'],
  );
  assert.deepEqual(
    accessibility.map((item) => item.label),
    ['Haverá decisão de acessibilidade', 'Sem necessidade de acessibilidade indicada', 'Decidir depois'],
  );
  assert.deepEqual(
    concurrency.map((item) => item.label),
    ['Uma atividade por vez', 'Poucas em paralelo', 'Várias em paralelo', 'Decidir depois'],
  );

  for (const option of [...format, ...origin, ...profile, ...materials, ...authorization, ...accessibility, ...concurrency]) {
    assert.ok(option.help.length > 20, option.id);
  }

  assert.match(planner, /Não peça nome, biografia, foto ou contato nesta página/u);
  assert.match(planner, /Sem quantidade, horário ou sala reais/u);
  assert.match(planner, /não coleta aceite e não afirma direito de uso/u);
});

test('combinações completas geram resultado determinístico e incompletas orientam o próximo passo', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /if \(choices\.origin === 'convite'\) \{\s*rules\.push\('responsavel-ausente'\)/u);
  assert.match(planner, /if \(choices\.origin === 'submissao-futura'\) \{\s*rules\.push\('conteudo-sem-curadoria'\)/u);
  assert.match(planner, /if \(choices\.format === 'painel'\) \{\s*rules\.push\('painel-sem-mediacao'\)/u);
  assert.match(planner, /if \(choices\.format === 'oficina'\) \{\s*rules\.push\('oficina-sem-capacidade'\)/u);
  assert.match(
    planner,
    /if \(choices\.profile === 'com-perfil-publico' && choices\.authorization !== 'com-autorizacao'\) \{\s*rules\.push\('perfil-sem-autorizacao'\)/u,
  );
  assert.match(
    planner,
    /if \(choices\.materials === 'com-materiais' && choices\.accessibility !== 'com-acessibilidade'\) \{\s*rules\.push\('material-sem-acessibilidade'\)/u,
  );

  assert.equal(planSpeakers({ ...plannedBase, format: '' }), null);
  assert.equal(nextStepFor({ ...plannedBase, format: '' }), 'Escolha o formato preliminar de participação.');
  assert.equal(nextStepFor({ ...plannedBase, origin: '' }), 'Indique a origem conceitual do conteúdo.');
  assert.equal(nextStepFor({ ...plannedBase, profile: '' }), 'Indique se haverá perfil público da pessoa participante.');
  assert.equal(nextStepFor({ ...plannedBase, materials: '' }), 'Indique a necessidade futura de materiais.');
  assert.equal(
    nextStepFor({ ...plannedBase, authorization: '' }),
    'Indique a necessidade futura de autorização de uso de imagem ou conteúdo.',
  );
  assert.equal(nextStepFor({ ...plannedBase, accessibility: '' }), 'Indique a necessidade futura de acessibilidade.');
  assert.equal(nextStepFor({ ...plannedBase, concurrency: '' }), 'Escolha a faixa genérica de simultaneidade.');

  const representative = [
    {
      choices: plannedBase,
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: { ...plannedBase, profile: 'com-perfil-publico', authorization: 'com-autorizacao' },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: { ...plannedBase, materials: 'com-materiais', accessibility: 'com-acessibilidade' },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: { ...plannedBase, concurrency: 'varias-paralelas' },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: { ...plannedBase, origin: 'convite' },
      overall: 'stop',
      stopRules: ['responsavel-ausente'],
    },
    {
      choices: { ...plannedBase, origin: 'submissao-futura' },
      overall: 'stop',
      stopRules: ['conteudo-sem-curadoria'],
    },
    {
      choices: { ...plannedBase, format: 'painel' },
      overall: 'stop',
      stopRules: ['painel-sem-mediacao'],
    },
    {
      choices: { ...plannedBase, format: 'oficina' },
      overall: 'stop',
      stopRules: ['oficina-sem-capacidade'],
    },
    {
      choices: { ...plannedBase, profile: 'com-perfil-publico' },
      overall: 'stop',
      stopRules: ['perfil-sem-autorizacao'],
    },
    {
      choices: { ...plannedBase, materials: 'com-materiais' },
      overall: 'stop',
      stopRules: ['material-sem-acessibilidade'],
    },
    {
      choices: {
        format: 'painel',
        origin: 'convite',
        profile: 'com-perfil-publico',
        materials: 'com-materiais',
        authorization: 'decidir-depois',
        accessibility: 'decidir-depois',
        concurrency: 'varias-paralelas',
      },
      overall: 'stop',
      stopRules: [
        'responsavel-ausente',
        'painel-sem-mediacao',
        'perfil-sem-autorizacao',
        'material-sem-acessibilidade',
      ],
    },
    {
      choices: {
        format: 'oficina',
        origin: 'submissao-futura',
        profile: 'com-perfil-publico',
        materials: 'com-materiais',
        authorization: 'sem-autorizacao',
        accessibility: 'sem-acessibilidade',
        concurrency: 'poucas-paralelas',
      },
      overall: 'stop',
      stopRules: STOP_IDS.filter((id) => id !== 'responsavel-ausente' && id !== 'painel-sem-mediacao'),
    },
    {
      choices: { ...plannedBase, format: 'decidir-depois' },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: { ...plannedBase, origin: 'decidir-depois' },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: { ...plannedBase, concurrency: 'decidir-depois' },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: { ...plannedBase, format: 'painel', origin: 'decidir-depois' },
      overall: 'stop',
      stopRules: ['painel-sem-mediacao'],
    },
  ];

  for (const item of representative) {
    const first = planSpeakers(item.choices);
    const second = planSpeakers(item.choices);
    assert.ok(first, JSON.stringify(item.choices));
    assert.deepEqual(first, second);
    assert.equal(first.overall, item.overall, JSON.stringify(item.choices));
    assert.deepEqual(first.stopRules, item.stopRules, JSON.stringify(item.choices));
  }

  let combinations = 0;
  const seenOverall = new Set();
  for (const format of FORMAT_IDS) {
    for (const origin of ORIGIN_IDS) {
      for (const profile of PROFILE_IDS) {
        for (const materials of MATERIALS_IDS) {
          for (const authorization of AUTHORIZATION_IDS) {
            for (const accessibility of ACCESSIBILITY_IDS) {
              for (const concurrency of CONCURRENCY_IDS) {
                const result = planSpeakers({
                  format, origin, profile, materials, authorization, accessibility, concurrency,
                });
                assert.ok(result, `${format}+${origin}+${profile}+${materials}+${authorization}+${accessibility}+${concurrency}`);
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
  assert.equal(combinations, 5184);
  assert.deepEqual([...seenOverall].sort(), [...STATUS_IDS].sort());
});

test('stop rules surgem de forma previsível para escolhas que exigem decisão humana', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /id: 'responsavel-ausente',\s*title: 'Responsável ausente'/u);
  assert.match(planner, /id: 'conteudo-sem-curadoria',\s*title: 'Conteúdo sem curadoria'/u);
  assert.match(planner, /id: 'painel-sem-mediacao',\s*title: 'Painel sem mediação'/u);
  assert.match(planner, /id: 'oficina-sem-capacidade',\s*title: 'Oficina sem capacidade'/u);
  assert.match(planner, /id: 'perfil-sem-autorizacao',\s*title: 'Perfil sem autorização'/u);
  assert.match(planner, /id: 'material-sem-acessibilidade',\s*title: 'Material sem acessibilidade'/u);
  assert.match(planner, /Regras de parada/u);
  assert.match(planner, /data-stop=\{item\.id\}/u);

  assert.deepEqual(stopRulesFor(plannedBase), []);
  assert.deepEqual(stopRulesFor({ ...plannedBase, origin: 'convite' }), ['responsavel-ausente']);
  assert.deepEqual(stopRulesFor({ ...plannedBase, origin: 'submissao-futura' }), ['conteudo-sem-curadoria']);
  assert.deepEqual(stopRulesFor({ ...plannedBase, format: 'painel' }), ['painel-sem-mediacao']);
  assert.deepEqual(stopRulesFor({ ...plannedBase, format: 'oficina' }), ['oficina-sem-capacidade']);
  assert.deepEqual(
    stopRulesFor({ ...plannedBase, profile: 'com-perfil-publico', authorization: 'com-autorizacao' }),
    [],
  );
  assert.deepEqual(
    stopRulesFor({ ...plannedBase, profile: 'com-perfil-publico', authorization: 'decidir-depois' }),
    ['perfil-sem-autorizacao'],
  );
  assert.deepEqual(
    stopRulesFor({ ...plannedBase, materials: 'com-materiais', accessibility: 'com-acessibilidade' }),
    [],
  );
  assert.equal(stopRulesFor(plannedBase).includes('conteudo-sem-curadoria'), false);
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

test('não há persistência, fetch, submit de formulário, upload, PII nem HTML inseguro', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.doesNotMatch(combined, /localStorage|sessionStorage|indexedDB|document\.cookie/u);
  assert.doesNotMatch(combined, /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/u);
  assert.doesNotMatch(combined, /<form\b/u);
  assert.doesNotMatch(combined, /type="submit"|action=|method=/u);
  assert.doesNotMatch(combined, /dangerouslySetInnerHTML|innerHTML/u);
  assert.doesNotMatch(combined, /gtag\(|google-analytics|fbq\(|navigator\.sendBeacon/iu);
  assert.doesNotMatch(planner, /window\.|document\./u);

  for (const pattern of PII_FORBIDDEN) {
    assert.doesNotMatch(combined, pattern);
  }
});

test('texto anti-claims deixa claro que a ferramenta não convida, cadastra, agenda, publica ou envia conteúdo', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.match(page, /ferramenta é orientativa/u);
  assert.match(page, /não\s+convida, não cadastra, não agenda, não publica e não envia conteúdo/u);
  assert.match(page, /sem persistência/u);
  assert.match(page, /Não afirma confirmação,\s*disponibilidade, direito de uso ou acessibilidade certificada/u);
  assert.match(page, /A EVA não decide/u);
  assert.match(page, /não pede nome, biografia,\s*foto, contato/u);
  assert.match(planner, /não convida, não cadastra, não agenda, não publica e não envia conteúdo/u);
  assert.match(planner, /não afirma direito de uso/u);
  assert.match(planner, /não certifica acessibilidade/u);

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

test('nenhuma combinação cadastra pessoa, agenda conteúdo ou afirma direito de uso', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /Nenhuma regra de parada nesta combinação/u);
  assert.match(planner, /não afirma\s*confirmação, disponibilidade, direito de uso ou acessibilidade certificada/u);
  assert.match(planner, /Este resultado não convida, não cadastra, não agenda, não publica e não envia conteúdo/u);

  for (const format of FORMAT_IDS) {
    for (const origin of ORIGIN_IDS) {
      const result = planSpeakers({ ...plannedBase, format, origin });
      assert.ok(result);
      assert.ok(STATUS_IDS.includes(result.overall));
    }
  }
});
