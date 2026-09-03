import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/briefing-do-evento/page.tsx';
const CSS = '../app/ajuda/briefing-do-evento/briefing-do-evento.module.css';

const SCRIPT_IDS = Object.freeze([
  'objetivo',
  'publico',
  'perfil-tipo',
  'formato',
  'data-aproximada',
  'local',
  'capacidade',
  'recursos-desejados',
  'responsaveis',
  'conteudo-essencial',
  'acessibilidade',
  'privacidade',
  'evidencias-revisao',
]);

const SCRIPT_TITLES = Object.freeze([
  'Objetivo',
  'Público',
  'Perfil e tipo',
  'Formato',
  'Data aproximada',
  'Local',
  'Capacidade',
  'Recursos desejados',
  'Responsáveis',
  'Conteúdo essencial',
  'Acessibilidade',
  'Privacidade',
  'Evidências para revisão',
]);

const PROFILE_IDS = Object.freeze([
  'cientifico',
  'corporativo',
  'feira',
  'entretenimento',
]);

const STOP_IDS = Object.freeze([
  'responsavel-ausente',
  'local-data-incoerentes',
  'dado-sensivel',
  'acessibilidade-nao-planejada',
]);

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '#estados',
  '#roteiro',
  '#perfis',
  '#paradas',
  '#checklist',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const ANTI_CLAIM_FORBIDDEN = [
  /publicação habilitada/iu,
  /publique agora/iu,
  /já (está|foi) publicado/iu,
  /em produção|go-live|no ar automaticamente/iu,
  /\bSLA\b/u,
  /prazo de atendimento/iu,
  /atendimento em \d+ (hora|minuto)/iu,
  /R\$/u,
  /whatsapp/iu,
  /permiss[aã]o já (concedida|comprovada|implementada)/iu,
  /ACL implementada/iu,
  /módulo (já )?habilitado/iu,
  /a EVA (homologa|publica|decide|aprova)/iu,
  /EVA é (uma )?aprovadora autônoma/iu,
  /Wizard visual/iu,
  /configure agora a ficha/iu,
  /garantimos/iu,
  /100\s*%/u,
  /selo de acessibilidade/iu,
  /certifica[cç][aã]o WCAG/iu,
  /conforme à WCAG/iu,
  /conformidade total/iu,
];

function blockSection(page) {
  const start = page.indexOf('const BLOCKS = [');
  const end = page.indexOf('const PROFILES = [');
  assert.ok(start >= 0 && end > start, 'constantes BLOCKS e PROFILES devem existir');
  return page.slice(start, end);
}

