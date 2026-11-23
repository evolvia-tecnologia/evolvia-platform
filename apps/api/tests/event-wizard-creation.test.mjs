import assert from 'node:assert/strict';
import test from 'node:test';
import { EventWizardService } from '../dist/event-wizard.service.js';
import { getWizardCompletionIssues } from '../dist/wizard-policy.js';

function serviceWith(transaction) {
  const prisma = { $transaction: transaction };
  const authorization = { requireRole: async () => ({ role: 'OWNER' }) };
  return new EventWizardService(prisma, authorization, {});
}

test('Wizard recusa tipo fora do catálogo antes de criar evento', async () => {
  let transactions = 0;
  const service = serviceWith(async () => { transactions += 1; });
  await assert.rejects(
    service.start('user-1', { organizationId: 'org-1', eventType: '<script>alert(1)</script>' }),
    /Escolha um tipo de evento disponível/u,
  );
  assert.equal(transactions, 0);
  await assert.rejects(
    service.start('user-1', { organizationId: 'org-1' }),
    /Escolha um tipo de evento disponível/u,
  );
  assert.equal(transactions, 0);
});

test('Wizard aceita Corrida e pré-seleciona entrega de material', async () => {
  const upserts = [];
  let sessionAnswers;
  const service = serviceWith(async (operation) => operation({
    event: { create: async ({ data }) => ({ id: 'evt-corrida', ...data }) },
    eventWizardSession: { create: async ({ data }) => { sessionAnswers = data.answers; return { id: 'session-1' }; } },
    eventCapability: { upsert: async ({ create }) => { upserts.push(create); return {}; } },
    auditLog: { create: async () => ({}) },
  }));
  service.get = async () => ({ event: { id: 'evt-corrida' } });

  const result = await service.start('user-1', {
    organizationId: 'org-1',
    eventType: 'Corrida',
  });

  assert.equal(result.event.id, 'evt-corrida');
  assert.equal(sessionAnswers.eventType, 'Corrida');
  assert.equal(sessionAnswers.profileCode, 'SOCIAL_COMMUNITY');
  assert.equal(sessionAnswers.capabilitiesCustomized, false);
  assert.ok(sessionAnswers.capabilities.includes('material_delivery'));
  assert.ok(sessionAnswers.capabilities.includes('registration'));
  assert.equal(upserts.find((item) => item.code === 'material_delivery')?.status, 'ACTIVE');
});

test('evento esportivo inicia sem entrega de material', async () => {
  const upserts = [];
  let sessionAnswers;
  const service = serviceWith(async (operation) => operation({
    event: { create: async ({ data }) => ({ id: 'evt-esporte', ...data }) },
    eventWizardSession: { create: async ({ data }) => { sessionAnswers = data.answers; return { id: 'session-1' }; } },
    eventCapability: { upsert: async ({ create }) => { upserts.push(create); return {}; } },
    auditLog: { create: async () => ({}) },
  }));
  service.get = async () => ({ event: { id: 'evt-esporte' } });

  await service.start('user-1', {
    organizationId: 'org-1',
    eventType: 'Evento esportivo ou torneio',
  });

  assert.equal(sessionAnswers.profileCode, 'SOCIAL_COMMUNITY');
  assert.equal(sessionAnswers.capabilities.includes('material_delivery'), false);
  assert.equal(upserts.find((item) => item.code === 'material_delivery')?.status, 'DISABLED');
});

function corridaEvent(overrides = {}) {
  return {
    id: 'evt-corrida',
    ownerId: 'user-1',
    name: 'Corrida da orla',
    slug: 'rascunho-aabbccddeeff001122334455',
    status: 'DRAFT',
    profileCode: 'SOCIAL_COMMUNITY',
    organizationId: 'org-1',
    organization: { id: 'org-1', name: 'Org', slug: 'org', status: 'ACTIVE' },
    eventType: 'Corrida',
    format: 'IN_PERSON',
    registrationMode: 'FREE',
    startDate: null,
    endDate: null,
    timeZone: 'America/Sao_Paulo',
    venue: null,
    estimatedAudience: null,
    subjectAreas: [],
    capabilities: [],
    updatedAt: new Date('2026-10-07T00:00:00.000Z'),
    ...overrides,
  };
}

function wizardSession(answers) {
  return {
    id: 'session-1',
    eventId: 'evt-corrida',
    flowVersion: 'v2',
    currentStep: 'capabilities',
    answers,
    completionPercent: 40,
    status: 'ACTIVE',
    revision: 2,
    lastSavedAt: new Date('2026-10-07T00:00:00.000Z'),
  };
}

