import assert from 'node:assert/strict';
import test from 'node:test';
import { ExhibitorCompanyService } from '../dist/exhibitor-company.service.js';

const userId = 'user1234567';
const email = 'ana@exemplo.com';
const companyId = 'company123456';
const otherCompanyId = 'othercompany1';
const event = {
  id: 'event123456', organizationId: 'org12345678', name: 'Feira', slug: 'feira', status: 'PUBLISHED',
  capabilities: [{ id: 'cap' }],
};
const company = {
  id: companyId, kind: 'EXHIBITOR', nationality: 'BRAZILIAN', document: '11222333000181', loginEmail: email,
  legalName: 'Empresa Exemplo', tradeName: 'Exemplo', booth: 'A1', areaLabel: '12 m2',
  quotaExhibitor: 1, quotaAssembler: 0, quotaService: 0,
  contactName: 'Ana', contactRole: 'Coord', contactEmail: email, postalCode: '', street: '', addressNumber: '',
  complement: '', district: '', city: '', state: '', country: '', phone: '',
};

function serviceFor(overrides = {}) {
  const audits = [];
  const prisma = {
    user: { findUnique: async () => ({ id: userId, email, name: 'Ana Lima', emailVerifiedAt: new Date('2026-01-01') }) },
    event: { findUnique: async ({ where }) => where.slug === 'feira' ? event : null },
    eventExhibitorCompany: { findMany: async ({ where }) => {
      assert.equal(where.eventId, event.id);
      assert.equal(where.organizationId, event.organizationId);
      assert.equal(where.OR[0].loginEmail, email);
      return [company];
    } },
    auditLog: { create: async ({ data }) => { audits.push(data); } },
    ...overrides,
  };
  return { prisma, audits, service: new ExhibitorCompanyService(prisma) };
}

test('e-mail não confirmado não consulta empresa', async () => {
  let queried = false;
  const { service } = serviceFor({
    user: { findUnique: async () => ({ id: userId, email, name: 'Ana', emailVerifiedAt: null }) },
    eventExhibitorCompany: { findMany: async () => { queried = true; return []; } },
  });
  await assert.rejects(service.home(userId, email, 'feira'), /Confirme o e-mail/u);
  assert.equal(queried, false);
});

test('conta de outro e-mail não abre a empresa e o token divergente é recusado', async () => {
  const { service } = serviceFor({
    eventExhibitorCompany: { findMany: async () => [] },
  });
  await assert.rejects(service.home(userId, 'outra@exemplo.com', 'feira'), /Sessão inválida/u);
  await assert.rejects(service.home(userId, email, 'feira'), /Não há empresa deste evento/u);
});

test('representante não altera o cadastro da empresa', async () => {
  const representativeCompany = { ...company, loginEmail: 'dona@exemplo.com' };
  const { service } = serviceFor({
    eventExhibitorCompany: { findMany: async () => [representativeCompany] },
  });
  await assert.rejects(
    service.updateProfile(userId, email, 'feira', companyId, { contactName: 'Ana', contactRole: 'Coord', contactEmail: email }),
    (error) => error.getStatus() === 403,
  );
});

test('credencial fora do prazo e de outra empresa não é gravada', async () => {
  let created = false;
  const { service, prisma } = serviceFor();
  prisma.$transaction = async (callback) => callback({
    eventExhibitorForm: { findFirst: async () => ({ id: 'form1234567', deadline: new Date('2020-01-01T00:00:00Z'), credentialKind: 'EXHIBITOR', kind: 'CREDENTIAL' }) },
    eventExhibitorCredential: { count: async () => 0, create: async () => { created = true; } },
    auditLog: { create: async () => {} },
  });
  await assert.rejects(service.addCredential(userId, email, 'feira', companyId, {
    formId: 'form1234567', kind: 'EXHIBITOR', nationality: 'BRAZILIAN', document: '52998224725',
    fullName: 'Ana Lima', badgeName: 'Ana', role: 'Coord',
  }), /prazo/u);
  await assert.rejects(service.addCredential(userId, email, 'feira', otherCompanyId, {
    formId: 'form1234567', kind: 'EXHIBITOR', nationality: 'BRAZILIAN', document: '52998224725',
    fullName: 'Ana Lima', badgeName: 'Ana', role: 'Coord',
  }), /Não há empresa/u);
  assert.equal(created, false);
});

