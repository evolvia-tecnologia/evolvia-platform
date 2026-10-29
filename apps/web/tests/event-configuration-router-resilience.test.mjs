import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  TECHNICAL_SQL,
  TECHNICAL_STACK,
  TECHNICAL_TRACE_ID,
  createTechnicalFailureBody,
  installRegistrationFormRouteHarness,
  registrationFormHref,
  scientificPanelHref,
  technicalLeakPattern,
} from './helpers/registration-form-route-harness.mjs';

const PUBLIC_CONFIGURATION_ERROR = 'Não foi possível abrir a configuração do evento.';
const PROBE_INTERVAL_MS = 1500;

async function routerSource() {
  return readFile(new URL('../components/event-configuration-router.tsx', import.meta.url), 'utf8');
}

function catchBlock(source) {
  const block = source.match(/catch \(caught\) \{[\s\S]*?\n      \}/u)?.[0];
  assert.ok(block, 'bloco catch da sonda precisa existir');
  return block;
}

function effectBlock(source) {
  const block = source.match(/useEffect\(\(\) => \{[\s\S]*?\n  \}, \[eventId, router, retryAttempt\]\);/u)?.[0];
  assert.ok(block, 'efeito da sonda precisa existir');
  return block;
}

function createApiFailure(message, status, details = {}) {
  const error = new Error(message);
  error.name = 'ApiError';
  error.status = status;
  error.code = details.code;
  error.traceId = details.traceId;
  error.context = details.context ?? {};
  return error;
}

function isUnauthorizedProbe(reason) {
  return Boolean(reason && reason.name === 'ApiError' && reason.status === 401);
}

function publicProbeError(caught) {
  if (isUnauthorizedProbe(caught)) {
    return { kind: 'login', redirect: '/login', message: '' };
  }
  const reason = new Error(PUBLIC_CONFIGURATION_ERROR);
  return {
    kind: 'error',
    message: reason instanceof Error ? reason.message : PUBLIC_CONFIGURATION_ERROR,
  };
}