test('reabrir Corrida sem personalização restaura a sugestão de material', async () => {
  const prisma = {
    event: { findUnique: async () => corridaEvent() },
    eventWizardSession: {
      findUnique: async () => wizardSession({
        eventType: 'Corrida',
        profileCode: 'SOCIAL_COMMUNITY',
        registrationMode: 'FREE',
        capabilitiesCustomized: false,
        capabilities: ['registration', 'communication', 'credential'],
      }),
    },
  };
  const service = new EventWizardService(prisma, { requireRole: async () => ({ role: 'OWNER' }) }, {});
  const payload = await service.get('user-1', 'evt-corrida');
  const material = payload.capabilityCatalog.find((item) => item.code === 'material_delivery');

  assert.equal(material.recommended, true);
  assert.equal(material.selected, true);
  assert.equal(payload.answers.capabilitiesCustomized, false);
  assert.ok(payload.answers.capabilities.includes('material_delivery'));
});

test('payload de Fundação reflete formato canônico do banco, não resposta antiga', async () => {
  const prisma = {
    event: { findUnique: async () => corridaEvent({ format: 'HYBRID' }) },
    eventWizardSession: { findUnique: async () => wizardSession({
      eventType: 'Corrida', format: 'IN_PERSON', capabilities: ['registration'],
      capabilitiesCustomized: true,
    }) },
  };
  const service = new EventWizardService(prisma, { requireRole: async () => ({ role: 'OWNER' }) }, {});
  const payload = await service.get('user-1', 'evt-corrida');
  assert.equal(payload.event.format, 'HYBRID');
});

test('desativação personalizada de material na Corrida permanece desligada', async () => {
  const prisma = {
    event: { findUnique: async () => corridaEvent() },
    eventWizardSession: {
      findUnique: async () => wizardSession({
        eventType: 'Corrida',
        profileCode: 'SOCIAL_COMMUNITY',
        registrationMode: 'FREE',
        capabilitiesCustomized: true,
        capabilities: ['communication'],
      }),
    },
  };
  const service = new EventWizardService(prisma, { requireRole: async () => ({ role: 'OWNER' }) }, {});
  const payload = await service.get('user-1', 'evt-corrida');
  const material = payload.capabilityCatalog.find((item) => item.code === 'material_delivery');

  assert.equal(material.recommended, true);
  assert.equal(material.selected, false);
  assert.equal(payload.answers.capabilitiesCustomized, true);
  assert.deepEqual(payload.answers.capabilities, ['registration', 'communication']);
});

test('Wizard inicia rascunho privado para um tipo canônico', async () => {
  let eventData;
  const service = serviceWith(async (operation) => operation({
    event: { create: async ({ data }) => { eventData = data; return { id: 'evt-1' }; } },
    eventWizardSession: { create: async () => ({ id: 'session-1' }) },
    eventCapability: { upsert: async () => ({}) },
    auditLog: { create: async () => ({}) },
  }));
  service.get = async () => ({ event: { id: 'evt-1' } });

  const result = await service.start('user-1', {
    organizationId: 'org-1',
    eventType: 'Congresso ou evento científico',
  });

  assert.equal(result.event.id, 'evt-1');
  assert.equal(eventData.organizationId, 'org-1');
  assert.equal(eventData.status, 'DRAFT');
  assert.match(eventData.slug, /^rascunho-[a-f0-9]{24}$/u);
});

test('limpar só o término grava endDate null no Event sem apagar o início', async () => {
  const service = serviceWith(async () => {});
  const changes = [];
  let stored = {
    startDate: new Date('2026-10-16T12:00:00.000Z'),
    endDate: new Date('2026-10-18T12:00:00.000Z'),
  };
  const tx = {
    event: {
      findUnique: async () => ({ slug: 'congresso-abc123def456' }),
      update: async ({ data }) => {
        changes.push(data);
        if (Object.prototype.hasOwnProperty.call(data, 'startDate')) stored.startDate = data.startDate;
        if (Object.prototype.hasOwnProperty.call(data, 'endDate')) stored.endDate = data.endDate;
        return { id: 'evt-1', ...stored };
      },
    },
  };

  const cleared = await service.persistEventData(tx, 'evt-1', {
    startDate: '2026-10-16T12:00:00.000Z',
    endDate: null,
    datesPending: false,
    timeZone: 'America/Sao_Paulo',
  });
  assert.equal(changes[0].startDate.toISOString(), '2026-10-16T12:00:00.000Z');
  assert.equal(changes[0].endDate, null);
  assert.equal(cleared.endDate, null);
  assert.equal(cleared.startDate, '2026-10-16T12:00:00.000Z');

  const omitted = await service.persistEventData(tx, 'evt-1', { name: 'Só o nome' });
  assert.equal(changes[1].startDate, undefined);
  assert.equal(changes[1].endDate, undefined);
  assert.equal(omitted.startDate, '2026-10-16T12:00:00.000Z');
  assert.equal(omitted.endDate, null);

  const pending = await service.persistEventData(tx, 'evt-1', { datesPending: true });
  assert.equal(changes[2].startDate, null);
  assert.equal(changes[2].endDate, null);
  assert.equal(pending.startDate, null);
  assert.equal(pending.endDate, null);
});

