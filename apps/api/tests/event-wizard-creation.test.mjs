import assert from 'node:assert/strict';
import test from 'node:test';
import { EventWizardService } from '../dist/event-wizard.service.js';

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
        return { id: 'evt-1' };
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
