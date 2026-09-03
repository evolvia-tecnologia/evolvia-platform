import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const PAGE = '../app/ajuda/papeis-e-decisoes/page.tsx';
const CSS = '../app/ajuda/papeis-e-decisoes/papeis-e-decisoes.module.css';

const ROLE_IDS = Object.freeze([
  'organizadora',
  'colaboradora',
  'revisora',
  'participante',
]);

const STAGE_IDS = Object.freeze([
  'orientacao',
  'configuracao',
  'revisao',
  'homologacao',
  'publicacao',
]);

const DECISION_IDS = Object.freeze([
  'decidir-orientacao',
  'decidir-configuracao',
  'decidir-revisao',
  'decidir-homologacao',
  'decidir-publicacao',
]);

const SCENARIO_IDS = Object.freeze([
  'cientifico',
  'corporativo',
  'feira',
  'entretenimento',
]);

const ALLOWED_HREFS = Object.freeze([
  '#main-content',
  '#papeis',
  '#etapas',
  '#decisoes',
  '#principios',
  '#cenarios',
  '/',
  '/eventos',
  '/privacidade',
  '/termos-de-uso',
]);

const ANTI_CLAIM_FORBIDDEN = [
  /permiss[aã]o já (concedida|comprovada|implementada)/iu,
  /ACL implementada/iu,
  /papel já (disponível|concedido|ativado)/iu,
  /publicação habilitada/iu,
  /publique agora/iu,
  /módulo (já )?publicado/iu,
  /módulo disponível/iu,
  /acesso (já )?garantido/iu,
  /a EVA (homologa|publica|aprova) (o evento|o conteúdo|sozinha)/iu,
  /EVA é (uma )?aprovadora autônoma/iu,
  /garantimos/iu,
  /100\s*%/u,
  /selo de acessibilidade/iu,
  /SLA/u,
  /Wizard visual/iu,
];

test('guia de papéis expõe skip-link, um main focável e um h1', async () => {
  const page = await source(PAGE);
  const mains = [...page.matchAll(/<main\b/gu)];
  const headings = [...page.matchAll(/<h1\b/gu)];

  assert.match(page, /className="skip-link" href="#main-content"/u);
  assert.match(page, /<main id="main-content"[^>]*tabIndex=\{-1\}/u);
  assert.equal(mains.length, 1);
  assert.equal(headings.length, 1);
  assert.match(page, /<h1>Quem planeja, revisa, homologa e publica um evento<\/h1>/u);
  assert.match(page, /Pular para o conteúdo principal/u);
  assert.match(page, /<PublicSiteHeader current="legal" \/>/u);
  assert.match(page, /title: 'Papéis e decisões'/u);
  assert.match(page, /robots: \{ index: false, follow: false \}/u);
  assert.match(page, /português do Brasil/u);
  assert.doesNotMatch(page, /\| Evolvia/u);
  assert.doesNotMatch(page, /'use client'/u);
});

test('matriz cobre os quatro papéis e as cinco etapas distintas da decisão', async () => {
  const page = await source(PAGE);

  assert.match(page, /label: 'Pessoa organizadora'/u);
  assert.match(page, /label: 'Pessoa colaboradora'/u);
  assert.match(page, /label: 'Pessoa revisora ou homologadora'/u);
  assert.match(page, /label: 'Pessoa participante ou visitante'/u);

  for (const id of ROLE_IDS) {
    assert.equal([...page.matchAll(new RegExp(`id: '${id}'`, 'gu'))].length, 1, id);
  }

  assert.match(page, /label: 'Orientação'/u);
  assert.match(page, /label: 'Configuração'/u);
  assert.match(page, /label: 'Revisão'/u);
  assert.match(page, /label: 'Homologação'/u);
  assert.match(page, /label: 'Confirmação humana de publicação'/u);

  for (const id of STAGE_IDS) {
    assert.equal([...page.matchAll(new RegExp(`id: '${id}'`, 'gu'))].length, 1, id);
  }

  assert.match(page, /<h2 id="papeis-title">Quatro papéis em um evento self-service<\/h2>/u);
  assert.match(page, /<h2 id="etapas-title">Cinco etapas distintas da decisão<\/h2>/u);
  assert.match(page, /Orientação, configuração, revisão, homologação e confirmação humana de/u);
});

