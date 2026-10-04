import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  acceptWorkspacePayload,
  buildEventFlow,
  eventFlowSections,
  eventTimeZoneLabel,
  initialWorkspaceView,
  maskTaxId,
  rejectWorkspaceLoad,
  replaceWorkspaceEvent,
  showsScientificNavigation,
  visibleWorkspacePayload,
  workspaceShell,
} from '../lib/event-flow.ts';

test('o caminho marca divulgação como etapa atual antes da publicação', () => {
  const steps = buildEventFlow({ eventId: 'evt', status: 'SETUP', section: 'overview', scientific: false });
  assert.deepEqual(steps.map((step) => [step.id, step.state]), [
    ['foundation', 'done'],
    ['disclosure', 'current'],
    ['registration', 'available'],
    ['release', 'available'],
    ['operation', 'available'],
  ]);
  assert.equal(steps.some((step) => step.id === 'scientific'), false);
});

test('evento científico publicado mostra a grade como etapa própria', () => {
  const steps = buildEventFlow({ eventId: 'evt', status: 'PUBLISHED', section: 'scientific', scientific: true });
  assert.equal(steps.find((step) => step.id === 'release')?.state, 'done');
  assert.equal(steps.find((step) => step.id === 'scientific')?.state, 'current');
  assert.match(steps.find((step) => step.id === 'scientific')?.href ?? '', /\/eventos\/evt\/cientifico$/u);
});

test('fuso e documento usam rótulos seguros para a interface', () => {
  assert.equal(eventTimeZoneLabel('America/Sao_Paulo'), 'Brasília, São Paulo, Rio de Janeiro');
  assert.equal(eventTimeZoneLabel(null), 'Não confirmado');
  assert.equal(maskTaxId('12345678901'), 'terminado em 01');
  assert.doesNotMatch(maskTaxId('12345678901'), /123456789/);
  assert.equal(maskTaxId(null), 'documento protegido');
  assert.equal(maskTaxId(undefined), 'documento protegido');
  assert.equal(maskTaxId(''), 'documento protegido');
  assert.equal(maskTaxId('00.000.000/E08G-12'), 'terminado em 12');
  assert.doesNotMatch(maskTaxId('00.000.000/E08G-12'), /E08G/);
});

test('inscrições têm um único marcador atual em configuração, homologação e publicação', () => {
  const expected = {
    SETUP: [
      ['foundation', 'done'],
      ['disclosure', 'available'],
      ['registration', 'current'],
      ['release', 'available'],
      ['operation', 'available'],
    ],
    HOMOLOGATION: [
      ['foundation', 'done'],
      ['disclosure', 'done'],
      ['registration', 'current'],
      ['release', 'available'],
      ['operation', 'available'],
    ],
    PUBLISHED: [
      ['foundation', 'done'],
      ['disclosure', 'done'],
      ['registration', 'current'],
      ['release', 'done'],
      ['operation', 'available'],
    ],
  };
  for (const [status, states] of Object.entries(expected)) {
    const steps = buildEventFlow({ eventId: 'qa', status, section: 'registrations', scientific: false });
    assert.deepEqual(steps.map((step) => [step.id, step.state]), states);
    assert.equal(steps.filter((step) => step.state === 'current').length, 1);
    assert.equal(steps.find((step) => step.screen)?.id, 'registration');
    assert.equal(steps.find((step) => step.id === 'release')?.preparation, status === 'PUBLISHED' ? 'done' : 'pending');
  }
});

test('cada seção e cada estado de preparação deixam exatamente uma etapa atual', () => {
  const statuses = ['DRAFT', 'SETUP', 'HOMOLOGATION', 'READY_TO_PUBLISH', 'PUBLISHED', 'SUSPENDED', 'FINISHED', 'CANCELLED'];
  for (const status of statuses) {
    for (const section of eventFlowSections()) {
      for (const scientific of [false, true]) {
        const steps = buildEventFlow({ eventId: 'qa', status, section, scientific });
        const current = steps.filter((step) => step.state === 'current');
        assert.equal(current.length, 1, `${status}/${section}/${scientific}`);
        assert.equal(current[0].screen, true);
        assert.equal(steps.filter((step) => step.screen).length, 1);
      }
    }
  }
});

