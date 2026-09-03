import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/planejar-credenciamento/page.tsx';
const PLANNER = '../app/ajuda/planejar-credenciamento/credentialing-planner.tsx';
const CSS = '../app/ajuda/planejar-credenciamento/planejar-credenciamento.module.css';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const ARRIVAL_IDS = ['balcao-assistido', 'autoatendimento', 'combinacao'];
const IDENTIFICATION_IDS = ['confirmacao-nominal', 'qr-futuro', 'decidir-depois'];
const PRINTING_IDS = ['sem-impressao', 'com-impressao', 'decidir-depois'];
const CONCURRENCY_IDS = ['chegada-espacada', 'simultaneidade-moderada', 'pico-concentrado'];
const CONTINGENCY_IDS = ['contingencia-prevista', 'sem-contingencia', 'decidir-depois'];
const STOP_IDS = [
  'responsavel-operacional-ausente',
  'capacidade-atendimento-nao-confirmada',
  'equipamento-impressora-nao-validado',
  'acessibilidade-ponto-nao-revisada',
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
  /check-in realizado/iu,
  /QR validado/iu,
  /impressão concluída/iu,
  /credencial criada/iu,
  /presença registrada/iu,
  /disponibilidade operacional comprovada/iu,
  /compatibilidade de hardware certificada/iu,
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
  if (!choices.arrival) return 'Escolha o modelo preliminar de chegada.';
  if (!choices.identification) return 'Escolha a identificação prevista.';
  if (!choices.printing) return 'Indique se haverá impressão local de crachá ou etiqueta.';
  if (!choices.concurrency) return 'Escolha a faixa genérica de simultaneidade de chegada.';
  if (!choices.contingency) return 'Indique se haverá contingência offline ou manual.';
  return null;
}

function stopRulesFor(choices) {
  const rules = [];
  if (choices.arrival === 'autoatendimento' || choices.arrival === 'combinacao') {
    rules.push('responsavel-operacional-ausente');
  }
  if (
    choices.concurrency === 'simultaneidade-moderada'
    || choices.concurrency === 'pico-concentrado'
    || choices.arrival === 'combinacao'
  ) {
    rules.push('capacidade-atendimento-nao-confirmada');
  }
  if (choices.printing === 'com-impressao') {
    rules.push('equipamento-impressora-nao-validado');
  }
  if (choices.arrival === 'autoatendimento' || choices.arrival === 'combinacao') {
    rules.push('acessibilidade-ponto-nao-revisada');
  }
  if (choices.contingency === 'sem-contingencia') {
    rules.push('contingencia-inexistente');
  }
  return rules;
}

function statusForDimension(dimension, value) {
  if (value === 'decidir-depois') return 'later';
  if (dimension === 'arrival' && (value === 'autoatendimento' || value === 'combinacao')) return 'stop';
  if (dimension === 'printing' && value === 'com-impressao') return 'stop';
  if (dimension === 'concurrency' && (value === 'simultaneidade-moderada' || value === 'pico-concentrado')) return 'stop';
  if (dimension === 'contingency' && value === 'sem-contingencia') return 'stop';
  return 'planned';
}

function overallStatusFor(choices, rules) {
  if (rules.length > 0) return 'stop';
  if (
    choices.identification === 'decidir-depois'
    || choices.printing === 'decidir-depois'
    || choices.contingency === 'decidir-depois'
  ) {
    return 'later';
  }
  return 'planned';
}

