import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificAuthorNoticeMailService } from '../dist/scientific-author-notice-mail.service.js';

const scope = { organizationId: 'org-science', eventId: 'event-science', reservationId: 'reservation-science' };
const submissionId = 'scientific-submission-001';
const keys = [
  'EVOLVIA_SCIENTIFIC_NOTICE_DELIVERY_ENABLED', 'EVOLVIA_EMAIL_DELIVERY_ENDPOINT',
  'EVOLVIA_EMAIL_DELIVERY_TOKEN', 'EVOLVIA_EMAIL_FROM', 'EVOLVIA_PUBLIC_BASE_URL',
  'EVOLVIA_SCIENTIFIC_NOTICE_ORGANIZATION_ID', 'EVOLVIA_SCIENTIFIC_NOTICE_EVENT_ID',
  'EVOLVIA_SCIENTIFIC_NOTICE_NOT_BEFORE',
];
function config() {
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.EVOLVIA_SCIENTIFIC_NOTICE_DELIVERY_ENABLED = '1';
  process.env.EVOLVIA_SCIENTIFIC_NOTICE_ORGANIZATION_ID = scope.organizationId;
  process.env.EVOLVIA_SCIENTIFIC_NOTICE_EVENT_ID = scope.eventId;
  process.env.EVOLVIA_SCIENTIFIC_NOTICE_NOT_BEFORE = '2026-10-27T00:00:00Z';
  process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT = 'https://email-gateway.example.test/messages';
  process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN = 'test-token-only';
  process.env.EVOLVIA_EMAIL_FROM = 'secretaria@example.test';
  process.env.EVOLVIA_PUBLIC_BASE_URL = 'https://eventos.example.test';
  return () => { for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  } };
}
function harness({ scientific = true, confirmed = true, authors = null, pending = [], slug = 'congresso' } = {}) {
  const state = { audits: [], transport: [], reads: [], pending, dispatches: new Map() };
  const prisma = {
    scientificAuthorNotice: {
      findFirst: async ({ where }) => {
        state.reads.push(where);
        return { kind: 'SUBMITTED' };
      },
      findMany: async ({ where, cursor, take }) => {
        state.reads.push(where);
        const start = cursor ? pending.findIndex((item) => item.id === cursor.id) + 1 : 0;
        return pending.slice(start, start + take);
      },
    },
    scientificSubmission: { findFirst: async ({ where }) => {
      state.reads.push(where);
      return scientific ? {
        title: 'Pesquisa científica', currentVersion: 1,
        event: { name: 'Congresso Evolvia', slug },
        ownerReservation: { registrationData: { full_name: 'Ana Pesquisadora' }, status: confirmed ? 'CONFIRMED' : 'CANCELLED' },
        authors: authors ?? [
          { person: { email: 'ana@example.test' } },
          { person: { email: 'coautor@example.test' } },
          { person: { email: 'ANA@example.test' } },
        ],
      } : null;
    } },
    scientificNoticeDispatch: {
      create: async ({ data }) => {
        if (state.dispatches.has(data.idempotencyKey)) {
          throw Object.assign(new Error('unique conflict'), { code: 'P2002' });
        }
        state.dispatches.set(data.idempotencyKey, { ...data });
        return { ...data };
      },
      findUnique: async ({ where }) => state.dispatches.get(where.idempotencyKey) ?? null,
      updateMany: async ({ where, data }) => {
        const row = state.dispatches.get(where.idempotencyKey);
        if (!row || (where.status && row.status !== where.status)) return { count: 0 };
        if (where.attempts?.lt !== undefined && row.attempts >= where.attempts.lt) return { count: 0 };
        if (where.claimedAt?.lte && row.claimedAt.getTime() > where.claimedAt.lte.getTime()) return { count: 0 };
        Object.assign(row, data, {
          attempts: data.attempts?.increment ? row.attempts + data.attempts.increment : row.attempts,
        });
        return { count: 1 };
      },
    },
    auditLog: {
      findFirst: async ({ where }) => state.audits.find((row) => row.action === where.action &&
        row.entityId === where.entityId && where.AND.every((filter) =>
          row.metadata[filter.metadata.path[0]] === filter.metadata.equals)) ?? null,
      count: async ({ where }) => state.audits.filter((row) => row.action === where.action &&
        row.entityId === where.entityId && where.AND.every((filter) =>
          row.metadata[filter.metadata.path[0]] === filter.metadata.equals)).length,
      create: async ({ data }) => { state.audits.push(data); return { id: String(state.audits.length) }; },
    },
  };
  const poster = async (url, body, headers) => {
    state.transport.push({ url, body: JSON.parse(body), headers });
    return 202;
  };
  return { service: new ScientificAuthorNoticeMailService(prisma), state, poster };
}