test('pedido da empresa usa o preço do produto e não aceita outra empresa', async () => {
  const writes = [];
  const { service, prisma, audits } = serviceFor();
  prisma.$transaction = async (callback) => callback({
    eventExhibitorForm: { findFirst: async ({ where }) => {
      assert.equal(where.eventId, event.id);
      assert.equal(where.organizationId, event.organizationId);
      assert.equal(where.kind, 'REQUEST');
      return { id: 'form1234567', deadline: null };
    } },
    eventExhibitorProduct: { findFirst: async () => ({ id: 'product12345', priceCents: 2800 }) },
    eventExhibitorOrder: {
      findFirst: async () => null,
      create: async ({ data }) => { writes.push(data); return { id: 'order1234567', ...data }; },
    },
    auditLog: { create: async ({ data }) => { audits.push(data); } },
  });
  const saved = await service.requestOrder(userId, email, 'feira', companyId, { formId: 'form1234567', productId: 'product12345', quantity: 2 });
  assert.equal(saved.priceCents, 2800);
  assert.equal(writes[0].companyId, companyId);
  assert.equal(writes[0].organizationId, event.organizationId);
  assert.equal(audits.at(-1).metadata.priceCents, 2800);
  assert.equal(audits.at(-1).metadata.email, undefined);
  await assert.rejects(service.requestOrder(userId, email, 'feira', otherCompanyId, { formId: 'form1234567', productId: 'product12345', quantity: 1 }), /Não há empresa/u);
});

const profileInput = {
  contactName: 'Ana Lima', contactRole: 'Coord', contactEmail: email, phone: '',
  postalCode: '', street: '', addressNumber: '', complement: '', district: '', city: '', state: '', country: '',
};

function withTransaction(prisma, txFactory) {
  let committed = null;
  prisma.$transaction = async (callback) => {
    const staged = { audits: [], writes: [] };
    try {
      const result = await callback(txFactory(staged));
      committed = staged;
      return result;
    } catch (error) {
      committed = null;
      throw error;
    }
  };
  return () => committed;
}

function workspace(prisma) {
  const empty = { findMany: async () => [] };
  Object.assign(prisma, {
    eventExhibitorCredential: empty,
    eventExhibitorForm: empty,
    eventExhibitorProduct: empty,
    eventExhibitorOrder: empty,
    eventExhibitorDownload: empty,
    eventExhibitorRepresentative: { findMany: async () => [] },
    eventExhibitorFormVisit: empty,
  });
}

test('perfil e representante só confirmam a escrita junto com a auditoria', async () => {
  const { service, prisma } = serviceFor();
  workspace(prisma);
  const committed = withTransaction(prisma, (staged) => ({
    eventExhibitorCompany: { updateMany: async ({ where, data }) => {
      assert.equal(where.eventId, event.id);
      assert.equal(where.organizationId, event.organizationId);
      staged.writes.push(data);
      return { count: 1 };
    } },
    eventExhibitorRepresentative: { create: async ({ data }) => {
      staged.writes.push(data);
      return { id: 'rep123456789', ...data };
    } },
    auditLog: { create: async ({ data }) => { staged.audits.push(data); } },
  }));
  const saved = await service.updateProfile(userId, email, 'feira', companyId, profileInput);
  assert.equal(saved.company.id, companyId);
  assert.equal(committed().audits[0].action, 'exhibitor.company_profile_updated');
  assert.equal(committed().audits[0].organizationId, event.organizationId);
  assert.equal(committed().audits[0].metadata.email, undefined);
  assert.equal(committed().writes.length, 1);
  const representative = await service.addRepresentative(userId, email, 'feira', companyId, {
    name: 'Lia Costa', role: 'Financeiro', email: 'lia@exemplo.com',
  });
  assert.equal(representative.email, 'lia@exemplo.com');
  assert.equal(committed().audits[0].action, 'exhibitor.representative_created');
  assert.equal(committed().writes.length, 1);
});

test('falha da auditoria desfaz perfil e representante', async () => {
  const { service, prisma } = serviceFor();
  const committed = withTransaction(prisma, (staged) => ({
    eventExhibitorCompany: { updateMany: async ({ data }) => { staged.writes.push(data); return { count: 1 }; } },
    eventExhibitorRepresentative: {
      create: async ({ data }) => { staged.writes.push(data); return { id: 'rep123456789', ...data }; },
      deleteMany: async ({ where }) => {
        assert.equal(where.companyId, companyId);
        assert.equal(where.eventId, event.id);
        staged.writes.push(where.id);
        return { count: 1 };
      },
    },
    auditLog: { create: async () => { throw new Error('auditoria indisponível'); } },
  }));
  await assert.rejects(service.updateProfile(userId, email, 'feira', companyId, profileInput), /auditoria indisponível/u);
  await assert.rejects(service.addRepresentative(userId, email, 'feira', companyId, {
    name: 'Lia Costa', role: 'Financeiro', email: 'lia@exemplo.com',
  }), /auditoria indisponível/u);
  await assert.rejects(service.removeRepresentative(userId, email, 'feira', companyId, 'rep123456789'), /auditoria indisponível/u);
  assert.equal(committed(), null);
});

test('perfil sem linha atualizada não gera auditoria', async () => {
  const { service, prisma } = serviceFor();
  let audits = 0;
  prisma.$transaction = async (callback) => callback({
    eventExhibitorCompany: { updateMany: async () => ({ count: 0 }) },
    auditLog: { create: async () => { audits += 1; } },
  });
  await assert.rejects(service.updateProfile(userId, email, 'feira', companyId, profileInput), /Não há empresa deste evento/u);
  assert.equal(audits, 0);
});
