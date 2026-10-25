import assert from 'node:assert/strict';
import test from 'node:test';
import { PresenceCertificateService } from '../dist/presence-certificate.service.js';
import { NotFoundException } from '@nestjs/common';
import { CertificateRoleService } from '../dist/certificate-role.service.js';

const code = 'ab'.repeat(16);
const oldKey = 'org-a/event-a/11111111-1111-1111-1111-111111111111.png';
const input = { eventId: 'event-a', organizationId: 'org-a', reservationId: 'reservation-a', status: 'CONFIRMED', checkedIn: true, registrationData: { full_name: 'Ana Souza' } };
function fixture({ art = true } = {}) {
  const setting = { enabled: true, revision: 1, hours: 8, title: 'Original {EVENTO}', body: 'Participação de {NOME} em {EVENTO}', event: { name: 'Evento original' }, artStorageKey: art ? oldKey : null, artMimeType: art ? 'image/png' : null, artAltText: art ? 'Arte original' : null };
  let row = null;
  const deleted = [], audits = [], reads = [];
  const files = new Map([[oldKey, Buffer.from("original-art")]]);
  const prisma = {
    event: { findUnique: async () => ({ id: input.eventId, organizationId: input.organizationId }) },
    eventCertificateSetting: {
      findFirst: async ({ where }) => { assert.equal(where.eventId, input.eventId); assert.equal(where.organizationId, input.organizationId); return structuredClone(setting); },
      updateMany: async ({ data }) => { Object.assign(setting, data, { revision: setting.revision + 1 }); return { count: 1 }; },
    },
    eventCertificate: {
      findFirst: async ({ where }) => { assert.equal(where.reservationId, input.reservationId); assert.equal(where.eventId, input.eventId); assert.equal(where.organizationId, input.organizationId); return row; },
      findUnique: async ({ where }) => row?.code === where.code ? { ...row, event: { name: setting.event.name, certificateSetting: setting } } : null,
      create: async ({ data }) => { row = { ...data, id: 'issued', issuedAt: new Date('2026-10-25T12:00:00Z') }; return row; },
      count: async () => row ? 1 : 0,
      findMany: async () => row ? [{ ...row, event: { name: setting.event.name, certificateSetting: setting } }] : [],
    },
    auditLog: { create: async ({ data }) => { audits.push(data); } },
    $transaction: async fn => fn(prisma),
  };
  const service = new PresenceCertificateService(prisma, { requireRole: async () => {} }, {
    read: async key => { reads.push(key); if (!files.has(key)) throw new NotFoundException(); return files.get(key); },
    write: async (key, bytes) => { files.set(key, Buffer.from(bytes)); },
    rollbackNewWrite: async key => { deleted.push(key); files.delete(key); },
  });
  return { service, setting, audits, reads, deleted, files, get row() { return row; } };
}

test('emissão congela texto e evento; consulta e PDF ignoram alterações posteriores', async () => {
  const h = fixture();
  const issued = await h.service.issue(input);
  const before = await h.service.publicView(issued.code);
  const pdfBefore = await h.service.publicPdf(issued.code);
  h.setting.title = 'Novo modelo'; h.setting.body = 'Novo texto'; h.setting.event.name = 'Evento renomeado';
  const after = await h.service.publicView(issued.code);
  assert.deepEqual(after, before);
  assert.equal(after.originalSnapshot, true);
  assert.equal(after.eventName, 'Evento original');
  assert.equal(after.body, 'Participação de Ana Souza em Evento original');
  assert.deepEqual((await h.service.publicPdf(issued.code)).bytes, pdfBefore.bytes);
  for (const secret of ['snapshotArtKey', 'organizationId', 'eventId', 'email', 'reservationId']) assert.equal(secret in after, false);
});

test('repetição da emissão mantém o modelo original e é idempotente', async () => {
  const h = fixture({ art: false });
  const first = await h.service.issue(input);
  h.setting.title = 'Novo';
  assert.deepEqual(await h.service.issue(input), first);
  assert.equal(h.row.snapshotTitle, 'Original {EVENTO}');
  assert.equal(h.audits.length, 1);
});

test('remover arte do modelo mantém a arte da emissão e não exclui arquivo histórico', async () => {
  const h = fixture();
  const issued = await h.service.issue(input);
  await h.service.removeArt('organizer', input.eventId, { expectedRevision: 1 });
  assert.equal(h.setting.artStorageKey, null);
  assert.deepEqual(h.deleted, [oldKey]);
  const art = await h.service.publicArt(issued.code);
  assert.equal(art.bytes.toString(), 'original-art');
  assert.equal(h.reads.at(-1), h.row.snapshotArtKey);
  assert.notEqual(h.row.snapshotArtKey, oldKey);
  assert.equal((await h.service.publicView(issued.code)).hasArt, true);
});

test('emissão sem arte não passa a exibir uma arte adicionada depois', async () => {
  const h = fixture({ art: false });
  const issued = await h.service.issue(input);
  h.setting.artStorageKey = oldKey; h.setting.artMimeType = 'image/png';
  assert.equal((await h.service.publicView(issued.code)).hasArt, false);
  await assert.rejects(h.service.publicArt(issued.code), /não possui arte/);
});

test('arte de outro evento é recusada antes de leitura ou emissão', async () => {
  const h = fixture();
  h.setting.artStorageKey = 'org-b/event-b/11111111-1111-1111-1111-111111111111.png';
  await assert.rejects(h.service.issue(input), /revisada/);
  assert.equal(h.row, null); assert.equal(h.reads.length, 0); assert.equal(h.audits.length, 0);
});

test('legado permanece autêntico sem inventar snapshot histórico', async () => {
  const h = fixture({ art: false });
  const issued = await h.service.issue(input);
  for (const key of Object.keys(h.row).filter(key => key.startsWith('snapshot'))) h.row[key] = null;
  const view = await h.service.publicView(issued.code);
  assert.equal(view.authentic, true); assert.equal(view.originalSnapshot, false);
});

test('papel científico usa snapshot sem expor escopo ou nome atual do evento', async () => {
  const row = { role: 'approved_submission', displayName: 'Ana Souza', hours: 8, issuedAt: new Date('2026-10-25T12:00:00Z'), subjectLabel: 'Trabalho original', paperRole: 'Autora', code, eventId: 'event-a', organizationId: 'org-a', event: { name: 'Nome novo' }, snapshotVersion: 1, snapshotEventName: 'Congresso original', snapshotTitle: 'Certificado original', snapshotBody: '{NOME} em {EVENTO}: {TITULO}' };
  const service = new CertificateRoleService({ eventRoleCertificate: { findUnique: async () => row }, eventCertificateRoleSetting: { findFirst: async ({ where }) => { assert.equal(where.organizationId, 'org-a'); assert.equal(where.eventId, 'event-a'); return { title: 'Novo', body: 'Novo' }; } } }, {});
  const view = await service.publicView(code);
  assert.equal(view.title, 'Certificado original'); assert.equal(view.eventName, 'Congresso original'); assert.equal(view.originalSnapshot, true);
  assert.match(view.body, /Trabalho original/); assert.equal('organizationId' in view, false);
});


test('arquivo ausente impede emissão e arquivo compartilhado não é duplicado', async () => {
  const h = fixture(); h.files.clear();
  await assert.rejects(h.service.issue(input), /Not Found/);
  assert.equal(h.row, null); assert.equal(h.audits.length, 0);
  const ok = fixture(); await ok.service.issue(input);
  assert.equal(ok.files.size, 2);
  assert.match(ok.row.snapshotArtKey, /^org-a\/event-a\/[a-f0-9]{64}\.png$/);
});