test('sem habilitação explícita nem consulta ao banco ou envio', async () => {
  const h = harness();
  delete process.env.EVOLVIA_SCIENTIFIC_NOTICE_DELIVERY_ENABLED;
  await h.service.notify(scope, submissionId, 1, h.poster);
  assert.equal(h.state.reads.length, 0);
  assert.equal(h.state.transport.length, 0);
});

test('após commit, entrega isoladamente a autor e coautor; repetições não reenviam', async () => {
  const restore = config();
  try {
    const h = harness();
    await h.service.notify(scope, submissionId, 1, h.poster);
    assert.equal(h.state.transport.length, 2);
    assert.deepEqual(h.state.transport.map((x) => x.body.message.to), [['ana@example.test'], ['coautor@example.test']]);
    assert.equal(h.state.transport[0].body.message.text.includes('submetido por Ana Pesquisadora'), true);
    assert.equal(h.state.audits.length, 2);
    assert.ok(h.state.audits.every((audit) => audit.metadata.providerAccepted && audit.metadata.delivered === false && audit.metadata.received === false));
    assert.ok(h.state.audits.every((audit) => !JSON.stringify(audit).includes('@')));
    assert.match(h.state.transport[0].headers['Idempotency-Key'], /^[0-9a-f]{64}$/u);
    assert.notEqual(h.state.transport[0].headers['Idempotency-Key'], h.state.transport[1].headers['Idempotency-Key']);
    await h.service.notify(scope, submissionId, 1, h.poster);
    assert.equal(h.state.transport.length, 2);
  } finally { restore(); }
});

test('payload inválido não consome claim SQL nem bloqueia retry após correção', async () => {
  const restore = config();
  try {
    const h = harness({ slug: 'slug inválido' });
    await h.service.notify(scope, submissionId, 1, h.poster);
    assert.equal(h.state.transport.length, 0);
    assert.equal(h.state.dispatches.size, 0, 'nenhum PROCESSING sem mensagem válida');
    assert.equal(h.state.audits.length, 0);
    h.service.prisma.scientificSubmission.findFirst = async () => ({
      title: 'Pesquisa científica', currentVersion: 1,
      event: { name: 'Congresso Evolvia', slug: 'congresso' },
      ownerReservation: { registrationData: { full_name: 'Ana Pesquisadora' }, status: 'CONFIRMED' },
      authors: [{ person: { email: 'ana@example.test' } }],
    });
    await h.service.notify(scope, submissionId, 1, h.poster);
    assert.equal(h.state.transport.length, 1, 'corrigir payload libera envio sem intervenção no banco');
    assert.equal(h.state.dispatches.size, 1);
    assert.ok([...h.state.dispatches.values()].every((row) => row.status === 'ACCEPTED'));
  } finally { restore(); }
});

test('HTTP 503 torna resultado incerto e impede reenvio cego por outras instâncias', async () => {
  const restore = config();
  try {
    const h = harness();
    const rejected = async () => 503;
    for (let i = 0; i < 4; i += 1) await h.service.notify(scope, submissionId, 1, rejected);
    assert.equal(h.state.audits.length, 2, '503 pode ter sido aceito antes da resposta; sem retry automático');
    assert.equal(h.state.dispatches.size, 2);
    assert.ok([...h.state.dispatches.values()].every((entry) => entry.status === 'UNKNOWN'));
    assert.ok(h.state.audits.every((audit) => audit.action === 'scientific.author_email_provider_failed'));
    assert.ok(h.state.audits.every((audit) => audit.metadata.delivered === false));
    assert.ok(h.state.audits.every((audit) => audit.metadata.httpStatus === 503));
  } finally { restore(); }
});


