import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ParticipantDashboardService } from '../dist/participant-dashboard.service.js';
import { HISTORY_GRANT_RECOVERY_CONSENT, HISTORY_RECOVERY_MESSAGE, participantDocumentIdentity } from '../dist/participant-history.policy.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const cpf = '390.533.447-05';
const identity = participantDocumentIdentity({ documentKind: 'CPF', identityDocument: cpf });
const now = new Date('2026-10-22T13:00:00Z');

function user(id, email) {
  return { id, email, name: id, emailVerifiedAt: now, emailHash: hash(email) };
}

function matchReservation(item, where) {
  if (!where) return true;
  if (where.AND) return where.AND.every((part) => matchReservation(item, part));
  if (where.OR) return where.OR.some((part) => matchReservation(item, part));
  if (where.identityHash?.in && !where.identityHash.in.includes(item.identityHash)) return false;
  if (typeof where.identityHash === 'string' && item.identityHash !== where.identityHash) return false;
  if (where.emailHash && item.emailHash !== where.emailHash) return false;
  if (where.status && item.status !== where.status) return false;
  if (where.event?.slug && item.slug !== where.event.slug) return false;
  return true;
}

function createHarness() {
  const owner = user('owner-1', 'titular@example.test');
  const attacker = user('attacker-1', 'solicitante@example.test');
  const ownerEvent = { name: 'Congresso titular', slug: 'congresso-titular', startDate: now, endDate: null, profileCode: 'SCIENTIFIC_EVENT', venue: 'SP' };
  const attackerEvent = { name: 'Curso solicitante', slug: 'curso-solicitante', startDate: now, endDate: null, profileCode: 'CORPORATE_TRAINING', venue: 'RJ' };
  const state = {
    users: [owner, attacker],
    links: [
      { id: 'link-owner', userId: owner.id, identityHash: identity.identityHash, emailHash: owner.emailHash, historyGrantSource: null, verifiedAt: null, createdAt: now },
      { id: 'link-attacker', userId: attacker.id, identityHash: identity.identityHash, emailHash: attacker.emailHash, historyGrantSource: null, verifiedAt: null, createdAt: new Date(now.getTime() + 1000) },
    ],
    recoveries: [],
    reservations: [
      {
        id: 'res-owner', organizationId: 'org-titular', eventId: 'event-titular',
        emailHash: owner.emailHash, identityHash: identity.identityHash, status: 'CONFIRMED',
        createdAt: now, checkIn: null, event: ownerEvent, slug: ownerEvent.slug,
      },
      {
        id: 'res-attacker', organizationId: 'org-solicitante', eventId: 'event-solicitante',
        emailHash: attacker.emailHash, identityHash: identity.identityHash, status: 'CONFIRMED',
        createdAt: now, checkIn: null, event: attackerEvent, slug: attackerEvent.slug,
      },
    ],
    sessions: [],
    upserts: [],
  };

  const prisma = {
    user: {
      findUnique: async ({ where }) => state.users.find((item) => item.id === where.id) ?? null,
    },
    participantIdentityLink: {
      findMany: async ({ where }) => state.links.filter((link) => {
        if (where.userId && link.userId !== where.userId) return false;
        if (where.historyGrantSource && link.historyGrantSource !== where.historyGrantSource) return false;
        return true;
      }),
      findFirst: async ({ where }) => state.links.find((link) => {
        if (where.identityHash && link.identityHash !== where.identityHash) return false;
        if (where.historyGrantSource && link.historyGrantSource !== where.historyGrantSource) return false;
        if (where.userId?.not && link.userId === where.userId.not) return false;
        return true;
      }) ?? null,
      upsert: async ({ where, create, update }) => {
        state.upserts.push({ where, create, update });
        const existing = state.links.find((link) => link.identityHash === where.identityHash_emailHash.identityHash && link.emailHash === where.identityHash_emailHash.emailHash);
        if (existing) Object.assign(existing, update);
        else state.links.push({ id: `link-${state.links.length}`, ...create });
        return existing ?? create;
      },
    },
    participantHistoryRecovery: {
      count: async () => state.recoveries.length,
      findMany: async ({ where }) => state.recoveries.filter((row) => {
        if (where.targetUserId && row.targetUserId !== where.targetUserId) return false;
        if (where.consumedAt === null && row.consumedAt) return false;
        return true;
      }),
      findFirst: async ({ where }) => state.recoveries.find((row) => {
        if (where.id && row.id !== where.id) return false;
        if (where.targetUserId && row.targetUserId !== where.targetUserId) return false;
        if (where.consumedAt === null && row.consumedAt) return false;
        return true;
      }) ?? null,
      findUnique: async ({ where }) => state.recoveries.find((row) => row.tokenHash === where.tokenHash) ?? null,
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const row of state.recoveries) {
          if (where.id && row.id !== where.id) continue;
          if (where.requesterUserId && row.requesterUserId !== where.requesterUserId) continue;
          if (where.consumedAt === null && row.consumedAt) continue;
          if (where.targetUserId && row.targetUserId !== where.targetUserId) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
      create: async ({ data }) => {
        const row = { id: `rec-${state.recoveries.length + 1}`, consumedAt: null, ...data };
        state.recoveries.push(row);
        return row;
      },
    },
    eventRegistrationReservation: {
      findMany: async ({ where }) => state.reservations.filter((item) => matchReservation(item, where)),
      findFirst: async ({ where }) => state.reservations.find((item) => matchReservation(item, where)) ?? null,
    },
    auditLog: { create: async () => ({ id: 'audit' }) },
    $transaction: async (fn) => fn(prisma),
  };

  const dashboard = new ParticipantDashboardService(prisma, {
    createSessionForReservation: async (eventId, organizationId, reservationId) => {
      state.sessions.push({ eventId, organizationId, reservationId });
      return { token: 'session', eventId, reservationId };
    },
  });
  return { dashboard, state, owner, attacker };
}

