import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/planejar-certificados/page.tsx';
const PLANNER = '../app/ajuda/planejar-certificados/certificates-planner.tsx';
const CSS = '../app/ajuda/planejar-certificados/planejar-certificados.module.css';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const PURPOSE_IDS = ['participacao-evento', 'atividade', 'apresentacao-trabalho', 'decidir-depois'];
const ELIGIBILITY_IDS = ['inscricao-confirmada', 'presenca-futura', 'aprovacao-apresentacao-futura', 'decidir-depois'];
const MODEL_IDS = ['mesmo-modelo', 'modelos-distintos', 'decidir-depois'];
const FORMAT_IDS = ['digital', 'impressao-sob-demanda', 'decidir-depois'];
const VALIDATION_IDS = ['sem-validacao', 'com-validacao-publica', 'decidir-depois'];
const STOP_IDS = [
  'responsavel-ausente',
  'elegibilidade-indefinida',
  'presenca-sem-fonte-confiavel',
  'trabalho-sem-aprovacao-apresentacao',
  'modelo-sem-campos-revisados',
  'validacao-publica-sem-politica',
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
  /certificado emitido/iu,
  /emiss[aã]o conclu[ií]da/iu,
  /PDF gerado/iu,
  /arquivo gerado/iu,
  /hash gerado/iu,
  /protocolo gerado/iu,
  /segunda via emitida/iu,
  /QR validado/iu,
  /presen[cç]a validada/iu,
  /presen[cç]a registrada/iu,
  /participa[cç][aã]o comprovada/iu,
  /validade jur[ií]dica comprovada/iu,
  /autenticidade comprovada/iu,
  /elegibilidade comprovada/iu,
  /disponibilidade operacional comprovada/iu,
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
  if (!choices.purpose) return 'Escolha a finalidade preliminar.';
  if (!choices.eligibility) return 'Escolha o critério conceitual de elegibilidade.';
  if (!choices.models) return 'Indique se haverá modelos distintos por perfil.';
  if (!choices.format) return 'Indique o formato conceitual.';
  if (!choices.validation) return 'Indique a necessidade futura de validação pública ou segunda via.';
  return null;
}

function stopRulesFor(choices) {
  const rules = [];
  if (
    choices.purpose === 'atividade'
    || choices.purpose === 'apresentacao-trabalho'
    || choices.models === 'modelos-distintos'
    || choices.validation === 'com-validacao-publica'
  ) {
    rules.push('responsavel-ausente');
  }
  if (
    choices.purpose === 'atividade'
    || choices.purpose === 'apresentacao-trabalho'
    || (choices.purpose === 'participacao-evento' && choices.eligibility === 'aprovacao-apresentacao-futura')
  ) {
    rules.push('elegibilidade-indefinida');
  }
  if (choices.eligibility === 'presenca-futura') {
    rules.push('presenca-sem-fonte-confiavel');
  }
  if (
    choices.purpose === 'apresentacao-trabalho'
    || choices.eligibility === 'aprovacao-apresentacao-futura'
  ) {
    rules.push('trabalho-sem-aprovacao-apresentacao');
  }
  if (choices.models === 'modelos-distintos') {
    rules.push('modelo-sem-campos-revisados');
  }
  if (choices.validation === 'com-validacao-publica') {
    rules.push('validacao-publica-sem-politica');
  }
  return rules;
}

function statusForDimension(dimension, value) {
  if (value === 'decidir-depois') return 'later';
  if (dimension === 'purpose' && (value === 'atividade' || value === 'apresentacao-trabalho')) return 'stop';
  if (dimension === 'eligibility' && (value === 'presenca-futura' || value === 'aprovacao-apresentacao-futura')) return 'stop';
  if (dimension === 'models' && value === 'modelos-distintos') return 'stop';
  if (dimension === 'validation' && value === 'com-validacao-publica') return 'stop';
  return 'planned';
}

function overallStatusFor(choices, rules) {
  if (rules.length > 0) return 'stop';
  if (
    choices.purpose === 'decidir-depois'
    || choices.eligibility === 'decidir-depois'
    || choices.models === 'decidir-depois'
    || choices.format === 'decidir-depois'
    || choices.validation === 'decidir-depois'
  ) {
    return 'later';
  }
  return 'planned';
}

