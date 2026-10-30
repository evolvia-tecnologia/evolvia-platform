import assert from 'node:assert/strict';
import test from 'node:test';
import { EventDeskService } from '../dist/event-desk.service.js';

const categoryId = 'cm12345678901234567890001';
const reservationId = 'reservation12345';
const secret = 'legacy-label-regression-secret-0123456789abcdef';

function setup(config, data) {
  const prisma = {
    event: { findUnique: async ({ where }) => ({
      id: where.id, name: 'Congresso', slug: 'congresso', status: 'PUBLISHED',
      organizationId: 'tenant_1', capabilities: [{ code: 'credential' }],
    }) },
    eventRegistrationReservation: { findFirst: async ({ where }) => {
      assert.equal(where.id, reservationId);
      assert.equal(where.eventId, 'event_1');
      assert.equal(where.organizationId, 'tenant_1');
      return {
        id: reservationId, protocol: 'EVO-TEST-001', status: 'CONFIRMED',
        registrationData: data, category: { id: categoryId, name: 'Palestrante' },
      };
    } },
    eventCapability: { findFirst: async ({ where }) => {
      assert.equal(where.eventId, 'event_1');
      assert.equal(where.code, 'credential');
      return { config };
    } },
  };
  return new EventDeskService(prisma, {
    requireRole: async (userId, tenant) => {
      assert.equal(userId, 'user_1');
      assert.equal(tenant, 'tenant_1');
      return { role: 'OPERATOR' };
    },
  });
}

test('G2 label: historical configuration prints unchanged until an explicit category template exists', async () => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  try {
    const longName = 'Nome da pessoa palestrante '.repeat(8).trim();
    const longInstitution = 'Instituição científica de pesquisa '.repeat(6).trim();
    const config = { label: {
      preset: '9x4', widthMm: 90, heightMm: 40,
      showName: true, nameField: 'preferred_name',
      showCompany: true, companyField: 'institution',
      extraFields: ['job_title'], showCategory: true, codeMode: 'BARCODE',
    } };
    const data = {
      preferred_name: longName, institution: longInstitution,
      job_title: 'Palestrante convidado', identity_document: '52998224725',
      email: 'privado@example.test',
    };
    const legacy = await setup(config, data).badge('user_1', 'event_1', { reservationId });
    assert.equal(legacy.name, longName, 'do not truncate historical names');
    assert.equal(legacy.company, longInstitution, 'do not truncate historical institution');
    assert.deepEqual(legacy.lines, ['Palestrante convidado']);
    assert.equal(legacy.category, 'Palestrante');
    assert.equal(legacy.widthMm, 90);
    assert.equal(legacy.heightMm, 40);
    assert.equal(legacy.orderedContent, undefined, 'no implicit conversion to a category model');
    assert.equal(legacy.qr, null);
    assert.match(legacy.barcode, /^EVB1\./u);
    assert.doesNotMatch(JSON.stringify(legacy), /52998224725|privado@example\.test/u);

    const explicit = { ...config, categoryLabelTemplates: [{
      categoryId, fields: ['job_title', 'preferred_name', 'qr'],
      styles: { preferred_name: { align: 'center', bold: true, color: '#1d4ed8', fontFamily: 'serif', fontSizeMm: 3.5 } },
    }] };
    const configured = await setup(explicit, data).badge('user_1', 'event_1', { reservationId });
    assert.deepEqual(configured.orderedContent.map((item) => item.code), ['job_title', 'preferred_name', 'qr']);
    assert.equal(configured.orderedContent[1].value, longName);
    assert.equal(configured.orderedContent[1].style.fontSizeMm, 3.5);
    assert.equal(configured.orderedContent[1].style.fontFamily, 'serif');
    assert.equal(configured.name, null);
    assert.equal(configured.barcode, null);
    assert.match(configured.qr, /^EVQ1\./u);
    assert.equal(configured.widthMm, 90);
    assert.equal(configured.heightMm, 40);
    assert.doesNotMatch(JSON.stringify(configured), /52998224725|privado@example\.test/u);
  } finally {
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});
