import assert from 'node:assert/strict';
import test from 'node:test';
import { PresenceCertificateService } from '../dist/presence-certificate.service.js';

const code = 'ab'.repeat(16);
const row = {
  id: 'certificate-1',
  code,
  displayName: 'Ana Souza',
  hours: 8,
  issuedAt: new Date('2026-10-06T15:00:00.000Z'),
  event: {
    name: 'Congresso',
    certificateSetting: {
      title: 'Certificado de participação',
      body: 'Certificamos que **{NOME}** participou de **{EVENTO}**.',
      artAltText: null,
      artMimeType: null,
    },
  },
};

function fixture({ rows = [row], denied = false, total = rows.length } = {}) {
  const audits = [];
  let listed = 0;
  const prisma = {
    event: { findUnique: async () => ({ id: 'event-1', organizationId: 'org-1' }) },
    eventCertificate: {
      findUnique: async ({ where }) => (where.code === code ? row : null),
      count: async ({ where }) => {
        assert.equal(where.organizationId, 'org-1');
        return total;
      },
      findMany: async (query) => {
        listed += 1;
        assert.equal(query.take, 40);
        assert.equal(query.where.eventId, 'event-1');
        assert.equal(query.where.organizationId, 'org-1');
        assert.equal(query.select.event.select.certificateSetting.select.artStorageKey, undefined);
        return rows;
      },
    },
    auditLog: { create: async (input) => { audits.push(input.data); } },
  };
  const service = new PresenceCertificateService(
    prisma,
    { requireRole: async () => { if (denied) throw Object.assign(new Error('acesso negado'), { status: 403 }); } },
    {},
  );
  return { service, audits, listed: () => listed };
}

test('baixar o PDF duas vezes devolve a mesma segunda via sem nova emissão', async () => {
  const { service, audits } = fixture();
  const first = await service.publicPdf(code.toUpperCase());
  const second = await service.publicPdf(` ${code} `);
  assert.equal(first.feeCents, 0);
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(first.bytes.subarray(0, 5).toString(), '%PDF-');
  assert.equal(audits.length, 0);
});

test('lote do evento sai em PDF, registra uma auditoria e não cria certificado', async () => {
  const second = { ...row, id: 'certificate-2', code: 'cd'.repeat(16), displayName: 'Bruno Lima' };
  const { service, audits } = fixture({ rows: [row, second], total: 41 });
  const result = await service.batchPdf('editor-1', 'event-1');
  assert.equal(result.feeCents, 0);
  assert.equal(result.count, 2);
  assert.equal(result.total, 41);
  assert.match(result.bytes.toString('latin1'), /Bruno Lima/u);
  assert.match(result.bytes.toString('latin1'), /Este lote mostra 2 de 41/u);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'certificate.batch_downloaded');
  assert.equal(audits[0].organizationId, 'org-1');
  assert.deepEqual(audits[0].metadata, { count: 2, total: 41, feeCents: 0 });
  assert.equal(JSON.stringify(audits[0]).includes('Ana Souza'), false);
});

test('evento sem certificado ou sem permissão não gera lote', async () => {
  const empty = fixture({ rows: [] });
  await assert.rejects(empty.service.batchPdf('editor-1', 'event-1'), { status: 404 });
  assert.equal(empty.audits.length, 0);

  const denied = fixture({ denied: true });
  await assert.rejects(denied.service.batchPdf('intruso', 'event-1'), { status: 403 });
  assert.equal(denied.listed(), 0);
  assert.equal(denied.audits.length, 0);
});