test('reserva confirmada do solicitante não vira dono nem abre histórico ou sessão alheia', async () => {
  const { dashboard, state, attacker } = createHarness();
  const request = await dashboard.requestHistoryRecovery(attacker.id, { documentKind: 'CPF', identityDocument: cpf }, now);
  assert.equal(request.message, HISTORY_RECOVERY_MESSAGE);
  assert.equal(state.upserts.length, 0);
  assert.equal(state.links.filter((link) => link.historyGrantSource === HISTORY_GRANT_RECOVERY_CONSENT).length, 0);
  assert.equal(state.recoveries[0]?.targetUserId, 'owner-1');
  assert.equal(state.recoveries[0]?.requesterUserId, attacker.id);

  const history = await dashboard.history(attacker.id);
  assert.deepEqual(history.events, []);
  assert.equal(history.pendingConfirmations.length, 0);

  const mine = await dashboard.get(attacker.id);
  assert.deepEqual(mine.events.map((item) => item.slug), ['curso-solicitante']);

  await assert.rejects(() => dashboard.enterEvent(attacker.id, 'congresso-titular'), (error) => {
    assert.equal(error.getStatus(), 404);
    return true;
  });
  assert.equal(state.sessions.length, 0);
});

test('só o consentimento do dono ligado autoriza histórico e sessão do outro e-mail', async () => {
  const { dashboard, state, attacker, owner } = createHarness();
  await dashboard.requestHistoryRecovery(attacker.id, { documentKind: 'CPF', identityDocument: cpf }, now);
  const recoveryId = state.recoveries[0].id;
  await dashboard.confirmHistoryRecovery(owner.id, { recoveryId }, now);
  assert.equal(state.upserts[0].create.historyGrantSource, HISTORY_GRANT_RECOVERY_CONSENT);

  const history = await dashboard.history(attacker.id);
  assert.deepEqual(history.events.map((item) => item.slug).sort(), ['congresso-titular', 'curso-solicitante']);

  const opened = await dashboard.enterEvent(attacker.id, 'congresso-titular');
  assert.equal(opened.reservationId, 'res-owner');
  await assert.rejects(() => dashboard.confirmHistoryRecovery(owner.id, { recoveryId }, now), (error) => {
    assert.equal(error.getStatus(), 404);
    return true;
  });
});

test('confirmação expirada ou de outra conta não concede histórico', async () => {
  const { dashboard, state, attacker, owner } = createHarness();
  await dashboard.requestHistoryRecovery(attacker.id, { documentKind: 'CPF', identityDocument: cpf }, now);
  const recoveryId = state.recoveries[0].id;
  await assert.rejects(() => dashboard.confirmHistoryRecovery(attacker.id, { recoveryId }, now), (error) => {
    assert.equal(error.getStatus(), 404);
    return true;
  });
  await assert.rejects(
    () => dashboard.confirmHistoryRecovery(owner.id, { recoveryId }, new Date(now.getTime() + 31 * 60 * 1000)),
    (error) => {
      assert.equal(error.getStatus(), 404);
      return true;
    },
  );
  const history = await dashboard.history(attacker.id);
  assert.deepEqual(history.events, []);
});

test('documento inválido do autenticado responde 400 e não vaza existência', async () => {
  const { dashboard, state, attacker } = createHarness();
  await assert.rejects(
    () => dashboard.requestHistoryRecovery(attacker.id, { documentKind: 'CPF', identityDocument: '111.111.111-11' }, now),
    (error) => {
      assert.equal(error.getStatus(), 400);
      return true;
    },
  );
  assert.equal(state.recoveries.length, 0);
});
