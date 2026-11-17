import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/revisao-da-pagina/page.tsx';
const CSS = '../app/ajuda/revisao-da-pagina/revisao-da-pagina.module.css';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const BLOCK_TITLES = [
  'Título',
  'Resumo',
  'Público',
  'Data e horário',
  'Fuso',
  'Local ou acesso online',
  'Programação',
  'Responsáveis',
  'Imagens e texto alternativo',
  'Links',
  'Acessibilidade',
  'Privacidade',
  'Coerência entre canais',
];

const ANTI_CLAIM_FORBIDDEN = [
  /publicação habilitada/iu,
  /publique agora/iu,
  /botão real de publicar/iu,
  /deploy disponível/iu,
  /totalmente acess[ií]vel/iu,
  /100\s*%/u,
  /selo de acessibilidade/iu,
  /certifica[cç][aã]o WCAG/iu,
  /conforme à WCAG/iu,
  /conformidade total/iu,
  /WCAG 2\.2 AA certificado/iu,
  /garantimos/iu,
  /atendimento em \d+ (hora|minuto)/iu,
  /validação jurídica concluída/iu,
  /aconselhamento jurídico/iu,
];

test('guia de revisão da página expõe skip-link, um main focável e um h1', async () => {
  const page = await source(PAGE);
  const mains = [...page.matchAll(/<main\b/gu)];
  const headings = [...page.matchAll(/<h1\b/gu)];

  assert.match(page, /className="skip-link" href="#main-content"/u);
  assert.match(page, /<main id="main-content"[^>]*tabIndex=\{-1\}/u);
  assert.equal(mains.length, 1);
  assert.equal(headings.length, 1);
  assert.match(page, /<h1>Revisar o conteúdo da página de divulgação<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
});

test('treze blocos incluem o que verificar, erro comum, evidência e regra de parada', async () => {
  const page = await source(PAGE);

  assert.equal(BLOCK_TITLES.length, 13);
  for (const title of BLOCK_TITLES) {
    assert.match(page, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), title);
  }

  assert.equal([...page.matchAll(/^\s+check: '/gmu)].length, 13);
  assert.equal([...page.matchAll(/^\s+error: '/gmu)].length, 13);
  assert.equal([...page.matchAll(/^\s+evidence: '/gmu)].length, 13);
  assert.equal([...page.matchAll(/^\s+stop: '/gmu)].length, 13);
  assert.match(page, /<strong>O que verificar\.<\/strong>/u);
  assert.match(page, /<strong>Erro comum\.<\/strong>/u);
  assert.match(page, /<strong>Evidência esperada\.<\/strong>/u);
  assert.match(page, /<strong>Regra de parada\.<\/strong>/u);
  assert.match(page, /<ol className=\{styles\.blocks\}>/u);
  assert.match(page, /<ul className=\{styles\.criteria\}>/u);
});

test('estados Confere, Revisar e Não homologar usam ícone, texto e borda', async () => {
  const page = await source(PAGE);
  const css = await source(CSS);

  assert.match(page, /label: 'Confere'/u);
  assert.match(page, /label: 'Revisar'/u);
  assert.match(page, /label: 'Não homologar'/u);
  assert.match(page, /icon: '✓'/u);
  assert.match(page, /icon: '!'/u);
  assert.match(page, /icon: '×'/u);
  assert.match(page, /nunca apenas cor/u);
  assert.match(page, /aria-hidden="true">✓<\/span>\s*Confere/u);
  assert.match(page, /aria-hidden="true">!<\/span>\s*Revisar/u);
  assert.match(page, /aria-hidden="true">×<\/span>\s*Não homologar/u);

  assert.match(css, /\.states \.confere \{[\s\S]*border-style: solid/u);
  assert.match(css, /\.states \.revisar \{[\s\S]*border-style: dashed/u);
  assert.match(css, /\.states \.nao-homologar \{[\s\S]*border-style: double/u);
  assert.match(css, /\.naoHomologar \{[\s\S]*border: 4px double/u);
});

test('regras de parada cobrem conflito, link quebrado, mídia, contato e dado sensível', async () => {
  const page = await source(PAGE);

  assert.match(page, /<h2 id="parada-title">Regras explícitas de parada<\/h2>/u);
  assert.match(page, /Data ou local conflitante/u);
  assert.match(page, /Link quebrado/u);
  assert.match(page, /Mídia sem alternativa/u);
  assert.match(page, /Contato não confirmado/u);
  assert.match(page, /Dado sensível exposto/u);
  assert.match(page, /data e local conflitantes — não homologar/iu);
  assert.match(page, /Link quebrado ou destino privado/u);
  assert.match(page, /Mídia sem alternativa — não homologar/u);
  assert.match(page, /Contato não confirmado/u);
  assert.match(page, /Dado sensível exposto — não homologar/u);
});

test('prévia, homologação e publicação permanecem distintas; EVA não decide', async () => {
  const page = await source(PAGE);

  assert.match(page, /title: 'Prévia'/u);
  assert.match(page, /title: 'Homologação'/u);
  assert.match(page, /title: 'Publicação'/u);
  assert.match(page, /Prévia, homologação e publicação não são a mesma ação/u);
  assert.match(page, /A EVA auxilia; a decisão permanece humana e autorizada/u);
  assert.match(page, /não homologa sozinha/u);
  assert.match(page, /não afirma que a publicação esteja habilitada/u);
});

test('textos permanecem honestos e não afirmam publicação habilitada, certificação, SLA ou validação jurídica', async () => {
  const page = await source(PAGE);

  assert.match(page, /não afirma que a publicação esteja habilitada/u);
  assert.match(page, /não declara certificação, SLA nem validação jurídica/u);
  assert.match(page, /não oferece validação jurídica/u);
  assert.match(page, /Não há\s+formulário, upload, estado salvo nem edição de evento real aqui/u);
  assert.match(page, /19\s+tipos de evento/u);
  assert.match(page, /sem repetir a taxonomia nem a política de\s+capabilities/u);
  assert.match(page, /title: 'Revisão da página do evento'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);

  for (const pattern of ANTI_CLAIM_FORBIDDEN) {
    assert.doesNotMatch(page, pattern);
  }
});

test('links são públicos comprovados, sem rotas privadas nem ação operacional', async () => {
  const page = await source(PAGE);
  const hrefs = [...page.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]);

  assert.ok(hrefs.length > 0);
  for (const href of hrefs) {
    assert.ok(ALLOWED_HREFS.includes(href), `href não autorizado: ${href}`);
    assert.doesNotMatch(href, /^(mailto:|tel:|javascript:)/iu);
  }

  assert.doesNotMatch(page, /href="\/login"/u);
  assert.doesNotMatch(page, /href="\/cadastro"/u);
  assert.doesNotMatch(page, /href="\/painel"/u);
  assert.doesNotMatch(page, /href="\/eventos\/novo"/u);
  assert.doesNotMatch(page, /<form\b/u);
  assert.doesNotMatch(page, /<input\b/u);
  assert.doesNotMatch(page, /<textarea\b/u);
  assert.doesNotMatch(page, /<button\b/u);
  assert.doesNotMatch(page, /fetch\(|useState|useEffect|'use client'/u);
  assert.doesNotMatch(page, /document\.cookie|localStorage|sessionStorage|analytics/iu);
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
  assert.match(page, /não invente endereço eletrônico, telefone ou chat/u);
});

test('página reutiliza o cabeçalho institucional sem alterá-lo e permanece estática', async () => {
  const page = await source(PAGE);

  assert.match(page, /from ['"].*public-site-header['"]/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /português do\s+Brasil/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /href="\/eventos"/u);
  assert.match(page, /href="\/privacidade"/u);
  assert.match(page, /href="\/termos-de-uso"/u);
  assert.match(page, /orientação estática e imprimível/u);
});

test('CSS do guia reflow em 320 px, forced-colors, alvos 44 px, print e reduced-motion', async () => {
  const css = await source(CSS);

  assert.match(css, /@media \(max-width: 320px\)/u);
  assert.match(css, /@media \(max-width: 720px\)/u);
  assert.match(css, /@media \(forced-colors: active\)/u);
  assert.match(css, /border: 1px solid CanvasText/u);
  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.match(css, /min-width: var\(--space-44\)/u);
  assert.match(css, /outline: 3px solid var\(--color-focus-on-light\)/u);
  assert.match(css, /\.article \{[\s\S]*min-width: 0/u);
  assert.match(css, /\.article h1 \{[\s\S]*overflow-wrap: anywhere/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /@media print/u);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/u);
  assert.match(css, /border-style: dashed/u);
  assert.match(css, /border-style: double/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/u);
  assert.doesNotMatch(css, /overflow:\s*hidden/u);
  assert.doesNotMatch(css, /white-space:\s*nowrap/u);
});