function draftEventRow(overrides = {}) {
  return {
    id: 'evt-1',
    ownerId: 'user-1',
    organizationId: 'org-1',
    status: 'DRAFT',
    eventType: 'Congresso ou evento científico',
    profileCode: 'SCIENTIFIC_EVENT',
    name: 'Congresso QA',
    format: 'IN_PERSON',
    startDate: new Date('2026-10-16T12:00:00.000Z'),
    endDate: new Date('2026-10-18T12:00:00.000Z'),
    timeZone: 'America/Sao_Paulo',
    venue: 'Centro',
    estimatedAudience: 100,
    slug: 'congresso-abc123def456',
    organization: { id: 'org-1', name: 'Org', slug: 'org', status: 'ACTIVE' },
    capabilities: [{ code: 'registration' }, { code: 'scientific' }],
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    ...overrides,
  };
}

function saveHarness(eventRow) {
  let eventPatch = null;
  let sessionPatch = null;
  let storedDates = { startDate: eventRow.startDate, endDate: eventRow.endDate };
  const prisma = {
    event: { findUnique: async () => eventRow },
    $transaction: async (operation) => operation({
      event: {
        findUnique: async () => ({ slug: eventRow.slug }),
        update: async ({ data }) => {
          eventPatch = data;
          if (Object.prototype.hasOwnProperty.call(data, 'startDate')) storedDates.startDate = data.startDate;
          if (Object.prototype.hasOwnProperty.call(data, 'endDate')) storedDates.endDate = data.endDate;
          return { id: eventRow.id, ...storedDates };
        },
      },
      eventCapability: { upsert: async () => ({}) },
      eventWizardSession: {
        updateMany: async ({ data }) => { sessionPatch = data; return { count: 1 }; },
      },
      auditLog: { create: async () => ({}) },
    }),
  };
  const authorization = { requireRole: async () => ({ role: 'OWNER' }) };
  const mutationPolicy = { assertFoundationMutable: () => undefined };
  const service = new EventWizardService(prisma, authorization, mutationPolicy);
  service.get = async () => ({ event: { id: 'evt-1' }, answers: sessionPatch?.answers ?? {} });
  return {
    service,
    get eventPatch() { return eventPatch; },
    get sessionPatch() { return sessionPatch; },
  };
}

test('save persiste endDate null no Event e na sessão Wizard juntos', async () => {
  const eventRow = draftEventRow();
  const harness = saveHarness(eventRow);

  await harness.service.save('user-1', 'evt-1', {
    currentStep: 'identity',
    revision: 3,
    answers: {
      eventType: eventRow.eventType,
      name: eventRow.name,
      format: 'IN_PERSON',
      startDate: '2026-10-16T12:00:00.000Z',
      endDate: null,
      timeZone: 'America/Sao_Paulo',
      datesPending: false,
      venue: 'Centro',
      registrationMode: 'FREE',
      capabilities: ['registration', 'scientific'],
      subjectAreas: ['saude'],
    },
  });

  assert.equal(harness.eventPatch.endDate, null);
  assert.equal(harness.eventPatch.startDate.toISOString(), '2026-10-16T12:00:00.000Z');
  assert.equal(harness.sessionPatch.answers.endDate, null);
  assert.equal(harness.sessionPatch.answers.startDate, '2026-10-16T12:00:00.000Z');
});

test('save que omite endDate preserva término no Event e no JSON da sessão', async () => {
  const eventRow = draftEventRow();
  const harness = saveHarness(eventRow);

  await harness.service.save('user-1', 'evt-1', {
    currentStep: 'identity',
    revision: 4,
    answers: {
      eventType: eventRow.eventType,
      name: eventRow.name,
      format: 'IN_PERSON',
      startDate: '2026-10-16T12:00:00.000Z',
      // endDate omitido de propósito
      timeZone: 'America/Sao_Paulo',
      datesPending: false,
      venue: 'Centro',
      registrationMode: 'FREE',
      capabilities: ['registration', 'scientific'],
      subjectAreas: ['saude'],
    },
  });

  assert.equal(harness.eventPatch.endDate, undefined);
  assert.equal(harness.sessionPatch.answers.endDate, '2026-10-18T12:00:00.000Z');
  assert.equal(harness.sessionPatch.answers.startDate, '2026-10-16T12:00:00.000Z');
});

