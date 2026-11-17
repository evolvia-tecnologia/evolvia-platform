import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const PAGE = '../app/ajuda/cronograma-essencial/page.tsx';
const CSS = '../app/ajuda/cronograma-essencial/cronograma-essencial.module.css';

const MILESTONE_TITLES = [
  'Definir objetivo e público',
  'Escolher perfil e tipo',
  'Reunir dados mínimos',
  'Configurar recursos',
  'Preparar conteúdo e mídias',
  'Revisar acessibilidade e privacidade',
  'Conferir a prévia',
  'Homologar',
  'Decidir a publicação',
];

const MILESTONE_IDS = [
  'objetivo-publico',
  'perfil-tipo',
  'dados-minimos',
  'configurar-recursos',
  'conteudo-midias',
  'acessibilidade-privacidade',
  'previa',
  'homologar',
  'decidir-publicacao',
];

const ALLOWED_HREFS = new Set([
  '#main-content',
  '#estados',
  '#indice-title',
  '#objetivo-publico',
  '#perfil-tipo',
  '#dados-minimos',
  '#configurar-recursos',
  '#conteudo-midias',
  '#acessibilidade-privacidade',
  '#previa',
  '#homologar',
  '#decidir-publicacao',
  '#perfis',
  '#parada',
  '#impressao',
  '/',
  '/eventos',
  '/termos-de-uso',
  '/privacidade',
]);

const ANTI_CLAIM_FORBIDDEN = [
  /publicação habilitada/iu,
  /já (?:está|foi) publicado/iu,
  /publique agora/iu,
  /em produção|go-live|no ar automaticamente/iu,
  /\bSLA\b|prazo de atendimento/u,
  /em \d+ (dias?|horas?|semanas?|minutos?)/iu,
  /até \d{1,2}\/\d{1,2}/u,
  /R\$|whatsapp|telefone|\bcpf\b/iu,
  /garantimos/iu,
  /100\s*%/u,
  /selo de acessibilidade/iu,
  /certifica[cç][aã]o WCAG/iu,
  /conforme à WCAG/iu,
  /a EVA (homologa|publica|aprova)/iu,
  /EVA é (uma )?aprovadora autônoma/iu,
];

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

test('cronograma essencial fornece landmarks, skip-link e um único main/h1', async () => {
  const src = await source(PAGE);
  assert.match(src, /className="skip-link" href="#main-content"/u);
  assert.match(src, /<main id="main-content"[^>]*tabIndex=\{-1\}/u);
  assert.equal([...src.matchAll(/<main\b/gu)].length, 1);
  assert.equal([...src.matchAll(/<h1\b/gu)].length, 1);
  assert.match(src, /<h1 className=\{styles\.title\}>Cronograma essencial de preparação do evento<\/h1>/u);
  assert.match(src, /Pular para o conteúdo principal/u);
  assert.match(src, /<article/u);
  assert.match(src, /<nav/u);
  assert.match(src, /<ol/u);
  assert.match(src, /title: 'Cronograma essencial'/u);
  assert.match(src, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false/u);
  assert.match(src, /português do Brasil/u);
  assert.doesNotMatch(src, /\| Evolvia/u);
});

test('os nove marcos aparecem na ordem e cada um declara responsável, entrada, evidência e parada', async () => {
  const src = await source(PAGE);

  assert.equal(MILESTONE_TITLES.length, 9);
  assert.equal(MILESTONE_IDS.length, 9);

  const titles = [...src.matchAll(/title: '([^']+)'/gu)].map((match) => match[1]);
  const milestoneTitles = titles.filter((title) => MILESTONE_TITLES.includes(title));
  assert.deepEqual(milestoneTitles, MILESTONE_TITLES);

  for (const id of MILESTONE_IDS) {
    assert.equal([...src.matchAll(new RegExp(`id: '${id}'`, 'gu'))].length, 1, id);
  }

  assert.equal([...src.matchAll(/\bowner:/gu)].length, 9);
  assert.equal([...src.matchAll(/\binput:/gu)].length, 9);
  assert.equal([...src.matchAll(/\bevidence:/gu)].length, 9);
  assert.equal([...src.matchAll(/\bstop:/gu)].length, 9);

  assert.match(src, /<dt>Responsável sugerido<\/dt>/u);
  assert.match(src, /<dt>Entrada necessária<\/dt>/u);
  assert.match(src, /<dt>Evidência de conclusão<\/dt>/u);
  assert.match(src, /<dt>Regra de parada<\/dt>/u);
  assert.match(src, /\{milestone\.owner\}/u);
  assert.match(src, /\{milestone\.input\}/u);
  assert.match(src, /\{milestone\.evidence\}/u);
  assert.match(src, /\{milestone\.stop\}/u);
});

test('estados planejado, em revisão e pronto para decisão usam texto e ícone', async () => {
  const src = await source(PAGE);

  assert.match(src, /label: 'Planejado'/u);
  assert.match(src, /label: 'Em revisão'/u);
  assert.match(src, /label: 'Pronto para decisão'/u);
  assert.match(src, /icon: '○'/u);
  assert.match(src, /icon: '◑'/u);
  assert.match(src, /icon: '✓'/u);
  assert.match(src, /aria-hidden="true">○<\/span>\s*Planejado/u);
  assert.match(src, /aria-hidden="true">◑<\/span>\s*Em revisão/u);
  assert.match(src, /aria-hidden="true">✓<\/span>\s*Pronto para decisão/u);
  assert.match(src, /não só cor/u);
  assert.match(src, /sem calendário\s+interativo/u);
  assert.match(src, /sem progresso salvo/u);
});

