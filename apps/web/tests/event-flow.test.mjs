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
  showsCertificateNavigation,
  showsCommunicationNavigation,
  showsEntertainmentNavigation,
  showsPaymentNavigation,
  showsRoleCertificateNavigation,
  showsScientificNavigation,
  showsScientificProgramNavigation,
  showsScientificWorksNavigation,
  showsTransmissionNavigation,
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

test('navegação de show fica no perfil de entretenimento e a operação inclui catracas', () => {
  const families = ['SCIENTIFIC_EVENT', 'CORPORATE_TRAINING', 'FAIR_EXHIBITION', 'ENTERTAINMENT', 'SOCIAL_COMMUNITY', 'OTHER'];
  for (const profileCode of families) {
    assert.equal(showsEntertainmentNavigation(profileCode), profileCode === 'ENTERTAINMENT');
  }
  assert.equal(showsEntertainmentNavigation('OTHER', 'Festival'), true);
  assert.equal(showsEntertainmentNavigation('OTHER', 'Show ou entretenimento'), true);
  assert.equal(showsEntertainmentNavigation(null, 'Festival'), true);
  assert.equal(showsEntertainmentNavigation('SCIENTIFIC_EVENT', 'Congresso'), false);
  assert.equal(showsEntertainmentNavigation('SCIENTIFIC_EVENT', 'Festival'), false);
  assert.equal(showsEntertainmentNavigation('CORPORATE_TRAINING', 'Festival'), false);
  assert.equal(showsEntertainmentNavigation('FAIR_EXHIBITION', 'Festival'), false);
  assert.equal(showsEntertainmentNavigation('SOCIAL_COMMUNITY', 'Show ou entretenimento'), false);
  assert.ok(eventFlowSections().includes('show'));
  assert.equal(workspaceShell({ section: 'show', eventId: 'B', phase: 'error', payloadEventId: null }), 'operation');
});

test('navegação científica fica restrita ao perfil e a operação não abre o painel completo', () => {
  const families = ['SCIENTIFIC_EVENT', 'CORPORATE_TRAINING', 'FAIR_EXHIBITION', 'ENTERTAINMENT', 'SOCIAL_COMMUNITY', 'OTHER'];
  for (const profileCode of families) {
    assert.equal(showsScientificNavigation(profileCode, []), profileCode === 'SCIENTIFIC_EVENT');
  }
  assert.equal(showsScientificNavigation('OTHER', ['scientific_submission']), true);
  assert.equal(showsScientificNavigation('CORPORATE_TRAINING', ['registration']), false);
  assert.equal(showsScientificWorksNavigation(['registration']), false);
  assert.equal(showsScientificWorksNavigation(['scientific_submission']), true);
  assert.equal(showsScientificProgramNavigation('SCIENTIFIC_EVENT', ['registration']), true);
  assert.equal(showsScientificProgramNavigation('SOCIAL_COMMUNITY', ['registration']), false);
  assert.equal(showsCommunicationNavigation(['registration']), false);
  assert.equal(showsPaymentNavigation(['payment']), true);
  assert.equal(showsCertificateNavigation(['certificate']), true);
  assert.equal(showsRoleCertificateNavigation(['certificate']), false);
  assert.equal(showsRoleCertificateNavigation(['certificate', 'scientific_submission']), true);
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
  assert.match(central, /type ScientificFlow = 'entry' \| 'works' \| 'program'/u);
  assert.match(central, /cientifico\/trabalhos/u);
  assert.match(central, /cientifico\/grade/u);
  assert.match(central, /cientifico\/submissoes#estacao/u);
  assert.match(central, /Abrir a estação científica/u);
  assert.match(central, /ScientificWorksNav/u);
  assert.match(central, /Trabalhos científicos/u);
  assert.match(central, /if \(loadedEventId !== eventId\)/u);
  assert.match(central, /belongsToEvent\(requestedId, liveEventId\.current, result\)/u);
  assert.match(central, /payload\.event\.id !== eventId/u);
  assert.match(central, /Registrar aceite ou recusa/u);
  assert.match(central, /cientifico\/avaliacao#decisao/u);
  assert.match(central, /available && path &&/u);
  const [reviews, submissions, program, structure, guests] = await Promise.all([
    readFile(new URL('../components/scientific-reviews.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/scientific-submissions.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/scientific-program.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/scientific-structure.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/scientific-guests.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(reviews, /id="decisao"/u);
  for (const source of [reviews, submissions]) assert.match(source, /aria-label="Retorno do fluxo"[\s\S]*Voltar aos trabalhos[\s\S]*Voltar ao painel/u);
  for (const source of [program, structure, guests]) assert.match(source, /aria-label="Retorno do fluxo"[\s\S]*Voltar à programação[\s\S]*Voltar ao painel/u);
  const [worksPage, gradePage] = await Promise.all([
    readFile(new URL('../app/eventos/[id]/cientifico/trabalhos/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/eventos/[id]/cientifico/grade/page.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(worksPage, /flow="works"/u);
  assert.match(gradePage, /flow="program"/u);
  assert.doesNotMatch(`${worksPage}\n${gradePage}`, /EventWorkspace/u);
  assert.match(checkIn, /O protocolo da inscrição não registra a entrada/u);
  assert.match(checkIn, /Consultar inscrições recebidas/u);
  assert.match(checkIn, /data-state=\{repeated \? 'repeat' : 'ok'\}/u);
  assert.doesNotMatch(checkIn, /baixar credencial|imprimir crachá|entregar credencial/iu);
});


test('preparação científica precede publicação e operação; integrações encerram o menu', async () => {
  for (const status of ['SETUP', 'PUBLISHED']) {
    const flow = buildEventFlow({ eventId: 'evt', status, section: 'scientific', scientific: true });
    assert.deepEqual(flow.map(step => step.id), ['foundation', 'disclosure', 'registration', 'scientific', 'release', 'operation']);
  }
  const sections = eventFlowSections();
  assert.ok(sections.indexOf('scientific') < sections.indexOf('check-in'));
  assert.ok(sections.indexOf('scientific') < sections.indexOf('transmission'));
  assert.equal(sections.at(-1), 'integrations');
});

test('predicado de transmissão falha fechado para formatos ausentes ou presenciais', () => {
  for (const format of ['IN_PERSON', null, undefined, '', 'INVALID']) {
    assert.equal(showsTransmissionNavigation(format), false, String(format));
  }
  for (const format of ['ONLINE', 'HYBRID']) assert.equal(showsTransmissionNavigation(format), true, format);
});
