import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/dados-minimos/page.tsx';
const CSS = '../app/ajuda/dados-minimos/dados-minimos.module.css';

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const SCRIPT_TITLES = [
  'Finalidade',
  'Necessidade',
  'Público',
  'Dado obrigatório ou opcional',
  'Transparência',
  'Acesso',
  'Retenção',
  'Revisão antes de publicar',
];

const KIND_TITLES = [
  'Dado cadastral',
  'Dado operacional',
  'Dado sensível',
  'Dado desnecessário',
];

const EXAMPLE_TITLES = [
  'Nome',
  'Como deseja ser chamado',
  'E-mail',
  'Campos contextuais',
];

const ANTI_CLAIM_FORBIDDEN = [
  /conforme à LGPD/iu,
  /em conformidade com a LGPD/iu,
  /conformidade LGPD/iu,
  /certifica[cç][aã]o LGPD/iu,
  /ficha em conformidade/iu,
  /adesão comprovada à LGPD/iu,
  /totalmente acess[ií]vel/iu,
  /100\s*%/u,
  /selo de acessibilidade/iu,
  /certifica[cç][aã]o WCAG/iu,
  /conforme à WCAG/iu,
  /conformidade total/iu,
  /WCAG 2\.2 AA certificado/iu,
  /garantimos/iu,
  /atendimento em \d+ (hora|minuto)/iu,
  /publicação habilitada/iu,
  /configure agora a ficha/iu,
];

test('guia de dados mínimos expõe skip-link, um main focável e um h1', async () => {
  const page = await source(PAGE);
  const mains = [...page.matchAll(/<main\b/gu)];
  const headings = [...page.matchAll(/<h1\b/gu)];

  assert.match(page, /className="skip-link" href="#main-content"/u);
  assert.match(page, /<main id="main-content"[^>]*tabIndex=\{-1\}/u);
  assert.equal(mains.length, 1);
  assert.equal(headings.length, 1);
  assert.match(page, /<h1>Planeje uma ficha de inscrição mínima e proporcional<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
});

test('roteiro cobre finalidade, necessidade, público, obrigatório/opcional, transparência, acesso, retenção e revisão', async () => {
  const page = await source(PAGE);

  assert.equal(SCRIPT_TITLES.length, 8);
  for (const title of SCRIPT_TITLES) {
    assert.match(page, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), title);
  }

  assert.match(page, /<h2 id="roteiro-title">Roteiro antes de configurar a ficha<\/h2>/u);
  assert.match(page, /<ol className=\{styles\.blocks\}>/u);
  assert.match(page, /nada aqui fica gravado, enviado ou publicado/u);
});

test('cada categoria traz por que pedir, quando não pedir e o que confirmar antes', async () => {
  const page = await source(PAGE);

  assert.equal(KIND_TITLES.length, 4);
  for (const title of KIND_TITLES) {
    assert.match(page, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), title);
  }

  assert.equal([...page.matchAll(/^\s+why: /gmu)].length, 4);
  assert.equal([...page.matchAll(/^\s+whenNot: /gmu)].length, 4);
  assert.equal([...page.matchAll(/^\s+confirm: /gmu)].length, 4);
  assert.match(page, /<dt>Por que pedir<\/dt>/u);
  assert.match(page, /<dt>Quando não pedir<\/dt>/u);
  assert.match(page, /<dt>O que confirmar antes<\/dt>/u);
});

test('exemplos conservadores cobrem nome, tratamento, e-mail e campos contextuais sem coleta', async () => {
  const page = await source(PAGE);

  for (const title of EXAMPLE_TITLES) {
    assert.match(page, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), title);
  }

  assert.match(page, /lembretes de planejamento, não campos de coleta/u);
  assert.match(page, /Não há PII real/u);
  assert.match(page, /não mostra endereço eletrônico de exemplo/u);
  assert.match(page, /Não copie uma matriz de tipos/u);
});

test('regras de parada cobrem finalidade ausente, dado sensível, contato não confirmado e retenção indefinida', async () => {
  const page = await source(PAGE);

  assert.match(page, /<h2 id="parada-title">Regras explícitas de parada<\/h2>/u);
  assert.match(page, /Finalidade ausente/u);
  assert.match(page, /Dado sensível/u);
  assert.match(page, /Contato não confirmado/u);
  assert.match(page, /Retenção indefinida/u);
  assert.match(page, /Ausência de finalidade é regra de parada/u);
  assert.match(page, /não invente e-mail, telefone ou chat/u);
  assert.match(page, /Na dúvida, não peça/u);
  assert.match(page, /não peça CPF, documento, dado de saúde ou biometria/u);
});

test('textos permanecem honestos: planejamento, sem aconselhamento jurídico nem claim de conformidade', async () => {
  const page = await source(PAGE);

  assert.match(page, /orientação estática/u);
  assert.match(page, /antes de\s+configurá-la/u);
  assert.match(page, /Não há formulário, coleta, cookies nem aconselhamento\s+jurídico aqui/u);
  assert.match(page, /não afirma conformidade/u);
  assert.match(page, /não oferece aconselhamento jurídico/u);
  assert.match(page, /19\s+tipos\s+de\s+evento/u);
  assert.match(page, /sem repetir a taxonomia/u);
  assert.match(page, /sem montar uma matriz por tipo/u);
  assert.match(page, /title: 'Dados mínimos da ficha'/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.doesNotMatch(page, /EVENT_PROFILE_GROUPS|listEventProfileOptions/u);
  assert.doesNotMatch(page, /Congresso ou evento científico/u);

  for (const pattern of ANTI_CLAIM_FORBIDDEN) {
    assert.doesNotMatch(page, pattern);
  }
});

test('checklist imprimível existe sem formulário, estado cliente, fetch, cookies ou analytics', async () => {
  const page = await source(PAGE);

  assert.match(page, /<h2 id="checklist-title">Checklist imprimível de revisão<\/h2>/u);
  assert.match(page, /Leia ou imprima esta lista/u);
  assert.match(page, /não grava estado/u);
  assert.match(page, /<ol className=\{styles\.checkItems\}>/u);
  assert.doesNotMatch(page, /<form\b/u);
  assert.doesNotMatch(page, /<input\b/u);
  assert.doesNotMatch(page, /<textarea\b/u);
  assert.doesNotMatch(page, /fetch\(|useState|useEffect|'use client'/u);
  assert.doesNotMatch(page, /document\.cookie|localStorage|sessionStorage|gtag\(|analytics/iu);
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
  assert.doesNotMatch(page, /href="\/eventos\/novo"/u);
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
  assert.match(page, /não invente e-mail, telefone ou chat/u);
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
  assert.match(page, /orientação estática/u);
});

test('CSS do guia reflow em 320 px, forced-colors, alvos 44 px, reduced-motion e impressão', async () => {
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