test('save com revisão divergente responde 409 sem gravar sessão', async () => {
  const eventRow = draftEventRow();
  let sessionWrites = 0;
  const prisma = {
    event: { findUnique: async () => eventRow },
    $transaction: async (operation) => operation({
      event: {
        findUnique: async () => ({ slug: eventRow.slug }),
        update: async ({ data }) => ({
          id: eventRow.id,
          startDate: Object.prototype.hasOwnProperty.call(data, 'startDate') ? data.startDate : eventRow.startDate,
          endDate: Object.prototype.hasOwnProperty.call(data, 'endDate') ? data.endDate : eventRow.endDate,
        }),
      },
      eventCapability: { upsert: async () => ({}) },
      eventWizardSession: {
        updateMany: async () => { sessionWrites += 1; return { count: 0 }; },
      },
      auditLog: { create: async () => ({}) },
    }),
  };
  const service = new EventWizardService(
    prisma,
    { requireRole: async () => ({ role: 'OWNER' }) },
    { assertFoundationMutable: () => undefined },
  );

  await assert.rejects(
    () => service.save('user-1', 'evt-1', {
      currentStep: 'identity',
      revision: 1,
      answers: {
        eventType: eventRow.eventType,
        name: eventRow.name,
        format: 'IN_PERSON',
        startDate: '2026-10-16T12:00:00.000Z',
        endDate: '2026-10-18T12:00:00.000Z',
        timeZone: 'America/Sao_Paulo',
        datesPending: false,
        venue: 'Centro',
        registrationMode: 'FREE',
        capabilities: ['registration', 'scientific'],
        subjectAreas: ['saude'],
      },
    }),
    (error) => error?.response?.code === 'VERSION_CONFLICT' || error?.getResponse?.()?.code === 'VERSION_CONFLICT',
  );
  assert.equal(sessionWrites, 1);
});

test('Autosave mantém rascunho privado; conclusão gera sigla e código público estável', async () => {
  const service = serviceWith(async () => {});
  let currentSlug = 'rascunho-aabbccddeeff001122334455';
  const changes = [];
  const tx = {
    event: {
      findUnique: async () => ({ slug: currentSlug }),
      update: async ({ data }) => {
        changes.push(data);
        if (data.slug) currentSlug = data.slug;
        return { id: 'evt-1', startDate: null, endDate: null };
      },
    },
  };

  await service.persistEventData(tx, 'evt-1', { name: 'C' });
  assert.equal(changes[0].slug, undefined);
  assert.match(currentSlug, /^rascunho-[a-f0-9]{24}$/u);

  await service.persistEventData(tx, 'evt-1', { name: 'Congresso Brasileiro de Inovação' }, true);
  assert.match(changes[1].slug, /^cbi-[a-f0-9]{12}$/u);
  const publicSlug = changes[1].slug;

  await service.persistEventData(tx, 'evt-1', { name: 'Congresso de Inovação Atualizado' }, true);
  assert.equal(changes[2].slug, undefined);
  assert.equal(currentSlug, publicSlug);
});

test('API deriva perfil e organização do evento, ignorando campos forjados no navegador', () => {
  const service = serviceWith(async () => {});
  const event = {
    eventType: 'Congresso ou evento científico',
    profileCode: 'SCIENTIFIC_EVENT',
    organizationId: 'org-1',
  };
  const answers = service.normalizeAnswersForEvent(event, {
    organizationId: 'org-invasora',
    eventType: 'Congresso ou evento científico',
    profileCode: 'ENTERTAINMENT',
    capabilitiesCustomized: true,
    capabilities: ['registration'],
  });
  assert.equal(answers.organizationId, 'org-1');
  assert.equal(answers.profileCode, 'SCIENTIFIC_EVENT');
  assert.throws(
    () => service.normalizeAnswersForEvent(event, {
      eventType: '<script>alert(1)</script>',
      profileCode: 'OTHER',
    }),
    /Escolha um tipo de evento disponível/u,
  );
});

test('API não conclui fundação com nome parcial do autosave', () => {
  const issues = getWizardCompletionIssues({ name: 'C' });
  assert.ok(issues.includes('Informe um nome com pelo menos 3 caracteres.'));
});