function planCertificates(choices) {
  if (nextStepFor(choices)) return null;
  const rules = stopRulesFor(choices);
  return {
    overall: overallStatusFor(choices, rules),
    dimensions: {
      purpose: statusForDimension('purpose', choices.purpose),
      eligibility: statusForDimension('eligibility', choices.eligibility),
      models: statusForDimension('models', choices.models),
      format: statusForDimension('format', choices.format),
      validation: statusForDimension('validation', choices.validation),
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
  assert.match(page, /<h1>Planejar certificados<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
  assert.match(page, /title: 'Planejar certificados — orientação local'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /from ['"].*public-site-header['"]/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /<CertificatesPlanner \/>/u);
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

  assert.match(planner, /legend: 'Finalidade preliminar'/u);
  assert.match(planner, /legend: 'Critério conceitual de elegibilidade'/u);
  assert.match(planner, /legend: 'Modelos por perfil'/u);
  assert.match(planner, /legend: 'Formato conceitual'/u);
  assert.match(planner, /legend: 'Validação pública ou segunda via'/u);
  assert.match(planner, /hintId: 'purpose-hint'/u);
  assert.match(planner, /hintId: 'eligibility-hint'/u);
  assert.match(planner, /hintId: 'models-hint'/u);
  assert.match(planner, /hintId: 'format-hint'/u);
  assert.match(planner, /hintId: 'validation-hint'/u);
  assert.match(planner, /id: 'decidir-depois'/u);
});

test('catálogos fechados das cinco dimensões, com decidir depois e sem campo livre', async () => {
  const planner = await source(PLANNER);
  const purpose = parseOptions(planner, 'export const PURPOSE_OPTIONS', 'export const ELIGIBILITY_OPTIONS');
  const eligibility = parseOptions(planner, 'export const ELIGIBILITY_OPTIONS', 'export const MODEL_OPTIONS');
  const models = parseOptions(planner, 'export const MODEL_OPTIONS', 'export const FORMAT_OPTIONS');
  const format = parseOptions(planner, 'export const FORMAT_OPTIONS', 'export const VALIDATION_OPTIONS');
  const validation = parseOptions(planner, 'export const VALIDATION_OPTIONS', 'export const STOP_RULES');

  assert.deepEqual(purpose.map((item) => item.id), PURPOSE_IDS);
  assert.deepEqual(eligibility.map((item) => item.id), ELIGIBILITY_IDS);
  assert.deepEqual(models.map((item) => item.id), MODEL_IDS);
  assert.deepEqual(format.map((item) => item.id), FORMAT_IDS);
  assert.deepEqual(validation.map((item) => item.id), VALIDATION_IDS);
  assert.deepEqual(
    purpose.map((item) => item.label),
    ['Participação no evento', 'Atividade', 'Apresentação ou trabalho', 'Decidir depois'],
  );
  assert.deepEqual(
    eligibility.map((item) => item.label),
    ['Inscrição confirmada', 'Presença futura', 'Aprovação ou apresentação futura', 'Decidir depois'],
  );
  assert.deepEqual(
    models.map((item) => item.label),
    ['Mesmo modelo para todos os perfis', 'Haverá modelos distintos por perfil', 'Decidir depois'],
  );
  assert.deepEqual(
    format.map((item) => item.label),
    ['Digital', 'Impressão sob demanda futura', 'Decidir depois'],
  );
  assert.deepEqual(
    validation.map((item) => item.label),
    [
      'Sem validação pública ou segunda via prevista',
      'Haverá necessidade futura de validação pública ou segunda via',
      'Decidir depois',
    ],
  );

  for (const option of [...purpose, ...eligibility, ...models, ...format, ...validation]) {
    assert.ok(option.help.length > 20, option.id);
  }

  assert.match(planner, /não emite certificado e não comprova participação/u);
  assert.match(planner, /não consulta inscrição real/u);
  assert.match(planner, /não valida presença, não lê check-in/u);
  assert.match(planner, /não cria template, categoria, campo dinâmico/u);
  assert.match(planner, /não gera arquivo, PDF, hash, QR/u);
  assert.match(planner, /não cria código, protocolo ou URL/u);
});

test('combinações completas geram resultado determinístico e incompletas orientam o próximo passo', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /choices\.purpose === 'atividade'\s*\|\| choices\.purpose === 'apresentacao-trabalho'\s*\|\| choices\.models === 'modelos-distintos'\s*\|\| choices\.validation === 'com-validacao-publica'/u);
  assert.match(planner, /rules\.push\('responsavel-ausente'\)/u);
  assert.match(planner, /rules\.push\('elegibilidade-indefinida'\)/u);
  assert.match(planner, /if \(choices\.eligibility === 'presenca-futura'\) \{\s*rules\.push\('presenca-sem-fonte-confiavel'\)/u);
  assert.match(planner, /rules\.push\('trabalho-sem-aprovacao-apresentacao'\)/u);
  assert.match(planner, /if \(choices\.models === 'modelos-distintos'\) \{\s*rules\.push\('modelo-sem-campos-revisados'\)/u);
  assert.match(planner, /if \(choices\.validation === 'com-validacao-publica'\) \{\s*rules\.push\('validacao-publica-sem-politica'\)/u);

  assert.equal(planCertificates({
    purpose: '', eligibility: '', models: '', format: '', validation: '',
  }), null);
  assert.equal(
    nextStepFor({ purpose: '', eligibility: '', models: '', format: '', validation: '' }),
    'Escolha a finalidade preliminar.',
  );
  assert.equal(
    nextStepFor({ purpose: 'participacao-evento', eligibility: '', models: '', format: '', validation: '' }),
    'Escolha o critério conceitual de elegibilidade.',
  );
  assert.equal(
    nextStepFor({
      purpose: 'participacao-evento', eligibility: 'inscricao-confirmada', models: '', format: '', validation: '',
    }),
    'Indique se haverá modelos distintos por perfil.',
  );
  assert.equal(
    nextStepFor({
      purpose: 'participacao-evento',
      eligibility: 'inscricao-confirmada',
      models: 'mesmo-modelo',
      format: '',
      validation: '',
    }),
    'Indique o formato conceitual.',
  );
  assert.equal(
    nextStepFor({
      purpose: 'participacao-evento',
      eligibility: 'inscricao-confirmada',
      models: 'mesmo-modelo',
      format: 'digital',
      validation: '',
    }),
    'Indique a necessidade futura de validação pública ou segunda via.',
  );

  const representative = [
    {
      choices: {
        purpose: 'participacao-evento',
        eligibility: 'inscricao-confirmada',
        models: 'mesmo-modelo',
        format: 'digital',
        validation: 'sem-validacao',
      },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: {
        purpose: 'participacao-evento',
        eligibility: 'inscricao-confirmada',
        models: 'mesmo-modelo',
        format: 'impressao-sob-demanda',
        validation: 'sem-validacao',
      },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: {
        purpose: 'participacao-evento',
        eligibility: 'inscricao-confirmada',
        models: 'mesmo-modelo',
        format: 'decidir-depois',
        validation: 'sem-validacao',
      },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: {
        purpose: 'decidir-depois',
        eligibility: 'inscricao-confirmada',
        models: 'mesmo-modelo',
        format: 'digital',
        validation: 'sem-validacao',
      },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: {
        purpose: 'participacao-evento',
        eligibility: 'decidir-depois',
        models: 'mesmo-modelo',
        format: 'digital',
        validation: 'sem-validacao',
      },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: {
        purpose: 'atividade',
        eligibility: 'inscricao-confirmada',
        models: 'mesmo-modelo',
        format: 'digital',
        validation: 'sem-validacao',
      },
      overall: 'stop',
      stopRules: ['responsavel-ausente', 'elegibilidade-indefinida'],
    },
    {
      choices: {
        purpose: 'apresentacao-trabalho',
        eligibility: 'aprovacao-apresentacao-futura',
        models: 'mesmo-modelo',
        format: 'digital',
        validation: 'sem-validacao',
      },
      overall: 'stop',
      stopRules: [
        'responsavel-ausente',
        'elegibilidade-indefinida',
        'trabalho-sem-aprovacao-apresentacao',
      ],
    },
    {
      choices: {
        purpose: 'participacao-evento',
        eligibility: 'presenca-futura',
        models: 'mesmo-modelo',
        format: 'digital',
        validation: 'sem-validacao',
      },
      overall: 'stop',
      stopRules: ['presenca-sem-fonte-confiavel'],
    },
    {
      choices: {
        purpose: 'participacao-evento',
        eligibility: 'aprovacao-apresentacao-futura',
        models: 'mesmo-modelo',
        format: 'digital',
        validation: 'sem-validacao',
      },
      overall: 'stop',
      stopRules: ['elegibilidade-indefinida', 'trabalho-sem-aprovacao-apresentacao'],
    },
    {
      choices: {
        purpose: 'participacao-evento',
        eligibility: 'inscricao-confirmada',
        models: 'modelos-distintos',
        format: 'digital',
        validation: 'sem-validacao',
      },
      overall: 'stop',
      stopRules: ['responsavel-ausente', 'modelo-sem-campos-revisados'],
    },
    {
      choices: {
        purpose: 'participacao-evento',
        eligibility: 'inscricao-confirmada',
        models: 'mesmo-modelo',
        format: 'digital',
        validation: 'com-validacao-publica',
      },
      overall: 'stop',
      stopRules: ['responsavel-ausente', 'validacao-publica-sem-politica'],
    },
    {
      choices: {
        purpose: 'apresentacao-trabalho',
        eligibility: 'presenca-futura',
        models: 'modelos-distintos',
        format: 'impressao-sob-demanda',
        validation: 'com-validacao-publica',
      },
      overall: 'stop',
      stopRules: STOP_IDS,
    },
    {
      choices: {
        purpose: 'atividade',
        eligibility: 'decidir-depois',
        models: 'mesmo-modelo',
        format: 'digital',
        validation: 'sem-validacao',
      },
      overall: 'stop',
      stopRules: ['responsavel-ausente', 'elegibilidade-indefinida'],
    },
  ];

  for (const item of representative) {
    const first = planCertificates(item.choices);
    const second = planCertificates(item.choices);
    assert.ok(first, JSON.stringify(item.choices));
    assert.deepEqual(first, second);
    assert.equal(first.overall, item.overall, JSON.stringify(item.choices));
    assert.deepEqual(first.stopRules, item.stopRules, JSON.stringify(item.choices));
  }

  let combinations = 0;
  const seenOverall = new Set();
  for (const purpose of PURPOSE_IDS) {
    for (const eligibility of ELIGIBILITY_IDS) {
      for (const models of MODEL_IDS) {
        for (const format of FORMAT_IDS) {
          for (const validation of VALIDATION_IDS) {
            const result = planCertificates({
              purpose, eligibility, models, format, validation,
            });
            assert.ok(result, `${purpose}+${eligibility}+${models}+${format}+${validation}`);
            assert.ok(STATUS_IDS.includes(result.overall), result.overall);
            seenOverall.add(result.overall);
            combinations += 1;
          }
        }
      }
    }
  }
  assert.equal(combinations, 432);
  assert.deepEqual([...seenOverall].sort(), [...STATUS_IDS].sort());
});

test('stop rules surgem de forma previsível e nenhuma combinação emite documento', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /id: 'responsavel-ausente',\s*title: 'Responsável ausente'/u);
  assert.match(planner, /id: 'elegibilidade-indefinida',\s*title: 'Elegibilidade indefinida'/u);
  assert.match(planner, /id: 'presenca-sem-fonte-confiavel',\s*title: 'Presença sem fonte confiável'/u);
  assert.match(planner, /id: 'trabalho-sem-aprovacao-apresentacao',\s*title: 'Trabalho sem aprovação ou apresentação confirmada'/u);
  assert.match(planner, /id: 'modelo-sem-campos-revisados',\s*title: 'Modelo sem campos revisados'/u);
  assert.match(planner, /id: 'validacao-publica-sem-politica',\s*title: 'Validação pública sem política'/u);
  assert.match(planner, /Regras de parada/u);
  assert.match(planner, /data-stop=\{item\.id\}/u);
  assert.match(planner, /Nenhuma combinação\s+emite documento ou\s+comprova participação/u);

  assert.deepEqual(
    stopRulesFor({
      purpose: 'participacao-evento',
      eligibility: 'inscricao-confirmada',
      models: 'mesmo-modelo',
      format: 'digital',
      validation: 'sem-validacao',
    }),
    [],
  );
  assert.deepEqual(
    stopRulesFor({
      purpose: 'participacao-evento',
      eligibility: 'presenca-futura',
      models: 'mesmo-modelo',
      format: 'digital',
      validation: 'sem-validacao',
    }),
    ['presenca-sem-fonte-confiavel'],
  );
  assert.equal(
    stopRulesFor({
      purpose: 'participacao-evento',
      eligibility: 'inscricao-confirmada',
      models: 'mesmo-modelo',
      format: 'impressao-sob-demanda',
      validation: 'sem-validacao',
    }).includes('modelo-sem-campos-revisados'),
    false,
  );
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
  assert.doesNotMatch(combined, /placeholder="[^"]*"|autocomplete=/u);
});

test('texto anti-claims deixa claro que a ferramenta não emite certificado, não comprova participação, não valida presença e não altera o evento', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.match(page, /ferramenta é orientativa/u);
  assert.match(page, /não emite certificado, não comprova\s*participação, não valida presença e não altera o evento/u);
  assert.match(page, /sem persistência/u);
  assert.match(page, /Não gera PDF, assinatura,\s*QR, hash, protocolo, segunda via/u);
  assert.match(page, /Nenhuma combinação emite documento ou\s*comprova participação/u);
  assert.match(page, /A EVA não decide/u);
  assert.match(page, /não afirma validade\s*jurídica, autenticidade, elegibilidade real nem disponibilidade\s*operacional/u);
  assert.match(planner, /não emite certificado, não comprova participação, não valida presença e não altera o evento/u);
  assert.match(planner, /não valida presença, não lê check-in/u);
  assert.match(planner, /não cria código, protocolo, URL, hash nem segunda via/u);

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
