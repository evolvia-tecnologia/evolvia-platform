import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/midias-acessiveis/page.tsx';
const CSS = '../app/ajuda/midias-acessiveis/midias-acessiveis.module.css';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const MEDIA_TITLES = [
  'Texto alternativo',
  'Imagens decorativas',
  'Contraste dentro da arte',
  'Legendas',
  'Transcrição',
  'Audiodescrição',
  'Movimento',
  'Flashes',
  'PDFs',
  'Links descritivos',
];

const ANTI_CLAIM_FORBIDDEN = [
  /totalmente acess[ií]vel/iu,
  /100\s*%/u,
  /selo de acessibilidade/iu,
  /certifica[cç][aã]o WCAG/iu,
  /conforme à WCAG/iu,
  /conformidade total/iu,
  /WCAG 2\.2 AA certificado/iu,
  /garantimos/iu,
  /upload habilitado/iu,
  /player habilitado/iu,
  /transcodifica[cç][aã]o habilitada/iu,
  /atendimento em \d+ (hora|minuto)/iu,
];

test('guia de mídias acessíveis expõe skip-link, um main focável e um h1', async () => {
  const page = await source(PAGE);
  const mains = [...page.matchAll(/<main\b/gu)];
  const headings = [...page.matchAll(/<h1\b/gu)];

  assert.match(page, /className="skip-link" href="#main-content"/u);
  assert.match(page, /<main id="main-content"[^>]*tabIndex=\{-1\}/u);
  assert.equal(mains.length, 1);
  assert.equal(headings.length, 1);
  assert.match(page, /<h1>Prepare imagens, vídeos, áudio e documentos antes de divulgar<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
});

test('dez tópicos de mídia e três estados aparecem com texto e ícone', async () => {
  const page = await source(PAGE);

  assert.equal(MEDIA_TITLES.length, 10);
  for (const title of MEDIA_TITLES) {
    assert.match(page, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), title);
  }

  assert.match(page, /label: 'Preparar'/u);
  assert.match(page, /label: 'Revisar'/u);
  assert.match(page, /label: 'Não publicar ainda'/u);
  assert.match(page, /icon: '✎'/u);
  assert.match(page, /icon: '!'/u);
  assert.match(page, /icon: '×'/u);
  assert.match(page, /aria-hidden="true">✎<\/span>\s*Preparar/u);
  assert.match(page, /aria-hidden="true">!<\/span>\s*Revisar/u);
  assert.match(page, /aria-hidden="true">×<\/span>\s*Não publicar ainda/u);
  assert.match(page, /nunca só cor/u);
  assert.match(page, /<ol className=\{styles\.blocks\}>/u);
  assert.match(page, /<ul className=\{styles\.criteria\}>/u);
});

test('cobre imagens, vídeos, áudio e documentos nos três formatos sem duplicar catálogo', async () => {
  const page = await source(PAGE);

  assert.match(page, /imagens, vídeos, áudio e documentos/iu);
  assert.match(page, /<h3>Presencial<\/h3>/u);
  assert.match(page, /<h3>Online<\/h3>/u);
  assert.match(page, /<h3>Híbrido<\/h3>/u);
  assert.match(page, /19\s+tipos de evento/u);
  assert.match(page, /sem repetir o catálogo/u);
  assert.match(page, /<h2 id="checklist-title">Checklist antes da prévia e da homologação<\/h2>/u);
  assert.match(page, /<ol className=\{styles\.checklist\}>/u);
});

test('regras de parada cobrem alt/legenda/transcrição ausente, flash não avaliado e PDF inacessível', async () => {
  const page = await source(PAGE);

  assert.match(page, /<h2 id="parada-title">Regras explícitas de parada<\/h2>/u);
  assert.match(page, /Legenda, transcrição ou texto alternativo ausente/u);
  assert.match(page, /Flash não avaliado/u);
  assert.match(page, /PDF inacessível/u);
  assert.match(page, /Imagem informativa sem texto alternativo — não publique ainda/u);
  assert.match(page, /Vídeo com fala e sem legendas — não publique ainda/u);
  assert.match(page, /Áudio sem transcrição — não publique ainda/u);
  assert.match(page, /Flash não avaliado — não publique ainda/u);
  assert.match(page, /PDF inacessível[\s\S]*não publique ainda/u);
});

test('textos permanecem honestos e não afirmam selo, conformidade automática nem recurso operacional', async () => {
  const page = await source(PAGE);

  assert.match(page, /não afirma conformidade automática/u);
  assert.match(page, /não recebe arquivo/u);
  assert.match(page, /não processa mídia/u);
  assert.match(page, /Nada aqui habilita envio, transcodificação, player ou publicação/u);
  assert.match(page, /Revisão humana e teste com tecnologia assistiva continuam necessários/u);
  assert.match(page, /não declara conformidade normativa/u);
  assert.match(page, /nem recurso operacional ligado/u);
  assert.match(page, /title: 'Mídias acessíveis'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);

  for (const pattern of ANTI_CLAIM_FORBIDDEN) {
    assert.doesNotMatch(page, pattern);
  }
});

test('página é Server Component sem upload, player, formulário, fetch ou captura de dados', async () => {
  const page = await source(PAGE);
  const hrefs = [...page.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]);

  assert.ok(hrefs.length > 0);
  for (const href of hrefs) {
    assert.ok(ALLOWED_HREFS.includes(href), `href não autorizado: ${href}`);
    assert.doesNotMatch(href, /^(mailto:|tel:|javascript:)/iu);
    assert.doesNotMatch(href, /^https?:/iu);
  }

  assert.doesNotMatch(page, /href="\/login"/u);
  assert.doesNotMatch(page, /href="\/cadastro"/u);
  assert.doesNotMatch(page, /href="\/painel"/u);
  assert.doesNotMatch(page, /href="\/eventos\/novo"/u);
  assert.doesNotMatch(page, /<form\b/u);
  assert.doesNotMatch(page, /<input\b/u);
  assert.doesNotMatch(page, /<textarea\b/u);
  assert.doesNotMatch(page, /<video\b/u);
  assert.doesNotMatch(page, /<audio\b/u);
  assert.doesNotMatch(page, /<img\b/u);
  assert.doesNotMatch(page, /type=["']file["']/u);
  assert.doesNotMatch(page, /accept=/u);
  assert.doesNotMatch(page, /FormData|multipart/u);
  assert.doesNotMatch(page, /fetch\(|useState|useEffect|'use client'/u);
  assert.doesNotMatch(page, /document\.cookie|localStorage|analytics/iu);
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

test('página reutiliza o cabeçalho institucional sem alterá-lo e permanece estática', async () => {
  const page = await source(PAGE);

  assert.match(page, /from ['"].*public-site-header['"]/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /português do Brasil/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /href="\/eventos"/u);
  assert.match(page, /href="\/privacidade"/u);
  assert.match(page, /href="\/termos-de-uso"/u);
  assert.match(page, /orientação prática e estática/u);
});

test('CSS do guia reflow em 320 px, forced-colors, alvos 44 px, zoom e reduced-motion', async () => {
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
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/u);
  assert.match(css, /border-style: dashed/u);
  assert.match(css, /border-style: double/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/u);
  assert.doesNotMatch(css, /overflow:\s*hidden/u);
  assert.doesNotMatch(css, /white-space:\s*nowrap/u);
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis/u);
});
