import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/planejar-programacao/page.tsx';
const PLANNER = '../app/ajuda/planejar-programacao/schedule-planner.tsx';
const CSS = '../app/ajuda/planejar-programacao/planejar-programacao.module.css';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const STRUCTURE_IDS = ['atividade-unica', 'trilha-sequencial', 'programacao-paralela'];
const DURATION_IDS = ['um-periodo', 'um-dia', 'multiplos-dias'];
const ROOM_IDS = ['unico', 'multiplos', 'decidir-depois'];
const SPEAKER_IDS = ['sem-convidadas', 'com-convidadas', 'decidir-depois'];
const CAPACITY_IDS = ['sem-capacidade', 'com-capacidade', 'decidir-depois'];
const STOP_IDS = [
  'conflito-horarios-nao-tratado',
  'ambiente-responsavel-ausente',
  'capacidade-sem-criterio',
  'atividade-paralela-sem-orientacao',
  'acessibilidade-percurso-nao-revisada',
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
  /agenda criada/iu,
  /atividade criada/iu,
  /sala criada/iu,
  /reserva confirmada/iu,
  /sem conflitos automaticamente/iu,
  /conflitos resolvidos automaticamente/iu,
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
  if (!choices.structure) return 'Escolha a estrutura preliminar da programação.';
  if (!choices.duration) return 'Escolha a duração preliminar, sem informar datas.';
  if (!choices.rooms) return 'Indique a necessidade genérica de salas ou ambientes.';
  if (!choices.speakers) return 'Indique se haverá pessoas convidadas ou palestrantes.';
  if (!choices.capacity) return 'Indique se as atividades poderão exigir inscrição ou capacidade específica.';
  return null;
}

function stopRulesFor(choices) {
  const rules = [];
  if (
    choices.structure === 'trilha-sequencial'
    || choices.structure === 'programacao-paralela'
    || choices.duration === 'multiplos-dias'
  ) {
    rules.push('conflito-horarios-nao-tratado');
  }
  if (choices.rooms === 'multiplos' || choices.speakers === 'com-convidadas') {
    rules.push('ambiente-responsavel-ausente');
  }
  if (choices.capacity === 'com-capacidade') {
    rules.push('capacidade-sem-criterio');
  }
  if (choices.structure === 'programacao-paralela') {
    rules.push('atividade-paralela-sem-orientacao');
  }
  if (
    choices.structure === 'trilha-sequencial'
    || choices.structure === 'programacao-paralela'
    || choices.rooms === 'multiplos'
    || choices.duration === 'multiplos-dias'
  ) {
    rules.push('acessibilidade-percurso-nao-revisada');
  }
  return rules;
}

function statusForDimension(dimension, value) {
  if (value === 'decidir-depois') return 'later';
  if (dimension === 'structure' && (value === 'trilha-sequencial' || value === 'programacao-paralela')) return 'stop';
  if (dimension === 'duration' && value === 'multiplos-dias') return 'stop';
  if (dimension === 'rooms' && value === 'multiplos') return 'stop';
  if (dimension === 'speakers' && value === 'com-convidadas') return 'stop';
  if (dimension === 'capacity' && value === 'com-capacidade') return 'stop';
  return 'planned';
}

function overallStatusFor(choices, rules) {
  if (rules.length > 0) return 'stop';
  if (
    choices.rooms === 'decidir-depois'
    || choices.speakers === 'decidir-depois'
    || choices.capacity === 'decidir-depois'
  ) {
    return 'later';
  }
  return 'planned';
}

