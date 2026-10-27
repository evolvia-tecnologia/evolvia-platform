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

test('serviço recusa travessia e codificação antes de qualquer leitura do storage', async () => {
  for (const suffix of ['../secret.png', 'aa/../../secret.png', 'aa\\secret.png', '%2e%2e.png', 'https://host/aa.png', 'aa.png?x=1']) {
    const h = fixture(); h.setting.artStorageKey = `org-a/event-a/${suffix}`;
    await assert.rejects(h.service.issue(input), /revisada/);
    assert.equal(h.reads.length, 0); assert.equal(h.row, null);
  }
  const h = fixture(); const issued = await h.service.issue(input);
  for (const key of ['org-a/event-a/../secret.png', 'org-a/event-a/aa\\secret.png', 'org-b/event-a/' + 'a'.repeat(64) + '.png', 'org-a/event-a/%2e%2e.png']) {
    h.row.snapshotArtKey = key; h.reads.length = 0;
    await assert.rejects(h.service.publicArt(issued.code), /não possui arte/);
    assert.equal(h.reads.length, 0);
  }
});

test('arquivamento concorrente coalesce leitura e não conserva cache de sucesso obsoleto', async () => {
  const h = fixture(); const storage = h.service.storage;
  const read = storage.read.bind(storage);
  let release; const gate = new Promise(resolve => { release = resolve; });
  let sourceReads = 0;
  storage.read = async key => { if (key === oldKey) { sourceReads++; await gate; } return read(key); };
  const first = h.service.archiveArt(input, h.setting);
  const second = h.service.archiveArt(input, h.setting);
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, b); assert.equal(sourceReads, 1);
  h.files.delete(oldKey);
  await assert.rejects(h.service.archiveArt(input, h.setting), /Not Found/);
  assert.equal(sourceReads, 2);
});

test('EEXIST só permite emissão quando o arquivo final existe e está íntegro', async () => {
  for (const state of ['complete', 'temporary-only', 'corrupt']) {
    const h = fixture();
    h.service.storage.write = async (key, bytes) => {
      if (state === 'complete') h.files.set(key, bytes);
      if (state === 'corrupt') h.files.set(key, Buffer.from('corrupt'));
      throw Object.assign(new Error('existing temporary file'), { code: 'EEXIST' });
    };
    if (state === 'complete') { await h.service.issue(input); assert.ok(h.row); }
    else { await assert.rejects(h.service.issue(input), /arquivando|verificada/); assert.equal(h.row, null); }
  }
});

test('arquivo existente com conteúdo adulterado bloqueia nova emissão', async () => {
  const h = fixture();
  const key = await h.service.archiveArt(input, h.setting);
  h.files.set(key, Buffer.from('corrupt'));
  await assert.rejects(h.service.issue(input), /verificada/);
  assert.equal(h.row, null); assert.equal(h.audits.length, 0);
});


test('nome de evento longo é preservado sem corte no snapshot ou na consulta', async () => {
  const h = fixture({ art: false });
  h.setting.event.name = 'Congresso internacional '.repeat(30);
  const issued = await h.service.issue(input);
  assert.equal(h.row.snapshotEventName, h.setting.event.name);
  assert.equal((await h.service.publicView(issued.code)).eventName, h.setting.event.name);
});

test('verso é congelado e uma emissão originalmente sem verso não ganha verso retroativo', async () => {
  const h=fixture({art:false});h.setting.backBody='Original {NOME}, {CARGA_HORARIA} h';const issued=await h.service.issue(input);const before=await h.service.publicView(issued.code);assert.equal(before.back,'Original Ana Souza, 8 h');h.setting.backBody='Alterado';assert.equal((await h.service.publicView(issued.code)).back,before.back);
  const old=fixture({art:false});const legacy=await old.service.issue(input);old.setting.backBody='Novo verso';assert.equal((await old.service.publicView(legacy.code)).back,null);
});