test('EVA orienta e não homologa nem publica; textos recusam SLA, data inventada e garantia', async () => {
  const src = await source(PAGE);

  assert.match(src, /A EVA orienta; não homologa nem publica/u);
  assert.match(src, /A EVA não ocupa este papel/u);
  assert.match(src, /A EVA não confirma publicação/u);
  assert.match(src, /não afirma que a publicação já está habilitada/u);
  assert.match(src, /não\s+executa deploy/u);
  assert.match(src, /não promete prazo/u);
  assert.match(src, /Não cria agenda, não grava datas e não publica/u);
  assert.match(src, /19 tipos de evento/u);
  assert.match(src, /quatro perfis/u);
  assert.match(src, /Não repetimos\s+a taxonomia/u);
  assert.match(src, /não criamos prazo, fila ou garantia/u);
  assert.doesNotMatch(src, /EVENT_PROFILE_GROUPS|listEventProfileOptions/u);
  assert.doesNotMatch(src, /Congresso ou evento científico/u);
  assert.doesNotMatch(src, /Simpósio científico/u);

  for (const pattern of ANTI_CLAIM_FORBIDDEN) {
    assert.doesNotMatch(src, pattern);
  }
});

test('links permanecem no allowlist público, sem query, token ou destino privado', async () => {
  const src = await source(PAGE);
  const staticHrefs = [...src.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]);
  const dynamicAnchors = MILESTONE_IDS.map((id) => `#${id}`);
  const hrefs = [...staticHrefs, ...dynamicAnchors];

  assert.ok(hrefs.length > 0, 'a página precisa expor destinos públicos');
  assert.match(src, /href=\{`#\$\{milestone\.id\}`\}/u);
  for (const href of hrefs) {
    assert.ok(ALLOWED_HREFS.has(href), `href não autorizado: ${href}`);
    assert.equal(href.includes('?'), false, `query não permitida: ${href}`);
    assert.doesNotMatch(href, /^(mailto:|tel:|javascript:)/iu);
  }

  assert.doesNotMatch(src, /\/painel|\/eventos\/novo|\/evento\/|\/convites/u);
  assert.doesNotMatch(src, /href="\/login"/u);
  assert.doesNotMatch(src, /href="\/cadastro"/u);
});

test('página permanece estática, sem cliente JS, formulário, fetch, cookie, PII ou coletor', async () => {
  const src = await source(PAGE);
  assert.match(src, /export const dynamic = 'force-static'/u);
  assert.doesNotMatch(src, /['"]use client['"]/u);
  assert.doesNotMatch(src, /useState|useEffect|onClick|addEventListener/u);
  assert.doesNotMatch(src, /fetch\(|cookies\(|headers\(|localStorage|sessionStorage|document\.cookie/u);
  assert.doesNotMatch(src, /gtag\(|analytics|telemetry/iu);
  assert.doesNotMatch(src, /<form\b|<input\b|<textarea\b|<select\b|<button\b/u);
  assert.doesNotMatch(src, /dangerouslySetInnerHTML/u);
  assert.doesNotMatch(src, /mailto:/iu);
  assert.doesNotMatch(src, /tel:/iu);
  assert.doesNotMatch(src, /@[a-z0-9.-]+\.[a-z]{2,}/iu);
  assert.doesNotMatch(src, /\+55|\(\d{2}\)\s*\d/u);
  assert.doesNotMatch(src, /berg\.expresso|gmail\.com|whatsapp/iu);
  assert.doesNotMatch(src, /localhost|127\.0\.0\.1|0\.0\.0\.0|api:4000/u);
  assert.doesNotMatch(src, /process\.env/u);
  assert.doesNotMatch(src, /Bearer |authorization/iu);
  assert.doesNotMatch(src, /eventId|organizationId|tenantId/u);
  assert.match(src, /não é salva, não usa\s+JavaScript/u);
});

test('CSS cobre reflow 1366/390/320, forced-colors, reduced-motion, foco, alvos 44px e impressão', async () => {
  const css = await source(CSS);
  assert.match(css, /@media \(max-width:\s*320px\)/u);
  assert.match(css, /@media \(max-width:\s*390px\)/u);
  assert.match(css, /@media \(max-width:\s*720px\)/u);
  assert.match(css, /@media \(min-width:\s*1366px\)/u);
  assert.match(css, /forced-colors:\s*active/u);
  assert.match(css, /prefers-reduced-motion:\s*reduce/u);
  assert.match(css, /@media print/u);
  assert.match(css, /min-height:\s*var\(--space-44\)/u);
  assert.match(css, /min-width:\s*var\(--space-44\)/u);
  assert.match(css, /:focus-visible/u);
  assert.match(css, /outline:\s*3px solid var\(--color-focus-on-light\)/u);
  assert.match(css, /\.article h1,[\s\S]*min-width: 0;[\s\S]*overflow-wrap: anywhere/u);
  assert.match(css, /border-style: dotted/u);
  assert.match(css, /border-style: dashed/u);
  assert.match(css, /border-style: double/u);
  assert.match(css, /color: LinkText/u);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/u);
  assert.match(css, /@media \(max-width:\s*320px\) \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/u);
  assert.doesNotMatch(css, /overflow:\s*hidden/u);
  assert.doesNotMatch(css, /white-space:\s*nowrap/u);
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis/u);
});