test('guia de briefing expõe skip-link, um main focável, um h1 e metadata conservadora', async () => {
  const page = await source(PAGE);
  const mains = [...page.matchAll(/<main\b/gu)];
  const headings = [...page.matchAll(/<h1\b/gu)];

  assert.match(page, /className="skip-link" href="#main-content"/u);
  assert.match(page, /<main id="main-content"[^>]*tabIndex=\{-1\}/u);
  assert.equal(mains.length, 1);
  assert.equal(headings.length, 1);
  assert.match(page, /<h1>Estruture o briefing mínimo antes da jornada guiada<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /title: 'Briefing do evento'/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /export const dynamic = 'force-static'/u);
  assert.match(page, /português do Brasil/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.doesNotMatch(page, /'use client'/u);
});

test('roteiro cobre os treze blocos na ordem canônica', async () => {
  const page = await source(PAGE);
  const section = blockSection(page);
  const ids = [...section.matchAll(/id: '([^']+)'/gu)].map((match) => match[1]);

  assert.deepEqual(ids, [...SCRIPT_IDS]);
  assert.equal(SCRIPT_IDS.length, 13);
  assert.equal(SCRIPT_TITLES.length, 13);

  for (const title of SCRIPT_TITLES) {
    assert.match(section, new RegExp(`title: '${title.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}'`, 'u'), title);
  }

  assert.match(page, /<h2 id="roteiro-title">Roteiro estático do briefing mínimo<\/h2>/u);
  assert.match(page, /<ol className=\{styles\.blocks\}>/u);
  assert.match(page, /presencial, online ou híbrido/iu);
  assert.match(page, /Nada aqui fica gravado, baixado\s+ou publicado/u);
});

test('cada bloco traz pergunta orientadora, exemplo genérico e evidência esperada', async () => {
  const page = await source(PAGE);
  const section = blockSection(page);

  assert.equal([...section.matchAll(/^\s+question: /gmu)].length, 13);
  assert.equal([...section.matchAll(/^\s+example: /gmu)].length, 13);
  assert.equal([...section.matchAll(/^\s+evidence: /gmu)].length, 13);
  assert.match(page, /<dt>Pergunta orientadora<\/dt>/u);
  assert.match(page, /<dt>Exemplo genérico<\/dt>/u);
  assert.match(page, /<dt>Evidência esperada<\/dt>/u);
  assert.match(page, /\{block\.question\}/u);
  assert.match(page, /\{block\.example\}/u);
  assert.match(page, /\{block\.evidence\}/u);
});

test('estados separam definir agora, pode decidir depois e pare e confirme com texto e ícone', async () => {
  const page = await source(PAGE);

  assert.match(page, /label: 'Definir agora'/u);
  assert.match(page, /label: 'Pode decidir depois'/u);
  assert.match(page, /label: 'Pare e confirme'/u);
  assert.match(page, /icon: '✓'/u);
  assert.match(page, /icon: '○'/u);
  assert.match(page, /icon: '×'/u);
  assert.match(page, /\{state\.icon\}/u);
  assert.match(page, /\{state\.label\}/u);
  assert.match(page, /texto e ícone, não só cor/u);
  assert.match(page, /<h2 id="estados-title">Como ler cada bloco: texto e ícone, não só cor<\/h2>/u);

  const nowCount = [...page.matchAll(/state: 'now'/gu)].length;
  const laterCount = [...page.matchAll(/state: 'later'/gu)].length;
  const stopCount = [...page.matchAll(/state: 'stop'/gu)].length;
  assert.equal(nowCount + laterCount + stopCount, 13);
  assert.ok(nowCount >= 1 && laterCount >= 1 && stopCount >= 1);
});

test('exemplos cobrem quatro perfis e os 19 tipos sem copiar taxonomia nem fixar capabilities', async () => {
  const page = await source(PAGE);

  for (const id of PROFILE_IDS) {
    assert.equal([...page.matchAll(new RegExp(`id: '${id}'`, 'gu'))].length, 1, id);
  }

  assert.match(page, /Encontro científico ou acadêmico/u);
  assert.match(page, /Encontro corporativo ou de capacitação/u);
  assert.match(page, /Mostra com expositores e visitantes/u);
  assert.match(page, /Encontro de entretenimento com público amplo/u);
  assert.match(page, /19 tipos de evento/u);
  assert.match(page, /sem repetir a taxonomia/u);
  assert.match(page, /sem fixar capabilities/u);
  assert.doesNotMatch(page, /EVENT_PROFILE_GROUPS|listEventProfileOptions/u);
  assert.doesNotMatch(page, /Congresso ou evento científico/u);
  assert.doesNotMatch(page, /Simpósio científico/u);
  assert.doesNotMatch(page, /Convenção empresarial/u);
  assert.doesNotMatch(page, /Show ou entretenimento/u);
});

test('regras de parada cobrem responsável ausente, local/data incoerentes, dado sensível e acessibilidade não planejada', async () => {
  const page = await source(PAGE);

  for (const id of STOP_IDS) {
    assert.equal([...page.matchAll(new RegExp(`id: '${id}'`, 'gu'))].length, 1, id);
  }

  assert.match(page, /<h2 id="parada-title">Regras explícitas de parada<\/h2>/u);
  assert.match(page, /Responsável ausente/u);
  assert.match(page, /Local e data incoerentes/u);
  assert.match(page, /Dado sensível/u);
  assert.match(page, /Acessibilidade não planejada/u);
  assert.match(page, /A EVA não ocupa esse papel/u);
  assert.match(page, /Documento de identificação, dado de saúde ou biometria/u);
  assert.match(page, /Ausência de plano, mesmo inicial, é regra de parada/u);
});

test('EVA orienta e sugere; textos não afirmam decisão, homologação, publicação, prazo, preço, SLA, contato ou permissão', async () => {
  const page = await source(PAGE);

  assert.match(page, /A EVA orienta e sugere/u);
  assert.match(page, /não decide,\s+não homologa e não publica/u);
  assert.match(page, /Sugestão da EVA não conta como aprovação, homologação ou publicação/u);
  assert.match(page, /Não invente\s+prazo, preço, canal de atendimento, contato, permissão ou publicação/u);
  assert.match(page, /sem afirmar acesso já atribuído/u);
  assert.match(page, /orientação estática/u);
  assert.doesNotMatch(page, /A EVA (homologa|publica|decide|aprova)/u);

  for (const pattern of ANTI_CLAIM_FORBIDDEN) {
    assert.doesNotMatch(page, pattern);
  }
});

test('checklist imprimível existe sem formulário, download gerado, fetch, cookies, analytics ou PII', async () => {
  const page = await source(PAGE);

  assert.match(page, /<h2 id="checklist-title">Checklist imprimível de revisão<\/h2>/u);
  assert.match(page, /Leia ou imprima esta lista/u);
  assert.match(page, /não gera arquivo, não grava estado/u);
  assert.match(page, /<ol className=\{styles\.checkItems\}>/u);
  assert.doesNotMatch(page, /<form\b/u);
  assert.doesNotMatch(page, /<input\b/u);
  assert.doesNotMatch(page, /<textarea\b/u);
  assert.doesNotMatch(page, /<select\b/u);
  assert.doesNotMatch(page, /<button\b/u);
  assert.doesNotMatch(page, /download=|blob:|URL\.createObjectURL/u);
  assert.doesNotMatch(page, /fetch\(|useState|useEffect|'use client'|cookies\(|headers\(/u);
  assert.doesNotMatch(page, /document\.cookie|localStorage|sessionStorage|gtag\(|analytics/iu);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/u);
});

test('links são públicos comprovados, sem rotas privadas, query, token ou captura de dados', async () => {
  const page = await source(PAGE);
  const hrefs = [...page.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]);

  assert.ok(hrefs.length > 0);
  for (const href of hrefs) {
    assert.ok(ALLOWED_HREFS.includes(href), `href não autorizado: ${href}`);
    assert.equal(href.includes('?'), false, `query não permitida: ${href}`);
    assert.doesNotMatch(href, /^(mailto:|tel:|javascript:)/iu);
  }

  assert.doesNotMatch(page, /href="\/login"/u);
  assert.doesNotMatch(page, /href="\/cadastro"/u);
  assert.doesNotMatch(page, /href="\/painel"/u);
  assert.doesNotMatch(page, /href="\/eventos\/novo"/u);
  assert.doesNotMatch(page, /\/convites|\/evento\//u);
});

test('página não expõe PII, token, host interno nem identificador operacional', async () => {
  const page = await source(PAGE);

  assert.doesNotMatch(page, /mailto:/iu);
  assert.doesNotMatch(page, /tel:/iu);
  assert.doesNotMatch(page, /@[a-z0-9.-]+\.[a-z]{2,}/iu);
  assert.doesNotMatch(page, /\+55|\(\d{2}\)\s*\d/u);
  assert.doesNotMatch(page, /berg\.expresso|gmail\.com|whatsapp/iu);
  assert.doesNotMatch(page, /localhost|127\.0\.0\.1|0\.0\.0\.0|api:4000/u);
  assert.doesNotMatch(page, /process\.env/u);
  assert.doesNotMatch(page, /Bearer |authorization/iu);
  assert.doesNotMatch(page, /eventId|organizationId|tenantId/u);
});

test('CSS do guia reflow em 1366/720/390/320, forced-colors, alvos 44 px, reduced-motion e impressão', async () => {
  const css = await source(CSS);

  assert.match(css, /@media \(max-width: 320px\)/u);
  assert.match(css, /@media \(max-width: 390px\)/u);
  assert.match(css, /@media \(max-width: 720px\)/u);
  assert.match(css, /@media \(min-width: 1366px\)/u);
  assert.match(css, /@media \(forced-colors: active\)/u);
  assert.match(css, /border: 1px solid CanvasText/u);
  assert.match(css, /color: LinkText/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /@media print/u);
  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.match(css, /min-width: var\(--space-44\)/u);
  assert.match(css, /outline: 3px solid var\(--color-focus-on-light\)/u);
  assert.match(css, /\.article \{[\s\S]*min-width: 0/u);
  assert.match(css, /\.article h1 \{[\s\S]*overflow-wrap: anywhere/u);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/u);
  assert.match(css, /@media \(max-width: 320px\) \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/u);
  assert.match(css, /border-style: dashed/u);
  assert.match(css, /border-style: double/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/u);
  assert.doesNotMatch(css, /overflow:\s*hidden/u);
  assert.doesNotMatch(css, /white-space:\s*nowrap/u);
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis/u);
});
