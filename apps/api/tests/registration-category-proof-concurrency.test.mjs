import assert from 'node:assert/strict';
import test from 'node:test';
import { RegistrationCategoryProofService } from '../dist/registration-category-proof.service.js';

const checksum = 'a'.repeat(64);
function fixture({ currentChecksum = checksum, state = 'PENDING_REVIEW', auditFails = false } = {}) {
  let row = { id: 'proof', eventId: 'event', organizationId: 'org', checksumSha256: currentChecksum, state };
  const audit = [];
  const prisma = { async $transaction(callback) {
    const before = { ...row };
    try {
      return await callback({
        eventRegistrationCategoryProof: { async updateMany({ where, data }) {
          if (!Object.entries(where).every(([key, value]) => row[key] === value)) return { count: 0 };
          row = { ...row, ...data }; return { count: 1 };
        } },
        auditLog: { async create({ data }) { if (auditFails) throw new Error('audit unavailable'); audit.push(data); } },
      });
    } catch (error) { row = before; throw error; }
  } };
  const service = new RegistrationCategoryProofService(prisma, {}, {});
  service.organizerEvent = async () => ({ id: 'event', organizationId: 'org' });
  service.reservation = async () => ({ protocol: 'EVO-0123456789ABCDEF', categoryProof: { id: 'proof' } });
  return { service, audit, row: () => row };
}
const review = (service, expectedChecksum = checksum) => service.review('reviewer', 'event', 'EVO-0123456789ABCDEF', { decision: 'APPROVED', expectedChecksum });

test('aprovação exige a identidade do PDF aberto pelo revisor', async () => {
  const f = fixture();
  await assert.rejects(review(f.service, null), /Abra o PDF/u);
  assert.equal(f.row().state, 'PENDING_REVIEW');
});

test('reenvio diferente não recebe a decisão do arquivo anterior', async () => {
  const f = fixture({ currentChecksum: 'b'.repeat(64) });
  await assert.rejects(review(f.service), /mudou ou já foi analisado/u);
  assert.equal(f.row().state, 'PENDING_REVIEW');
  assert.equal(f.audit.length, 0);
});

test('decisão aplicada a arquivo pendente grava seu checksum no mesmo audit', async () => {
  const f = fixture();
  await review(f.service);
  assert.equal(f.row().state, 'APPROVED');
  assert.equal(f.audit[0].metadata.checksumSha256, checksum);
  await assert.rejects(review(f.service), /mudou ou já foi analisado/u);
  assert.equal(f.audit.length, 1);
});

test('falha da auditoria reverte a decisão', async () => {
  const f = fixture({ auditFails: true });
  await assert.rejects(review(f.service), /audit unavailable/u);
  assert.equal(f.row().state, 'PENDING_REVIEW');
});

test('reenvio perde a disputa para aprovação e remove apenas o novo arquivo', async () => {
  const removed = [];
  const previous = { id: 'proof', state: 'PENDING_REVIEW', storageKey: 'old.pdf', checksumSha256: checksum };
  let predicate;
  const service = new RegistrationCategoryProofService({
    $transaction: (callback) => callback({
      eventRegistrationCategoryProof: {
        findUnique: async () => previous,
        updateMany: async ({ where }) => { predicate = where; return { count: 0 }; },
      },
    }),
  }, {}, { write: async () => {}, remove: async (key) => removed.push(key) });
  service.publishedEvent = async () => ({ id: 'event', organizationId: 'org' });
  service.reservation = async () => ({ id: 'reservation', protocol: 'EVO-0123456789ABCDEF', status: 'PENDING_PAYMENT', expiresAt: null, checkout: null, category: { proofRequirement: 'REQUIRED_BEFORE_PAYMENT' }, categoryProof: previous });
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
  await assert.rejects(service.attach('event', 'EVO-0123456789ABCDEF', { fileName: 'proof.pdf', contentBase64: pdf.toString('base64') }), /mudou durante o envio/u);
  assert.equal(predicate.state, 'PENDING_REVIEW');
  assert.equal(predicate.storageKey, 'old.pdf');
  assert.equal(removed.length, 1);
  assert.notEqual(removed[0], 'old.pdf');
});
