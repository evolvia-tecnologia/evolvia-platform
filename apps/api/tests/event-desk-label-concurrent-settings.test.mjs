import assert from 'node:assert/strict';
import test from 'node:test';
import { EventDeskService } from '../dist/event-desk.service.js';

const eventId = 'event_1';
const organizationId = 'tenant_1';
const categoryId = 'cm12345678901234567890001';
const historical = {
  label: {
    preset: '9x4', widthMm: 90, heightMm: 40,
    showName: true, nameField: 'preferred_name',
    showCompany: true, companyField: 'institution',
    extraFields: [], showCategory: true, codeMode: 'QR',
  },
  selfService: { cpf: true, email: false, qr: true },
};
const categoryModel = {
  categoryId, fields: ['institution', 'preferred_name', 'qr'],
  styles: {
    preferred_name: {
      align: 'right', bold: true, color: '#1d4ed8',
      fontFamily: 'serif', fontSizeMm: 3.5,
    },
  },
};
const nextLabel = { ...historical.label, preset: '6x3', widthMm: 60, heightMm: 30, codeMode: 'BOTH' };

function fixture(conflicts) {
  let persisted = structuredClone(historical);
  let attempts = 0;
  let commits = 0;
  let outsideReads = 0;
  const prisma = {
    event: { findUnique: async ({ where }) => {
      assert.equal(where.id, eventId);
      return {
        id: eventId, organizationId, name: 'Congresso', slug: 'congresso',
        status: 'PUBLISHED', capabilities: [{ code: 'credential' }],
      };
    } },
    eventCapability: { findFirst: async () => {
      outsideReads += 1;
      throw new Error('Reading JSON outside the serializable transaction can lose concurrent edits');
    } },
    $transaction: async (callback, options) => {
      attempts += 1;
      assert.equal(options.isolationLevel, 'Serializable');
      let proposed;
      let audit;
      const tx = {
        eventCapability: {
          findFirst: async ({ where }) => {
            assert.equal(where.eventId, eventId);
            // EventCapability is scoped by the eventId FK; membership scopes the event.
            assert.equal(where.code, 'credential');
            assert.equal(where.status, 'ACTIVE');
            return { config: structuredClone(persisted) };
          },
          update: async ({ where, data }) => {
            assert.equal(where.eventId_code.eventId, eventId);
            proposed = structuredClone(data.config);
          },
        },
        auditLog: { create: async ({ data }) => {
          assert.equal(data.organizationId, organizationId);
          assert.equal(data.eventId, eventId);
          audit = data;
        } },
      };
      const result = await callback(tx);
      if (attempts <= conflicts) {
        // Another SERIALIZABLE transaction wins the category template write.
        // The current transaction must roll back and reread this new value.
        persisted = { ...persisted, categoryLabelTemplates: [structuredClone(categoryModel)] };
        throw Object.assign(new Error('write conflict'), { code: 'P2034' });
      }
      assert.equal(audit.action, 'credential.label_updated');
      persisted = proposed;
      commits += 1;
      return result;
    },
  };
  const service = new EventDeskService(prisma, {
    requireRole: async (userId, tenant) => {
      assert.equal(userId, 'organizer_1');
      assert.equal(tenant, organizationId);
      return { role: 'OWNER' };
    },
  });
  return {
    service, state: () => structuredClone(persisted),
    counters: () => ({ attempts, commits, outsideReads }),
  };
}

test('salvar papel após conflito preserva ordem, estilos e configurações legadas da categoria', async () => {
  const { service, state, counters } = fixture(1);
  const result = await service.updateLabel('organizer_1', eventId, nextLabel);
  assert.equal(result.label.codeMode, 'BOTH');
  assert.deepEqual(state().categoryLabelTemplates, [categoryModel]);
  assert.deepEqual(state().selfService, historical.selfService);
  assert.equal(state().label.widthMm, 60);
  assert.equal(state().label.heightMm, 30);
  assert.equal(state().label.codeMode, 'BOTH');
  assert.deepEqual(counters(), { attempts: 2, commits: 1, outsideReads: 0 });
});

test('três conflitos não podem sobrescrever um modelo salvo por outra transação', async () => {
  const { service, state, counters } = fixture(3);
  await assert.rejects(
    service.updateLabel('organizer_1', eventId, nextLabel),
    /Configuração concorrente\. Tente novamente\./u,
  );
  assert.deepEqual(state().categoryLabelTemplates, [categoryModel]);
  assert.deepEqual(state().label, historical.label);
  assert.deepEqual(counters(), { attempts: 3, commits: 0, outsideReads: 0 });
});
