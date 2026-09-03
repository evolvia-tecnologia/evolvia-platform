import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/planejar-materiais/page.tsx';
const PLANNER = '../app/ajuda/planejar-materiais/materials-planner.tsx';
const CSS = '../app/ajuda/planejar-materiais/planejar-materiais.module.css';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const NEED_IDS = ['nenhum-material', 'item-unico', 'kit'];
const MOMENT_IDS = ['chegada', 'atividade-especifica', 'saida'];
const CATEGORY_IDS = ['sem-diferenciacao', 'com-diferenciacao', 'decidir-depois'];
const VOLUME_IDS = ['reduzido', 'moderado', 'alto'];
const RECORD_IDS = ['sem-comprovante', 'com-comprovante', 'decidir-depois'];
const STOP_IDS = [
  'responsavel-ausente',
  'composicao-kit-indefinida',
  'volume-sem-capacidade',
  'categoria-sem-regra',
  'item-sem-contingencia',
  'registro-sem-finalidade',
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
  /item criado/iu,
  /estoque movimentado/iu,
  /lote criado/iu,
  /categoria criada/iu,
  /comprovante emitido/iu,
  /entrega registrada/iu,
  /assinatura coletada/iu,
  /rastreabilidade comprovada/iu,
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
  if (!choices.need) return 'Escolha a necessidade preliminar de materiais.';
  if (!choices.moment) return 'Escolha o momento conceitual de entrega.';
  if (!choices.category) return 'Indique se haverá diferenciação por categoria de participante.';
  if (!choices.volume) return 'Escolha a faixa genérica de volume.';
  if (!choices.record) return 'Indique se haverá comprovante ou registro de entrega.';
  return null;
}

function stopRulesFor(choices) {
  const rules = [];
  if (choices.need === 'kit' || choices.moment === 'atividade-especifica') {
    rules.push('responsavel-ausente');
  }
  if (choices.need === 'kit') {
    rules.push('composicao-kit-indefinida');
  }
  if (choices.volume === 'moderado' || choices.volume === 'alto') {
    rules.push('volume-sem-capacidade');
  }
  if (choices.category === 'com-diferenciacao') {
    rules.push('categoria-sem-regra');
  }
  if (choices.need === 'kit' || choices.moment === 'saida') {
    rules.push('item-sem-contingencia');
  }
  if (choices.record === 'com-comprovante') {
    rules.push('registro-sem-finalidade');
  }
  return rules;
}

function statusForDimension(dimension, value) {
  if (value === 'decidir-depois') return 'later';
  if (dimension === 'need' && value === 'kit') return 'stop';
  if (dimension === 'moment' && (value === 'atividade-especifica' || value === 'saida')) return 'stop';
  if (dimension === 'volume' && (value === 'moderado' || value === 'alto')) return 'stop';
  if (dimension === 'category' && value === 'com-diferenciacao') return 'stop';
  if (dimension === 'record' && value === 'com-comprovante') return 'stop';
  return 'planned';
}

function overallStatusFor(choices, rules) {
  if (rules.length > 0) return 'stop';
  if (choices.category === 'decidir-depois' || choices.record === 'decidir-depois') {
    return 'later';
  }
  return 'planned';
}

