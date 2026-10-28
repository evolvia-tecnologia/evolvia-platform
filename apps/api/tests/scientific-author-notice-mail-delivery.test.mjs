import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificAuthorNoticeMailService } from '../dist/scientific-author-notice-mail.service.js';

const scope = { organizationId: 'org-science', eventId: 'event-science', reservationId: 'reservation-science' };
const submissionId = 'scientific-submission-001';
const keys = [
  'EVOLVIA_SCIENTIFIC_NOTICE_DELIVERY_ENABLED', 'EVOLVIA_EMAIL_DELIVERY_ENDPOINT',
  'EVOLVIA_EMAIL_DELIVERY_TOKEN', 'EVOLVIA_EMAIL_FROM', 'EVOLVIA_PUBLIC_BASE_URL',
];
function config() {
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.EVOLVIA_SCIENTIFIC_NOTICE_DELIVERY_ENABLED = '1';
  process.env.EVOLVIA_EMAIL_DELIVERY_ENDPOINT = 'https://email-gateway.example.test/messages';
  process.env.EVOLVIA_EMAIL_DELIVERY_TOKEN = 'test-token-only';
  process.env.EVOLVIA_EMAIL_FROM = 'secretaria@example.test';
  process.env.EVOLVIA_PUBLIC_BASE_URL = 'https://eventos.example.test';
  return () => { for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  } };
}
function harness({ scientific = true } = {}) {
  const state = { audits: [], transport: [], reads: [] };
  const prisma = {
    scientificAuthorNotice: { findFirst: async ({ where }) => {
      state.reads.push(where);
      return { kind: 'SUBMITTED' };
    } },
    scientificSubmission: { findFirst: async ({ where }) => {
      state.reads.push(where);
      return scientific ? {
        title: 'Pesquisa científica', currentVersion: 1,
        event: { name: 'Congresso Evolvia', slug: 'congresso' },
        ownerReservation: { registrationData: { full_name: 'Ana Pesquisadora' } },
        authors: [
          { person: { email: 'ana@example.test' } },
          { person: { email: 'coautor@example.test' } },
          { person: { email: 'ANA@example.test' } },
        ],
      } : null;
    } },
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

test('rejeições são auditadas, retentativas limitadas e não alegam recebimento', async () => {
  const restore = config();
  try {
    const h = harness();
    const rejected = async () => 503;
    for (let i = 0; i < 4; i += 1) await h.service.notify(scope, submissionId, 1, rejected);
    assert.equal(h.state.audits.length, 6);
    assert.ok(h.state.audits.every((audit) => audit.action === 'scientific.author_email_provider_failed'));
    assert.ok(h.state.audits.every((audit) => audit.metadata.delivered === false));
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
