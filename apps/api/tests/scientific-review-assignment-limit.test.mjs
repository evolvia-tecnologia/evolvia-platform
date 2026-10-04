import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificReviewsService } from '../dist/scientific-reviews.service.js';

test('distribuições concorrentes respeitam o teto após lock do trabalho no tenant', async () => {
  let count = 0;
  let tail = Promise.resolve();
  const locks = [];
  const prisma = {
    scientificSubmission: { findFirst: async () => ({ id: 'submission', status: 'UNDER_REVIEW', authors: [] }) },
    scientificSubmissionVersion: { findFirst: async () => ({ id: 'version' }) },
    scientificPerson: { findFirst: async ({ where }) => ({ id: where.id, email: 'reviewer@example.test' }) },
    async $transaction(callback) {
      let release;
      try {
        return await callback({
          async $queryRaw(query) {
            const preceding = tail;
            tail = new Promise((resolve) => { release = resolve; });
            await preceding;
            locks.push(query);
            return [{ id: 'submission' }];
          },
          scientificReviewAssignment: {
            findFirst: async () => null,
            count: async () => count,
            create: async () => { count += 1; return { id: `assignment-${count}` }; },
          },
          scientificSubmissionConfig: { findUnique: async () => ({ reviewersPerSubmission: 1 }) },
          auditLog: { create: async () => {} },
        });
      } finally { release?.(); }
    },
  };
  const service = new ScientificReviewsService(prisma, {}, {});
  service.requireMutableEditor = async () => ({ id: 'event', organizationId: 'org' });
  service.getManagement = async () => ({ count });
  const results = await Promise.allSettled(['reviewer1', 'reviewer2'].map((reviewerPersonId) =>
    service.createAssignment('editor', 'event', { submissionId: 'submission', versionId: 'version', reviewerPersonId }),
  ));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(count, 1);
  assert.match(results.find((r) => r.status === 'rejected').reason.message, /limite configurado/u);
  assert.equal(locks.length, 2);
  assert.match(locks[0].sql, /FOR UPDATE/u);
  assert.deepEqual(locks[0].values, ['submission', 'event', 'org']);
});
