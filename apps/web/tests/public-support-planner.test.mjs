import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/planejar-atendimento/page.tsx';
const PLANNER = '../app/ajuda/planejar-atendimento/support-planner.tsx';
const CSS = '../app/ajuda/planejar-atendimento/planejar-atendimento.module.css';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const MOMENT_IDS = ['antes', 'durante', 'depois'];
const CHANNEL_IDS = ['pagina-publica', 'email-corporativo', 'balcao-presencial', 'decidir-depois'];
const TOPIC_IDS = ['inscricao', 'pagamento', 'acesso', 'programacao', 'acessibilidade', 'certificado'];
const DEMAND_IDS = ['reduzida', 'moderada', 'alta'];
const ESCALATION_IDS = ['sem-escalonamento', 'escalonamento-previsto', 'decidir-depois'];
const ACCESSIBLE_IDS = ['alternativa-prevista', 'sem-alternativa', 'decidir-depois'];
const CRITICAL_TOPICS = ['pagamento', 'acesso', 'acessibilidade', 'certificado'];
const STOP_IDS = [
  'responsavel-ausente',
  'canal-nao-confirmado',
  'demanda-sem-capacidade',
  'orientacao-critica-inexistente',
  'alternativa-acessivel-ausente',
  'escalonamento-indefinido',
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
  /chamado aberto/iu,
  /ticket criado/iu,
  /mensagem enviada/iu,
  /atendimento real iniciado/iu,
  /atendimento disponível agora/iu,
  /canal confirmado e ativo/iu,
  /prazo de atendimento garantido/iu,
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
  if (choices.moments.length === 0) return 'Escolha ao menos um momento preliminar de suporte.';
  if (!choices.channel) return 'Escolha um canal apenas conceitual.';
  if (choices.topics.length === 0) return 'Indique ao menos um grupo de dúvidas esperadas.';
  if (!choices.demand) return 'Escolha a faixa genérica de demanda.';
  if (!choices.escalation) return 'Indique a necessidade de escalonamento humano.';
  if (!choices.accessible) return 'Indique se haverá alternativa acessível.';
  return null;
}

function stopRulesFor(choices) {
  const rules = [];
  if (choices.moments.includes('durante') || choices.channel === 'balcao-presencial') {
    rules.push('responsavel-ausente');
  }
  if (choices.channel === 'email-corporativo') {
    rules.push('canal-nao-confirmado');
  }
  if (choices.demand === 'moderada' || choices.demand === 'alta') {
    rules.push('demanda-sem-capacidade');
  }
  if (CRITICAL_TOPICS.some((topic) => choices.topics.includes(topic))) {
    rules.push('orientacao-critica-inexistente');
  }
  if (choices.accessible === 'sem-alternativa') {
    rules.push('alternativa-acessivel-ausente');
  }
  if (choices.escalation === 'decidir-depois') {
    rules.push('escalonamento-indefinido');
  }
  return rules;
}

function statusForDimension(dimension, choices) {
  if (dimension === 'moments') {
    return choices.moments.includes('durante') ? 'stop' : 'planned';
  }
  if (dimension === 'topics') {
    return CRITICAL_TOPICS.some((topic) => choices.topics.includes(topic)) ? 'stop' : 'planned';
  }
  if (dimension === 'channel') {
    if (choices.channel === 'decidir-depois') return 'later';
    if (choices.channel === 'email-corporativo' || choices.channel === 'balcao-presencial') return 'stop';
    return 'planned';
  }
  if (dimension === 'demand') {
    return choices.demand === 'moderada' || choices.demand === 'alta' ? 'stop' : 'planned';
  }
  if (dimension === 'escalation') {
    return choices.escalation === 'decidir-depois' ? 'stop' : 'planned';
  }
  if (choices.accessible === 'decidir-depois') return 'later';
  if (choices.accessible === 'sem-alternativa') return 'stop';
  return 'planned';
}

function overallStatusFor(choices, rules) {
  if (rules.length > 0) return 'stop';
  if (choices.channel === 'decidir-depois' || choices.accessible === 'decidir-depois') {
    return 'later';
  }
  return 'planned';
}

