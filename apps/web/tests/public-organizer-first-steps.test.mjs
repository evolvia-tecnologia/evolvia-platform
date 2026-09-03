import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const PAGE = '../app/ajuda/primeiros-passos/page.tsx';
const CSS = '../app/ajuda/primeiros-passos/primeiros-passos.module.css';

const STEPS = [
  'Definir o objetivo',
  'Escolher o tipo',
  'Preparar dados mínimos',
  'Configurar',
  'Revisar a prévia',
  'Validar antes de publicar',
];

const ALLOWED_HREFS = new Set([
  '#main-content',
  '#objetivo',
  '#tipo',
  '#dados',
  '#configurar',
  '#previa',
  '#validar',
  '#checklist',
  '/',
  '/eventos',
  '/cadastro',
  '/login',
  '/termos-de-uso',
  '/privacidade',
]);

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

test('primeiros passos fornece landmarks, skip-link e um único main/h1', async () => {
  const src = await source(PAGE);
  assert.match(src, /className="skip-link" href="#main-content"/u);
  assert.match(src, /<main id="main-content"[^>]*tabIndex=\{-1\}/u);
  assert.equal([...src.matchAll(/<main\b/gu)].length, 1);
  assert.equal([...src.matchAll(/<h1\b/gu)].length, 1);
  assert.match(src, /<ol/u);
  assert.match(src, /<nav/u);
  assert.match(src, /<article/u);
});

test('jornada pública cobre as seis etapas na ordem canônica', async () => {
  const src = await source(PAGE);
  const headings = [...src.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gu)].map((match) => match[1]);
  let cursor = -1;
  for (const step of STEPS) {
    const index = headings.indexOf(step);
    assert.ok(index > cursor, `etapa fora de ordem ou ausente: ${step}`);
    cursor = index;
  }
  assert.match(src, /Regras de parada/u);
  assert.match(src, /Pare antes de qualquer ação irreversível/u);
});

test('página distingue ações disponíveis, validações e autorização', async () => {
  const src = await source(PAGE);
  assert.match(src, /Disponível agora/u);
  assert.match(src, /Validação/u);
  assert.match(src, /Autorização/u);
  assert.match(src, /Checklist estático/u);
  assert.match(src, /não é salva, não usa JavaScript/u);
});

test('links permanecem no allowlist público, sem query, token ou destino privado', async () => {
  const src = await source(PAGE);
  const staticHrefs = [...src.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]);
  const stepIds = [...src.matchAll(/id: '([a-z]+)'/gu)].map((match) => `#${match[1]}`);
  const hrefs = [...staticHrefs, ...stepIds];

  assert.ok(hrefs.length > 0, 'a página precisa expor destinos públicos');
  assert.match(src, /href=\{`#\$\{step\.id\}`\}/u);
  for (const href of hrefs) {
    assert.ok(ALLOWED_HREFS.has(href), `href não autorizado: ${href}`);
    assert.equal(href.includes('?'), false, `query não permitida: ${href}`);
  }
  assert.doesNotMatch(src, /\/painel|\/eventos\/novo|\/evento\/|\/convites/u);
});

test('linguagem não afirma publicação, deploy, SLA, preço ou contato inventado', async () => {
  const src = await source(PAGE);
  assert.match(src, /não afirma que a publicação já está habilitada/u);
  assert.match(src, /não executa publicação/u);
  assert.match(src, /não habilita deploy/u);
  assert.doesNotMatch(src, /já (?:está|foi) publicado/iu);
  assert.doesNotMatch(src, /em produção|go-live|no ar automaticamente/iu);
  assert.doesNotMatch(src, /\bSLA\b|prazo de atendimento/u);
  assert.doesNotMatch(src, /R\$|whatsapp|telefone|\bcpf\b/iu);
  assert.doesNotMatch(src, /@[a-z0-9.-]+\.[a-z]{2,}/iu);
});

test('página permanece estática, sem cliente JS, formulário, fetch, cookie ou PII', async () => {
  const src = await source(PAGE);
  assert.match(src, /export const dynamic = 'force-static'/u);
  assert.match(src, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false/u);
  assert.doesNotMatch(src, /['"]use client['"]/u);
  assert.doesNotMatch(src, /useState|useEffect|onClick|addEventListener/u);
  assert.doesNotMatch(src, /fetch\(|cookies\(|headers\(|localStorage|sessionStorage|document\.cookie/u);
  assert.doesNotMatch(src, /<form\b|<input\b|<textarea\b|<select\b|<button\b/u);
  assert.doesNotMatch(src, /dangerouslySetInnerHTML/u);
});

test('CSS cobre reflow 320px, forced-colors, reduced-motion, foco e alvos 44px', async () => {
  const css = await source(CSS);
  assert.match(css, /@media \(max-width:\s*320px\)/u);
  assert.match(css, /forced-colors:\s*active/u);
  assert.match(css, /prefers-reduced-motion:\s*reduce/u);
  assert.match(css, /min-height:\s*var\(--space-44\)/u);
  assert.match(css, /min-width:\s*var\(--space-44\)/u);
  assert.match(css, /:focus-visible/u);
  assert.match(css, /outline:\s*3px solid var\(--color-focus-on-light\)/u);
  assert.match(css, /\.title \{[\s\S]*min-width: 0;[\s\S]*overflow-wrap: anywhere/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
});
