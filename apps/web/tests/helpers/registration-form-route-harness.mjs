const TOKEN_KEY = 'evolvia_token';
const SAFE_CONFIGURATION_ERROR = 'Não foi possível abrir a configuração do evento.';
const SAFE_OPERATION_ERROR = 'Não foi possível concluir a operação.';

export const TECHNICAL_TRACE_ID = 'tr-9f3c-secret-do-not-render';
export const TECHNICAL_STACK = 'Error: connect ECONNREFUSED 127.0.0.1:5432\n    at EventWizardService.get (/app/event-wizard.service.ts:99:11)';
export const TECHNICAL_SQL = 'SELECT * FROM "EventWizardSession" WHERE id = $1';

function headerMap(headers) {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  return { ...headers };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fieldMessage(field) {
  if (typeof field === 'string') return field.trim() || null;
  if (field && typeof field.message === 'string') return field.message.trim() || null;
  return null;
}

export function getHarnessToken() {
  return typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY);
}

export function wizardProbePath(eventId) {
  return `/event-wizard/${eventId}`;
}

export function wizardProbeUrl(eventId) {
  return `/api${wizardProbePath(eventId)}`;
}

export function registrationFormHref(eventId) {
  return `/eventos/${eventId}/painel/inscricoes/ficha`;
}

export function scientificPanelHref(eventId) {
  return `/eventos/${eventId}/painel`;
}

export function createWizardPayload({ eventId, profileCode, status, eventType }) {
  return {
    event: {
      id: eventId,
      name: 'Evento de prova da ficha',
      slug: `prova-${eventId}`,
      status: status === 'COMPLETED' ? 'READY' : 'DRAFT',
      profileCode,
      organizationId: 'org-prova-ficha',
      organization: { id: 'org-prova-ficha', name: 'Organização de prova', slug: 'org-prova-ficha' },
      updatedAt: '2026-09-03T12:00:00.000Z',
    },
    session: {
      id: `session-${eventId}`,
      currentStep: status === 'COMPLETED' ? 'review' : 'profile',
      completionPercent: status === 'COMPLETED' ? 100 : 20,
      status,
      revision: 1,
      lastSavedAt: '2026-09-03T12:00:00.000Z',
    },
    answers: {
      eventType,
      profileCode,
    },
    capabilityCatalog: [],
  };
}

export function createTechnicalFailureBody(message) {
  return {
    error: {
      code: 'WIZARD_INTERNAL',
      status: 500,
      message,
      traceId: TECHNICAL_TRACE_ID,
      context: {
        stack: TECHNICAL_STACK,
        sql: TECHNICAL_SQL,
      },
    },
  };
}

export function installRegistrationFormRouteHarness() {
  const store = new Map();
  const calls = [];
  const routes = new Map();
  const previous = {
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
    localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
    fetch: globalThis.fetch,
  };

  const localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };

  globalThis.window = globalThis;
  globalThis.localStorage = localStorage;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : String(input.url);
    const method = String(init.method || 'GET').toUpperCase();
    const headers = headerMap(init.headers);
    calls.push({ url, method, headers, body: init.body ?? null });

    const handler = routes.get(`${method} ${url}`);
    if (!handler) {
      throw new Error(`Chamada de API fora do contrato da rota: ${method} ${url}`);
    }

    return handler();
  };

  return {
    calls,
    setToken(token = 'token-prova-ficha') {
      localStorage.setItem(TOKEN_KEY, token);
    },
    clearToken() {
      localStorage.removeItem(TOKEN_KEY);
    },
    mockWizardSession(input) {
      const payload = createWizardPayload(input);
      routes.set(`GET ${wizardProbeUrl(input.eventId)}`, () => jsonResponse(200, payload));
      return payload;
    },
    mockWizardHttpError(eventId, status, body) {
      routes.set(`GET ${wizardProbeUrl(eventId)}`, () => jsonResponse(status, body));
    },
    restore() {
      store.clear();
      calls.length = 0;
      routes.clear();
      if (previous.window) Object.defineProperty(globalThis, 'window', previous.window);
      else delete globalThis.window;
      if (previous.localStorage) Object.defineProperty(globalThis, 'localStorage', previous.localStorage);
      else delete globalThis.localStorage;
      globalThis.fetch = previous.fetch;
    },
  };
}