test('duas instâncias concorrentes reservam uma única entrega lógica no banco', async () => {
  const restore = config();
  try {
    const h = harness();
    const replica = new ScientificAuthorNoticeMailService(h.service.prisma);
    await Promise.all([
      h.service.notify(scope, submissionId, 1, h.poster),
      replica.notify(scope, submissionId, 1, h.poster),
    ]);
    assert.equal(h.state.transport.length, 2, 'uma mensagem por autor, nunca duas por réplica');
    assert.equal(h.state.audits.length, 2);
    assert.equal(h.state.dispatches.size, 2);
    assert.ok([...h.state.dispatches.values()].every((row) => row.status === 'ACCEPTED'));
    await replica.notify(scope, submissionId, 1, h.poster);
    assert.equal(h.state.transport.length, 2, 'replay continua idempotente');
  } finally { restore(); }
});

test('timeout após possível aceite preserva UNKNOWN mesmo após reiniciar serviço', async () => {
  const restore = config();
  try {
    const h = harness();
    let calls = 0;
    const ambiguous = async () => { calls += 1; throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); };
    await h.service.notify(scope, submissionId, 1, ambiguous);
    assert.equal(calls, 2);
    const replica = new ScientificAuthorNoticeMailService(h.service.prisma);
    await replica.notify(scope, submissionId, 1, ambiguous);
    assert.equal(calls, 2, 'resposta perdida não autoriza segundo POST');
    assert.ok([...h.state.dispatches.values()].every((row) => row.status === 'UNKNOWN'));
    assert.ok(h.state.audits.every((row) => row.metadata.received === false));
  } finally { restore(); }
});

test('crash antes de gravar resultado deixa PROCESSING que expira em UNKNOWN, nunca em retry', async () => {
  const restore = config();
  try {
    const h = harness();
    const original = h.service.prisma.scientificNoticeDispatch.updateMany;
    h.service.prisma.scientificNoticeDispatch.updateMany = async () => { throw new Error('database lost after POST'); };
    await h.service.notify(scope, submissionId, 1, h.poster);
    assert.equal(h.state.transport.length, 2);
    h.service.prisma.scientificNoticeDispatch.updateMany = original;
    for (const row of h.state.dispatches.values()) row.claimedAt = new Date(0);
    const replica = new ScientificAuthorNoticeMailService(h.service.prisma);
    await replica.notify(scope, submissionId, 1, h.poster);
    assert.equal(h.state.transport.length, 2);
    assert.ok([...h.state.dispatches.values()].every((row) => row.status === 'UNKNOWN'));
  } finally { restore(); }
});

test('rejeição 422 comprovada permite no máximo três tentativas com backoff e a mesma chave', async () => {
  const restore = config();
  try {
    const h = harness();
    let calls = 0;
    const denied = async () => { calls += 1; return 422; };
    for (let n = 0; n < 4; n += 1) {
      for (const row of h.state.dispatches.values()) row.claimedAt = new Date(0);
      await h.service.notify(scope, submissionId, 1, denied);
    }
    assert.equal(calls, 6);
    assert.equal(h.state.dispatches.size, 2);
    assert.ok([...h.state.dispatches.values()].every((row) => row.attempts === 3 && row.status === 'FAILED'));
    assert.equal(h.state.audits.length, 6);
  } finally { restore(); }
});

test('não envia para submissão inacessível fora do escopo confirmado', async () => {
  const restore = config();
  try {
    const h = harness({ scientific: false });
    await h.service.notify(scope, submissionId, 1, h.poster);
    assert.equal(h.state.transport.length, 0);
    const q = h.state.reads[1];
    assert.equal(q.organizationId, scope.organizationId);
    assert.equal(q.eventId, scope.eventId);
    assert.equal(q.ownerReservationId, scope.reservationId);
    assert.equal(q.currentVersion, 1);
  } finally { restore(); }
});

test('não despacha após cancelamento da inscrição, mesmo se o aviso persistiu', async () => {
  const restore = config();
  try {
    const h = harness({ confirmed: false });
    await h.service.notify(scope, submissionId, 1, h.poster);
    assert.equal(h.state.transport.length, 0);
    assert.equal(h.state.audits.length, 0);
  } finally { restore(); }
});

