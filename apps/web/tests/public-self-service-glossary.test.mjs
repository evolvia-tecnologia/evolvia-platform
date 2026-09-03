import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/glossario/page.tsx';
const CSS = '../app/ajuda/glossario/glossario.module.css';

const TERM_IDS = Object.freeze([
  'perfil-tipo-de-evento',
  'capability-recurso',
  'wizard',
  'ficha-de-inscricao',
  'previa',
  'homologacao',
  'publicacao',
  'inscricao',
  'credenciamento',
  'controle-de-acesso',
  'certificado',
  'trabalho-cientifico',
]);

const GROUP_IDS = Object.freeze([
  'grupo-configurar',
  'grupo-revisar',
  'grupo-operar',
  'grupo-conteudo',
]);

const ALLOWED_EXACT_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/cadastro',
  '/privacidade',
  '/termos-de-uso',
]);

const PRIVATE_HREF_FORBIDDEN = [
  /\/painel\b/u,
  /\/eventos\/novo\b/u,
  /\/eventos\/\[/u,
  /\/evento\/\[/u,
  /\/convites\b/u,
  /\/login\b/u,
  /mailto:/iu,
  /tel:/iu,
  /javascript:/iu,
  /https?:\/\//iu,
];

const ANTI_CLAIM_FORBIDDEN = [
  /módulo já publicado/iu,
  /módulo publicado de certificados/iu,
  /já emite certificado/iu,
  /certificado (já )?(publicado|disponível|emitido)/iu,
  /inscri[cç][aã]o pública completa (já|está|encontra)/iu,
  /Wizard visual/iu,
  /PWA/u,
  /offline/iu,
  /garantimos/iu,
  /selo de acessibilidade/iu,
  /100\s*%/u,
  /SLA/u,
];

test('glossário expõe os 12 termos uma única vez como entradas identificáveis e linkáveis', async () => {
  const page = await source(PAGE);
  const declaredIds = [...page.matchAll(/id: '([a-z0-9-]+)'/gu)].map((match) => match[1]);
  const termDeclarations = declaredIds.filter((id) => TERM_IDS.includes(id));
  const groupDeclarations = declaredIds.filter((id) => GROUP_IDS.includes(id));

  assert.equal(TERM_IDS.length, 12);
  assert.equal(new Set(TERM_IDS).size, 12);
  assert.deepEqual(termDeclarations, [...TERM_IDS]);
  assert.deepEqual(groupDeclarations, [...GROUP_IDS]);

  assert.match(page, /\{GROUPS\.map\(\(group\) =>/u);
  assert.match(page, /group\.terms\.map\(\(term\) =>/u);
  assert.match(page, /id=\{term\.id\}/u);
  assert.match(page, /href=\{`#\$\{term\.id\}`\}/u);
  assert.match(page, /href=\{`#\$\{group\.id\}`\}/u);
  assert.match(page, /id=\{group\.id\}/u);
  assert.match(page, /aria-label="Grupos do glossário"/u);

  for (const id of TERM_IDS) {
    const asEntry = [...page.matchAll(new RegExp(`id: '${id}'`, 'gu'))];
    assert.equal(asEntry.length, 1, `entrada duplicada: ${id}`);
  }
});

test('cada termo técnico tem equivalente em linguagem comum e as três facetas honestas', async () => {
  const page = await source(PAGE);

  assert.match(page, /plain: 'o formato inicial do evento'/u);
  assert.match(page, /plain: 'função que o evento pode usar'/u);
  assert.match(page, /plain: 'assistente de criação'/u);
  assert.match(page, /plain: 'formulário de cadastro da pessoa participante'/u);
  assert.match(page, /plain: 'visualização privada'/u);
  assert.match(page, /plain: 'revisão responsável'/u);
  assert.match(page, /plain: 'tornar o evento visível'/u);
  assert.match(page, /plain: 'cadastro da pessoa participante'/u);
  assert.match(page, /plain: 'recepção e crachá'/u);
  assert.match(page, /plain: 'entrada e presença'/u);
  assert.match(page, /plain: 'comprovante de participação'/u);
  assert.match(page, /plain: 'submissão acadêmica'/u);

  const concepts = [...page.matchAll(/concept: '/gu)];
  const availability = [...page.matchAll(/availability: '/gu)];
  const dependsOn = [...page.matchAll(/dependsOn: '/gu)];
  assert.equal(concepts.length, 12);
  assert.equal(availability.length, 12);
  assert.equal(dependsOn.length, 12);

  assert.match(page, /<dt>Conceito<\/dt>/u);
  assert.match(page, /<dt>Disponibilidade atual<\/dt>/u);
  assert.match(page, /<dt>O que depende de configuração ou autorização<\/dt>/u);
  assert.match(page, /\{term\.plain\}/u);
});

test('página estática tem skip-link, um main focável, um h1 e headings consistentes', async () => {
  const page = await source(PAGE);
  const mains = [...page.matchAll(/<main\b/gu)];
  const headings = [...page.matchAll(/<h1\b/gu)];

  assert.equal(mains.length, 1);
  assert.equal(headings.length, 1);
  assert.match(page, /className="skip-link" href="#main-content"/u);
  assert.match(page, /<main id="main-content"[^>]*tabIndex=\{-1\}/u);
  assert.match(page, /<h1>Termos essenciais antes de configurar um evento<\/h1>/u);
  assert.match(page, /<h2 id="indice-title">Navegar por grupos<\/h2>/u);
  assert.match(page, /<h2 id=\{`\$\{group\.id\}-title`\}>\{group\.title\}<\/h2>/u);
  assert.match(page, /<h3 id=\{headingId\}>/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /title: 'Glossário do self-service'/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /português do Brasil/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.doesNotMatch(page, /'use client'/u);
});

test('textos permanecem honestos e não prometem módulo publicado nem certificado', async () => {
  const page = await source(PAGE);

  assert.match(page, /não emite certificado/u);
  assert.match(page, /não abre inscrição e não publica/u);
  assert.match(page, /sem promessa de módulo publicado/u);
  assert.match(page, /Não há inscrição pública completa nesta superfície/u);
  assert.match(page, /não promete certificado/u);
  assert.match(page, /A EVA não homologa sozinha/u);
  assert.match(page, /Não é um gesto silencioso da EVA/u);

  for (const pattern of ANTI_CLAIM_FORBIDDEN) {
    assert.doesNotMatch(page, pattern);
  }
});

test('links são públicos comprovados, sem rotas privadas nem captura de dados', async () => {
  const page = await source(PAGE);
  const literalHrefs = [...page.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]);
  const templateHrefs = [...page.matchAll(/href=\{`([^`]+)`\}/gu)].map((match) => match[1]);

  assert.ok(literalHrefs.length > 0);
  for (const href of literalHrefs) {
    assert.ok(ALLOWED_EXACT_HREFS.includes(href), `href não autorizado: ${href}`);
  }

  assert.deepEqual([...templateHrefs].sort(), ['#${group.id}', '#${term.id}'].sort());

  for (const pattern of PRIVATE_HREF_FORBIDDEN) {
    assert.doesNotMatch(page, pattern);
  }

  assert.doesNotMatch(page, /<form\b/u);
  assert.doesNotMatch(page, /<input\b/u);
  assert.doesNotMatch(page, /<textarea\b/u);
  assert.doesNotMatch(page, /fetch\(|useState|useEffect|localStorage|sessionStorage|document\.cookie/u);
  assert.doesNotMatch(page, /organizationId|eventId|tenantId|organizationSecret/u);
  assert.match(page, /href="\/cadastro"/u);
  assert.match(page, /href="\/eventos"/u);
  assert.match(page, /href="\/privacidade"/u);
  assert.match(page, /href="\/termos-de-uso"/u);
  assert.match(page, /Não há busca/u);
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
  assert.doesNotMatch(page, /scientific_submission|access_control|capabilityCodes/u);
  assert.match(page, /não coleta dado pessoal/u);
});

test('CSS reflow em 1366/390/320, foco, alvos 44px, forced-colors e reduced-motion', async () => {
  const css = await source(CSS);

  assert.match(css, /@media \(max-width: 320px\)/u);
  assert.match(css, /@media \(max-width: 390px\)/u);
  assert.match(css, /@media \(min-width: 1366px\)/u);
  assert.match(css, /@media \(forced-colors: active\)/u);
  assert.match(css, /border: 1px solid CanvasText/u);
  assert.match(css, /color: LinkText/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.match(css, /min-width: var\(--space-44\)/u);
  assert.match(css, /outline: 3px solid var\(--color-focus-on-light\)/u);
  assert.match(css, /\.article \{[\s\S]*min-width: 0/u);
  assert.match(css, /\.article h1 \{[\s\S]*overflow-wrap: anywhere/u);
  assert.match(css, /\.termList \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/u);
  assert.match(css, /@media \(min-width: 1366px\) \{[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(css, /@media \(max-width: 320px\) \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/u);
  assert.doesNotMatch(css, /overflow:\s*hidden/u);
  assert.doesNotMatch(css, /white-space:\s*nowrap/u);
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis/u);
  assert.doesNotMatch(css, /-webkit-line-clamp/u);
});