function planCredentialing(choices) {
  if (nextStepFor(choices)) return null;
  const rules = stopRulesFor(choices);
  return {
    overall: overallStatusFor(choices, rules),
    dimensions: {
      arrival: statusForDimension('arrival', choices.arrival),
      identification: statusForDimension('identification', choices.identification),
      printing: statusForDimension('printing', choices.printing),
      concurrency: statusForDimension('concurrency', choices.concurrency),
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
  assert.match(page, /<h1>Planejar credenciamento<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
  assert.match(page, /title: 'Planejar credenciamento — orientação local'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /from ['"].*public-site-header['"]/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /<CredentialingPlanner \/>/u);
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

  assert.match(planner, /legend: 'Modelo preliminar de chegada'/u);
  assert.match(planner, /legend: 'Identificação prevista'/u);
  assert.match(planner, /legend: 'Impressão local'/u);
  assert.match(planner, /legend: 'Faixa de simultaneidade de chegada'/u);
  assert.match(planner, /legend: 'Contingência offline ou manual'/u);
  assert.match(planner, /hintId: 'arrival-hint'/u);
  assert.match(planner, /hintId: 'identification-hint'/u);
  assert.match(planner, /hintId: 'printing-hint'/u);
  assert.match(planner, /hintId: 'concurrency-hint'/u);
  assert.match(planner, /hintId: 'contingency-hint'/u);
  assert.match(planner, /id: 'decidir-depois'/u);
});

test('catálogos fechados das cinco dimensões, com decidir depois e sem campo livre', async () => {
  const planner = await source(PLANNER);
  const arrival = parseOptions(planner, 'export const ARRIVAL_OPTIONS', 'export const IDENTIFICATION_OPTIONS');
  const identification = parseOptions(planner, 'export const IDENTIFICATION_OPTIONS', 'export const PRINTING_OPTIONS');
  const printing = parseOptions(planner, 'export const PRINTING_OPTIONS', 'export const CONCURRENCY_OPTIONS');
  const concurrency = parseOptions(planner, 'export const CONCURRENCY_OPTIONS', 'export const CONTINGENCY_OPTIONS');
  const contingency = parseOptions(planner, 'export const CONTINGENCY_OPTIONS', 'export const STOP_RULES');

  assert.deepEqual(arrival.map((item) => item.id), ARRIVAL_IDS);
  assert.deepEqual(identification.map((item) => item.id), IDENTIFICATION_IDS);
  assert.deepEqual(printing.map((item) => item.id), PRINTING_IDS);
  assert.deepEqual(concurrency.map((item) => item.id), CONCURRENCY_IDS);
  assert.deepEqual(contingency.map((item) => item.id), CONTINGENCY_IDS);
  assert.deepEqual(
    arrival.map((item) => item.label),
    ['Balcão assistido', 'Autoatendimento', 'Combinação dos dois'],
  );
  assert.deepEqual(
    identification.map((item) => item.label),
    ['Confirmação nominal', 'QR já emitido por fluxo futuro', 'Decidir depois'],
  );
  assert.deepEqual(
    printing.map((item) => item.label),
    ['Sem impressão local prevista', 'Haverá impressão local de crachá ou etiqueta', 'Decidir depois'],
  );
  assert.deepEqual(
    concurrency.map((item) => item.label),
    ['Chegada espaçada', 'Simultaneidade moderada', 'Pico concentrado'],
  );
  assert.deepEqual(
    contingency.map((item) => item.label),
    ['Contingência offline ou manual prevista', 'Sem contingência prevista', 'Decidir depois'],
  );

  for (const option of [...arrival, ...identification, ...printing, ...concurrency, ...contingency]) {
    assert.ok(option.help.length > 20, option.id);
  }

  assert.match(planner, /Não peça nome, documento ou dado pessoal nesta página/u);
  assert.match(planner, /não lê, não valida e não pede QR/u);
  assert.match(planner, /não valida impressora, não imprime e não cria crachá/u);
  assert.match(planner, /Não informe número exato de participantes/u);
  assert.match(planner, /não sincroniza e não implementa fallback/u);
});

test('combinações completas geram resultado determinístico e incompletas orientam o próximo passo', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /if \(choices\.arrival === 'autoatendimento' \|\| choices\.arrival === 'combinacao'\) \{\s*rules\.push\('responsavel-operacional-ausente'\)/u);
  assert.match(planner, /if \(\s*choices\.concurrency === 'simultaneidade-moderada'\s*\|\| choices\.concurrency === 'pico-concentrado'\s*\|\| choices\.arrival === 'combinacao'\s*\) \{\s*rules\.push\('capacidade-atendimento-nao-confirmada'\)/u);
  assert.match(planner, /if \(choices\.printing === 'com-impressao'\) \{\s*rules\.push\('equipamento-impressora-nao-validado'\)/u);
  assert.match(planner, /if \(choices\.arrival === 'autoatendimento' \|\| choices\.arrival === 'combinacao'\) \{\s*rules\.push\('acessibilidade-ponto-nao-revisada'\)/u);
  assert.match(planner, /if \(choices\.contingency === 'sem-contingencia'\) \{\s*rules\.push\('contingencia-inexistente'\)/u);

  assert.equal(planCredentialing({
    arrival: '', identification: '', printing: '', concurrency: '', contingency: '',
  }), null);
  assert.equal(
    nextStepFor({ arrival: '', identification: '', printing: '', concurrency: '', contingency: '' }),
    'Escolha o modelo preliminar de chegada.',
  );
  assert.equal(
    nextStepFor({ arrival: 'balcao-assistido', identification: '', printing: '', concurrency: '', contingency: '' }),
    'Escolha a identificação prevista.',
  );
  assert.equal(
    nextStepFor({
      arrival: 'balcao-assistido', identification: 'confirmacao-nominal', printing: '', concurrency: '', contingency: '',
    }),
    'Indique se haverá impressão local de crachá ou etiqueta.',
  );
  assert.equal(
    nextStepFor({
      arrival: 'balcao-assistido',
      identification: 'confirmacao-nominal',
      printing: 'sem-impressao',
      concurrency: '',
      contingency: '',
    }),
    'Escolha a faixa genérica de simultaneidade de chegada.',
  );
  assert.equal(
    nextStepFor({
      arrival: 'balcao-assistido',
      identification: 'confirmacao-nominal',
      printing: 'sem-impressao',
      concurrency: 'chegada-espacada',
      contingency: '',
    }),
    'Indique se haverá contingência offline ou manual.',
  );

  const representative = [
    {
      choices: {
        arrival: 'balcao-assistido',
        identification: 'confirmacao-nominal',
        printing: 'sem-impressao',
        concurrency: 'chegada-espacada',
        contingency: 'contingencia-prevista',
      },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: {
        arrival: 'balcao-assistido',
        identification: 'qr-futuro',
        printing: 'sem-impressao',
        concurrency: 'chegada-espacada',
        contingency: 'contingencia-prevista',
      },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: {
        arrival: 'balcao-assistido',
        identification: 'decidir-depois',
        printing: 'decidir-depois',
        concurrency: 'chegada-espacada',
        contingency: 'decidir-depois',
      },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: {
        arrival: 'autoatendimento',
        identification: 'confirmacao-nominal',
        printing: 'sem-impressao',
        concurrency: 'chegada-espacada',
        contingency: 'contingencia-prevista',
      },
      overall: 'stop',
      stopRules: ['responsavel-operacional-ausente', 'acessibilidade-ponto-nao-revisada'],
    },
    {
      choices: {
        arrival: 'combinacao',
        identification: 'confirmacao-nominal',
        printing: 'sem-impressao',
        concurrency: 'chegada-espacada',
        contingency: 'contingencia-prevista',
      },
      overall: 'stop',
      stopRules: [
        'responsavel-operacional-ausente',
        'capacidade-atendimento-nao-confirmada',
        'acessibilidade-ponto-nao-revisada',
      ],
    },
    {
      choices: {
        arrival: 'balcao-assistido',
        identification: 'confirmacao-nominal',
        printing: 'com-impressao',
        concurrency: 'chegada-espacada',
        contingency: 'contingencia-prevista',
      },
      overall: 'stop',
      stopRules: ['equipamento-impressora-nao-validado'],
    },
    {
      choices: {
        arrival: 'balcao-assistido',
        identification: 'confirmacao-nominal',
        printing: 'sem-impressao',
        concurrency: 'simultaneidade-moderada',
        contingency: 'contingencia-prevista',
      },
      overall: 'stop',
      stopRules: ['capacidade-atendimento-nao-confirmada'],
    },
    {
      choices: {
        arrival: 'balcao-assistido',
        identification: 'confirmacao-nominal',
        printing: 'sem-impressao',
        concurrency: 'pico-concentrado',
        contingency: 'contingencia-prevista',
      },
      overall: 'stop',
      stopRules: ['capacidade-atendimento-nao-confirmada'],
    },
    {
      choices: {
        arrival: 'balcao-assistido',
        identification: 'confirmacao-nominal',
        printing: 'sem-impressao',
        concurrency: 'chegada-espacada',
        contingency: 'sem-contingencia',
      },
      overall: 'stop',
      stopRules: ['contingencia-inexistente'],
    },
    {
      choices: {
        arrival: 'autoatendimento',
        identification: 'qr-futuro',
        printing: 'com-impressao',
        concurrency: 'pico-concentrado',
        contingency: 'sem-contingencia',
      },
      overall: 'stop',
      stopRules: STOP_IDS,
    },
    {
      choices: {
        arrival: 'balcao-assistido',
        identification: 'decidir-depois',
        printing: 'sem-impressao',
        concurrency: 'chegada-espacada',
        contingency: 'contingencia-prevista',
      },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: {
        arrival: 'autoatendimento',
        identification: 'decidir-depois',
        printing: 'sem-impressao',
        concurrency: 'chegada-espacada',
        contingency: 'contingencia-prevista',
      },
      overall: 'stop',
      stopRules: ['responsavel-operacional-ausente', 'acessibilidade-ponto-nao-revisada'],
    },
  ];

  for (const item of representative) {
    const first = planCredentialing(item.choices);
    const second = planCredentialing(item.choices);
    assert.ok(first, JSON.stringify(item.choices));
    assert.deepEqual(first, second);
    assert.equal(first.overall, item.overall, JSON.stringify(item.choices));
    assert.deepEqual(first.stopRules, item.stopRules, JSON.stringify(item.choices));
  }

  let combinations = 0;
  const seenOverall = new Set();
  for (const arrival of ARRIVAL_IDS) {
    for (const identification of IDENTIFICATION_IDS) {
      for (const printing of PRINTING_IDS) {
        for (const concurrency of CONCURRENCY_IDS) {
          for (const contingency of CONTINGENCY_IDS) {
            const result = planCredentialing({
              arrival, identification, printing, concurrency, contingency,
            });
            assert.ok(result, `${arrival}+${identification}+${printing}+${concurrency}+${contingency}`);
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

  assert.match(planner, /id: 'responsavel-operacional-ausente',\s*title: 'Responsável operacional ausente'/u);
  assert.match(planner, /id: 'capacidade-atendimento-nao-confirmada',\s*title: 'Capacidade de atendimento não confirmada'/u);
  assert.match(planner, /id: 'equipamento-impressora-nao-validado',\s*title: 'Equipamento ou impressora não validado'/u);
  assert.match(planner, /id: 'acessibilidade-ponto-nao-revisada',\s*title: 'Acessibilidade do ponto não revisada'/u);
  assert.match(planner, /id: 'contingencia-inexistente',\s*title: 'Contingência inexistente'/u);
  assert.match(planner, /Regras de parada/u);
  assert.match(planner, /data-stop=\{item\.id\}/u);
  assert.match(planner, /Nenhuma combinação\s+autoriza operação real/u);

  assert.deepEqual(
    stopRulesFor({
      arrival: 'balcao-assistido',
      identification: 'confirmacao-nominal',
      printing: 'sem-impressao',
      concurrency: 'chegada-espacada',
      contingency: 'contingencia-prevista',
    }),
    [],
  );
  assert.deepEqual(
    stopRulesFor({
      arrival: 'autoatendimento',
      identification: 'confirmacao-nominal',
      printing: 'sem-impressao',
      concurrency: 'chegada-espacada',
      contingency: 'contingencia-prevista',
    }),
    ['responsavel-operacional-ausente', 'acessibilidade-ponto-nao-revisada'],
  );
  assert.equal(
    stopRulesFor({
      arrival: 'balcao-assistido',
      identification: 'qr-futuro',
      printing: 'sem-impressao',
      concurrency: 'chegada-espacada',
      contingency: 'contingencia-prevista',
    }).includes('equipamento-impressora-nao-validado'),
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
  assert.doesNotMatch(combined, /RFID|catraca|reconhecimento facial|face-api|kiosk/iu);
  assert.doesNotMatch(combined, /placeholder="[^"]*"|autocomplete=/u);
});

test('texto anti-claims deixa claro que a ferramenta não faz check-in, não valida QR, não imprime, não cria credencial e não registra presença', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.match(page, /ferramenta é orientativa/u);
  assert.match(page, /não faz check-in, não\s*valida QR, não imprime, não cria credencial e não registra presença/u);
  assert.match(page, /sem persistência/u);
  assert.match(page, /Não configura dispositivo,\s*impressora, leitor, rede/u);
  assert.match(page, /Nenhuma combinação autoriza operação real/u);
  assert.match(page, /A EVA não decide/u);
  assert.match(page, /não afirma disponibilidade operacional, compatibilidade\s*de hardware nem certificação de acessibilidade/u);
  assert.match(planner, /não faz check-in, não valida QR, não imprime, não cria credencial e não registra presença/u);
  assert.match(planner, /não lê, não valida e não pede QR/u);
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
