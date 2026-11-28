import test from 'node:test';
import assert from 'node:assert/strict';
import { EventDeskService } from '../dist/event-desk.service.js';

const eventId = 'event-label-history';
const organizationId = 'org-label-history';
const categoryId = 'cm12345678901234567890001';
const otherCategoryId = 'cm12345678901234567890002';
const preferredStyle = {
  align: 'right', bold: true, color: '#1d4ed8', fontFamily: 'serif', fontSizeMm: 3.5,
};
const institutionStyle = {
  align: 'left', bold: false, color: '#065f46', fontFamily: 'sans', fontSizeMm: 2.5,
};
const initial = {
  label: { preset: '4x2', widthMm: 40, heightMm: 20, codeMode: 'QR' },
  categoryLabelTemplates: [
    {
      categoryId, fields: ['preferred_name', 'institution', 'qr'],
      styles: { preferred_name: preferredStyle, institution: institutionStyle },
    },
    {
      categoryId: otherCategoryId, fields: ['institution', 'qr'],
      styles: { institution: institutionStyle },
    },
  ],
};

function fixture(conflictOnce = false) {
  let persisted = structuredClone(initial);
  let attempts = 0;
  let auditCount = 0;
  const prisma = {
    event: { findUnique: async ({ where }) => {
      assert.equal(where.id, eventId);
      return {
        id: eventId, organizationId, status: 'PUBLISHED',
        capabilities: [{ code: 'credential' }],
      };
    } },
    platformEventModeration: { findUnique: async ({ where }) => {
      assert.equal(where.eventId, eventId);
      return null; // evento ativo sem linha de moderação
    } },
    eventRegistrationCategory: { findFirst: async ({ where }) => {
      assert.equal(where.eventId, eventId);
      assert.equal(where.organizationId, organizationId);
      return where.id === categoryId ? { id: categoryId } : null;
    } },
    eventRegistrationForm: { findFirst: async ({ where }) => {
      assert.equal(where.organizationId, organizationId);
      return { fields: [] };
    } },
    $transaction: async (callback, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      attempts += 1;
      let pending;
      const result = await callback({
        eventCapability: {
          findFirst: async ({ where }) => {
            assert.equal(where.eventId, eventId);
            assert.equal(where.code, 'credential');
            return { config: structuredClone(persisted) };
          },
          update: async ({ where, data }) => {
            assert.equal(where.eventId_code.eventId, eventId);
            pending = structuredClone(data.config);
          },
        },
        auditLog: { create: async ({ data }) => {
          assert.equal(data.organizationId, organizationId);
          assert.equal(data.action, 'credential.category_label_updated');
          auditCount += 1;
        } },
      });
      if (conflictOnce && attempts === 1) {
        // Another organizer commits a different font/color while our transaction aborts.
        persisted.categoryLabelTemplates[0].styles.preferred_name.color = '#be123c';
        throw Object.assign(new Error('Serializable conflict'), { code: 'P2034' });
      }
      persisted = pending;
      return result;
    },
  };
  const service = new EventDeskService(prisma, {
    requireRole: async (userId, tenant) => {
      assert.equal(userId, 'owner');
      assert.equal(tenant, organizationId);
      return { role: 'OWNER' };
    },
  });
  return { service, state: () => structuredClone(persisted),
    counts: () => ({ attempts, auditCount }) };
}

test('cliente legado reordena campos sem apagar fonte, cor, negrito ou outra categoria', async () => {
  const { service, state } = fixture();
  const fields = ['institution', 'preferred_name', 'qr'];
  const saved = await service.updateCategoryLabel('owner', eventId, categoryId, { fields });
  assert.deepEqual(saved.fields, fields);
  assert.deepEqual(saved.styles, { preferred_name: preferredStyle, institution: institutionStyle });
  const current = state();
  assert.deepEqual(current.categoryLabelTemplates[0].fields, fields);
  assert.deepEqual(current.categoryLabelTemplates[0].styles,
    { preferred_name: preferredStyle, institution: institutionStyle });
  assert.deepEqual(current.categoryLabelTemplates[1], initial.categoryLabelTemplates[1]);
  assert.deepEqual(current.label, initial.label);
});

test('omissão de styles preserva somente estilos dos campos mantidos; styles vazio limpa explicitamente', async () => {
  const { service, state } = fixture();
  const saved = await service.updateCategoryLabel('owner', eventId, categoryId,
    { fields: ['preferred_name', 'qr'] });
  assert.deepEqual(saved.styles, { preferred_name: preferredStyle });
  assert.deepEqual(state().categoryLabelTemplates[0].styles, { preferred_name: preferredStyle });
  const cleared = await service.updateCategoryLabel('owner', eventId, categoryId,
    { fields: ['preferred_name', 'qr'], styles: {} });
  assert.deepEqual(cleared.styles, {});
  assert.equal(state().categoryLabelTemplates[0].styles, undefined);
  assert.deepEqual(state().categoryLabelTemplates[1], initial.categoryLabelTemplates[1]);
});

test('retry serializable relê estilo vencedor, não restaura formatação obsoleta', async () => {
  const { service, state, counts } = fixture(true);
  const saved = await service.updateCategoryLabel('owner', eventId, categoryId,
    { fields: ['preferred_name', 'institution', 'qr'] });
  assert.equal(saved.styles.preferred_name.color, '#be123c');
  assert.equal(state().categoryLabelTemplates[0].styles.preferred_name.color, '#be123c');
  assert.equal(counts().attempts, 2);
});
