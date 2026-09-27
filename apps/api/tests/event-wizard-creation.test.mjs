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

test('Primeiro nome do evento gera sigla e código público estável em edições seguintes', async () => {
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

  await service.persistEventData(tx, 'evt-1', { name: 'Congresso Brasileiro de Inovação' });
  assert.match(changes[0].slug, /^cbi-[a-f0-9]{12}$/u);
  const publicSlug = changes[0].slug;

  await service.persistEventData(tx, 'evt-1', { name: 'Congresso de Inovação Atualizado' });
  assert.equal(changes[1].slug, undefined);
  assert.equal(currentSlug, publicSlug);
});