function planSupport(choices) {
  if (nextStepFor(choices)) return null;
  const rules = stopRulesFor(choices);
  return {
    overall: overallStatusFor(choices, rules),
    dimensions: {
      moments: statusForDimension('moments', choices),
      channel: statusForDimension('channel', choices),
      topics: statusForDimension('topics', choices),
      demand: statusForDimension('demand', choices),
      escalation: statusForDimension('escalation', choices),
      accessible: statusForDimension('accessible', choices),
    },
    stopRules: rules,
  };
}

const PLANNED_BASE = Object.freeze({
  moments: ['antes'],
  channel: 'pagina-publica',
  topics: ['inscricao'],
  demand: 'reduzida',
  escalation: 'sem-escalonamento',
  accessible: 'alternativa-prevista',
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
  assert.match(page, /<h1>Planejar atendimento<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
  assert.match(page, /title: 'Planejar atendimento — orientação local'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /from ['"].*public-site-header['"]/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /<SupportPlanner \/>/u);
});

test('componente cliente isola as seis dimensões com fieldset, legend, hint, rádios, caixas e decidir depois', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /['"]use client['"]/u);
  assert.equal([...planner.matchAll(/<fieldset\b/gu)].length, 2);
  assert.match(planner, /CHECKBOX_GROUPS\.map\(\(group\) => <fieldset/u);
  assert.match(planner, /RADIO_GROUPS\.map\(\(group\) => <fieldset/u);
  assert.match(planner, /<legend>\{group\.legend\}<\/legend>/u);
  assert.match(planner, /aria-describedby=\{group\.hintId\}/u);
  assert.match(planner, /htmlFor=\{`\$\{group\.id\}-\$\{option\.id\}`\}/u);
  assert.match(planner, /type="radio"/u);
  assert.match(planner, /type="checkbox"/u);
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

  assert.match(planner, /legend: 'Momentos preliminares de suporte'/u);
  assert.match(planner, /legend: 'Canal conceitual'/u);
  assert.match(planner, /legend: 'Grupos de dúvidas esperadas'/u);
  assert.match(planner, /legend: 'Faixa genérica de demanda'/u);
  assert.match(planner, /legend: 'Escalonamento humano'/u);
  assert.match(planner, /legend: 'Alternativa acessível'/u);
  assert.match(planner, /hintId: 'moments-hint'/u);
  assert.match(planner, /hintId: 'channel-hint'/u);
  assert.match(planner, /hintId: 'topics-hint'/u);
  assert.match(planner, /hintId: 'demand-hint'/u);
  assert.match(planner, /hintId: 'escalation-hint'/u);
  assert.match(planner, /hintId: 'accessible-hint'/u);
  assert.match(planner, /id: 'decidir-depois'/u);
});

test('catálogos fechados das seis dimensões, com decidir depois e sem campo livre', async () => {
  const planner = await source(PLANNER);
  const moments = parseOptions(planner, 'export const MOMENT_OPTIONS', 'export const CHANNEL_OPTIONS');
  const channels = parseOptions(planner, 'export const CHANNEL_OPTIONS', 'export const TOPIC_OPTIONS');
  const topics = parseOptions(planner, 'export const TOPIC_OPTIONS', 'export const DEMAND_OPTIONS');
  const demand = parseOptions(planner, 'export const DEMAND_OPTIONS', 'export const ESCALATION_OPTIONS');
  const escalation = parseOptions(planner, 'export const ESCALATION_OPTIONS', 'export const ACCESSIBLE_OPTIONS');
  const accessible = parseOptions(planner, 'export const ACCESSIBLE_OPTIONS', 'export const STOP_RULES');

  assert.deepEqual(moments.map((item) => item.id), MOMENT_IDS);
  assert.deepEqual(channels.map((item) => item.id), CHANNEL_IDS);
  assert.deepEqual(topics.map((item) => item.id), TOPIC_IDS);
  assert.deepEqual(demand.map((item) => item.id), DEMAND_IDS);
  assert.deepEqual(escalation.map((item) => item.id), ESCALATION_IDS);
  assert.deepEqual(accessible.map((item) => item.id), ACCESSIBLE_IDS);
  assert.deepEqual(
    moments.map((item) => item.label),
    ['Antes do evento', 'Durante o evento', 'Depois do evento'],
  );
  assert.deepEqual(
    channels.map((item) => item.label),
    ['Página pública', 'E-mail corporativo', 'Balcão presencial', 'Decidir depois'],
  );
  assert.deepEqual(
    topics.map((item) => item.label),
    ['Inscrição', 'Pagamento', 'Acesso', 'Programação', 'Acessibilidade', 'Certificado'],
  );
  assert.deepEqual(
    demand.map((item) => item.label),
    ['Demanda reduzida', 'Demanda moderada', 'Demanda alta'],
  );
  assert.deepEqual(
    escalation.map((item) => item.label),
    ['Sem escalonamento humano previsto', 'Haverá necessidade de escalonamento humano', 'Decidir depois'],
  );
  assert.deepEqual(
    accessible.map((item) => item.label),
    ['Alternativa acessível prevista', 'Sem alternativa acessível prevista', 'Decidir depois'],
  );

  for (const option of [...moments, ...channels, ...topics, ...demand, ...escalation, ...accessible]) {
    assert.ok(option.help.length > 20, option.id);
  }

  assert.match(planner, /Não peça endereço, não publique conteúdo/u);
  assert.match(planner, /Não peça endereço de e-mail, não envie mensagem/u);
  assert.match(planner, /Não peça endereço, não monte fila e não atribua pessoa/u);
  assert.match(planner, /Não informe quantidade, não estime fila/u);
  assert.match(planner, /Não certifique WCAG e não registre necessidade individual/u);
});

test('combinações completas geram resultado determinístico e incompletas orientam o próximo passo', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /if \(has\(choices\.moments, 'durante'\) \|\| choices\.channel === 'balcao-presencial'\) \{\s*rules\.push\('responsavel-ausente'\)/u);
  assert.match(planner, /if \(choices\.channel === 'email-corporativo'\) \{\s*rules\.push\('canal-nao-confirmado'\)/u);
  assert.match(planner, /if \(choices\.demand === 'moderada' \|\| choices\.demand === 'alta'\) \{\s*rules\.push\('demanda-sem-capacidade'\)/u);
  assert.match(planner, /if \(CRITICAL_TOPICS\.some\(\(topic\) => has\(choices\.topics, topic\)\)\) \{\s*rules\.push\('orientacao-critica-inexistente'\)/u);
  assert.match(planner, /if \(choices\.accessible === 'sem-alternativa'\) \{\s*rules\.push\('alternativa-acessivel-ausente'\)/u);
  assert.match(planner, /if \(choices\.escalation === 'decidir-depois'\) \{\s*rules\.push\('escalonamento-indefinido'\)/u);

  assert.equal(planSupport({
    moments: [], channel: '', topics: [], demand: '', escalation: '', accessible: '',
  }), null);
  assert.equal(
    nextStepFor({ moments: [], channel: '', topics: [], demand: '', escalation: '', accessible: '' }),
    'Escolha ao menos um momento preliminar de suporte.',
  );
  assert.equal(
    nextStepFor({ moments: ['antes'], channel: '', topics: [], demand: '', escalation: '', accessible: '' }),
    'Escolha um canal apenas conceitual.',
  );
  assert.equal(
    nextStepFor({
      moments: ['antes'], channel: 'pagina-publica', topics: [], demand: '', escalation: '', accessible: '',
    }),
    'Indique ao menos um grupo de dúvidas esperadas.',
  );
  assert.equal(
    nextStepFor({
      moments: ['antes'],
      channel: 'pagina-publica',
      topics: ['inscricao'],
      demand: '',
      escalation: '',
      accessible: '',
    }),
    'Escolha a faixa genérica de demanda.',
  );
  assert.equal(
    nextStepFor({
      moments: ['antes'],
      channel: 'pagina-publica',
      topics: ['inscricao'],
      demand: 'reduzida',
      escalation: '',
      accessible: '',
    }),
    'Indique a necessidade de escalonamento humano.',
  );
  assert.equal(
    nextStepFor({
      moments: ['antes'],
      channel: 'pagina-publica',
      topics: ['inscricao'],
      demand: 'reduzida',
      escalation: 'sem-escalonamento',
      accessible: '',
    }),
    'Indique se haverá alternativa acessível.',
  );

  const representative = [
    {
      choices: { ...PLANNED_BASE },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: {
        ...PLANNED_BASE,
        moments: ['antes', 'depois'],
        topics: ['inscricao', 'programacao'],
        escalation: 'escalonamento-previsto',
      },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: { ...PLANNED_BASE, channel: 'decidir-depois' },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: { ...PLANNED_BASE, accessible: 'decidir-depois' },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: { ...PLANNED_BASE, channel: 'decidir-depois', accessible: 'decidir-depois' },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: { ...PLANNED_BASE, moments: ['durante'] },
      overall: 'stop',
      stopRules: ['responsavel-ausente'],
    },
    {
      choices: { ...PLANNED_BASE, channel: 'balcao-presencial' },
      overall: 'stop',
      stopRules: ['responsavel-ausente'],
    },
    {
      choices: { ...PLANNED_BASE, channel: 'email-corporativo' },
      overall: 'stop',
      stopRules: ['canal-nao-confirmado'],
    },
    {
      choices: { ...PLANNED_BASE, demand: 'moderada' },
      overall: 'stop',
      stopRules: ['demanda-sem-capacidade'],
    },
    {
      choices: { ...PLANNED_BASE, demand: 'alta' },
      overall: 'stop',
      stopRules: ['demanda-sem-capacidade'],
    },
    {
      choices: { ...PLANNED_BASE, topics: ['pagamento'] },
      overall: 'stop',
      stopRules: ['orientacao-critica-inexistente'],
    },
    {
      choices: { ...PLANNED_BASE, topics: ['acesso'] },
      overall: 'stop',
      stopRules: ['orientacao-critica-inexistente'],
    },
    {
      choices: { ...PLANNED_BASE, topics: ['acessibilidade'] },
      overall: 'stop',
      stopRules: ['orientacao-critica-inexistente'],
    },
    {
      choices: { ...PLANNED_BASE, topics: ['certificado'] },
      overall: 'stop',
      stopRules: ['orientacao-critica-inexistente'],
    },
    {
      choices: { ...PLANNED_BASE, accessible: 'sem-alternativa' },
      overall: 'stop',
      stopRules: ['alternativa-acessivel-ausente'],
    },
    {
      choices: { ...PLANNED_BASE, escalation: 'decidir-depois' },
      overall: 'stop',
      stopRules: ['escalonamento-indefinido'],
    },
    {
      choices: {
        moments: ['durante'],
        channel: 'email-corporativo',
        topics: ['pagamento'],
        demand: 'alta',
        escalation: 'decidir-depois',
        accessible: 'sem-alternativa',
      },
      overall: 'stop',
      stopRules: STOP_IDS,
    },
    {
      choices: {
        moments: ['durante'],
        channel: 'decidir-depois',
        topics: ['inscricao'],
        demand: 'reduzida',
        escalation: 'sem-escalonamento',
        accessible: 'alternativa-prevista',
      },
      overall: 'stop',
      stopRules: ['responsavel-ausente'],
    },
  ];

  for (const item of representative) {
    const first = planSupport(item.choices);
    const second = planSupport(item.choices);
    assert.ok(first, JSON.stringify(item.choices));
    assert.deepEqual(first, second);
    assert.equal(first.overall, item.overall, JSON.stringify(item.choices));
    assert.deepEqual(first.stopRules, item.stopRules, JSON.stringify(item.choices));
  }

  let combinations = 0;
  const seenOverall = new Set();
  for (const channel of CHANNEL_IDS) {
    for (const demand of DEMAND_IDS) {
      for (const escalation of ESCALATION_IDS) {
        for (const accessible of ACCESSIBLE_IDS) {
          const result = planSupport({
            moments: ['antes'],
            channel,
            topics: ['inscricao'],
            demand,
            escalation,
            accessible,
          });
          assert.ok(result, `${channel}+${demand}+${escalation}+${accessible}`);
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

test('stop rules surgem de forma previsível e nenhuma combinação abre chamado ou promete atendimento', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /id: 'responsavel-ausente',\s*title: 'Responsável ausente'/u);
  assert.match(planner, /id: 'canal-nao-confirmado',\s*title: 'Canal não confirmado'/u);
  assert.match(planner, /id: 'demanda-sem-capacidade',\s*title: 'Demanda sem capacidade'/u);
  assert.match(planner, /id: 'orientacao-critica-inexistente',\s*title: 'Orientação crítica inexistente'/u);
  assert.match(planner, /id: 'alternativa-acessivel-ausente',\s*title: 'Alternativa acessível ausente'/u);
  assert.match(planner, /id: 'escalonamento-indefinido',\s*title: 'Escalonamento indefinido'/u);
  assert.match(planner, /Regras de parada/u);
  assert.match(planner, /data-stop=\{item\.id\}/u);
  assert.match(planner, /Nenhuma combinação\s+abre chamado ou promete atendimento/u);

  assert.deepEqual(stopRulesFor(PLANNED_BASE), []);
  assert.deepEqual(
    stopRulesFor({ ...PLANNED_BASE, moments: ['durante'] }),
    ['responsavel-ausente'],
  );
  assert.deepEqual(
    stopRulesFor({ ...PLANNED_BASE, channel: 'email-corporativo' }),
    ['canal-nao-confirmado'],
  );
  assert.equal(
    stopRulesFor({ ...PLANNED_BASE, topics: ['programacao'] }).includes('orientacao-critica-inexistente'),
    false,
  );
});

test('reinício restaura o estado inicial e o anuncia via aria-live', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /useState\(emptyChoices\)/u);
  assert.match(planner, /function restart\(\) \{\s*setChoices\(emptyChoices\(\)\);\s*setRestarted\(true\);/u);
  assert.match(planner, /Reiniciar escolhas/u);
  assert.match(planner, /Escolhas reiniciadas\. Nenhum resumo está visível\./u);
  assert.match(planner, /Nenhuma escolha feita\. O resumo aparece quando as seis dimensões estiverem definidas\./u);
  assert.match(planner, /aria-live="polite"/u);
  assert.doesNotMatch(planner, /useEffect/u);
});

test('não há persistência, fetch, submit, PII nem HTML inseguro', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.doesNotMatch(combined, /localStorage|sessionStorage|indexedDB|document\.cookie/u);
  assert.doesNotMatch(combined, /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/u);
  assert.doesNotMatch(combined, /<form\b/u);
  assert.doesNotMatch(combined, /type="submit"|action=|method=/u);
  assert.doesNotMatch(combined, /dangerouslySetInnerHTML|innerHTML/u);
  assert.doesNotMatch(combined, /gtag\(|google-analytics|fbq\(|navigator\.sendBeacon/iu);
  assert.doesNotMatch(planner, /window\.|document\./u);
  assert.doesNotMatch(combined, /placeholder="[^"]*"|autocomplete=/u);
  assert.doesNotMatch(combined, /whatsapp|telegram|sms|chatbot|ticket|SMTP/iu);
});

test('texto anti-claims deixa claro que a ferramenta não envia mensagem, não abre chamado, não promete prazo e não oferece atendimento real', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.match(page, /ferramenta é\s+orientativa/u);
  assert.match(page, /não envia mensagem, não abre chamado, não promete prazo\s+e não oferece atendimento real/u);
  assert.match(page, /sem persistência/u);
  assert.match(page, /Não pede nome, e-mail, telefone,\s*endereço, assunto, mensagem/u);
  assert.match(page, /Nenhuma combinação\s+abre chamado ou promete atendimento/u);
  assert.match(page, /A EVA pode orientar, mas não atende/u);
  assert.match(page, /não afirma disponibilidade de\s+canal, tempo de resposta, resolução nem certificação/u);
  assert.match(planner, /não envia mensagem, não abre chamado, não promete prazo e não oferece atendimento real/u);
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
  assert.match(css, /@media \(min-width: 1280px\)/u);
  assert.match(css, /@media \(min-width: 1440px\)/u);
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
  assert.match(planner, /type="checkbox"/u);
  assert.match(planner, /aria-live="polite"/u);
  assert.match(planner, /setChoices\(emptyChoices\(\)\)/u);
});
