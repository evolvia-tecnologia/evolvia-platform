// G5.8: duas conexões PostgreSQL reais contra a migration aditiva.
// Nenhum transporte externo: este teste prova a exclusão mútua DURÁVEL do claim.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test, { after } from 'node:test';
import { PrismaClient } from '@prisma/client';
import {
  claimScientificNoticeDispatch,
  completeScientificNoticeDispatch,
} from '../dist/scientific-notice-dispatch.js';

const a = new PrismaClient();
const b = new PrismaClient();
const run = randomBytes(12).toString('hex');
const organizationId = `g58-pg-${run}`;
const key = (suffix) => createHash('sha256').update(`${run}:${suffix}`).digest('hex');
const input = (suffix, versionNumber = 1) => ({
  idempotencyKey: key(suffix),
  organizationId,
  eventId: 'event-pg-scientific',
  submissionId: 'submission-pg-scientific',
  versionNumber,
});
const olderThanLease = () => new Date(Date.now() - 10 * 60_000);

after(async () => {
  try { await a.scientificNoticeDispatch.deleteMany({ where: { organizationId } }); }
  finally { await Promise.all([a.$disconnect(), b.$disconnect()]); }
});

test('duas conexões disputam uma reserva: exatamente uma vence e ACCEPTED não reenvia', async () => {
  const one = input('concurrent');
  const results = await Promise.all([
    claimScientificNoticeDispatch(a, one),
    claimScientificNoticeDispatch(b, one),
  ]);
  assert.deepEqual(results.slice().sort(), [false, true]);
  const row = await a.scientificNoticeDispatch.findUniqueOrThrow({
    where: { idempotencyKey: one.idempotencyKey },
  });
  assert.equal(row.attempts, 1);
  assert.equal(row.status, 'PROCESSING');
  await completeScientificNoticeDispatch(a, one.idempotencyKey, 'ACCEPTED');
  assert.equal(await claimScientificNoticeDispatch(b, one), false);
  assert.equal((await b.scientificNoticeDispatch.findUniqueOrThrow({
    where: { idempotencyKey: one.idempotencyKey },
  })).status, 'ACCEPTED');
});

test('crash com resultado de transporte incerto vira UNKNOWN e não autoriza retry automático', async () => {
  const one = input('crash');
  assert.equal(await claimScientificNoticeDispatch(a, one), true);
  // Simula fim do lease depois de POST possivelmente aceito mas antes da persistência.
  await a.scientificNoticeDispatch.update({
    where: { idempotencyKey: one.idempotencyKey }, data: { claimedAt: olderThanLease() },
  });
  const alerts = [];
  const onUnknown = (...args) => alerts.push(args);
  const now = new Date();
  assert.deepEqual(await Promise.all([
    claimScientificNoticeDispatch(a, one, now, onUnknown),
    claimScientificNoticeDispatch(b, one, now, onUnknown),
  ]), [false, false]);
  assert.deepEqual(alerts, [[]], 'apenas o vencedor alerta, sem identificadores');
  assert.equal(await claimScientificNoticeDispatch(b, one, now, onUnknown), false);
  assert.equal(alerts.length, 1);
  const row = await a.scientificNoticeDispatch.findUniqueOrThrow({
    where: { idempotencyKey: one.idempotencyKey },
  });
  assert.equal(row.status, 'UNKNOWN');
  assert.equal(await claimScientificNoticeDispatch(a, one), false);
  assert.equal(row.attempts, 1);
});

test('rejeição definitiva permite apenas um retry com compare-and-set por vez e máximo três', async () => {
  const one = input('rejected');
  assert.equal(await claimScientificNoticeDispatch(a, one), true);
  for (const expected of [2, 3]) {
    await completeScientificNoticeDispatch(a, one.idempotencyKey, 'FAILED');
    await a.scientificNoticeDispatch.update({
      where: { idempotencyKey: one.idempotencyKey }, data: { claimedAt: olderThanLease() },
    });
    const winners = await Promise.all([
      claimScientificNoticeDispatch(a, one),
      claimScientificNoticeDispatch(b, one),
    ]);
    assert.deepEqual(winners.slice().sort(), [false, true]);
    const state = await a.scientificNoticeDispatch.findUniqueOrThrow({
      where: { idempotencyKey: one.idempotencyKey },
    });
    assert.equal(state.attempts, expected);
    assert.equal(state.status, 'PROCESSING');
  }
  await completeScientificNoticeDispatch(b, one.idempotencyKey, 'FAILED');
  await a.scientificNoticeDispatch.update({
    where: { idempotencyKey: one.idempotencyKey }, data: { claimedAt: olderThanLease() },
  });
  assert.equal(await claimScientificNoticeDispatch(a, one), false);
  assert.equal((await a.scientificNoticeDispatch.findUniqueOrThrow({
    where: { idempotencyKey: one.idempotencyKey },
  })).attempts, 3);
});

test('idempotencyKey distingue versões e valida escopo depois de conflito', async () => {
  const first = input('scoped', 1);
  const otherVersion = input('scoped-v2', 2);
  assert.equal(await claimScientificNoticeDispatch(a, first), true);
  assert.equal(await claimScientificNoticeDispatch(b, otherVersion), true);
  await assert.rejects(() => claimScientificNoticeDispatch(b, {
    ...first, eventId: 'event-alheio',
  }), /scope_mismatch/u);
  assert.equal((await a.scientificNoticeDispatch.count({
    where: { idempotencyKey: { in: [first.idempotencyKey, otherVersion.idempotencyKey] }, organizationId, submissionId: first.submissionId },
  })), 2);
});
