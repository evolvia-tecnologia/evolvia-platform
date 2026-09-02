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
  assert.match(dashboard, /Consultar o catálogo explicativo de integrações/u);
  assert.doesNotMatch(hub, /Conectar|Adicionar/u);
  assert.doesNotMatch(dashboard, /Conectar/u);
  assert.doesNotMatch(page, /Conectar/u);
});

test('busca, filtros combináveis, receitas e estado vazio estão acessíveis', () => {
  assert.match(hub, /htmlFor="integrations-search"/u);
  assert.match(hub, /placeholder="Nome, finalidade, objetivo, gatilho ou ação"/u);
  assert.match(hub, /role="group" aria-label="Filtrar por categoria"/u);
  assert.match(hub, /role="group" aria-label="Filtrar por objetivo"/u);
  assert.match(hub, /payload\.objectives\.map/u);
  assert.match(hub, /aria-pressed=\{category === 'ALL'\}/u);
  assert.match(hub, /aria-pressed=\{objective === item\.code\}/u);
  assert.match(hub, /category !== 'ALL' && item\.category !== category/u);
  assert.match(hub, /objective !== 'ALL' && !item\.objectives\.some/u);
  assert.match(hub, /item\.objectives\.map\(\(entry\) => entry\.label\)/u);
  assert.match(hub, /entry\.trigger, entry\.action/u);
  assert.match(hub, /aria-expanded=\{expanded\}/u);
  assert.match(hub, /aria-controls="integration-detail"/u);
  assert.match(hub, /<p className=\{styles\.resultMeta\} role="status" aria-live="polite" aria-atomic="true">/u);
  assert.match(hub, /<div className=\{styles\.results\}>/u);
  assert.doesNotMatch(hub, /styles\.results\}[^>]*aria-live/u);
  assert.doesNotMatch(hub, /styles\.empty\}[^>]*role="status"/u);
  assert.match(hub, /Como funciona/u);
  assert.match(hub, /Possibilidades/u);
  assert.match(hub, /Quando \{entry\.trigger\} → então \{entry\.action\}/u);
  assert.match(hub, /Quando usar/u);
  assert.match(hub, /O que é necessário/u);
  assert.match(hub, /Autenticação prevista/u);
  assert.match(hub, /Dados compartilhados/u);
  assert.match(hub, /Estado da disponibilidade/u);
  assert.match(hub, /Nenhuma integração encontrada para/u);
  assert.match(hub, /Ajuste a busca, a categoria ou o objetivo/u);
  assert.match(hub, /Limpar filtros/u);
  assert.match(hub, /function clearFilters/u);
  assert.match(hub, /availabilityLabel/u);
  assert.doesNotMatch(hub, /Conectar|Adicionar/u);
  assert.doesNotMatch(hub, /Emitir notas e organizar finanças|Enviar leads ao CRM/u);
});

test('estados usam texto, teclado, alvo de 44px e reflow em 320px', () => {
  assert.match(hub, /availabilityLabel/u);
  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.match(css, /outline: 3px solid var\(--color-focus-on-light\)/u);
  assert.match(css, /\.clearFilters:focus-visible/u);
  assert.match(css, /flex-wrap: wrap/u);
  assert.match(css, /@media \(max-width: 320px\)/u);
  assert.match(css, /@media \(max-width: 700px\)/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /@media \(forced-colors: active\)/u);
  assert.doesNotMatch(css, /overflow-x:\s*auto/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/iu);
  assert.doesNotMatch(hub, /<iframe|<script/u);
  assert.doesNotMatch(hub, /https?:\/\/|\.png|\.svg/u);
});

test('hub não duplica lista, categorias, objetivos ou disponibilidade do catálogo', () => {
  assert.match(hub, /payload\.categories\.map/u);
  assert.match(hub, /payload\.objectives\.map/u);
  assert.match(hub, /payload\.items\.filter/u);
  assert.match(hub, /selected\.availabilityLabel/u);
  assert.match(hub, /selected\.categoryLabel/u);
  assert.match(hub, /selected\.recipes\.map/u);
  assert.match(hub, /entry\.directionLabel/u);
  assert.match(hub, /entry\.statusLabel/u);
  assert.doesNotMatch(hub, /HubSpot|Mailchimp|MemberKit|Asaas|Ploomes|Airtable|Jira/u);
  assert.doesNotMatch(hub, /PLANEJADA|EM_PREPARACAO/u);
});

test('região viva do resultado é textual e não envolve a grade nem Limpar filtros', () => {
  const live = hub.match(/<p className=\{styles\.resultMeta\} role="status" aria-live="polite" aria-atomic="true">[\s\S]*?<\/p>/u)?.[0] ?? '';
  assert.match(live, /Nenhuma integração encontrada para/u);
  assert.match(live, /integrações encontradas/u);
  assert.doesNotMatch(live, /Limpar filtros|<button|<ul className=\{styles\.grid\}/u);
  assert.match(hub, /<\/p>\s*\{filtered\.length === 0 \? \(/u);
  assert.match(hub, /styles\.clearFilters[\s\S]*Limpar filtros/u);
  assert.match(hub, /<ul className=\{styles\.grid\} aria-label="Integrações do evento">/u);
});