function planSchedule(choices) {
  if (nextStepFor(choices)) return null;
  const rules = stopRulesFor(choices);
  return {
    overall: overallStatusFor(choices, rules),
    dimensions: {
      structure: statusForDimension('structure', choices.structure),
      duration: statusForDimension('duration', choices.duration),
      rooms: statusForDimension('rooms', choices.rooms),
      speakers: statusForDimension('speakers', choices.speakers),
      capacity: statusForDimension('capacity', choices.capacity),
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
  assert.match(page, /<h1>Planejar programação<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
  assert.match(page, /title: 'Planejar programação — orientação local'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /from ['"].*public-site-header['"]/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /<SchedulePlanner \/>/u);
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
  assert.doesNotMatch(planner, /type="text"|type="email"|type="tel"|type="url"|type="number"/u);
  assert.doesNotMatch(planner, /<select\b/u);
  assert.doesNotMatch(planner, /<form\b/u);

  assert.match(planner, /legend: 'Estrutura preliminar'/u);
  assert.match(planner, /legend: 'Duração preliminar'/u);
  assert.match(planner, /legend: 'Salas ou ambientes'/u);
  assert.match(planner, /legend: 'Pessoas convidadas'/u);
  assert.match(planner, /legend: 'Inscrição ou capacidade'/u);
  assert.match(planner, /hintId: 'structure-hint'/u);
  assert.match(planner, /hintId: 'duration-hint'/u);
  assert.match(planner, /hintId: 'rooms-hint'/u);
  assert.match(planner, /hintId: 'speakers-hint'/u);
  assert.match(planner, /hintId: 'capacity-hint'/u);
  assert.match(planner, /id: 'decidir-depois'/u);
});

test('catálogos fechados das cinco dimensões, com decidir depois onde cabe e sem campo livre', async () => {
  const planner = await source(PLANNER);
  const structure = parseOptions(planner, 'export const STRUCTURE_OPTIONS', 'export const DURATION_OPTIONS');
  const duration = parseOptions(planner, 'export const DURATION_OPTIONS', 'export const ROOM_OPTIONS');
  const rooms = parseOptions(planner, 'export const ROOM_OPTIONS', 'export const SPEAKER_OPTIONS');
  const speakers = parseOptions(planner, 'export const SPEAKER_OPTIONS', 'export const CAPACITY_OPTIONS');
  const capacity = parseOptions(planner, 'export const CAPACITY_OPTIONS', 'export const STOP_RULES');

  assert.deepEqual(structure.map((item) => item.id), STRUCTURE_IDS);
  assert.deepEqual(duration.map((item) => item.id), DURATION_IDS);
  assert.deepEqual(rooms.map((item) => item.id), ROOM_IDS);
  assert.deepEqual(speakers.map((item) => item.id), SPEAKER_IDS);
  assert.deepEqual(capacity.map((item) => item.id), CAPACITY_IDS);
  assert.deepEqual(
    structure.map((item) => item.label),
    ['Atividade única', 'Trilha sequencial', 'Programação paralela'],
  );
  assert.deepEqual(
    duration.map((item) => item.label),
    ['Um período', 'Um dia', 'Múltiplos dias'],
  );
  assert.deepEqual(
    rooms.map((item) => item.label),
    ['Ambiente único', 'Múltiplos ambientes', 'Decidir depois'],
  );
  assert.deepEqual(
    speakers.map((item) => item.label),
    ['Sem pessoas convidadas neste planejamento', 'Haverá pessoas convidadas ou palestrantes', 'Decidir depois'],
  );
  assert.deepEqual(
    capacity.map((item) => item.label),
    ['Sem inscrição ou capacidade específica', 'Atividades poderão exigir inscrição ou capacidade específica', 'Decidir depois'],
  );

  for (const option of [...structure, ...duration, ...rooms, ...speakers, ...capacity]) {
    assert.ok(option.help.length > 20, option.id);
  }

  assert.match(planner, /Não cria atividade, título, horário nem reserva/u);
  assert.match(planner, /Não há seletor de data, hora ou calendário nesta página/u);
  assert.match(planner, /não pede nome, não cria palestrante e não envia convite/u);
  assert.match(planner, /não configura inscrição de atividade nem pagamento/u);
});

test('combinações completas geram resultado determinístico e incompletas orientam o próximo passo', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /if \(\s*choices\.structure === 'trilha-sequencial'\s*\|\| choices\.structure === 'programacao-paralela'\s*\|\| choices\.duration === 'multiplos-dias'\s*\)/u);
  assert.match(planner, /if \(choices\.rooms === 'multiplos' \|\| choices\.speakers === 'com-convidadas'\) \{\s*rules\.push\('ambiente-responsavel-ausente'\)/u);
  assert.match(planner, /if \(choices\.capacity === 'com-capacidade'\) \{\s*rules\.push\('capacidade-sem-criterio'\)/u);
  assert.match(planner, /if \(choices\.structure === 'programacao-paralela'\) \{\s*rules\.push\('atividade-paralela-sem-orientacao'\)/u);
  assert.match(planner, /rules\.push\('acessibilidade-percurso-nao-revisada'\)/u);

  assert.equal(planSchedule({
    structure: '',
    duration: '',
    rooms: '',
    speakers: '',
    capacity: '',
  }), null);
  assert.equal(
    nextStepFor({ structure: '', duration: '', rooms: '', speakers: '', capacity: '' }),
    'Escolha a estrutura preliminar da programação.',
  );
  assert.equal(
    nextStepFor({ structure: 'atividade-unica', duration: '', rooms: '', speakers: '', capacity: '' }),
    'Escolha a duração preliminar, sem informar datas.',
  );
  assert.equal(
    nextStepFor({
      structure: 'atividade-unica',
      duration: 'um-periodo',
      rooms: '',
      speakers: '',
      capacity: '',
    }),
    'Indique a necessidade genérica de salas ou ambientes.',
  );
  assert.equal(
    nextStepFor({
      structure: 'atividade-unica',
      duration: 'um-periodo',
      rooms: 'unico',
      speakers: '',
      capacity: '',
    }),
    'Indique se haverá pessoas convidadas ou palestrantes.',
  );
  assert.equal(
    nextStepFor({
      structure: 'atividade-unica',
      duration: 'um-periodo',
      rooms: 'unico',
      speakers: 'sem-convidadas',
      capacity: '',
    }),
    'Indique se as atividades poderão exigir inscrição ou capacidade específica.',
  );

  const representative = [
    {
      choices: {
        structure: 'atividade-unica',
        duration: 'um-periodo',
        rooms: 'unico',
        speakers: 'sem-convidadas',
        capacity: 'sem-capacidade',
      },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: {
        structure: 'atividade-unica',
        duration: 'um-dia',
        rooms: 'unico',
        speakers: 'sem-convidadas',
        capacity: 'sem-capacidade',
      },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: {
        structure: 'atividade-unica',
        duration: 'um-periodo',
        rooms: 'decidir-depois',
        speakers: 'sem-convidadas',
        capacity: 'sem-capacidade',
      },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: {
        structure: 'atividade-unica',
        duration: 'um-dia',
        rooms: 'unico',
        speakers: 'decidir-depois',
        capacity: 'decidir-depois',
      },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: {
        structure: 'trilha-sequencial',
        duration: 'um-periodo',
        rooms: 'unico',
        speakers: 'sem-convidadas',
        capacity: 'sem-capacidade',
      },
      overall: 'stop',
      stopRules: ['conflito-horarios-nao-tratado', 'acessibilidade-percurso-nao-revisada'],
    },
    {
      choices: {
        structure: 'programacao-paralela',
        duration: 'um-periodo',
        rooms: 'unico',
        speakers: 'sem-convidadas',
        capacity: 'sem-capacidade',
      },
      overall: 'stop',
      stopRules: [
        'conflito-horarios-nao-tratado',
        'atividade-paralela-sem-orientacao',
        'acessibilidade-percurso-nao-revisada',
      ],
    },
    {
      choices: {
        structure: 'atividade-unica',
        duration: 'multiplos-dias',
        rooms: 'unico',
        speakers: 'sem-convidadas',
        capacity: 'sem-capacidade',
      },
      overall: 'stop',
      stopRules: ['conflito-horarios-nao-tratado', 'acessibilidade-percurso-nao-revisada'],
    },
    {
      choices: {
        structure: 'atividade-unica',
        duration: 'um-periodo',
        rooms: 'multiplos',
        speakers: 'sem-convidadas',
        capacity: 'sem-capacidade',
      },
      overall: 'stop',
      stopRules: ['ambiente-responsavel-ausente', 'acessibilidade-percurso-nao-revisada'],
    },
    {
      choices: {
        structure: 'atividade-unica',
        duration: 'um-periodo',
        rooms: 'unico',
        speakers: 'com-convidadas',
        capacity: 'sem-capacidade',
      },
      overall: 'stop',
      stopRules: ['ambiente-responsavel-ausente'],
    },
    {
      choices: {
        structure: 'atividade-unica',
        duration: 'um-periodo',
        rooms: 'unico',
        speakers: 'sem-convidadas',
        capacity: 'com-capacidade',
      },
      overall: 'stop',
      stopRules: ['capacidade-sem-criterio'],
    },
    {
      choices: {
        structure: 'programacao-paralela',
        duration: 'multiplos-dias',
        rooms: 'multiplos',
        speakers: 'com-convidadas',
        capacity: 'com-capacidade',
      },
      overall: 'stop',
      stopRules: STOP_IDS,
    },
    {
      choices: {
        structure: 'trilha-sequencial',
        duration: 'um-dia',
        rooms: 'decidir-depois',
        speakers: 'decidir-depois',
        capacity: 'decidir-depois',
      },
      overall: 'stop',
      stopRules: ['conflito-horarios-nao-tratado', 'acessibilidade-percurso-nao-revisada'],
    },
  ];

  for (const item of representative) {
    const first = planSchedule(item.choices);
    const second = planSchedule(item.choices);
    assert.ok(first, JSON.stringify(item.choices));
    assert.deepEqual(first, second);
    assert.equal(first.overall, item.overall, JSON.stringify(item.choices));
    assert.deepEqual(first.stopRules, item.stopRules, JSON.stringify(item.choices));
  }

  let combinations = 0;
  const seenOverall = new Set();
  for (const structure of STRUCTURE_IDS) {
    for (const duration of DURATION_IDS) {
      for (const rooms of ROOM_IDS) {
        for (const speakers of SPEAKER_IDS) {
          for (const capacity of CAPACITY_IDS) {
            const result = planSchedule({ structure, duration, rooms, speakers, capacity });
            assert.ok(result, `${structure}+${duration}+${rooms}+${speakers}+${capacity}`);
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

test('stop rules surgem de forma previsível para escolhas que exigem decisão humana', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /id: 'conflito-horarios-nao-tratado',\s*title: 'Conflito de horários não tratado'/u);
  assert.match(planner, /id: 'ambiente-responsavel-ausente',\s*title: 'Ambiente ou responsável ausente'/u);
  assert.match(planner, /id: 'capacidade-sem-criterio',\s*title: 'Capacidade sem critério'/u);
  assert.match(planner, /id: 'atividade-paralela-sem-orientacao',\s*title: 'Atividade paralela sem orientação'/u);
  assert.match(planner, /id: 'acessibilidade-percurso-nao-revisada',\s*title: 'Acessibilidade do percurso não revisada'/u);
  assert.match(planner, /Regras de parada/u);
  assert.match(planner, /data-stop=\{item\.id\}/u);

  assert.deepEqual(
    stopRulesFor({
      structure: 'atividade-unica',
      duration: 'um-periodo',
      rooms: 'unico',
      speakers: 'sem-convidadas',
      capacity: 'sem-capacidade',
    }),
    [],
  );
  assert.deepEqual(
    stopRulesFor({
      structure: 'programacao-paralela',
      duration: 'um-periodo',
      rooms: 'unico',
      speakers: 'sem-convidadas',
      capacity: 'sem-capacidade',
    }),
    [
      'conflito-horarios-nao-tratado',
      'atividade-paralela-sem-orientacao',
      'acessibilidade-percurso-nao-revisada',
    ],
  );
  assert.equal(
    stopRulesFor({
      structure: 'atividade-unica',
      duration: 'um-periodo',
      rooms: 'unico',
      speakers: 'sem-convidadas',
      capacity: 'sem-capacidade',
    }).includes('capacidade-sem-criterio'),
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

test('não há persistência, fetch, submit de formulário, calendário nem HTML inseguro', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.doesNotMatch(combined, /localStorage|sessionStorage|indexedDB|document\.cookie/u);
  assert.doesNotMatch(combined, /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/u);
  assert.doesNotMatch(combined, /<form\b/u);
  assert.doesNotMatch(combined, /type="submit"|action=|method=/u);
  assert.doesNotMatch(combined, /dangerouslySetInnerHTML|innerHTML/u);
  assert.doesNotMatch(combined, /gtag\(|google-analytics|fbq\(|navigator\.sendBeacon/iu);
  assert.doesNotMatch(planner, /window\.|document\./u);
  assert.doesNotMatch(combined, /type="date"|type="time"|type="datetime-local"|type="month"|type="week"/u);
  assert.doesNotMatch(combined, /<input[^>]*type="file"/u);
  assert.doesNotMatch(combined, /DatePicker|datetime-local|google calendar|ics\b|text\/calendar/iu);
  assert.doesNotMatch(combined, /new Date\(|Date\.now\(|Intl\.DateTimeFormat/u);
});

test('texto anti-claims deixa claro que a ferramenta não cria agenda, atividade, sala, palestrante, inscrição, reserva ou publicação', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.match(page, /ferramenta é orientativa/u);
  assert.match(page, /não cria agenda, atividade, sala, palestrante,\s*inscrição, reserva ou publicação/u);
  assert.match(page, /sem persistência/u);
  assert.match(page, /Nenhuma combinação autoriza programação real/u);
  assert.match(page, /A EVA não decide/u);
  assert.match(page, /ausência automática de conflitos/u);
  assert.match(page, /calendário integrado/u);
  assert.match(planner, /não cria agenda, atividade, sala, palestrante, inscrição, reserva ou publicação/u);
  assert.match(planner, /não afirma ausência automática de conflitos/u);
  assert.match(planner, /não certifica acessibilidade/u);
  assert.match(planner, /Isto não autoriza\s*programação real/u);

  for (const pattern of ANTI_CLAIM_FORBIDDEN) {
    assert.doesNotMatch(combined, pattern);
  }
});

test('links são públicos comprovados, sem rota privada, PII, contato inventado ou integração de calendário', async () => {
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
  assert.doesNotMatch(combined, /calendar\.google|outlook\.live|webcal:/iu);
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