test('permissão de envio em outro evento ou organização não é herdada', async () => {
  const restore = config();
  try {
    const h = harness();
    await h.service.notify({ ...scope, eventId: 'outro-evento' }, submissionId, 1, h.poster);
    await h.service.notify({ ...scope, organizationId: 'outra-organizacao' }, submissionId, 1, h.poster);
    assert.equal(h.state.reads.length, 0);
    assert.equal(h.state.transport.length, 0);
  } finally { restore(); }
});

test('envia no máximo quatro destinatários simultaneamente', async () => {
  const restore = config();
  try {
    const authors = Array.from({ length: 9 }, (_, index) => ({ person: { email: `autor${index}@example.test` } }));
    const h = harness({ authors });
    let active = 0;
    let highest = 0;
    const slow = async () => {
      active += 1;
      highest = Math.max(highest, active);
      await Promise.resolve();
      active -= 1;
      return 202;
    };
    await h.service.notify(scope, submissionId, 1, slow);
    assert.equal(h.state.audits.length, 9);
    assert.equal(highest, 4);
  } finally { restore(); }
});

test('worker retoma avisos persistidos por organização/evento sem reenviar aceitos', async () => {
  const restore = config();
  try {
    const pending = [
      { id: 'notice1', ...scope, ownerReservationId: scope.reservationId, submissionId: 'scientific-submission-001', versionNumber: 1 },
      { id: 'notice2', ...scope, ownerReservationId: scope.reservationId, submissionId: 'scientific-submission-002', versionNumber: 1 },
    ];
    const h = harness({ pending });
    const first = await h.service.dispatchPending(h.poster);
    assert.equal(first, 2);
    assert.equal(h.state.transport.length, 4);
    const again = await h.service.dispatchPending(h.poster);
    assert.equal(again, 0, 'cursor não deve reprocessar o histórico a cada minuto');
    assert.equal(h.state.transport.length, 4);
    // A varredura periódica recupera avisos ainda sem recibo e respeita
    // a deduplicação dos que o provedor já aceitou.
    h.service.revisitAt = 0;
    const replay = await h.service.dispatchPending(h.poster);
    assert.equal(replay, 2);
    assert.equal(h.state.transport.length, 4);
    const scans = h.state.reads.filter((row) => row.recordedAt?.gte);
    assert.ok(scans.length >= 2);
    assert.ok(scans.every((row) => row.organizationId === scope.organizationId && row.eventId === scope.eventId));
  } finally { restore(); }
});

test('worker percorre backlog maior que 25 lotes sem reiniciar cursor antes do fim', async () => {
  const restore = config();
  try {
    const pending = Array.from({ length: 51 }, (_, index) => ({
      id: `notice-${String(index + 1).padStart(3, '0')}`,
      organizationId: scope.organizationId,
      eventId: scope.eventId,
      ownerReservationId: scope.reservationId,
      submissionId: `scientific-submission-${index + 1}`,
      versionNumber: 1,
    }));
    const h = harness({ pending });
    assert.equal(await h.service.dispatchPending(h.poster), 25);
    // Simula o prazo de varredura expirando enquanto ainda existem avisos novos.
    // A implementação antiga voltava ao começo a cada tick e nunca alcançava o fim.
    h.service.revisitAt = 0;
    assert.equal(await h.service.dispatchPending(h.poster), 25);
    assert.equal(await h.service.dispatchPending(h.poster), 1);
    assert.equal(h.state.transport.length, 102, 'os 51 avisos devem alcançar seus dois autores');
    assert.equal(h.state.audits.length, 102);
    assert.equal(await h.service.dispatchPending(h.poster), 25, 'após esgotar o backlog, sweep pode recomeçar');
    assert.equal(h.state.transport.length, 102, 'o sweep não duplica envios aceitos');
    assert.ok(h.state.reads.every((where) => where.organizationId === scope.organizationId || !('organizationId' in where)));
  } finally { restore(); }
});

test('worker não consulta base fora do evento explicitamente autorizado', async () => {
  const restore = config();
  try {
    process.env.EVOLVIA_SCIENTIFIC_NOTICE_EVENT_ID = 'outro-evento';
    const h = harness();
    assert.equal(await h.service.dispatchPending(h.poster), 0);
    assert.equal(h.state.transport.length, 0);
  } finally { restore(); }
});

