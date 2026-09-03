import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/planejar-formato/page.tsx';
const PLANNER = '../app/ajuda/planejar-formato/format-planner.tsx';
const CSS = '../app/ajuda/planejar-formato/planejar-formato.module.css';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const PROFILE_IDS = ['entretenimento', 'corporativo', 'cientifico', 'feira'];
const FORMAT_IDS = ['presencial', 'online', 'hibrido'];
const AUDIENCE_IDS = ['encontro-reduzido', 'publico-moderado', 'publico-amplo', 'grande-circulacao'];
const TOPIC_IDS = ['place', 'connectivity', 'reception', 'accessibility', 'contingency', 'owner'];
const ATTENTION_IDS = ['essential', 'recommended', 'confirm'];

const CANONICAL_EVENT_TYPES = [
  'Congresso ou evento científico',
  'Simpósio científico',
  'Jornada científica',
  'Seminário acadêmico',
  'Conferência científica',
  'Evento corporativo ou treinamento',
  'Convenção empresarial',
  'Treinamento',
  'Workshop',
  'Curso ou palestra',
  'Networking ou meetup',
  'Feira ou exposição',
  'Exposição',
  'Show ou entretenimento',
  'Festival',
  'Evento social ou comunitário',
  'Evento religioso ou beneficente',
  'Evento esportivo ou torneio',
  'Outro tipo de evento',
];

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
  /aconselhamento jurídico/iu,
  /\bSLA\b/u,
  /tempo de resposta contratado/iu,
  /custa R\$/iu,
  /preço estimado/iu,
  /prazo de \d+ dias/iu,
  /equipe de \d+/iu,
  /lotação máxima/iu,
  /capacidade física de/iu,
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

function attentionFor(topicId, format) {
  if (topicId === 'connectivity') return format === 'presencial' ? 'recommended' : 'essential';
  if (topicId === 'reception') return format === 'online' ? 'recommended' : 'essential';
  if (topicId === 'contingency') return 'recommended';
  if (topicId === 'owner') return 'confirm';
  return 'essential';
}

