import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { Prisma } from '@prisma/client';
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

function matchLink(link, where) {
  if (!where) return true;
  if (where.identityHash && link.identityHash !== where.identityHash) return false;
  if (where.historyGrantSource && link.historyGrantSource !== where.historyGrantSource) return false;
  if (where.userId?.not && link.userId === where.userId.not) return false;
  if (typeof where.userId === 'string' && link.userId !== where.userId) return false;
  return true;
}

function createHarness() {
  const titular = user('titular-1', 'titular@example.test');
  const intruso = user('intruso-1', 'intruso@example.test');
  const solicitante = user('solicitante-1', 'solicitante@example.test');
  const quarto = user('quarto-1', 'quarto@example.test');
  const titularEvent = { name: 'Congresso titular', slug: 'congresso-titular', startDate: now, endDate: null, profileCode: 'SCIENTIFIC_EVENT', venue: 'SP' };
  const intrusoEvent = { name: 'Curso intruso', slug: 'curso-intruso', startDate: now, endDate: null, profileCode: 'CORPORATE_TRAINING', venue: 'RJ' };
  const state = {
    users: [titular, intruso, solicitante, quarto],
    links: [
      { id: 'link-titular', userId: titular.id, identityHash: identity.identityHash, emailHash: titular.emailHash, historyGrantSource: null, grantorEmailHash: null, verifiedAt: null, createdAt: now },
      { id: 'link-intruso', userId: intruso.id, identityHash: identity.identityHash, emailHash: intruso.emailHash, historyGrantSource: null, grantorEmailHash: null, verifiedAt: null, createdAt: new Date(now.getTime() + 1000) },
    ],
    recoveries: [],
    reservations: [
      {
        id: 'res-titular', organizationId: 'org-titular', eventId: 'event-titular',
        emailHash: titular.emailHash, identityHash: identity.identityHash, status: 'CONFIRMED',
        createdAt: now, checkIn: null, event: titularEvent, slug: titularEvent.slug,
      },
      {
        id: 'res-intruso', organizationId: 'org-intruso', eventId: 'event-intruso',
        emailHash: intruso.emailHash, identityHash: identity.identityHash, status: 'CONFIRMED',
        createdAt: now, checkIn: null, event: intrusoEvent, slug: intrusoEvent.slug,
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
      findMany: async ({ where }) => state.links.filter((link) => matchLink(link, where)),
      findFirst: async ({ where }) => state.links.find((link) => matchLink(link, where)) ?? null,
      findUnique: async ({ where }) => state.links.find((link) => (
        link.identityHash === where.identityHash_emailHash.identityHash
        && link.emailHash === where.identityHash_emailHash.emailHash
      )) ?? null,
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
          if (where.expiresAt?.gt && row.expiresAt <= where.expiresAt.gt) continue;
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
  return { dashboard, state, titular, intruso, solicitante, quarto, prisma };
}

test('vínculo recente do intruso não escolhe autoridade global nem abre histórico do titular', async () => {
  const { dashboard, state, solicitante } = createHarness();
  const request = await dashboard.requestHistoryRecovery(solicitante.id, { documentKind: 'CPF', identityDocument: cpf }, now);
  assert.equal(request.message, HISTORY_RECOVERY_MESSAGE);
  assert.equal(state.upserts.length, 0);
  assert.deepEqual(state.recoveries.map((row) => row.targetUserId).sort(), ['intruso-1', 'titular-1']);
  assert.equal(state.links.filter((link) => link.historyGrantSource === HISTORY_GRANT_RECOVERY_CONSENT).length, 0);

  const history = await dashboard.history(solicitante.id);
  assert.deepEqual(history.events, []);
  await assert.rejects(() => dashboard.enterEvent(solicitante.id, 'congresso-titular'), (error) => {
    assert.equal(error.getStatus(), 404);
    return true;
  });
  assert.equal(state.sessions.length, 0);
});

test('intruso aprovando o pedido do solicitante não lista nem abre a sessão do titular', async () => {
  const { dashboard, state, solicitante, intruso } = createHarness();
  await dashboard.requestHistoryRecovery(solicitante.id, { documentKind: 'CPF', identityDocument: cpf }, now);
  const recoveryId = state.recoveries.find((row) => row.targetUserId === intruso.id).id;
  await dashboard.confirmHistoryRecovery(intruso.id, { recoveryId }, now);
  assert.deepEqual(state.upserts[0].create.grantorEmailHashes, [hash('intruso@example.test')]);
  assert.equal(state.upserts[0].create.grantedByUserId, intruso.id);

  const history = await dashboard.history(solicitante.id);
  assert.deepEqual(history.events.map((item) => item.slug), ['curso-intruso']);
  const opened = await dashboard.enterEvent(solicitante.id, 'curso-intruso');
  assert.equal(opened.reservationId, 'res-intruso');
  await assert.rejects(() => dashboard.enterEvent(solicitante.id, 'congresso-titular'), (error) => {
    assert.equal(error.getStatus(), 404);
    return true;
  });
});

test('consentimento do titular só libera as reservas controladas por ele', async () => {
  const { dashboard, state, solicitante, titular } = createHarness();
  await dashboard.requestHistoryRecovery(solicitante.id, { documentKind: 'CPF', identityDocument: cpf }, now);
  const recoveryId = state.recoveries.find((row) => row.targetUserId === titular.id).id;
  await dashboard.confirmHistoryRecovery(titular.id, { recoveryId }, now);
  const history = await dashboard.history(solicitante.id);
  assert.deepEqual(history.events.map((item) => item.slug), ['congresso-titular']);
  const opened = await dashboard.enterEvent(solicitante.id, 'congresso-titular');
  assert.equal(opened.reservationId, 'res-titular');
});

test('cadeia de consentimento do intruso não herda o histórico do titular', async () => {
  const { dashboard, state, titular, intruso, solicitante } = createHarness();
  await dashboard.requestHistoryRecovery(intruso.id, { documentKind: 'CPF', identityDocument: cpf }, now);
  const titularToIntruso = state.recoveries.find((row) => row.targetUserId === titular.id && row.requesterUserId === intruso.id).id;
  await dashboard.confirmHistoryRecovery(titular.id, { recoveryId: titularToIntruso }, now);
  assert.deepEqual((await dashboard.history(intruso.id)).events.map((item) => item.slug), ['congresso-titular']);

  await dashboard.requestHistoryRecovery(solicitante.id, { documentKind: 'CPF', identityDocument: cpf }, now);
  assert.deepEqual(state.recoveries.filter((row) => row.requesterUserId === solicitante.id && !row.consumedAt).map((row) => row.targetUserId).sort(), [intruso.id, titular.id]);
  const recoveryId = state.recoveries.find((row) => row.requesterUserId === solicitante.id && row.targetUserId === intruso.id).id;
  await dashboard.confirmHistoryRecovery(intruso.id, { recoveryId }, now);
  assert.deepEqual((await dashboard.history(solicitante.id)).events.map((item) => item.slug), ['curso-intruso']);
  await assert.rejects(() => dashboard.enterEvent(solicitante.id, 'congresso-titular'), (error) => {
    assert.equal(error.getStatus(), 404);
    return true;
  });
});

test('primeira vinculação maliciosa só autoriza os dados do próprio vínculo', async () => {
  const { dashboard, state, solicitante, intruso } = createHarness();
  state.links = state.links.filter((link) => link.userId === intruso.id);
  await dashboard.requestHistoryRecovery(solicitante.id, { documentKind: 'CPF', identityDocument: cpf }, now);
  assert.deepEqual(state.recoveries.map((row) => row.targetUserId), [intruso.id]);
  await dashboard.confirmHistoryRecovery(intruso.id, { recoveryId: state.recoveries[0].id }, now);
  assert.deepEqual((await dashboard.history(solicitante.id)).events.map((item) => item.slug), ['curso-intruso']);
  await assert.rejects(() => dashboard.enterEvent(solicitante.id, 'congresso-titular'), (error) => {
    assert.equal(error.getStatus(), 404);
    return true;
  });
});

test('confirmação expirada ou de outra conta não concede histórico', async () => {
  const { dashboard, state, solicitante, titular } = createHarness();
  await dashboard.requestHistoryRecovery(solicitante.id, { documentKind: 'CPF', identityDocument: cpf }, now);
  const recoveryId = state.recoveries.find((row) => row.targetUserId === titular.id).id;
  await assert.rejects(() => dashboard.confirmHistoryRecovery(solicitante.id, { recoveryId }, now), (error) => {
    assert.equal(error.getStatus(), 404);
    return true;
  });
  await assert.rejects(
    () => dashboard.confirmHistoryRecovery(titular.id, { recoveryId }, new Date(now.getTime() + 31 * 60 * 1000)),
    (error) => {
      assert.equal(error.getStatus(), 404);
      return true;
    },
  );
  const history = await dashboard.history(solicitante.id);
  assert.deepEqual(history.events, []);
});

test('depois de A aprovar B, T ainda concede os próprios dados e C alcança T sem herdar A/B', async () => {
  const { dashboard, state, titular, intruso, solicitante, quarto } = createHarness();
  await dashboard.requestHistoryRecovery(solicitante.id, { documentKind: 'CPF', identityDocument: cpf }, now);
  await dashboard.confirmHistoryRecovery(intruso.id, {
    recoveryId: state.recoveries.find((row) => row.targetUserId === intruso.id && row.requesterUserId === solicitante.id).id,
  }, now);
  assert.deepEqual((await dashboard.history(solicitante.id)).events.map((item) => item.slug), ['curso-intruso']);

  const pendingTitular = state.recoveries.find((row) => row.targetUserId === titular.id && row.requesterUserId === solicitante.id && !row.consumedAt);
  await dashboard.confirmHistoryRecovery(titular.id, { recoveryId: pendingTitular.id }, now);
  assert.deepEqual((await dashboard.history(solicitante.id)).events.map((item) => item.slug).sort(), ['congresso-titular', 'curso-intruso']);

  await dashboard.requestHistoryRecovery(quarto.id, { documentKind: 'CPF', identityDocument: cpf }, now);
  const pendingC = state.recoveries.filter((row) => row.requesterUserId === quarto.id && !row.consumedAt);
  assert.deepEqual(pendingC.map((row) => row.targetUserId).sort(), ['intruso-1', 'solicitante-1', 'titular-1']);
  await dashboard.confirmHistoryRecovery(titular.id, {
    recoveryId: pendingC.find((row) => row.targetUserId === titular.id).id,
  }, now);
  assert.deepEqual((await dashboard.history(quarto.id)).events.map((item) => item.slug), ['congresso-titular']);
  await assert.rejects(() => dashboard.enterEvent(quarto.id, 'curso-intruso'), (error) => {
    assert.equal(error.getStatus(), 404);
    return true;
  });
});

test('confirmação recusa vínculo identity+email já ligado a outra conta', async () => {
  const { dashboard, state, titular, solicitante } = createHarness();
  await dashboard.requestHistoryRecovery(solicitante.id, { documentKind: 'CPF', identityDocument: cpf }, now);
  state.links.push({
    id: 'stolen',
    userId: 'outra-conta',
    identityHash: identity.identityHash,
    emailHash: hash('solicitante@example.test'),
    historyGrantSource: null,
    grantorEmailHashes: [],
  });
  await assert.rejects(
    () => dashboard.confirmHistoryRecovery(titular.id, {
      recoveryId: state.recoveries.find((row) => row.targetUserId === titular.id).id,
    }, now),
    (error) => {
      assert.equal(error.getStatus(), 409);
      return true;
    },
  );
});

test('documento inválido do autenticado responde 400 e não vaza existência', async () => {
  const { dashboard, state, solicitante } = createHarness();
  await assert.rejects(
    () => dashboard.requestHistoryRecovery(solicitante.id, { documentKind: 'CPF', identityDocument: '111.111.111-11' }, now),
    (error) => {
      assert.equal(error.getStatus(), 400);
      return true;
    },
  );
  assert.equal(state.recoveries.length, 0);
});


for (const code of ['P2034', 'P2002']) {
  test(`confirmação relê a concessão após ${code} e exige Serializable`, async () => {
    const { dashboard, state, titular, solicitante, prisma } = createHarness();
    await dashboard.requestHistoryRecovery(solicitante.id, { documentKind: 'CPF', identityDocument: cpf }, now);
    const recoveryId = state.recoveries.find((row) => row.targetUserId === titular.id).id;
    let attempts = 0;
    prisma.$transaction = async (fn, options) => {
      assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
      attempts += 1;
      if (attempts === 1) throw new Prisma.PrismaClientKnownRequestError('colisão', { code, clientVersion: '6.19.3' });
      return fn(prisma);
    };
    await dashboard.confirmHistoryRecovery(titular.id, { recoveryId }, now);
    assert.equal(attempts, 2);
    assert.equal(state.upserts.length, 1);
    assert.deepEqual(state.upserts[0].create.grantorEmailHashes, [titular.emailHash]);
  });
  test(`três conflitos ${code} respondem 409 sem consumir pedido`, async () => {
    const { dashboard, state, titular, solicitante, prisma } = createHarness();
    await dashboard.requestHistoryRecovery(solicitante.id, { documentKind: 'CPF', identityDocument: cpf }, now);
    const recovery = state.recoveries.find((row) => row.targetUserId === titular.id);
    let attempts = 0;
    prisma.$transaction = async () => {
      attempts += 1;
      throw new Prisma.PrismaClientKnownRequestError('colisão', { code, clientVersion: '6.19.3' });
    };
    await assert.rejects(() => dashboard.confirmHistoryRecovery(titular.id, { recoveryId: recovery.id }, now), (error) => error.getStatus() === 409);
    assert.equal(attempts, 3);
    assert.equal(recovery.consumedAt, null);
    assert.equal(state.upserts.length, 0);
  });
}

test('erro não concorrente não é repetido e confirmante sem e-mail verificado não concede', async () => {
  const { dashboard, state, titular, solicitante, prisma } = createHarness();
  await dashboard.requestHistoryRecovery(solicitante.id, { documentKind: 'CPF', identityDocument: cpf }, now);
  const recovery = state.recoveries.find((row) => row.targetUserId === titular.id);
  const transaction = prisma.$transaction;
  const failure = new Error('falha de conexão');
  let attempts = 0;
  prisma.$transaction = async () => { attempts += 1; throw failure; };
  await assert.rejects(() => dashboard.confirmHistoryRecovery(titular.id, { recoveryId: recovery.id }, now), (error) => error === failure);
  assert.equal(attempts, 1);
  prisma.$transaction = transaction;
  titular.emailVerifiedAt = null;
  await assert.rejects(() => dashboard.confirmHistoryRecovery(titular.id, { recoveryId: recovery.id }, now), (error) => error.getStatus() === 404);
  assert.equal(recovery.consumedAt, null);
  assert.equal(state.upserts.length, 0);
});
