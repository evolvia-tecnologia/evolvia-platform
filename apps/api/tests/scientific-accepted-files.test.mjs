import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificAuthorService } from '../dist/scientific-author.service.js';

const scope = { eventId: 'cevent00000001', organizationId: 'corganization01', reservationId: 'creservation001' };
const submissionId = 'csubmission001';
const pdf = { fileName: 'poster.pdf', contentBase64: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF').toString('base64') };
const firstKey = `${scope.organizationId}/${scope.eventId}/primeiro.pdf`;

function harness({ format = 'EPOSTER', status = 'ACCEPTED', first = firstKey, previousSecond = null, previousSlide = null, enabled = true } = {}) {
  const actions = [];
  const tx = {
    scientificSubmission: { findFirst: async () => ({ id: submissionId, status, presentationFormatCode: format, currentVersion: 1 }) },
    scientificSubmissionConfig: { findUnique: async () => ({ acceptedWorkUploadEnabled: enabled, acceptedWorkUploadDeadline: null }) },
    scientificSubmissionVersion: {
      findFirst: async () => ({ id: 'cversion000001', eposterFileKey: first, secondEposterFileKey: previousSecond, slideFileKey: previousSlide }),
      updateMany: async ({ data }) => {
        actions.push(['update', data]);
        assert.equal(Object.keys(data).length, 1);
        return { count: 1 };
      },
    },
    auditLog: { create: async ({ data }) => { actions.push(['audit', data.metadata]); } },
  };
  const prisma = { $transaction: async (callback) => { const result = await callback(tx); actions.push('commit'); return result; } };
  const files = {
    write: async (key) => { actions.push(['write', key]); },
    remove: async (key) => { actions.push(['remove', key]); },
  };
  return { service: new ScientificAuthorService(prisma, { requireConfirmedScope: async () => scope }, files), actions };
}

test('segunda versão preserva o primeiro ePoster e só substitui o próprio arquivo', async () => {
  const h = harness({ previousSecond: 'segundo-antigo.pdf' });
  const result = await h.service.uploadFollowUp('congresso', 'Bearer participante', submissionId, 'second', pdf);
  assert.equal(result.hasSecondEposter, true);
  const update = h.actions.find((item) => Array.isArray(item) && item[0] === 'update')[1];
  assert.equal(Object.keys(update).join(','), 'secondEposterFileKey');
  assert.notEqual(update.secondEposterFileKey, firstKey);
  const removed = h.actions.filter((item) => Array.isArray(item) && item[0] === 'remove');
  assert.deepEqual(removed, [['remove', 'segundo-antigo.pdf']]);
  assert.equal(h.actions.find((item) => Array.isArray(item) && item[0] === 'audit')[1].slot, 'second');
});

test('segunda versão sem o primeiro arquivo não grava nada', async () => {
  const h = harness({ first: null });
  await assert.rejects(h.service.uploadFollowUp('congresso', 'Bearer participante', submissionId, 'second', pdf), /primeiro ePoster/);
  assert.ok(!h.actions.includes('commit'));
  assert.equal(h.actions.filter((item) => Array.isArray(item) && item[0] === 'remove').length, 1);
  assert.ok(!h.actions.some((item) => Array.isArray(item) && item[1] === firstKey));
});

test('slide de trabalho aceito não mexe no ePoster', async () => {
  const h = harness({ format: 'ORAL' });
  const result = await h.service.uploadFollowUp('congresso', 'Bearer participante', submissionId, 'slide', pdf);
  assert.equal(result.hasSlide, true);
  const update = h.actions.find((item) => Array.isArray(item) && item[0] === 'update')[1];
  assert.equal(Object.keys(update).join(','), 'slideFileKey');
  assert.ok(!h.actions.some((item) => Array.isArray(item) && item[0] === 'remove' && item[1] === firstKey));
});

test('arquivo depois do aceite exige decisão e permissão do evento', async () => {
  await assert.rejects(harness({ status: 'SUBMITTED' }).service.uploadFollowUp('congresso', 'Bearer participante', submissionId, 'slide', pdf), /depois da decisão/);
  await assert.rejects(harness({ enabled: false }).service.uploadFollowUp('congresso', 'Bearer participante', submissionId, 'slide', pdf), /não está habilitado/);
});