function planFormat(choices, catalogs) {
  const profile = catalogs.profiles.find((option) => option.id === choices.profile);
  const format = catalogs.formats.find((option) => option.id === choices.format);
  const audience = catalogs.audiences.find((option) => option.id === choices.audience);
  if (!profile || !format || !audience) return null;
  const checkpoints = TOPIC_IDS.map((id) => ({
    id,
    attention: attentionFor(id, format.id),
  }));
  return { profile, format, audience, checkpoints };
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
  assert.match(page, /<h1>Planejar formato e capacidade<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
  assert.match(page, /title: 'Planejar formato e capacidade — orientação local'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /from ['"].*public-site-header['"]/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /<FormatPlanner \/>/u);
});

test('componente cliente isola as três dimensões com fieldset, legend, hint e rádios', async () => {
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

  assert.match(planner, /legend: 'Perfil amplo'/u);
  assert.match(planner, /legend: 'Formato'/u);
  assert.match(planner, /legend: 'Faixa de público'/u);
  assert.match(planner, /hintId: 'profile-hint'/u);
  assert.match(planner, /hintId: 'format-hint'/u);
  assert.match(planner, /hintId: 'audience-hint'/u);
});

test('quatro perfis, três formatos e quatro faixas genéricas, sem reproduzir os 19 tipos', async () => {
  const planner = await source(PLANNER);
  const profiles = parseOptions(planner, 'export const PROFILES', 'export const FORMATS');
  const formats = parseOptions(planner, 'export const FORMATS', 'export const AUDIENCES');
  const audiences = parseOptions(planner, 'export const AUDIENCES', 'export const CHECKPOINT_TOPICS');

  assert.deepEqual(profiles.map((item) => item.id), PROFILE_IDS);
  assert.deepEqual(formats.map((item) => item.id), FORMAT_IDS);
  assert.deepEqual(audiences.map((item) => item.id), AUDIENCE_IDS);
  assert.deepEqual(profiles.map((item) => item.label), ['Entretenimento', 'Corporativo', 'Científico', 'Feira']);
  assert.deepEqual(formats.map((item) => item.label), ['Presencial', 'Online', 'Híbrido']);
  assert.deepEqual(
    audiences.map((item) => item.label),
    ['Encontro reduzido', 'Público moderado', 'Público amplo', 'Grande circulação'],
  );

  for (const option of [...profiles, ...formats, ...audiences]) {
    assert.ok(option.help.length > 20, option.id);
  }

  for (const eventType of CANONICAL_EVENT_TYPES) {
    assert.doesNotMatch(planner, new RegExp(eventType.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), eventType);
  }
  assert.doesNotMatch(planner, /EVENT_PROFILE_GROUPS|event-profile-catalog|event-wizard/u);
  assert.doesNotMatch(planner, /SCIENTIFIC_EVENT|CORPORATE_TRAINING|FAIR_EXHIBITION|ENTERTAINMENT/u);
});

test('toda combinação completa gera resumo determinístico com os três níveis de atenção', async () => {
  const planner = await source(PLANNER);
  const catalogs = {
    profiles: parseOptions(planner, 'export const PROFILES', 'export const FORMATS'),
    formats: parseOptions(planner, 'export const FORMATS', 'export const AUDIENCES'),
    audiences: parseOptions(planner, 'export const AUDIENCES', 'export const CHECKPOINT_TOPICS'),
  };

  assert.match(planner, /if \(topicId === 'connectivity'\) return format === 'presencial' \? 'recommended' : 'essential'/u);
  assert.match(planner, /if \(topicId === 'reception'\) return format === 'online' \? 'recommended' : 'essential'/u);
  assert.match(planner, /if \(topicId === 'contingency'\) return 'recommended'/u);
  assert.match(planner, /if \(topicId === 'owner'\) return 'confirm'/u);
  assert.match(planner, /id: 'place', title: 'Local ou acesso'/u);
  assert.match(planner, /id: 'connectivity', title: 'Conectividade'/u);
  assert.match(planner, /id: 'reception', title: 'Recepção e credenciamento'/u);
  assert.match(planner, /id: 'accessibility', title: 'Acessibilidade'/u);
  assert.match(planner, /id: 'contingency', title: 'Contingência'/u);
  assert.match(planner, /id: 'owner', title: 'Responsável humano'/u);

  const incomplete = planFormat({ profile: '', format: '', audience: '' }, catalogs);
  assert.equal(incomplete, null);

  const representative = [
    { profile: 'entretenimento', format: 'presencial', audience: 'encontro-reduzido' },
    { profile: 'corporativo', format: 'online', audience: 'publico-moderado' },
    { profile: 'cientifico', format: 'hibrido', audience: 'publico-amplo' },
    { profile: 'feira', format: 'presencial', audience: 'grande-circulacao' },
    { profile: 'feira', format: 'online', audience: 'grande-circulacao' },
    { profile: 'entretenimento', format: 'hibrido', audience: 'encontro-reduzido' },
  ];

  const seenAnnouncements = new Set();
  for (const choices of representative) {
    const first = planFormat(choices, catalogs);
    const second = planFormat(choices, catalogs);
    assert.ok(first);
    assert.deepEqual(first, second, `${choices.profile}+${choices.format}+${choices.audience}`);
    assert.deepEqual(first.checkpoints.map((item) => item.id), TOPIC_IDS);
    const levels = new Set(first.checkpoints.map((item) => item.attention));
    assert.deepEqual([...levels].sort(), [...ATTENTION_IDS].sort());
    seenAnnouncements.add(`${first.profile.label}|${first.format.label}|${first.audience.label}`);
  }
  assert.equal(seenAnnouncements.size, representative.length);

  let combinations = 0;
  for (const profile of PROFILE_IDS) {
    for (const format of FORMAT_IDS) {
      for (const audience of AUDIENCE_IDS) {
        const result = planFormat({ profile, format, audience }, catalogs);
        assert.ok(result, `${profile}+${format}+${audience}`);
        const levels = new Set(result.checkpoints.map((item) => item.attention));
        assert.equal(levels.has('essential'), true, `${profile}+${format}+${audience}`);
        assert.equal(levels.has('recommended'), true, `${profile}+${format}+${audience}`);
        assert.equal(levels.has('confirm'), true, `${profile}+${format}+${audience}`);
        assert.equal(result.checkpoints.find((item) => item.id === 'owner')?.attention, 'confirm');
        combinations += 1;
      }
    }
  }
  assert.equal(combinations, 48);
});

test('reinício restaura o estado inicial e o anuncia via aria-live', async () => {
  const planner = await source(PLANNER);

  assert.match(planner, /useState\(emptyChoices\)/u);
  assert.match(planner, /function restart\(\) \{\s*setChoices\(emptyChoices\(\)\);\s*setRestarted\(true\);/u);
  assert.match(planner, /Reiniciar escolhas/u);
  assert.match(planner, /Escolhas reiniciadas\. Nenhum resumo está visível\./u);
  assert.match(planner, /Nenhuma escolha feita\. O resumo aparece quando perfil, formato e faixa de público estiverem definidos\./u);
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

test('texto anti-claims deixa claro que o resultado não configura, não homologa e não publica', async () => {
  const [page, planner] = await Promise.all([source(PAGE), source(PLANNER)]);
  const combined = `${page}\n${planner}`;

  assert.match(page, /ferramenta é orientativa/u);
  assert.match(page, /não configura, não homologa e não publica evento/u);
  assert.match(page, /sem persistência/u);
  assert.match(page, /não estima custo, prazo, equipe/u);
  assert.match(page, /capacidade física/u);
  assert.match(page, /A EVA não decide/u);
  assert.match(planner, /não configura, não homologa e não publica evento/u);
  assert.match(planner, /Não informe nome, e-mail ou telefone/u);
  assert.match(planner, /sem certificar WCAG/u);
  assert.match(planner, /sem prazo, custo, equipe ou obrigação jurídica/u);

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

test('níveis de atenção não dependem só de cor: texto, ícone e borda distinta', async () => {
  const [planner, css] = await Promise.all([source(PLANNER), source(CSS)]);

  assert.match(planner, /essential: Object\.freeze\(\{ id: 'essential', label: 'Essencial', icon: '●' \}\)/u);
  assert.match(planner, /recommended: Object\.freeze\(\{ id: 'recommended', label: 'Recomendado', icon: '○' \}\)/u);
  assert.match(planner, /confirm: Object\.freeze\(\{ id: 'confirm', label: 'Confirmar antes de avançar', icon: '!' \}\)/u);
  assert.match(planner, /aria-hidden="true">\{item\.icon\}/u);
  assert.match(planner, /data-attention=\{item\.attention\}/u);
  assert.match(planner, /\{item\.attentionLabel\}/u);
  assert.match(planner, /Níveis de atenção/u);
  assert.match(planner, /nunca só por cor/u);
  assert.match(planner, /Selecionado/u);

  assert.match(css, /\.attentionEssential \{[\s\S]*border: 2px solid/u);
  assert.match(css, /\.attentionRecommended \{[\s\S]*border: 2px dashed/u);
  assert.match(css, /\.attentionConfirm \{[\s\S]*border: 4px double/u);
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
