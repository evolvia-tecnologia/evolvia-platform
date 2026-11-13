import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { RegistrationTermsDocumentService } from '../dist/registration-terms-document.service.js';
import { EventMutationPolicy } from '../dist/event-mutation-policy.service.js';

const event = { id: 'cevent00001', organizationId: 'corg000001', status: 'PUBLISHED' };
const pdf = { fileName: 'termos.pdf', contentBase64: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF').toString('base64') };
function harness({ status = 'PUBLISHED', lockedStatus = status, existing = false, restoreHash = null, concurrent = false, deny = false, failAudit = false, missing = false } = {}) {
  const actions = [];
  const documents = {
    findFirst: async ({ where }) => {
      assert.equal(where.eventId, event.id); assert.equal(where.organizationId, event.organizationId);
      if (restoreHash) return { id: 'document', storageKey: 'original-key', fileName: 'original.pdf', byteSize: 52, version: 3, state: 'ACTIVE', checksumSha256: restoreHash };
      return existing || (actions.includes('lock') && concurrent) ? { version: 1 } : null;
    },
    updateMany: async ({ where }) => {
      assert.equal(where.eventId, event.id); assert.equal(where.organizationId, event.organizationId);
      actions.push('replace'); return { count: existing ? 1 : 0 };
    },
    create: async ({ data }) => {
      assert.equal(data.eventId, event.id); assert.equal(data.organizationId, event.organizationId);
      actions.push('create'); return { ...data, version: data.version };
    },
  };
  const prisma = {
    event: { findUnique: async () => ({ ...event, status }) },
    eventRegistrationTermsDocument: documents,
    $transaction: async (fn) => {
      const result = await fn({
        $queryRaw: async (query, id, org) => {
          assert.match(query.join('?'), /FOR UPDATE/u);
          assert.equal(id, event.id); assert.equal(org, event.organizationId);
          actions.push('lock'); return missing ? [] : [{ id: event.id, status: lockedStatus }];
        },
        eventRegistrationTermsDocument: documents,
        auditLog: { create: async ({ data }) => {
          assert.equal(data.eventId, event.id); assert.equal(data.organizationId, event.organizationId);
          assert.equal(data.actorUserId, 'user'); assert.equal(data.action, restoreHash ? 'registration.terms_document_restored' : 'registration.terms_document_attached');
          actions.push('audit'); if (failAudit) throw new Error('audit failed');
        } },
      });
      actions.push('commit'); return result;
    },
  };
  const auth = { requireRole: async (user, org) => {
    assert.equal(user, 'user'); assert.equal(org, event.organizationId);
    actions.push('authorize'); if (deny) throw new Error('denied');
  } };
  const storage = {
    write: async (key) => { actions.push(['write', key]); },
    rollbackNewWrite: async (key) => { actions.push(['remove', key]); },
  };
  return { service: new RegistrationTermsDocumentService(prisma, auth, new EventMutationPolicy(), storage), actions };
}
test('recupera apenas o primeiro PDF em homologação, pronto e publicado', async () => {
  for (const status of ['HOMOLOGATION', 'READY_TO_PUBLISH', 'PUBLISHED']) {
    const h = harness({ status });
    assert.equal((await h.service.attach('user', event.id, pdf)).version, 1);
    assert.ok(h.actions.indexOf('lock') < h.actions.indexOf('create'));
    assert.ok(h.actions.indexOf('audit') < h.actions.indexOf('commit'));
  }
});
test('mantém versionamento e substituição na fundação mutável', async () => {
  for (const status of ['DRAFT', 'SETUP']) {
    const h = harness({ status, existing: true });
    assert.equal((await h.service.attach('user', event.id, pdf)).version, 2);
  }
});
test('não substitui documento após homologação nem escreve sem permissão', async () => {
  for (const options of [{ existing: true }, { deny: true }]) {
    const h = harness(options);
    await assert.rejects(h.service.attach('user', event.id, pdf));
    assert.equal(h.actions.some(Array.isArray), false);
    assert.ok(!h.actions.includes('create'));
  }
});
test('não recebe termos em evento encerrado ou cancelado', async () => {
  for (const status of ['FINISHED', 'CANCELLED']) {
    const h = harness({ status });
    await assert.rejects(h.service.attach('user', event.id, pdf));
    assert.equal(h.actions.some(Array.isArray), false);
  }
});
test('revalida documento concorrente sob lock e limpa só o upload recusado', async () => {
  const h = harness({ concurrent: true });
  await assert.rejects(h.service.attach('user', event.id, pdf));
  assert.ok(!h.actions.includes('create'));
  const write = h.actions.find(item => Array.isArray(item) && item[0] === 'write');
  assert.deepEqual(h.actions.filter(item => Array.isArray(item) && item[0] === 'remove'), [['remove', write[1]]]);
});
test('revalida mudança de estado e desaparecimento do evento sob lock', async () => {
  for (const options of [{ lockedStatus: 'CANCELLED' }, { missing: true }, { status: 'SETUP', lockedStatus: 'PUBLISHED', existing: true }]) {
    const h = harness(options);
    await assert.rejects(h.service.attach('user', event.id, pdf));
    assert.ok(!h.actions.includes('create')); assert.ok(!h.actions.includes('commit'));
    assert.equal(h.actions.filter(item => Array.isArray(item) && item[0] === 'remove').length, 1);
  }
});
test('falha de auditoria não confirma recuperação e remove somente o novo PDF', async () => {
  const h = harness({ failAudit: true });
  await assert.rejects(h.service.attach('user', event.id, pdf), /audit failed/u);
  assert.ok(!h.actions.includes('commit'));
  const write = h.actions.find(item => Array.isArray(item) && item[0] === 'write');
  assert.deepEqual(h.actions.filter(item => Array.isArray(item) && item[0] === 'remove'), [['remove', write[1]]]);
});


test('restaura os mesmos bytes no caminho da versão publicada e conserva os aceites', async () => {
  const checksum = createHash('sha256').update(Buffer.from(pdf.contentBase64, 'base64')).digest('hex');
  const h = harness({ restoreHash: checksum });
  const result = await h.service.attach('user', event.id, pdf);
  assert.equal(result.version, 3);
  assert.equal(result.fileName, 'original.pdf');
  assert.deepEqual(h.actions, ['authorize', 'lock', ['write', 'original-key'], 'audit', 'commit']);
  const refused = harness({ restoreHash: '0'.repeat(64) });
  await assert.rejects(refused.service.attach('user', event.id, pdf), /não podem ser substituídos/);
  assert.deepEqual(refused.actions, ['authorize']);
});