async function probeEventWizard(eventId) {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  const token = getHarnessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(wizardProbeUrl(eventId), {
    headers,
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const envelope = payload.error;
    const fields = Array.isArray(envelope?.fields) ? envelope.fields : [];
    const detailedFieldMessages = fields.map(fieldMessage).filter(Boolean);
    const legacyMessage = payload.message;
    const legacyText = Array.isArray(legacyMessage) ? legacyMessage.join(' ') : legacyMessage;
    const summary = envelope?.message || legacyText;
    const message = detailedFieldMessages.length > 0
      ? detailedFieldMessages.join(' ')
      : summary || SAFE_OPERATION_ERROR;

    const error = new Error(message);
    error.name = 'ApiError';
    error.status = response.status;
    error.code = envelope?.code;
    error.traceId = envelope?.traceId;
    error.fields = fields;
    error.context = envelope?.context ?? {};
    throw error;
  }

  return payload;
}

export function decideAuthenticatedConfigurationRoute({ hasToken, payload, failureMessage }) {
  if (!hasToken) {
    return { kind: 'login', redirect: '/login', apiCalled: false };
  }

  if (failureMessage) {
    return { kind: 'error', message: failureMessage, apiCalled: true };
  }

  if (!payload) {
    return { kind: 'error', message: SAFE_CONFIGURATION_ERROR, apiCalled: true };
  }

  if (payload.event.profileCode === 'SCIENTIFIC_EVENT' && payload.session.status === 'COMPLETED') {
    return {
      kind: 'scientific-painel',
      redirect: scientificPanelHref(payload.event.id),
      apiCalled: true,
    };
  }

  if (payload.session.status === 'COMPLETED') {
    return {
      kind: 'ficha',
      href: registrationFormHref(payload.event.id),
      apiCalled: true,
    };
  }

  return { kind: 'active', apiCalled: true };
}

export async function runAuthenticatedConfigurationRoute(eventId) {
  const hasToken = Boolean(getHarnessToken());
  if (!hasToken) {
    return decideAuthenticatedConfigurationRoute({ hasToken: false });
  }

  try {
    const payload = await probeEventWizard(eventId);
    return {
      ...decideAuthenticatedConfigurationRoute({ hasToken: true, payload }),
      payload,
    };
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : SAFE_CONFIGURATION_ERROR;
    return {
      ...decideAuthenticatedConfigurationRoute({ hasToken: true, failureMessage: message }),
      reason,
    };
  }
}

export function assertNoPublicOrWorkflowLeak(calls) {
  for (const call of calls) {
    if (call.method !== 'GET') {
      throw new Error(`A prova da rota não pode mutar o Wizard: ${call.method} ${call.url}`);
    }

    if (!call.url.startsWith('/api/event-wizard/')) {
      throw new Error(`A prova da rota não pode chamar ${call.method} ${call.url}`);
    }

    if (/\/complete|\/start|\/public\/|\/evento\/|inscricao|publicar/iu.test(call.url)) {
      throw new Error(`A prova da rota vazou jornada pública ou de publicação: ${call.url}`);
    }
  }
}

export function technicalLeakPattern() {
  return new RegExp(
    [
      TECHNICAL_TRACE_ID,
      'ECONNREFUSED',
      'EventWizardService',
      'event-wizard\\.service',
      'SELECT \\* FROM',
      'traceId',
      '127\\.0\\.0\\.1',
      'node_modules',
      'WIZARD_INTERNAL',
    ].join('|'),
    'u',
  );
}
