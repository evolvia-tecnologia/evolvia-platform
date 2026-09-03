import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/termos-de-uso',
  '/privacidade',
]);

const ANTI_CLAIM_FORBIDDEN = [
  /totalmente acess[ií]vel/iu,
  /100\s*%/u,
  /selo de acessibilidade/iu,
  /certifica[cç][aã]o WCAG/iu,
  /conforme à WCAG/iu,
  /conformidade total/iu,
  /WCAG 2\.2 AA certificado/iu,
];

test('declaração pública expõe skip-link, um main focável e um h1', async () => {
  const page = await source('../app/acessibilidade/page.tsx');
  const mains = [...page.matchAll(/<main\b/gu)];
  const headings = [...page.matchAll(/<h1\b/gu)];

  assert.match(page, /className="skip-link" href="#main-content"/u);
  assert.match(page, /<main id="main-content"[^>]*tabIndex=\{-1\}/u);
  assert.equal(mains.length, 1);
  assert.equal(headings.length, 1);
  assert.match(page, /<h1>Acessibilidade na Evolvia<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
});

test('textos permanecem honestos e não afirmam selo ou conformidade homologada', async () => {
  const page = await source('../app/acessibilidade/page.tsx');

  assert.match(page, /não declara conformidade WCAG 2\.2 AA/u);
  assert.match(page, /não apresenta selo/u);
  assert.match(page, /conformidade não homologada/u);
  assert.match(page, /Não há certificação, SLA de atendimento/u);
  assert.match(page, /title: 'Acessibilidade'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);

  for (const pattern of ANTI_CLAIM_FORBIDDEN) {
    assert.doesNotMatch(page, pattern);
  }
});

test('links são seguros, internos e sem captura de dados', async () => {
  const page = await source('../app/acessibilidade/page.tsx');
  const hrefs = [...page.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]);

  assert.ok(hrefs.length > 0);
  for (const href of hrefs) {
    assert.ok(ALLOWED_HREFS.includes(href), `href não autorizado: ${href}`);
    assert.doesNotMatch(href, /^(mailto:|tel:|javascript:)/iu);
  }

  assert.doesNotMatch(page, /<form\b/u);
  assert.doesNotMatch(page, /<input\b/u);
  assert.doesNotMatch(page, /<textarea\b/u);
  assert.doesNotMatch(page, /fetch\(|useState|useEffect/u);
});

test('contato usa somente o canal institucional público já canônico', async () => {
  const page = await source('../app/acessibilidade/page.tsx');

  assert.match(page, /contato corporativo público já canônico/u);
  assert.match(page, /href="\/termos-de-uso"/u);
  assert.match(page, /href="\/privacidade"/u);
  assert.match(page, /não publica e-mail, telefone ou dado pessoal/u);
  assert.doesNotMatch(page, /mailto:/iu);
  assert.doesNotMatch(page, /tel:/iu);
  assert.doesNotMatch(page, /@[a-z0-9.-]+\.[a-z]{2,}/iu);
  assert.doesNotMatch(page, /\+55|\(\d{2}\)\s*\d/u);
  assert.doesNotMatch(page, /berg\.expresso|gmail\.com|whatsapp/iu);
});

test('página reutiliza o cabeçalho institucional sem alterá-lo e cobre teclado, foco, zoom e AT', async () => {
  const page = await source('../app/acessibilidade/page.tsx');

  assert.match(page, /from ['"].*public-site-header['"]/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /Navegação por teclado e indicador de foco visível/u);
  assert.match(page, /zoom do navegador/u);
  assert.match(page, /tecnologias assistivas/u);
  assert.match(page, /português do Brasil/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
});

test('CSS da declaração reflow em 320 px, forced-colors e alvos de 44 px', async () => {
  const css = await source('../app/acessibilidade/acessibilidade.module.css');

  assert.match(css, /@media \(max-width: 320px\)/u);
  assert.match(css, /@media \(forced-colors: active\)/u);
  assert.match(css, /border: 1px solid CanvasText/u);
  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.match(css, /outline: 3px solid var\(--color-focus-on-light\)/u);
  assert.match(css, /\.article \{[\s\S]*min-width: 0/u);
  assert.match(css, /\.article h1 \{[\s\S]*overflow-wrap: anywhere/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/u);
  assert.doesNotMatch(css, /overflow:\s*hidden/u);
  assert.doesNotMatch(css, /white-space:\s*nowrap/u);
});
