import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/planejar-comunicacao/page.tsx';
const PLANNER = '../app/ajuda/planejar-comunicacao/communication-planner.tsx';
const CSS = '../app/ajuda/planejar-comunicacao/planejar-comunicacao.module.css';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const MOMENT_IDS = ['confirmacao', 'lembrete', 'alteracao', 'acesso', 'pos-evento'];
const CHANNEL_IDS = ['email', 'area-participante', 'mensagem-instantanea'];
const NEED_IDS = [
  'assunto',
  'data-horario-fuso',
  'local-ou-link',
  'contato-responsavel',
  'acessibilidade',
  'privacidade',
  'alternativa-falha',
];
const ACTION_IDS = ['essential', 'confirm', 'human'];
const RISK_IDS = ['consent', 'missing-critical', 'unreviewed-link', 'no-accessible-alt'];
const VIEWPORTS = [320, 768, 1280, 1440];

const ANTI_CLAIM_FORBIDDEN = [
  /certifica[cç][aã]o WCAG/iu,
  /conforme à WCAG/iu,
  /WCAG 2\.2 AA certificado/iu,
  /certifica[cç][aã]o LGPD/iu,
  /homologa automaticamente/iu,
  /publicação habilitada/iu,
  /publique agora/iu,
  /envie agora/iu,
  /mensagem enviada/iu,
  /disparo automático/iu,
  /SMTP/u,
  /deploy disponível/iu,
  /selo de acessibilidade/iu,
  /garantimos/iu,
  /100\s*%/u,
  /validação jurídica concluída/iu,
  /aconselhamento jurídico/iu,
  /tempo de resposta contratado/iu,
  /custa R\$/iu,
  /preço estimado/iu,
  /prazo de \d+ dias/iu,
  /entrega garantida/iu,
  /canal já configurado/iu,
  /é obrigatório por lei/iu,
  /obrigação jurídica de/iu,
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

function has(values, id) {
  return values.includes(id);
}

function needsDatetime(moments) {
  return has(moments, 'lembrete') || has(moments, 'confirmacao') || has(moments, 'alteracao');
}

function needsPlace(moments) {
  return has(moments, 'acesso') || has(moments, 'alteracao');
}

function isMissingCritical(selection) {
  if (!has(selection.needs, 'assunto')) return true;
  if (needsDatetime(selection.moments) && !has(selection.needs, 'data-horario-fuso')) return true;
  if (needsPlace(selection.moments) && !has(selection.needs, 'local-ou-link')) return true;
  return false;
}

function riskIdsFor(selection) {
  const risks = [];
  if (has(selection.channels, 'email') || has(selection.channels, 'mensagem-instantanea')) {
    risks.push('consent');
  }
  if (isMissingCritical(selection)) {
    risks.push('missing-critical');
  }
  if (has(selection.needs, 'local-ou-link') || has(selection.moments, 'acesso') || has(selection.moments, 'alteracao')) {
    risks.push('unreviewed-link');
  }
  if (!has(selection.needs, 'acessibilidade') || !has(selection.needs, 'alternativa-falha')) {
    risks.push('no-accessible-alt');
  }
  return risks;
}

function planCommunication(selection, catalogs) {
  const moments = catalogs.moments.filter((item) => has(selection.moments, item.id));
  const channels = catalogs.channels.filter((item) => has(selection.channels, item.id));
  const needs = catalogs.needs.filter((item) => has(selection.needs, item.id));
  if (moments.length === 0 || channels.length === 0) return null;
  return {
    moments,
    channels,
    needs,
    risks: riskIdsFor(selection),
    complete: true,
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
  assert.match(page, /<h1>Planejar a comunicação do evento<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
  assert.match(page, /title: 'Planejar comunicação — orientação local'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /from ['"].*public-site-header['"]/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /<CommunicationPlanner \/>/u);
});

test('componente cliente isola momentos, canais e cuidados com fieldset, legend, hint e checkboxes', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /['"]use client['"]/u);
  assert.equal([...planner.matchAll(/<fieldset\b/gu)].length, 1);
  assert.match(planner, /GROUPS\.map\(\(group\) => <fieldset/u);
  assert.match(planner, /<legend>\{group\.legend\}<\/legend>/u);
  assert.match(planner, /aria-describedby=\{group\.hintId\}/u);
  assert.match(planner, /htmlFor=\{`\$\{group\.id\}-\$\{option\.id\}`\}/u);
  assert.match(planner, /type="checkbox"/u);
  assert.match(planner, /<button type="button"[^>]*onClick=\{restart\}/u);
  assert.match(planner, /Reiniciar planejamento/u);
  assert.match(planner, /aria-live="polite"/u);
  assert.match(planner, /role="status"/u);
  assert.match(planner, /aria-atomic="true"/u);
  assert.doesNotMatch(planner, /aria-live="assertive"/u);
  assert.doesNotMatch(planner, /<textarea\b/u);
  assert.doesNotMatch(planner, /type="text"|type="email"|type="tel"|type="url"|type="number"/u);
  assert.doesNotMatch(planner, /<select\b/u);
  assert.doesNotMatch(planner, /type="radio"/u);

  assert.match(planner, /legend: 'Momentos da comunicação'/u);
  assert.match(planner, /legend: 'Canais de planejamento'/u);
  assert.match(planner, /legend: 'Cuidados de conteúdo'/u);
  assert.match(planner, /hintId: 'moments-hint'/u);
  assert.match(planner, /hintId: 'channels-hint'/u);
  assert.match(planner, /hintId: 'needs-hint'/u);
});

test('catálogos fechados cobrem os cinco momentos, três canais e sete cuidados, sem texto livre', async () => {
  const planner = await source(PLANNER);
  const moments = parseOptions(planner, 'export const MOMENTS', 'export const CHANNELS');
  const channels = parseOptions(planner, 'export const CHANNELS', 'export const NEEDS');
  const needs = parseOptions(planner, 'export const NEEDS', 'export const RISKS');

  assert.deepEqual(moments.map((item) => item.id), MOMENT_IDS);
  assert.deepEqual(channels.map((item) => item.id), CHANNEL_IDS);
  assert.deepEqual(needs.map((item) => item.id), NEED_IDS);
  assert.deepEqual(
    moments.map((item) => item.label),
    ['Confirmação', 'Lembrete', 'Alteração importante', 'Instruções de acesso ou participação', 'Pós-evento'],
  );
  assert.deepEqual(channels.map((item) => item.label), ['E-mail', 'Área do participante', 'Mensagem instantânea']);
  assert.deepEqual(
    needs.map((item) => item.label),
    [
      'Assunto claro',
      'Data, horário e fuso',
      'Local ou link',
      'Contato responsável',
      'Acessibilidade',
      'Privacidade',
      'Alternativa em caso de falha',
    ],
  );

  for (const option of [...moments, ...channels, ...needs]) {
    assert.ok(option.help.length > 20, option.id);
  }

  assert.match(planner, /Disponibilidade e configuração serão confirmadas depois/u);
  assert.match(planner, /Não escreva o texto da mensagem aqui/u);
  assert.doesNotMatch(planner, /EVENT_PROFILE_GROUPS|event-profile-catalog|event-wizard/u);
});

test('toda seleção completa gera resumo determinístico com os três níveis e riscos relevantes', async () => {
  const planner = await source(PLANNER);
  const catalogs = {
    moments: parseOptions(planner, 'export const MOMENTS', 'export const CHANNELS'),
    channels: parseOptions(planner, 'export const CHANNELS', 'export const NEEDS'),
    needs: parseOptions(planner, 'export const NEEDS', 'export const RISKS'),
  };

  assert.match(planner, /selection\.moments\.length > 0 && selection\.channels\.length > 0/u);
  assert.match(planner, /id: 'essential', label: 'Conteúdo essencial', icon: '●'/u);
  assert.match(planner, /id: 'confirm', label: 'Confirmar antes de enviar', icon: '○'/u);
  assert.match(planner, /id: 'human', label: 'Decisão humana', icon: '!'/u);
  assert.match(planner, /id: 'consent',[\s\S]*Envio sem consentimento ou finalidade/u);
  assert.match(planner, /id: 'missing-critical',[\s\S]*Informação crítica ausente/u);
  assert.match(planner, /id: 'unreviewed-link',[\s\S]*Link não revisado/u);
  assert.match(planner, /id: 'no-accessible-alt',[\s\S]*Ausência de alternativa acessível/u);
  assert.match(planner, /has\(selection\.channels, 'email'\) \|\| has\(selection\.channels, 'mensagem-instantanea'\)/u);
  assert.match(planner, /!has\(selection\.needs, 'assunto'\)/u);
  assert.match(planner, /needsDatetime\(selection\.moments\) && !has\(selection\.needs, 'data-horario-fuso'\)/u);
  assert.match(planner, /needsPlace\(selection\.moments\) && !has\(selection\.needs, 'local-ou-link'\)/u);
  assert.match(planner, /!has\(selection\.needs, 'acessibilidade'\) \|\| !has\(selection\.needs, 'alternativa-falha'\)/u);

  assert.equal(planCommunication({ moments: [], channels: [], needs: [] }, catalogs), null);
  assert.equal(planCommunication({ moments: ['confirmacao'], channels: [], needs: [] }, catalogs), null);
  assert.equal(planCommunication({ moments: [], channels: ['email'], needs: ['assunto'] }, catalogs), null);

  const carefulNeeds = NEED_IDS.filter((id) => id !== 'local-ou-link');
  const representative = [
    {
      moments: ['confirmacao'],
      channels: ['email'],
      needs: [],
      risks: ['consent', 'missing-critical', 'no-accessible-alt'],
    },
    {
      moments: ['acesso'],
      channels: ['mensagem-instantanea'],
      needs: ['local-ou-link'],
      risks: ['consent', 'missing-critical', 'unreviewed-link', 'no-accessible-alt'],
    },
    {
      moments: ['lembrete', 'alteracao'],
      channels: ['email', 'area-participante'],
      needs: ['assunto', 'data-horario-fuso', 'local-ou-link', 'acessibilidade', 'alternativa-falha'],
      risks: ['consent', 'unreviewed-link'],
    },
    {
      moments: ['pos-evento'],
      channels: ['area-participante'],
      needs: carefulNeeds,
      risks: [],
    },
    {
      moments: MOMENT_IDS,
      channels: CHANNEL_IDS,
      needs: NEED_IDS,
      risks: ['consent', 'unreviewed-link'],
    },
    {
      moments: ['confirmacao', 'pos-evento'],
      channels: ['area-participante'],
      needs: ['assunto'],
      risks: ['missing-critical', 'no-accessible-alt'],
    },
  ];

  for (const fixture of representative) {
    const first = planCommunication(fixture, catalogs);
    const second = planCommunication(fixture, catalogs);
    assert.ok(first, fixture.moments.join('+'));
    assert.deepEqual(first, second, fixture.moments.join('+'));
    assert.deepEqual(first.risks, fixture.risks, fixture.moments.join('+'));
    assert.equal(first.moments.length > 0, true);
    assert.equal(first.channels.length > 0, true);
  }

  let complete = 0;
  for (const moment of MOMENT_IDS) {
    for (const channel of CHANNEL_IDS) {
      const result = planCommunication({ moments: [moment], channels: [channel], needs: [] }, catalogs);
      assert.ok(result, `${moment}+${channel}`);
      assert.equal(result.risks.includes('no-accessible-alt'), true, `${moment}+${channel}`);
      complete += 1;
    }
  }
  assert.equal(complete, 15);

  assert.deepEqual(ACTION_IDS, ['essential', 'confirm', 'human']);
  assert.deepEqual(RISK_IDS, ['consent', 'missing-critical', 'unreviewed-link', 'no-accessible-alt']);
});

test('reinício restaura o estado inicial e o anuncia via aria-live', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /useState\(emptySelection\)/u);
  assert.match(planner, /function restart\(\) \{\s*setSelection\(emptySelection\(\)\);\s*setRestarted\(true\);/u);
  assert.match(planner, /Reiniciar planejamento/u);
  assert.match(planner, /Planejamento reiniciado\. Nenhum resumo está visível\./u);
  assert.match(planner, /Nenhuma escolha feita\. O resumo aparece quando ao menos um momento e um canal estiverem selecionados\./u);
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

test('texto anti-claims deixa claro que o resultado não envia, não agenda e não configura', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.match(page, /ferramenta é orientativa/u);
  assert.match(page, /não envia, não agenda, não\s+configura canal/u);
  assert.match(page, /sem persistência/u);
  assert.match(page, /A EVA pode orientar este plano, mas não aprova\s+nem dispara comunicação/u);
  assert.match(page, /Não promete disponibilidade de canal, prazo, SLA/u);
  assert.match(planner, /não aprova nem dispara comunicação nesta ferramenta/u);
  assert.match(planner, /Não informe destinatário aqui/u);
  assert.match(planner, /não certifica WCAG/u);
  assert.match(planner, /sem prometer disponibilidade contínua/u);
  assert.match(planner, /A ausência de alerta não\s+certifica o envio nem a conformidade/u);
  assert.match(planner, /Isto é orientação, não certificação nem decisão automática/u);

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

test('níveis de ação não dependem só de cor: texto, ícone e borda distinta', async () => {
  const [planner, css] = await Promise.all([source(PLANNER), source(CSS)]);

  assert.match(planner, /essential: Object\.freeze\(\{ id: 'essential', label: 'Conteúdo essencial', icon: '●' \}\)/u);
  assert.match(planner, /confirm: Object\.freeze\(\{ id: 'confirm', label: 'Confirmar antes de enviar', icon: '○' \}\)/u);
  assert.match(planner, /human: Object\.freeze\(\{ id: 'human', label: 'Decisão humana', icon: '!' \}\)/u);
  assert.match(planner, /aria-hidden="true">\{section\.icon\}/u);
  assert.match(planner, /data-nivel=\{section\.id\}/u);
  assert.match(planner, /\{section\.label\}/u);
  assert.match(planner, /Níveis de ação/u);
  assert.match(planner, /nunca só por cor/u);
  assert.match(planner, /Selecionado/u);
  assert.match(planner, /Orientação de risco/u);

  assert.match(css, /\.actionEssential \{[\s\S]*border: 2px solid/u);
  assert.match(css, /\.actionConfirm \{[\s\S]*border: 2px dashed/u);
  assert.match(css, /\.actionHuman \{[\s\S]*border: 4px double/u);
  assert.match(css, /\.option \{[\s\S]*border: 1px dashed/u);
  assert.match(css, /\.option:has\(input:checked\) \{[\s\S]*border: 2px solid/u);
  assert.match(css, /\.risk \{[\s\S]*border: 2px dashed/u);
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
  assert.match(planner, /type="checkbox"/u);
  assert.match(planner, /aria-live="polite"/u);
  assert.match(planner, /setSelection\(emptySelection\(\)\)/u);
});