test('cada decisão declara responsável, pré-condição e regra de parada', async () => {
  const page = await source(PAGE);

  assert.equal(DECISION_IDS.length, 5);
  for (const id of DECISION_IDS) {
    assert.equal([...page.matchAll(new RegExp(`id: '${id}'`, 'gu'))].length, 1, id);
  }

  const owners = [...page.matchAll(/owner: '/gu)];
  const preconditions = [...page.matchAll(/precondition: '/gu)];
  const stops = [...page.matchAll(/stop: '/gu)];
  assert.equal(owners.length, 5);
  assert.equal(preconditions.length, 5);
  assert.equal(stops.length, 5);

  assert.match(page, /<dt>Responsável<\/dt>/u);
  assert.match(page, /<dt>Pré-condição<\/dt>/u);
  assert.match(page, /<dt>Regra de parada<\/dt>/u);
  assert.match(page, /\{decision\.owner\}/u);
  assert.match(page, /\{decision\.precondition\}/u);
  assert.match(page, /\{decision\.stop\}/u);
  assert.match(page, /Cartões abaixo são semanticamente equivalentes a uma tabela/u);
});

test('EVA nunca aparece como aprovadora autônoma e os princípios não inventam ACL', async () => {
  const page = await source(PAGE);

  assert.match(page, /nunca homologa, nunca\s+publica e nunca aparece como aprovadora autônoma/u);
  assert.match(page, /A EVA não homologa sozinha/u);
  assert.match(page, /A EVA não confirma publicação/u);
  assert.match(page, /A EVA não ocupa este papel/u);
  assert.match(page, /A EVA só orienta/u);
  assert.match(page, /deny-by-default/u);
  assert.match(page, /Menor privilégio/u);
  assert.match(page, /sem afirmar permissões ou papéis\s+já comprovados no runtime/u);
  assert.match(page, /não comprovam controle de acesso implementado/u);
  assert.doesNotMatch(page, /A EVA (homologa|publica|aprova) o/u);

  for (const pattern of ANTI_CLAIM_FORBIDDEN) {
    assert.doesNotMatch(page, pattern);
  }
});

test('cenários cobrem quatro perfis de evento e os 19 tipos sem duplicar taxonomia', async () => {
  const page = await source(PAGE);

  for (const id of SCENARIO_IDS) {
    assert.equal([...page.matchAll(new RegExp(`id: '${id}'`, 'gu'))].length, 1, id);
  }

  assert.match(page, /Evento científico ou acadêmico/u);
  assert.match(page, /Evento corporativo ou capacitação/u);
  assert.match(page, /Feira ou exposição/u);
  assert.match(page, /Evento de entretenimento/u);
  assert.match(page, /19 tipos de evento/u);
  assert.match(page, /sem\s+repetir a taxonomia/u);
  assert.doesNotMatch(page, /Congresso ou evento científico/u);
  assert.doesNotMatch(page, /Simpósio científico/u);
  assert.doesNotMatch(page, /EVENT_PROFILE_GROUPS/u);
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
  assert.doesNotMatch(page, /<form\b/u);
  assert.doesNotMatch(page, /<input\b/u);
  assert.doesNotMatch(page, /<textarea\b/u);
  assert.doesNotMatch(page, /fetch\(|useState|useEffect|localStorage|sessionStorage|document\.cookie/u);
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
  assert.match(page, /Não atribui papel, não concede acesso/u);
});

test('CSS reflow em 1366/720/390/320, alvos 44 px, forced-colors e reduced-motion', async () => {
  const css = await source(CSS);

  assert.match(css, /@media \(max-width: 320px\)/u);
  assert.match(css, /@media \(max-width: 390px\)/u);
  assert.match(css, /@media \(max-width: 720px\)/u);
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
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(css, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/u);
  assert.match(css, /@media \(max-width: 320px\) \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/u);
  assert.doesNotMatch(css, /overflow:\s*hidden/u);
  assert.doesNotMatch(css, /white-space:\s*nowrap/u);
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis/u);
});
