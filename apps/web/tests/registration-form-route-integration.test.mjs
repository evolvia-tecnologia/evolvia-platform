import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { EVENT_PROFILE_GROUPS } from '../lib/event-profile-catalog.ts';
import {
  TECHNICAL_SQL,
  TECHNICAL_STACK,
  TECHNICAL_TRACE_ID,
  assertNoPublicOrWorkflowLeak,
  createTechnicalFailureBody,
  installRegistrationFormRouteHarness,
  registrationFormHref,
  runAuthenticatedConfigurationRoute,
  scientificPanelHref,
  technicalLeakPattern,
  wizardProbeUrl,
} from './helpers/registration-form-route-harness.mjs';

const ROUTE_FAMILY_SAMPLE = [
  {
    title: 'Congresso',
    eventType: 'Congresso ou evento científico',
    familyId: 'scientific',
    profileCode: 'SCIENTIFIC_EVENT',
  },
  {
    title: 'Treinamento',
    eventType: 'Treinamento',
    familyId: 'corporate',
    profileCode: 'CORPORATE_TRAINING',
  },
  {
    title: 'Feira',
    eventType: 'Feira ou exposição',
    familyId: 'fair',
    profileCode: 'FAIR_EXHIBITION',
  },
  {
    title: 'Show',
    eventType: 'Show ou entretenimento',
    familyId: 'entertainment',
    profileCode: 'ENTERTAINMENT',
  },
  {
    title: 'Social ou comunitário',
    eventType: 'Evento social ou comunitário',
    familyId: 'community',
    profileCode: 'SOCIAL_COMMUNITY',
  },
  {
    title: 'Outro perfil',
    eventType: 'Outro tipo de evento',
    familyId: 'other',
    profileCode: 'OTHER',
  },
];

const SESSION_STATUSES = ['ACTIVE', 'COMPLETED'];

async function routerSource() {
  return readFile(new URL('../components/event-configuration-router.tsx', import.meta.url), 'utf8');
}

async function pageSource() {
  return readFile(new URL('../app/eventos/[id]/configuracao/page.tsx', import.meta.url), 'utf8');
}

async function apiSource() {
  return readFile(new URL('../lib/api.ts', import.meta.url), 'utf8');
}

function eventIdFor(row, status) {
  return `evt-${row.familyId}-${status.toLowerCase()}`;
}

test('amostra cobre Congresso, Feira, Show e as seis famílias do catálogo', () => {
  const familyIds = EVENT_PROFILE_GROUPS.map((group) => group.id);
  const sampleIds = ROUTE_FAMILY_SAMPLE.map((row) => row.familyId);

  assert.deepEqual(familyIds, ['scientific', 'corporate', 'fair', 'entertainment', 'community', 'other']);
  assert.deepEqual(sampleIds, familyIds);
  assert.equal(new Set(sampleIds).size, 6);

  for (const requiredTitle of ['Congresso', 'Feira', 'Show']) {
    assert.ok(ROUTE_FAMILY_SAMPLE.some((row) => row.title === requiredTitle), requiredTitle);
  }

  for (const row of ROUTE_FAMILY_SAMPLE) {
    const group = EVENT_PROFILE_GROUPS.find((item) => item.id === row.familyId);
    assert.ok(group, row.familyId);
    assert.ok(group.options.some((option) => option.value === row.eventType && option.title === row.title), row.eventType);
  }
});

