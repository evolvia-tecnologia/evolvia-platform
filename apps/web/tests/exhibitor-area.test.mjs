import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildEventFlow, eventFlowSections, showsExhibitorNavigation, workspaceShell } from '../lib/event-flow.ts';

const panel = await readFile(new URL('../components/event-exhibitors.tsx', import.meta.url), 'utf8');
const area = await readFile(new URL('../components/exhibitor-area.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/eventos/[id]/painel/expositores/page.tsx', import.meta.url), 'utf8');
const publicPage = await readFile(new URL('../app/evento/[slug]/expositor/page.tsx', import.meta.url), 'utf8');
const service = await readFile(new URL('../../api/src/exhibitor.service.ts', import.meta.url), 'utf8');

test('a central e a área da empresa cobrem cota, pedido e download', () => {
  assert.match(panel, /Central de atendimento ao expositor/u);
  assert.match(panel, /Crachá de expositor/u);
  assert.match(panel, /Montador/u);
  assert.match(panel, /Serviço/u);
  assert.match(panel, /Prestadores/u);
  assert.match(panel, /Solicitado/u);
  assert.match(panel, /link https/u);
  assert.match(area, /Área do expositor/u);
  assert.match(area, /O acesso da empresa usa o e-mail cadastrado e o documento da empresa/u);
  assert.match(area, /sessionStorage/u);
  assert.doesNotMatch(`${panel}\n${area}`, /type="password"|Senha|senha/u);
  assert.match(page, /section="exhibitors"/u);
  assert.match(publicPage, /ExhibitorArea/u);
});

test('o serviço não grava senha e isola a sessão no evento', () => {
  assert.match(service, /exhibitor\.session_created/u);
  assert.match(service, /A cota deste tipo de crachá já foi usada/u);
  assert.doesNotMatch(service, /password|senha/iu);
  assert.match(service, /metadata: \{ expiresAt: expiresAt\.toISOString\(\) \}/u);
});

test('expositores entram na operação quando a capacidade está ligada', () => {
  assert.equal(eventFlowSections().includes('exhibitors'), true);
  const steps = buildEventFlow({ eventId: 'evt', status: 'PUBLISHED', section: 'exhibitors', scientific: false });
  assert.equal(steps.filter((step) => step.state === 'current').length, 1);
  assert.equal(steps.find((step) => step.screen)?.id, 'operation');
  assert.equal(showsExhibitorNavigation(['exhibitor']), true);
  assert.equal(showsExhibitorNavigation(['registration']), false);
  assert.equal(workspaceShell({ section: 'exhibitors', eventId: 'evt', phase: 'error', payloadEventId: null }), 'operation');
});