test('cursor excluído retorna ao início sem travar worker nem duplicar avisos aceitos', async () => {
  const restore = config();
  try {
    const pending = [
      { id: 'notice1', ...scope, ownerReservationId: scope.reservationId, submissionId: 'scientific-submission-001', versionNumber: 1 },
      { id: 'notice2', ...scope, ownerReservationId: scope.reservationId, submissionId: 'scientific-submission-002', versionNumber: 1 },
    ];
    const h = harness({ pending });
    const warnings = [];
    h.service.logger.warn = (message) => warnings.push(message);
    assert.equal(await h.service.dispatchPending(h.poster), 2);
    assert.equal(h.state.transport.length, 4);
    const original = h.service.prisma.scientificAuthorNotice.findMany;
    h.service.prisma.scientificAuthorNotice.findMany = async (query) => {
      if (query.cursor) throw Object.assign(new Error('mensagem privada não deve aparecer'), { code: 'P2025' });
      return original(query);
    };
    assert.equal(await h.service.dispatchPending(h.poster), 0, 'cursor ausente é tratado sem propagar P2025');
    assert.equal(h.service.cursor, null);
    assert.ok(warnings.includes('scientific_notice_cursor_missing_reset'));
    assert.equal(await h.service.dispatchPending(h.poster), 2, 'nova varredura alcança itens existentes');
    assert.equal(h.state.transport.length, 4, 'auditoria evita reenviar aceitos após reset');
    assert.ok(warnings.every((message) => !message.includes('mensagem privada')));
  } finally { restore(); }
});

test('falha de auditoria de um autor não impede demais lotes nem expõe erro', async () => {
  const restore = config();
  try {
    const authors = Array.from({ length: 5 }, (_, index) => ({ person: { email: `autor${index}@example.test` } }));
    const h = harness({ authors });
    const warnings = [];
    h.service.logger.warn = (message) => warnings.push(message);
    const original = h.service.prisma.auditLog.create;
    let failOnce = true;
    h.service.prisma.auditLog.create = async (args) => {
      if (failOnce) {
        failOnce = false;
        throw new Error('email=privado@example.test token=secreto');
      }
      return original(args);
    };
    await h.service.notify(scope, submissionId, 1, h.poster);
    assert.equal(h.state.transport.length, 5, 'o quinto destinatário não é bloqueado pelo primeiro');
    assert.equal(h.state.audits.length, 4);
    assert.ok(warnings.includes('scientific_notice_recipient_retry_later'));
    assert.ok(warnings.every((message) => !message.includes('privado@') && !message.includes('secreto')));
  } finally { restore(); }
});

test('falha sistêmica registra apenas código Prisma permitido sem mensagem sensível', () => {
  const h = harness();
  const warnings = [];
  h.service.logger.warn = (message) => warnings.push(message);
  h.service.logWorkerFailure(Object.assign(new Error('token=secreto email=privado@example.test'), { code: 'P1001' }));
  h.service.logWorkerFailure(new Error('senha=outra'));
  assert.deepEqual(warnings, [
    'scientific_notice_worker_failed code=P1001',
    'scientific_notice_worker_failed code=unknown',
  ]);
});


test('falha local antes de fetch permite retry; erro de DNS após invocar fetch permanece incerto', async (t) => {
  const restore = config();
  try {
    const h = harness({ authors: [{ person: { email: 'teste@example.test' } }] });
    const transport = t.mock.method(globalThis, 'fetch', async (request) => {
      assert.equal(request.redirect, 'manual');
      throw Object.assign(new Error('rede'), { code: 'ENOTFOUND' });
    });
    const validToken = process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN;
    process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN = 'teste\ninválido';
    await h.service.notify(scope, submissionId, 1);
    const [row] = h.state.dispatches.values();
    assert.equal(transport.mock.callCount(), 0);
    assert.equal(row.status, 'FAILED');
    assert.equal(h.state.audits[0].metadata.reason, 'not_sent');
    row.claimedAt = new Date(0);
    process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN = validToken;
    await h.service.notify(scope, submissionId, 1);
    assert.equal(transport.mock.callCount(), 1);
    assert.equal(transport.mock.calls[0].arguments[0].redirect, 'manual');
    assert.equal(h.state.audits[1].metadata.reason, 'uncertain');
    assert.equal(row.status, 'UNKNOWN');
    await h.service.notify(scope, submissionId, 1);
    assert.equal(transport.mock.callCount(), 1);
  } finally { restore(); }
});