test('rota autenticada de configuração usa getToken, probe do Wizard e decisões por sessão', async () => {
  const [router, page] = await Promise.all([routerSource(), pageSource()]);

  assert.match(page, /EventConfigurationRouter eventId=\{params\.id\}/u);
  assert.doesNotMatch(page, /EventWizard|registration-form-builder|workflow/u);

  assert.match(router, /if \(!getToken\(\)\) \{\s*router\.replace\('\/login'\);\s*return;/u);
  assert.match(router, /const payload = await api<WizardRouteProbe>\(`\/event-wizard\/\$\{eventId\}`\);/u);
  assert.match(
    router,
    /payload\.event\.profileCode === 'SCIENTIFIC_EVENT' && payload\.session\.status === 'COMPLETED'/u,
  );
  assert.match(router, /router\.replace\(`\/eventos\/\$\{eventId\}\/painel`\)/u);
  assert.match(router, /setSessionStatus\(payload\.session\.status\)/u);
  assert.match(router, /sessionStatus === 'COMPLETED' && !reviewFoundation/u);
  assert.match(router, /\/eventos\/\$\{eventId\}\/painel\/inscricoes\/ficha/u);
  assert.match(
    router,
    /setError\(reason instanceof Error \? reason\.message : 'Não foi possível abrir a configuração do evento\.'\)/u,
  );
  assert.match(router, /<div className="error">\{error\}<\/div>/u);
  assert.doesNotMatch(router, /traceId|reason\.stack|JSON\.stringify\(reason\)|console\.(debug|info|log)/u);

  const api = await apiSource();
  assert.match(api, /typeof window === 'undefined' \? null : localStorage\.getItem\('evolvia_token'\)/u);
  assert.match(api, /headers\.set\('Authorization', `Bearer \$\{token\}`\)/u);
  assert.match(api, /const response = await fetch\(`\/api\$\{path\}`/u);
  assert.match(api, /summary \|\| 'Não foi possível concluir a operação\.'/u);
});

test('mock da API devolve sessões ACTIVE e COMPLETED por perfil da amostra', async (t) => {
  const harness = installRegistrationFormRouteHarness();
  t.after(() => harness.restore());

  harness.setToken();

  for (const row of ROUTE_FAMILY_SAMPLE) {
    for (const status of SESSION_STATUSES) {
      const eventId = eventIdFor(row, status);
      const payload = harness.mockWizardSession({
        eventId,
        profileCode: row.profileCode,
        status,
        eventType: row.eventType,
      });

      const result = await runAuthenticatedConfigurationRoute(eventId);

      assert.equal(payload.event.profileCode, row.profileCode, row.title);
      assert.equal(payload.session.status, status, `${row.title} ${status}`);
      assert.equal(result.apiCalled, true, `${row.title} ${status}`);
      assert.equal(result.payload.event.profileCode, row.profileCode);
      assert.equal(result.payload.session.status, status);

      const probe = harness.calls.find((call) => call.url === wizardProbeUrl(eventId));
      assert.ok(probe, `${row.title} ${status}`);
      assert.equal(probe.method, 'GET');
      assert.match(probe.headers.authorization, /^Bearer token-prova-ficha$/u);
    }
  }

  assertNoPublicOrWorkflowLeak(harness.calls);
  assert.equal(harness.calls.length, ROUTE_FAMILY_SAMPLE.length * SESSION_STATUSES.length);
});

test('científico COMPLETED preserva o redirect legítimo ao painel', async (t) => {
  const harness = installRegistrationFormRouteHarness();
  t.after(() => harness.restore());
  harness.setToken();

  const congresso = ROUTE_FAMILY_SAMPLE.find((row) => row.title === 'Congresso');
  const eventId = eventIdFor(congresso, 'COMPLETED');
  harness.mockWizardSession({
    eventId,
    profileCode: congresso.profileCode,
    status: 'COMPLETED',
    eventType: congresso.eventType,
  });

  const result = await runAuthenticatedConfigurationRoute(eventId);

  assert.equal(result.kind, 'scientific-painel');
  assert.equal(result.redirect, scientificPanelHref(eventId));
  assert.notEqual(result.redirect, registrationFormHref(eventId));
  assert.doesNotMatch(result.redirect, /inscricoes\/ficha|\/evento\/|inscricao/u);
  assertNoPublicOrWorkflowLeak(harness.calls);
});

test('demais perfis COMPLETED oferecem a ficha autenticada', async (t) => {
  const harness = installRegistrationFormRouteHarness();
  t.after(() => harness.restore());
  harness.setToken();

  const others = ROUTE_FAMILY_SAMPLE.filter((row) => row.profileCode !== 'SCIENTIFIC_EVENT');
  assert.equal(others.length, 5);

  for (const row of others) {
    const eventId = eventIdFor(row, 'COMPLETED');
    harness.mockWizardSession({
      eventId,
      profileCode: row.profileCode,
      status: 'COMPLETED',
      eventType: row.eventType,
    });

    const result = await runAuthenticatedConfigurationRoute(eventId);
    assert.equal(result.kind, 'ficha', row.title);
    assert.equal(result.href, registrationFormHref(eventId), row.title);
    assert.match(result.href, /\/eventos\/.+\/painel\/inscricoes\/ficha$/u);
    assert.doesNotMatch(result.href, /\/evento\/|inscricao-publica|publicar/u);
  }

  const router = await routerSource();
  assert.match(router, /Preparar e versionar a ficha não abre inscrições ao público/u);
  assert.match(router, /Configurar ficha de inscrição/u);
  assert.doesNotMatch(router, /abrir inscrições|inscrição pública disponível|publicar inscrições/iu);
  assertNoPublicOrWorkflowLeak(harness.calls);
});

test('sessões ACTIVE não redirecionam nem antecipam a ficha', async (t) => {
  const harness = installRegistrationFormRouteHarness();
  t.after(() => harness.restore());
  harness.setToken();

  for (const row of ROUTE_FAMILY_SAMPLE) {
    const eventId = eventIdFor(row, 'ACTIVE');
    harness.mockWizardSession({
      eventId,
      profileCode: row.profileCode,
      status: 'ACTIVE',
      eventType: row.eventType,
    });

    const result = await runAuthenticatedConfigurationRoute(eventId);
    assert.equal(result.kind, 'active', row.title);
    assert.equal(result.href, undefined, row.title);
    assert.equal(result.redirect, undefined, row.title);
  }

  const router = await routerSource();
  assert.match(router, /sessionStatus === 'COMPLETED' && !reviewFoundation/u);
  assert.match(router, /<EventWizard eventId=\{eventId\} \/>/u);
  assert.doesNotMatch(
    router,
    /sessionStatus === 'ACTIVE'[\s\S]{0,160}RegistrationFormAccess/u,
  );
  assertNoPublicOrWorkflowLeak(harness.calls);
});

test('ausência de token leva a login sem chamar a API', async (t) => {
  const harness = installRegistrationFormRouteHarness();
  t.after(() => harness.restore());
  harness.clearToken();

  const eventId = eventIdFor(ROUTE_FAMILY_SAMPLE[0], 'ACTIVE');
  harness.mockWizardSession({
    eventId,
    profileCode: ROUTE_FAMILY_SAMPLE[0].profileCode,
    status: 'ACTIVE',
    eventType: ROUTE_FAMILY_SAMPLE[0].eventType,
  });

  const result = await runAuthenticatedConfigurationRoute(eventId);

  assert.equal(result.kind, 'login');
  assert.equal(result.redirect, '/login');
  assert.equal(result.apiCalled, false);
  assert.equal(harness.calls.length, 0);
});

test('falha de API produz feedback seguro sem dados técnicos', async (t) => {
  const harness = installRegistrationFormRouteHarness();
  t.after(() => harness.restore());
  harness.setToken();

  const safeEventId = 'evt-feira-api-safe-error';
  const fallbackEventId = 'evt-show-api-fallback-error';

  harness.mockWizardHttpError(
    safeEventId,
    500,
    createTechnicalFailureBody('Não foi possível abrir a configuração do evento.'),
  );
  harness.mockWizardHttpError(fallbackEventId, 500, createTechnicalFailureBody(undefined));

  const safe = await runAuthenticatedConfigurationRoute(safeEventId);
  const fallback = await runAuthenticatedConfigurationRoute(fallbackEventId);

  assert.equal(safe.kind, 'error');
  assert.equal(fallback.kind, 'error');
  assert.equal(safe.message, 'Não foi possível abrir a configuração do evento.');
  assert.equal(fallback.message, 'Não foi possível concluir a operação.');

  const leak = technicalLeakPattern();
  assert.doesNotMatch(safe.message, leak);
  assert.doesNotMatch(fallback.message, leak);
  assert.doesNotMatch(safe.message, new RegExp(TECHNICAL_TRACE_ID, 'u'));
  assert.doesNotMatch(fallback.message, new RegExp(TECHNICAL_STACK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  assert.doesNotMatch(fallback.message, new RegExp(TECHNICAL_SQL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));

  assert.equal(safe.reason.traceId, TECHNICAL_TRACE_ID);
  assert.equal(safe.reason.context.stack, TECHNICAL_STACK);
  assert.equal(safe.reason.code, 'WIZARD_INTERNAL');

  const router = await routerSource();
  assert.match(router, /<div className="error">\{error\}<\/div>/u);
  assert.doesNotMatch(router, /reason\.traceId|reason\.context|reason\.code|reason\.stack/u);
  assert.doesNotMatch(router, /WIZARD_INTERNAL|ECONNREFUSED|SELECT \*/u);
  assertNoPublicOrWorkflowLeak(harness.calls);
});

test('a prova permanece in-process e não abre inscrição pública nem publicação', async () => {
  const [router, page, helperSource] = await Promise.all([
    routerSource(),
    pageSource(),
    readFile(new URL('./helpers/registration-form-route-harness.mjs', import.meta.url), 'utf8'),
  ]);

  for (const source of [router, page]) {
    assert.doesNotMatch(source, /playwright|puppeteer|chromium|localhost:3000/iu);
    assert.doesNotMatch(source, /publicar inscrições|abrir inscrições ao público|inscrição pública disponível/iu);
  }

  assert.doesNotMatch(
    helperSource,
    /from ['"][^'"]*(event-wizard|registration-form-builder|event-admin-dashboard)/u,
  );
  assert.doesNotMatch(helperSource, /method: 'POST'|method: 'PATCH'/u);
  assert.doesNotMatch(helperSource, /https?:\/\//u);
});