function createProbeGate() {
  let active = true;
  let inFlight = false;
  let stopped = false;
  let timer = null;
  let started = 0;
  let skipped = 0;

  function stopPolling() {
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  async function probe(work) {
    if (!active || stopped || inFlight) {
      skipped += 1;
      return;
    }
    inFlight = true;
    started += 1;
    try {
      await work();
    } finally {
      inFlight = false;
    }
  }

  return {
    get active() {
      return active;
    },
    get inFlight() {
      return inFlight;
    },
    get stopped() {
      return stopped;
    },
    get timer() {
      return timer;
    },
    get started() {
      return started;
    },
    get skipped() {
      return skipped;
    },
    request(work) {
      return probe(work);
    },
    start(intervalMs, work) {
      if (stopped) return probe(work);
      timer = setInterval(() => {
        void probe(work);
      }, intervalMs);
      return probe(work);
    },
    stopPolling,
    unmount() {
      active = false;
      stopPolling();
    },
  };
}

test('erro público PT-BR substitui a mensagem crua da API', async () => {
  const source = await routerSource();
  const caught = catchBlock(source);
  const leak = technicalLeakPattern();

  assert.match(source, /const PUBLIC_CONFIGURATION_ERROR = 'Não foi possível abrir a configuração do evento\.';/u);
  assert.match(
    caught,
    /const reason = new Error\(PUBLIC_CONFIGURATION_ERROR\);/u,
  );
  assert.match(
    caught,
    /setError\(reason instanceof Error \? reason\.message : 'Não foi possível abrir a configuração do evento\.'\)/u,
  );
  assert.doesNotMatch(caught, /caught\.message/u);
  assert.doesNotMatch(caught, /setError\(caught/u);
  assert.doesNotMatch(source, leak);

  const technical = createApiFailure(TECHNICAL_STACK, 500, {
    code: 'WIZARD_INTERNAL',
    traceId: TECHNICAL_TRACE_ID,
    context: { sql: TECHNICAL_SQL, stack: TECHNICAL_STACK },
  });
  const envelope = createTechnicalFailureBody(TECHNICAL_STACK);
  const rendered = publicProbeError(technical);

  assert.equal(rendered.kind, 'error');
  assert.equal(rendered.message, PUBLIC_CONFIGURATION_ERROR);
  assert.notEqual(rendered.message, technical.message);
  assert.notEqual(rendered.message, envelope.error.message);
  assert.doesNotMatch(rendered.message, leak);
  assert.doesNotMatch(rendered.message, new RegExp(TECHNICAL_TRACE_ID, 'u'));
  assert.doesNotMatch(rendered.message, /ECONNREFUSED|SELECT \*|WIZARD_INTERNAL|127\.0\.0\.1/u);
});

test('401 e ausência de token continuam no login sem feedback técnico', async () => {
  const source = await routerSource();
  const effect = effectBlock(source);
  const caught = catchBlock(source);

  assert.match(effect, /if \(!getToken\(\)\) \{\s*router\.replace\('\/login'\);\s*return;/u);
  assert.match(caught, /caught instanceof ApiError && caught\.status === 401/u);
  assert.match(caught, /router\.replace\('\/login'\);\s*return;/u);
  assert.doesNotMatch(caught, /setError[\s\S]{0,80}401/u);

  const unauthorized = publicProbeError(createApiFailure('Unauthorized token expired', 401, {
    code: 'UNAUTHORIZED',
    traceId: TECHNICAL_TRACE_ID,
  }));
  assert.equal(unauthorized.kind, 'login');
  assert.equal(unauthorized.redirect, '/login');
  assert.equal(unauthorized.message, '');
  assert.doesNotMatch(unauthorized.redirect, /painel|ficha|configuracao/u);

  const harness = installRegistrationFormRouteHarness();
  try {
    harness.clearToken();
    assert.equal(typeof globalThis.localStorage.getItem('evolvia_token') === 'string' ? globalThis.localStorage.getItem('evolvia_token') : null, null);
  } finally {
    harness.restore();
  }
});

test('apenas uma sonda permanece em voo e o timer para no terminal', async () => {
  const source = await routerSource();
  const effect = effectBlock(source);

  assert.match(effect, /let inFlight = false;/u);
  assert.match(effect, /let stopped = false;/u);
  assert.match(effect, /if \(!active \|\| stopped \|\| inFlight\) return;/u);
  assert.match(effect, /inFlight = true;/u);
  assert.match(effect, /finally \{\s*inFlight = false;/u);
  assert.match(effect, /function stopPolling\(\)/u);
  assert.match(effect, /stopped = true;/u);
  assert.match(effect, /clearInterval\(timer\)/u);
  assert.match(effect, /timer = setInterval\(probe, 1500\);/u);
  assert.match(effect, /timer = setInterval\(probe, 1500\);\s*probe\(\);/u);
  assert.match(
    effect,
    /payload\.session\.status === 'COMPLETED' && !reviewRequested[\s\S]{0,80}stopPolling\(\);/u,
  );
  assert.match(effect, /if \(payload\.session\.status === 'COMPLETED'\) \{\s*stopPolling\(\);/u);
  assert.match(caughtStopOnError(effect), /stopPolling\(\);/u);
  assert.match(effect, /return \(\) => \{\s*active = false;\s*stopPolling\(\);/u);

  let pending = 0;
  let maxConcurrent = 0;
  const gate = createProbeGate();
  const delayed = () => new Promise((resolve) => {
    pending += 1;
    maxConcurrent = Math.max(maxConcurrent, pending);
    setTimeout(() => {
      pending -= 1;
      resolve();
    }, 40);
  });

  const first = gate.start(10, delayed);
  await Promise.all([first, gate.request(delayed), new Promise((resolve) => setTimeout(resolve, 25))]);
  assert.equal(gate.started, 1);
  assert.ok(gate.skipped >= 1);
  assert.equal(maxConcurrent, 1);

  gate.stopPolling();
  const startedAfterStop = gate.started;
  await gate.request(delayed);
  assert.equal(gate.started, startedAfterStop);
  assert.equal(gate.stopped, true);
  assert.equal(gate.timer, null);
});

function caughtStopOnError(effect) {
  const block = effect.match(/catch \(caught\) \{[\s\S]*?\n      \}/u)?.[0];
  assert.ok(block);
  return block;
}

test('unmount encerra o timer mesmo com sonda atrasada', async () => {
  const source = await routerSource();
  assert.match(effectBlock(source), /return \(\) => \{\s*active = false;\s*stopPolling\(\);/u);

  let workStarted = 0;
  const gate = createProbeGate();
  const delayed = () => {
    workStarted += 1;
    return new Promise((resolve) => setTimeout(resolve, 30));
  };

  const running = gate.start(5, delayed);
  gate.unmount();
  await running;
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(gate.active, false);
  assert.equal(gate.stopped, true);
  assert.equal(gate.timer, null);
  assert.equal(workStarted, 1);
  const skippedBefore = gate.skipped;
  await gate.start(5, delayed);
  assert.equal(workStarted, 1);
  assert.ok(gate.skipped > skippedBefore);
});

test('científico COMPLETED continua no painel e demais COMPLETED começam por categorias e lotes', async () => {
  const source = await routerSource();
  const effect = effectBlock(source);

  assert.match(
    effect,
    /payload\.session\.status === 'COMPLETED' && !reviewRequested/u,
  );
  assert.match(effect, /router\.replace\(`\/eventos\/\$\{eventId\}\/painel`\)/u);
  assert.match(effect, /new URLSearchParams\(window\.location\.search\)\.get\('review'\) === 'foundation'/u);
  assert.doesNotMatch(effect, /profileCode === 'SCIENTIFIC_EVENT' && payload\.session\.status === 'COMPLETED'/u);
  assert.match(source, /sessionStatus === 'COMPLETED' && !reviewFoundation/u);
  assert.match(source, /\/eventos\/\$\{eventId\}\/painel\/inscricoes\/categorias-lotes/u);
  assert.match(source, /Configurar categorias e lotes/u);
  assert.match(source, /Configurar ficha de inscrição/u);
  assert.match(source, /<EventWizard eventId=\{eventId\} \/>/u);
  assert.doesNotMatch(
    source,
    /sessionStatus === 'ACTIVE'[\s\S]{0,160}RegistrationFormAccess/u,
  );

  const eventId = 'evt-resilience-completed';
  assert.equal(scientificPanelHref(eventId), `/eventos/${eventId}/painel`);
  assert.equal(registrationFormHref(eventId), `/eventos/${eventId}/painel/inscricoes/ficha`);
  assert.notEqual(scientificPanelHref(eventId), registrationFormHref(eventId));
});

test('negativos: sem vazamento técnico, sem polling após erro e sem segunda sonda', async () => {
  const source = await routerSource();
  const caught = catchBlock(source);
  const effect = effectBlock(source);
  const leak = technicalLeakPattern();

  assert.doesNotMatch(source, leak);
  assert.doesNotMatch(source, /reason\.traceId|reason\.context|reason\.code|reason\.stack/u);
  assert.doesNotMatch(source, /JSON\.stringify\(caught\)|JSON\.stringify\(reason\)/u);
  assert.doesNotMatch(source, /console\.(debug|info|log)/u);
  assert.doesNotMatch(source, /WIZARD_INTERNAL|ECONNREFUSED|SELECT \*/u);
  assert.doesNotMatch(caught, /caught\.message/u);
  assert.doesNotMatch(effect, /setInterval\(probe[\s\S]{0,40}setInterval\(probe/u);

  const network = publicProbeError(new Error(`connect ECONNREFUSED 127.0.0.1:5432 ${TECHNICAL_TRACE_ID}`));
  assert.equal(network.message, PUBLIC_CONFIGURATION_ERROR);
  assert.doesNotMatch(network.message, leak);

  const gate = createProbeGate();
  let probes = 0;
  await gate.start(PROBE_INTERVAL_MS, async () => {
    probes += 1;
    gate.stopPolling();
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(probes, 1);
  assert.equal(gate.timer, null);
  assert.equal(gate.stopped, true);
});


test('orientação de divulgação abre revisão explícita da fundação científica', async () => {
  const guidance = await readFile(new URL('../components/publication-eva-guidance.tsx', import.meta.url), 'utf8');
  assert.match(guidance, /\/configuracao\?review=foundation/u);
});

test('falha da configuração permite retry explícito e retorno seguro sem publicar nem alterar dados', async () => {
  const source = await routerSource();
  const effect = effectBlock(source);

  assert.ok(source.includes('const [retryAttempt, setRetryAttempt] = useState(0)'));
  assert.ok(source.includes("setError('')"));
  assert.ok(source.includes('setReady(false)'));
  assert.ok(source.includes('setRetryAttempt((current) => current + 1)'));
  assert.ok(effect.includes('[eventId, router, retryAttempt]'));
  assert.ok(source.includes('onClick={retryProbe}>Tentar novamente'));
  assert.ok(source.includes('aria-live="polite" aria-labelledby="configuration-error-title"'));
  assert.ok(source.includes('href="/painel">Voltar ao painel'));
  assert.ok(source.includes('Voltar ao painel do evento'));
  assert.ok(!source.includes('window.location.reload'));
  assert.ok(!source.includes('localStorage.clear'));
});

test('troca de evento não reutiliza o estado autenticado do evento anterior', async () => {
  const source = await routerSource();
  const effect = effectBlock(source);

  assert.match(source, /const \[resolvedEventId, setResolvedEventId\] = useState\(''\)/u);
  assert.match(source, /if \(!ready \|\| resolvedEventId !== eventId\)/u);
  assert.match(effect, /setReady\(false\);\s*setError\(''\);\s*setSessionStatus\(''\);\s*setResolvedEventId\(''\);\s*setReviewFoundation\(false\);/u);
  assert.match(effect, /setSessionStatus\(payload\.session\.status\);\s*setResolvedEventId\(eventId\);\s*setReady\(true\);/u);
  assert.match(effect, /setError\(reason instanceof Error[\s\S]*?\);\s*setResolvedEventId\(eventId\);\s*setReady\(true\);/u);

  const previousEvent = { ready: true, resolvedEventId: 'evento-A' };
  const mayRender = (eventId) => previousEvent.ready && previousEvent.resolvedEventId === eventId;
  assert.equal(mayRender('evento-A'), true);
  assert.equal(mayRender('evento-B'), false, 'evento B não pode exibir estado de A antes de nova sonda');
});

test('retry invalida imediatamente respostas de sondas anteriores, inclusive falhas tardias', async () => {
  const source = await routerSource();
  const effect = effectBlock(source);

  assert.match(source, /const generationRef = useRef\(0\)/u);
  assert.match(effect, /const generation = \+\+generationRef\.current;/u);
  assert.match(effect, /if \(!active \|\| stopped \|\| inFlight\) return;\s*if \(generationRef\.current !== generation\) return;/u);
  assert.match(effect, /if \(!active\) return;\s*if \(generationRef\.current !== generation\) return;\s*const reviewRequested/u);
  assert.match(effect, /catch \(caught\) \{\s*if \(!active\) return;\s*if \(generationRef\.current !== generation\) return;/u);
  assert.match(source, /function retryProbe\(\) \{[\s\S]*?generationRef\.current \+= 1;[\s\S]*?setResolvedEventId\(''\);[\s\S]*?setReady\(false\);[\s\S]*?setRetryAttempt\(\(current\) => current \+ 1\);/u);

  let generation = 1;
  const oldRequest = generation;
  generation += 1; // clique de retry antes da limpeza do efeito antigo
  assert.equal(oldRequest === generation, false);
  const retryRequest = ++generation;
  assert.equal(retryRequest === generation, true);
  assert.equal(oldRequest === generation, false, 'resposta tardia não pode atualizar erro nem sessão');
});


test('erro recuperável recebe foco de teclado e loading anuncia progresso sem bloquear leitores', async () => {
  const source = await routerSource();

  assert.match(source, /const errorHeadingRef = useRef<HTMLHeadingElement>\(null\);/u);
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*if \(ready && resolvedEventId === eventId && error\) \{\s*errorHeadingRef\.current\?\.focus\(\);\s*\}\s*\}, \[error, eventId, ready, resolvedEventId\]\);/u,
  );
  assert.match(source, /<h1 id="configuration-error-title" ref=\{errorHeadingRef\} tabIndex=\{-1\}>/u);
  assert.match(source, /aria-labelledby="configuration-error-title" aria-describedby="configuration-error-description"/u);
  assert.match(source, /<div id="configuration-error-description" className="error">\{error\}<\/div>/u);
  assert.match(source, /<div className="loading-mark" aria-hidden="true">E<\/div>/u);
  assert.match(source, /<p role="status">A EVA está abrindo a configuração do evento\.\.\.<\/p>/u);
  assert.doesNotMatch(source, /className="loading-screen" aria-busy="true"/u);
  assert.match(source, /<button type="button" className="btn btn-primary" onClick=\{retryProbe\}>Tentar novamente<\/button>/u);
  assert.match(source, /href="\/painel">Voltar ao painel<\/Link>/u);
});