test('troca de evento descarta carga antiga, resposta atrasada e erro anterior', () => {
  const event = (id) => ({ event: { id }, name: id });
  let view = acceptWorkspacePayload(initialWorkspaceView('A'), 'A', event('A'));
  assert.equal(visibleWorkspacePayload(view, 'A')?.name, 'A');

  view = replaceWorkspaceEvent('B');
  assert.equal(visibleWorkspacePayload(view, 'B'), null);
  assert.equal(acceptWorkspacePayload(view, 'A', event('A')), view);

  view = acceptWorkspacePayload(view, 'B', event('B'));
  assert.equal(visibleWorkspacePayload(view, 'B')?.name, 'B');
  assert.equal(visibleWorkspacePayload(view, 'A'), null);

  view = rejectWorkspaceLoad(replaceWorkspaceEvent('B'), 'B', 'Sem permissão para este evento.');
  assert.equal(view.phase, 'error');
  assert.equal(view.payload, null);
  assert.equal(workspaceShell({ section: 'check-in', eventId: 'B', phase: view.phase, payloadEventId: null }), 'operation');
  assert.equal(workspaceShell({ section: 'overview', eventId: 'B', phase: view.phase, payloadEventId: null }), 'error');

  view = acceptWorkspacePayload(view, 'B', event('B'));
  assert.equal(view.phase, 'ready');
  assert.equal(workspaceShell({ section: 'overview', eventId: 'B', phase: view.phase, payloadEventId: 'B' }), 'panel');
  assert.equal(workspaceShell({ section: 'check-in', eventId: '', phase: 'absent', payloadEventId: null }), 'error');
  assert.equal(workspaceShell({ section: 'check-in', eventId: 'B', phase: 'loading', payloadEventId: null }), 'loading');
});

test('navegação científica fica restrita ao perfil e a operação não abre o painel completo', () => {
  const families = ['SCIENTIFIC_EVENT', 'CORPORATE_TRAINING', 'FAIR_EXHIBITION', 'ENTERTAINMENT', 'SOCIAL_COMMUNITY', 'OTHER'];
  for (const profileCode of families) {
    assert.equal(showsScientificNavigation(profileCode, []), profileCode === 'SCIENTIFIC_EVENT');
  }
  assert.equal(showsScientificNavigation('OTHER', ['scientific_submission']), true);
  assert.equal(showsScientificNavigation('CORPORATE_TRAINING', ['registration']), false);
});

test('o acesso operacional não reutiliza a navegação de configuração', async () => {
  const workspace = await readFile(new URL('../components/event-workspace.tsx', import.meta.url), 'utf8');
  const frameStart = workspace.indexOf('function OperationalEventFrame');
  const frameEnd = workspace.indexOf('export default function EventWorkspace');
  const frame = workspace.slice(frameStart, frameEnd);
  assert.ok(frameStart >= 0 && frameEnd > frameStart);
  assert.match(frame, /data-shell="operation"/u);
  assert.match(frame, /Pular para o conteúdo/u);
  assert.match(frame, /href="\/painel"/u);
  assert.doesNotMatch(frame, /categorias-lotes|divulgacao|financeiro|cientifico|integracoes|PAINEL DO EVENTO/u);
  assert.match(workspace, /aria-current=\{step\.state === 'current' \? 'step' : undefined\}/u);
  assert.match(workspace, /if \(!eventId\) return;/u);
  assert.match(workspace, /key=\{eventId\}/u);
  const dashboard = await readFile(new URL('../components/event-admin-dashboard.tsx', import.meta.url), 'utf8');
  for (const source of [workspace, dashboard]) {
    assert.match(source, /reason instanceof ApiError && reason\.status === 401/u);
    assert.match(source, /router\.replace\('\/login'\)/u);
  }
});

test('publicação bloqueia a fundação e a grade, e o check-in não entrega a credencial', async () => {
  const [gate, checkIn, central] = await Promise.all([
    readFile(new URL('../components/publication-release-gate.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/check-in-console.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/scientific-event-central.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(gate, /a fundação do evento deixa de aceitar alterações, inclusive a grade científica/u);
  assert.match(central, /a fundação e a grade científica deixam de aceitar alterações/u);
  assert.match(checkIn, /O protocolo da inscrição não registra a entrada/u);
  assert.match(checkIn, /Consultar inscrições recebidas/u);
  assert.match(checkIn, /data-state=\{repeated \? 'repeat' : 'ok'\}/u);
  assert.doesNotMatch(checkIn, /baixar credencial|imprimir crachá|entregar credencial/iu);
});
