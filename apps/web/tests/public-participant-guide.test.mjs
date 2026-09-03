import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/participantes/page.tsx';
const CSS = '../app/ajuda/participantes/participantes.module.css';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const ANTI_CLAIM_FORBIDDEN = [
  /totalmente acess[ií]vel/iu,
  /100\s*%/u,
  /selo de acessibilidade/iu,
  /certifica[cç][aã]o WCAG/iu,
  /conforme à WCAG/iu,
  /conformidade total/iu,
  /WCAG 2\.2 AA certificado/iu,
  /garantimos/iu,
  /atendimento em \d+ (hora|minuto)/iu,
];

test('guia da pessoa participante expõe skip-link, um main focável e um h1', async () => {
  const page = await source(PAGE);
  const mains = [...page.matchAll(/<main\b/gu)];
  const headings = [...page.matchAll(/<h1\b/gu)];

  assert.match(page, /className="skip-link" href="#main-content"/u);
  assert.match(page, /<main id="main-content"[^>]*tabIndex=\{-1\}/u);
  assert.equal(mains.length, 1);
  assert.equal(headings.length, 1);
  assert.match(page, /<h1>Como uma pessoa participante se orienta na Evolvia<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
});

test('seções cobrem antes, durante, depois e informação ausente', async () => {
  const page = await source(PAGE);

  assert.match(page, /<h2 id="antes-title">Antes de consultar um evento<\/h2>/u);
  assert.match(page, /<h2 id="durante-title">Durante a consulta da ficha pública<\/h2>/u);
  assert.match(page, /<h2 id="depois-title">Depois de consultar<\/h2>/u);
  assert.match(page, /<h2 id="ausente-title">Quando a informação não aparece<\/h2>/u);
  assert.match(page, /Informação ausente/u);
  assert.match(page, /Evento não encontrado ou indisponível/u);
  assert.match(page, /Confirme com a organização/u);
  assert.match(page, /Isso não significa que a pessoa tenha errado/u);
});

test('textos permanecem honestos e não afirmam SLA, selo, certificação ou garantia', async () => {
  const page = await source(PAGE);

  assert.match(page, /não garante vaga, prazo de resposta nem certificação/u);
  assert.match(page, /Não há SLA/u);
  assert.match(page, /não declaramos que um evento seja acessível/u);
  assert.match(page, /não inventa e-mail, telefone ou chat/u);
  assert.match(page, /title: 'Guia da pessoa participante'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);

  for (const pattern of ANTI_CLAIM_FORBIDDEN) {
    assert.doesNotMatch(page, pattern);
  }
});

test('links são públicos comprovados, sem rotas privadas nem captura de dados', async () => {
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
  assert.doesNotMatch(page, /<form\b/u);
  assert.doesNotMatch(page, /<input\b/u);
  assert.doesNotMatch(page, /<textarea\b/u);
  assert.doesNotMatch(page, /fetch\(|useState|useEffect|'use client'/u);
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
  assert.match(page, /Não envie senha, documento, token ou dado extra/u);
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
});

test('CSS do guia reflow em 320 px, forced-colors, zoom e text spacing', async () => {
  const css = await source(CSS);

  assert.match(css, /@media \(max-width: 320px\)/u);
  assert.match(css, /@media \(forced-colors: active\)/u);
  assert.match(css, /border: 1px solid CanvasText/u);
  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.match(css, /min-width: var\(--space-44\)/u);
  assert.match(css, /outline: 3px solid var\(--color-focus-on-light\)/u);
  assert.match(css, /\.article \{[\s\S]*min-width: 0/u);
  assert.match(css, /\.article h1 \{[\s\S]*overflow-wrap: anywhere/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/u);
  assert.doesNotMatch(css, /overflow:\s*hidden/u);
  assert.doesNotMatch(css, /white-space:\s*nowrap/u);
});
