import assert from 'node:assert/strict';
import test from 'node:test';
import { EventDeskService } from '../dist/event-desk.service.js';
import { CheckInService } from '../dist/check-in.service.js';
import { readLabelConfig, normalizeLabelConfig, mergeLabelConfig, DeskPolicyError } from '../dist/event-desk-policy.js';

const categoryId = 'cm12345678901234567890001';
const reservationId = 'reservation12345';
const secret = 'legacy-label-regression-secret-0123456789abcdef';

function setup(config, data, reservationProtocol = 'EVO-TEST-001') {
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
        id: reservationId, protocol: reservationProtocol, status: 'CONFIRMED',
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
  }, {
    registrarTentativaDeImpressao: async (scope) => {
      assert.deepEqual(scope, { organizationId: 'tenant_1', eventId: 'event_1', reservationId, actorUserId: 'user_1' });
      return 'test-issued-sequence';
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

test('historical printer configuration missing extraFields retains dimensions, fields and barcode without rewriting stored JSON', async () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  try {
    const config = { label: {
      preset: '6x3', widthMm: 60, heightMm: 30,
      showName: true, nameField: 'full_name',
      showCompany: true, companyField: 'institution',
      showCategory: false, codeMode: 'BARCODE',
      // A historical extension is not a valid new write field, but must not
      // discard the remaining persisted settings during a read.
      oldPrinterExtension: 'kept-in-storage',
    } };
    assert.throws(() => normalizeLabelConfig(config.label), DeskPolicyError,
      'new writes must still reject unknown keys and incomplete payloads');
    const label = readLabelConfig(config);
    assert.equal(label.preset, '6x3');
    assert.equal(label.widthMm, 60);
    assert.equal(label.heightMm, 30);
    assert.equal(label.nameField, 'full_name');
    assert.equal(label.companyField, 'institution');
    assert.deepEqual(label.extraFields, []);
    assert.equal(label.showCategory, false);
    assert.equal(label.codeMode, 'BARCODE');
    assert.equal(config.label.oldPrinterExtension, 'kept-in-storage');
    const preserved = mergeLabelConfig({ ...config, categoryLabelTemplates: [{
      categoryId, fields: ['preferred_name', 'qr'],
    }] }, { ...label, widthMm: 90, heightMm: 40, preset: '9x4' });
    assert.equal(preserved.label.oldPrinterExtension, 'kept-in-storage',
      'saving current controls must not erase unknown historical printer metadata');
    assert.equal(preserved.label.nameField, 'full_name');
    assert.equal(preserved.label.widthMm, 90);
    assert.deepEqual(preserved.categoryLabelTemplates, [{ categoryId, fields: ['preferred_name', 'qr'] }],
      'global printer changes must not replace per-category templates');
    assert.equal(Object.hasOwn(config.label, 'extraFields'), false, 'read must not mutate historical storage');
    const badge = await setup(config, {
      full_name: 'Nome Histórico', institution: 'Instituição Histórica',
      email: 'private@example.test',
    }).badge('user_1', 'event_1', { reservationId });
    assert.equal(badge.name, 'Nome Histórico');
    assert.equal(badge.company, 'Instituição Histórica');
    assert.equal(badge.category, null);
    assert.equal(badge.widthMm, 60);
    assert.equal(badge.heightMm, 30);
    assert.equal(badge.qr, null);
    assert.match(badge.barcode, /^EVB1\./u);
    assert.doesNotMatch(JSON.stringify(badge), /private@example\.test/u);
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});


test('B2 parity: posto e totem produzem a mesma etiqueta legada e por categoria sem vazar PII', async () => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  const protocol = 'EVO-1234567890ABCDEF';
  const data = {
    preferred_name: 'Participante de teste', institution: 'Universidade Exemplo',
    job_title: 'Palestrante', email: 'pessoal@example.test',
    identity_document: '52998224725',
  };
  function kiosk(config) {
    const reservation = {
      id: reservationId, protocol, status: 'CONFIRMED', registrationData: data,
      category: { id: categoryId, name: 'Palestrante' },
    };
    const prisma = {
      event: { findFirst: async ({ where }) => {
        assert.equal(where.slug, 'congresso');
        return {
          id: 'event_1', name: 'Congresso', slug: 'congresso',
          organizationId: 'tenant_1', capabilities: [{ config }],
        };
      } },
      eventRegistrationReservation: { findFirst: async ({ where }) => {
        assert.equal(where.eventId, 'event_1');
        assert.equal(where.organizationId, 'tenant_1');
        assert.equal(where.status, 'CONFIRMED');
        assert.equal(where.protocol, protocol);
        return reservation;
      } },
      $transaction: async (callback) => callback({
        eventRegistrationCheckIn: { findUnique: async () => ({
          eventId: 'event_1', organizationId: 'tenant_1',
          checkedInAt: new Date('2026-11-02T10:00:00.000Z'), reversedAt: null,
        }) },
      }),
    };
    return new CheckInService(prisma, {});
  }
  const legacy = {
    label: {
      preset: '9x4', widthMm: 90, heightMm: 40,
      showName: true, nameField: 'preferred_name',
      showCompany: true, companyField: 'institution',
      extraFields: ['job_title'], showCategory: true, codeMode: 'BARCODE',
    },
    selfService: { cpf: false, email: false, qr: false, protocol: true },
  };
  const category = {
    ...legacy,
    categoryLabelTemplates: [{
      categoryId, fields: ['institution', 'preferred_name', 'qr'],
      styles: { preferred_name: { align: 'center', bold: true, color: '#1d4ed8', fontFamily: 'serif', fontSizeMm: 3.5 } },
    }],
  };
  try {
    for (const [kind, config] of [['legado', legacy], ['categoria', category]]) {
      const posto = await setup(config, data, protocol).badge('user_1', 'event_1', { reservationId });
      const { checkedInAt, alreadyCheckedIn, ...totem } = await kiosk(config).selfServicePrint(
        'congresso', { method: 'PROTOCOL', value: protocol },
      );
      assert.equal(alreadyCheckedIn, true);
      assert.equal(checkedInAt, '2026-11-02T10:00:00.000Z');
      assert.deepEqual(posto.emissao, { sequence: 'test-issued-sequence', concluida: false },
        'posto registra tentativa também no fallback legado, sem confirmar papel');
      const { emissao, ...postoImprimivel } = posto;
      assert.deepEqual(totem, postoImprimivel, 'B2: ' + kind + ' deve imprimir o mesmo payload no posto e no totem');
      assert.doesNotMatch(JSON.stringify(totem), /52998224725|pessoal@example\.test/u);
      if (kind === 'categoria') {
        assert.deepEqual(totem.orderedContent.map((item) => item.code),
          ['institution', 'preferred_name', 'qr']);
        assert.equal(totem.orderedContent[1].style.bold, true);
        assert.match(totem.qr, /^EVQ1\./u);
      } else {
        assert.equal(totem.orderedContent, undefined);
        assert.match(totem.barcode, /^EVB1\./u);
      }
    }
  } finally {
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});