function planMaterials(choices) {
  if (nextStepFor(choices)) return null;
  const rules = stopRulesFor(choices);
  return {
    overall: overallStatusFor(choices, rules),
    dimensions: {
      need: statusForDimension('need', choices.need),
      moment: statusForDimension('moment', choices.moment),
      category: statusForDimension('category', choices.category),
      volume: statusForDimension('volume', choices.volume),
      record: statusForDimension('record', choices.record),
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
  assert.match(page, /<h1>Planejar materiais e kits<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
  assert.match(page, /title: 'Planejar materiais e kits — orientação local'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /from ['"].*public-site-header['"]/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /<MaterialsPlanner \/>/u);
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
  assert.doesNotMatch(planner, /type="text"|type="email"|type="tel"|type="url"|type="number"|type="file"|type="search"|type="date"|type="time"/u);
  assert.doesNotMatch(planner, /<select\b/u);
  assert.doesNotMatch(planner, /<form\b/u);
  assert.doesNotMatch(planner, /type="checkbox"/u);

  assert.match(planner, /legend: 'Necessidade preliminar'/u);
  assert.match(planner, /legend: 'Momento conceitual de entrega'/u);
  assert.match(planner, /legend: 'Diferenciação por categoria de participante'/u);
  assert.match(planner, /legend: 'Faixa genérica de volume'/u);
  assert.match(planner, /legend: 'Comprovante ou registro de entrega'/u);
  assert.match(planner, /hintId: 'need-hint'/u);
  assert.match(planner, /hintId: 'moment-hint'/u);
  assert.match(planner, /hintId: 'category-hint'/u);
  assert.match(planner, /hintId: 'volume-hint'/u);
  assert.match(planner, /hintId: 'record-hint'/u);
  assert.match(planner, /id: 'decidir-depois'/u);
});

test('catálogos fechados das cinco dimensões, com decidir depois e sem campo livre', async () => {
  const planner = await source(PLANNER);
  const need = parseOptions(planner, 'export const NEED_OPTIONS', 'export const MOMENT_OPTIONS');
  const moment = parseOptions(planner, 'export const MOMENT_OPTIONS', 'export const CATEGORY_OPTIONS');
  const category = parseOptions(planner, 'export const CATEGORY_OPTIONS', 'export const VOLUME_OPTIONS');
  const volume = parseOptions(planner, 'export const VOLUME_OPTIONS', 'export const RECORD_OPTIONS');
  const record = parseOptions(planner, 'export const RECORD_OPTIONS', 'export const STOP_RULES');

  assert.deepEqual(need.map((item) => item.id), NEED_IDS);
  assert.deepEqual(moment.map((item) => item.id), MOMENT_IDS);
  assert.deepEqual(category.map((item) => item.id), CATEGORY_IDS);
  assert.deepEqual(volume.map((item) => item.id), VOLUME_IDS);
  assert.deepEqual(record.map((item) => item.id), RECORD_IDS);
  assert.deepEqual(
    need.map((item) => item.label),
    ['Nenhum material', 'Item único', 'Kit com múltiplos itens'],
  );
  assert.deepEqual(
    moment.map((item) => item.label),
    ['Chegada', 'Atividade específica', 'Saída'],
  );
  assert.deepEqual(
    category.map((item) => item.label),
    ['Sem diferenciação por categoria', 'Haverá diferenciação por categoria', 'Decidir depois'],
  );
  assert.deepEqual(
    volume.map((item) => item.label),
    ['Volume reduzido', 'Volume moderado', 'Volume alto'],
  );
  assert.deepEqual(
    record.map((item) => item.label),
    ['Sem comprovante ou registro previsto', 'Haverá comprovante ou registro como decisão futura', 'Decidir depois'],
  );

  for (const option of [...need, ...moment, ...category, ...volume, ...record]) {
    assert.ok(option.help.length > 20, option.id);
  }

  assert.match(planner, /não cadastra item e não movimenta estoque/u);
  assert.match(planner, /não cria item, lote ou estoque/u);
  assert.match(planner, /não cria kit, não lista itens e não monta estoque/u);
  assert.match(planner, /Sem data, horário ou local real/u);
  assert.match(planner, /Não informe quantidade, lote ou capacidade física/u);
  assert.match(planner, /não coleta assinatura nem identidade/u);
});

test('combinações completas geram resultado determinístico e incompletas orientam o próximo passo', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /if \(choices\.need === 'kit' \|\| choices\.moment === 'atividade-especifica'\) \{\s*rules\.push\('responsavel-ausente'\)/u);
  assert.match(planner, /if \(choices\.need === 'kit'\) \{\s*rules\.push\('composicao-kit-indefinida'\)/u);
  assert.match(planner, /if \(choices\.volume === 'moderado' \|\| choices\.volume === 'alto'\) \{\s*rules\.push\('volume-sem-capacidade'\)/u);
  assert.match(planner, /if \(choices\.category === 'com-diferenciacao'\) \{\s*rules\.push\('categoria-sem-regra'\)/u);
  assert.match(planner, /if \(choices\.need === 'kit' \|\| choices\.moment === 'saida'\) \{\s*rules\.push\('item-sem-contingencia'\)/u);
  assert.match(planner, /if \(choices\.record === 'com-comprovante'\) \{\s*rules\.push\('registro-sem-finalidade'\)/u);

  assert.equal(planMaterials({
    need: '', moment: '', category: '', volume: '', record: '',
  }), null);
  assert.equal(
    nextStepFor({ need: '', moment: '', category: '', volume: '', record: '' }),
    'Escolha a necessidade preliminar de materiais.',
  );
  assert.equal(
    nextStepFor({ need: 'item-unico', moment: '', category: '', volume: '', record: '' }),
    'Escolha o momento conceitual de entrega.',
  );
  assert.equal(
    nextStepFor({
      need: 'item-unico', moment: 'chegada', category: '', volume: '', record: '',
    }),
    'Indique se haverá diferenciação por categoria de participante.',
  );
  assert.equal(
    nextStepFor({
      need: 'item-unico',
      moment: 'chegada',
      category: 'sem-diferenciacao',
      volume: '',
      record: '',
    }),
    'Escolha a faixa genérica de volume.',
  );
  assert.equal(
    nextStepFor({
      need: 'item-unico',
      moment: 'chegada',
      category: 'sem-diferenciacao',
      volume: 'reduzido',
      record: '',
    }),
    'Indique se haverá comprovante ou registro de entrega.',
  );

  const representative = [
    {
      choices: {
        need: 'nenhum-material',
        moment: 'chegada',
        category: 'sem-diferenciacao',
        volume: 'reduzido',
        record: 'sem-comprovante',
      },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: {
        need: 'item-unico',
        moment: 'chegada',
        category: 'sem-diferenciacao',
        volume: 'reduzido',
        record: 'sem-comprovante',
      },
      overall: 'planned',
      stopRules: [],
    },
    {
      choices: {
        need: 'item-unico',
        moment: 'chegada',
        category: 'decidir-depois',
        volume: 'reduzido',
        record: 'decidir-depois',
      },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: {
        need: 'item-unico',
        moment: 'chegada',
        category: 'sem-diferenciacao',
        volume: 'reduzido',
        record: 'decidir-depois',
      },
      overall: 'later',
      stopRules: [],
    },
    {
      choices: {
        need: 'kit',
        moment: 'chegada',
        category: 'sem-diferenciacao',
        volume: 'reduzido',
        record: 'sem-comprovante',
      },
      overall: 'stop',
      stopRules: ['responsavel-ausente', 'composicao-kit-indefinida', 'item-sem-contingencia'],
    },
    {
      choices: {
        need: 'item-unico',
        moment: 'atividade-especifica',
        category: 'sem-diferenciacao',
        volume: 'reduzido',
        record: 'sem-comprovante',
      },
      overall: 'stop',
      stopRules: ['responsavel-ausente'],
    },
    {
      choices: {
        need: 'item-unico',
        moment: 'saida',
        category: 'sem-diferenciacao',
        volume: 'reduzido',
        record: 'sem-comprovante',
      },
      overall: 'stop',
      stopRules: ['item-sem-contingencia'],
    },
    {
      choices: {
        need: 'item-unico',
        moment: 'chegada',
        category: 'com-diferenciacao',
        volume: 'reduzido',
        record: 'sem-comprovante',
      },
      overall: 'stop',
      stopRules: ['categoria-sem-regra'],
    },
    {
      choices: {
        need: 'item-unico',
        moment: 'chegada',
        category: 'sem-diferenciacao',
        volume: 'moderado',
        record: 'sem-comprovante',
      },
      overall: 'stop',
      stopRules: ['volume-sem-capacidade'],
    },
    {
      choices: {
        need: 'item-unico',
        moment: 'chegada',
        category: 'sem-diferenciacao',
        volume: 'alto',
        record: 'sem-comprovante',
      },
      overall: 'stop',
      stopRules: ['volume-sem-capacidade'],
    },
    {
      choices: {
        need: 'item-unico',
        moment: 'chegada',
        category: 'sem-diferenciacao',
        volume: 'reduzido',
        record: 'com-comprovante',
      },
      overall: 'stop',
      stopRules: ['registro-sem-finalidade'],
    },
    {
      choices: {
        need: 'kit',
        moment: 'atividade-especifica',
        category: 'com-diferenciacao',
        volume: 'alto',
        record: 'com-comprovante',
      },
      overall: 'stop',
      stopRules: STOP_IDS,
    },
    {
      choices: {
        need: 'kit',
        moment: 'chegada',
        category: 'decidir-depois',
        volume: 'reduzido',
        record: 'sem-comprovante',
      },
      overall: 'stop',
      stopRules: ['responsavel-ausente', 'composicao-kit-indefinida', 'item-sem-contingencia'],
    },
  ];

  for (const item of representative) {
    const first = planMaterials(item.choices);
    const second = planMaterials(item.choices);
    assert.ok(first, JSON.stringify(item.choices));
    assert.deepEqual(first, second);
    assert.equal(first.overall, item.overall, JSON.stringify(item.choices));
    assert.deepEqual(first.stopRules, item.stopRules, JSON.stringify(item.choices));
  }

  let combinations = 0;
  const seenOverall = new Set();
  for (const need of NEED_IDS) {
    for (const moment of MOMENT_IDS) {
      for (const category of CATEGORY_IDS) {
        for (const volume of VOLUME_IDS) {
          for (const record of RECORD_IDS) {
            const result = planMaterials({
              need, moment, category, volume, record,
            });
            assert.ok(result, `${need}+${moment}+${category}+${volume}+${record}`);
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

test('stop rules surgem de forma previsível e nenhuma combinação movimenta ou autoriza estoque ou entrega', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /id: 'responsavel-ausente',\s*title: 'Responsável ausente'/u);
  assert.match(planner, /id: 'composicao-kit-indefinida',\s*title: 'Composição do kit indefinida'/u);
  assert.match(planner, /id: 'volume-sem-capacidade',\s*title: 'Volume sem capacidade'/u);
  assert.match(planner, /id: 'categoria-sem-regra',\s*title: 'Categoria sem regra'/u);
  assert.match(planner, /id: 'item-sem-contingencia',\s*title: 'Item sem contingência'/u);
  assert.match(planner, /id: 'registro-sem-finalidade',\s*title: 'Registro sem finalidade'/u);
  assert.match(planner, /Regras de parada/u);
  assert.match(planner, /data-stop=\{item\.id\}/u);
  assert.match(planner, /Nenhuma combinação\s+movimenta ou autoriza estoque ou entrega/u);

  assert.deepEqual(
    stopRulesFor({
      need: 'item-unico',
      moment: 'chegada',
      category: 'sem-diferenciacao',
      volume: 'reduzido',
      record: 'sem-comprovante',
    }),
    [],
  );
  assert.deepEqual(
    stopRulesFor({
      need: 'kit',
      moment: 'chegada',
      category: 'sem-diferenciacao',
      volume: 'reduzido',
      record: 'sem-comprovante',
    }),
    ['responsavel-ausente', 'composicao-kit-indefinida', 'item-sem-contingencia'],
  );
  assert.equal(
    stopRulesFor({
      need: 'item-unico',
      moment: 'chegada',
      category: 'sem-diferenciacao',
      volume: 'reduzido',
      record: 'sem-comprovante',
    }).includes('registro-sem-finalidade'),
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
  assert.doesNotMatch(combined, /type="file"|capture=|accept=/u);
});

test('texto anti-claims deixa claro que a ferramenta não cria item, estoque, lote, categoria, comprovante ou registro de entrega', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.match(page, /ferramenta é orientativa/u);
  assert.match(page, /não cria\s+item, estoque, lote, categoria, comprovante ou registro de entrega/u);
  assert.match(page, /sem persistência/u);
  assert.match(page, /Não cadastra itens, não movimenta estoque e não\s*registra entregas/u);
  assert.match(page, /Nenhuma combinação autoriza estoque ou entrega|Nenhuma combinação\s+movimenta ou autoriza estoque ou entrega/u);
  assert.match(page, /A EVA não decide/u);
  assert.match(page, /não afirma disponibilidade operacional, rastreabilidade\s*real nem conformidade/u);
  assert.match(planner, /não cria item, estoque, lote, categoria, comprovante ou registro de entrega/u);
  assert.match(planner, /não coleta assinatura nem identidade/u);
  assert.match(planner, /não afirma rastreabilidade/u);

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
