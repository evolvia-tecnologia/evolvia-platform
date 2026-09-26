import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [hub, css, dashboard, page, catalog, controller] = await Promise.all([
  readFile(new URL('../components/integrations-hub.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/integrations-hub.module.css', import.meta.url), 'utf8'),
  readFile(new URL('../components/event-admin-dashboard.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/eventos/[id]/painel/integracoes/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../api/src/integrations-catalog.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../api/src/event-integrations.controller.ts', import.meta.url), 'utf8'),
]);

test('rota autenticada do painel consome o catálogo da API', () => {
  assert.match(page, /section="integrations"/u);
  assert.match(page, /IntegracoesDoEventoPage/u);
  assert.match(hub, /api<IntegrationsPayload>\(`\/events\/\$\{eventId\}\/integrations`\)/u);
  assert.match(controller, /@Controller\('events\/:eventId\/integrations'\)/u);
  assert.doesNotMatch(hub, /INTEGRATION_CATALOG|evolvia_public_api|memberkit/u);
  assert.match(catalog, /export const INTEGRATION_CATALOG/u);
});

test('navegação do painel aponta para a rota real sem CTA de conexão', () => {
  assert.match(dashboard, /href=\{`\/eventos\/\$\{eventId\}\/painel\/integracoes`\}/u);
  assert.match(dashboard, /<strong>Integrações<\/strong>/u);
  assert.match(dashboard, /section === 'integrations'/u);
  assert.match(dashboard, /Ver catálogo de integrações/u);
  assert.doesNotMatch(hub, /Conectar/u);
  assert.doesNotMatch(dashboard, /Conectar/u);
  assert.doesNotMatch(page, /Conectar/u);
});

test('busca por objetivo e detalhes locais reduzem texto sem prometer conexão', () => {
  assert.match(hub, /htmlFor="integrations-search"/u);
  assert.match(hub, /payload\.objectives\?\.map/u);
  assert.match(hub, /item\.objectives\?\.some/u);
  assert.match(hub, /item\.recipes\?\.flatMap/u);
  assert.match(hub, /integrations-category/u);
  assert.match(hub, /integrations-objective/u);
  assert.match(hub, /aria-expanded=\{expanded\}/u);
  assert.match(hub, /integration-detail-\$\{item\.code\}/u);
  assert.match(hub, /\{expanded && <div/u);
  assert.match(hub, /Possibilidades previstas/u);
  assert.match(hub, /role="status" aria-live="polite"/u);
  assert.match(hub, /Limpar filtros/u);
  assert.match(hub, /NFS-e exige regras do município/u);
  assert.doesNotMatch(hub, /<section className=\{styles\.eva\}/u);
  assert.doesNotMatch(hub, /Conectar|Adicionar/u);
});

test('estados usam texto, teclado, alvo de 44px e reflow em 320px', () => {
  assert.match(hub, /availabilityLabel/u);
  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.match(css, /outline: 3px solid var\(--color-focus-on-light\)/u);
  assert.match(css, /@media \(max-width: 320px\)/u);
  assert.match(css, /@media \(max-width: 700px\)/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /@media \(forced-colors: active\)/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/iu);
  assert.doesNotMatch(hub, /<iframe|<script/u);
  assert.doesNotMatch(hub, /https?:\/\/|\.png|\.svg/u);
});

test('hub recebe categorias, objetivos e disponibilidade da API', () => {
  assert.match(hub, /payload\.categories\.map/u);
  assert.match(hub, /payload\.objectives\?\.map/u);
  assert.match(hub, /payload\.items\.filter/u);
  assert.match(hub, /item\.availabilityLabel/u);
  assert.doesNotMatch(hub, /HubSpot|Mailchimp|MemberKit|Asaas|Ploomes/u);
});
