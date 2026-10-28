import assert from 'node:assert/strict';
import test from 'node:test';
import {
  scientificMailEnabled, scientificNoticeRecipients, scientificNoticeKey, scientificNoticeMessage,
} from '../dist/scientific-author-notice-mail.policy.js';

test('avisos científicos exigem habilitação explícita e não disparam por padrão', () => {
  const scope = { organizationId: 'org-1', eventId: 'event-1' };
  assert.equal(scientificMailEnabled({}, scope), false);
  assert.equal(scientificMailEnabled({ EVOLVIA_SCIENTIFIC_NOTICE_DELIVERY_ENABLED: 'true' }, scope), false);
  assert.equal(scientificMailEnabled({ EVOLVIA_SCIENTIFIC_NOTICE_DELIVERY_ENABLED: '1' }, scope), false);
  const enabled = {
    EVOLVIA_SCIENTIFIC_NOTICE_DELIVERY_ENABLED: '1',
    EVOLVIA_SCIENTIFIC_NOTICE_ORGANIZATION_ID: 'org-1',
    EVOLVIA_SCIENTIFIC_NOTICE_EVENT_ID: 'event-1',
  };
  assert.equal(scientificMailEnabled(enabled, scope), true);
  assert.equal(scientificMailEnabled(enabled, { organizationId: 'org-2', eventId: 'event-1' }), false);
  assert.equal(scientificMailEnabled(enabled, { organizationId: 'org-1', eventId: 'event-2' }), false);
});

test('normaliza e deduplica autores, ignorando e-mails malformados', () => {
  const recipients = scientificNoticeRecipients([
    { person: { email: ' ANA@EXAMPLE.test ' } },
    { person: { email: 'ana@example.test' } },
    { person: { email: 'coautor@example.test' } },
    { person: { email: 'nome sem arroba' } },
    { person: { email: null } },
    { person: null },
    {},
  ]);
  assert.deepEqual(recipients, ['ana@example.test', 'coautor@example.test']);
});

test('idempotência separa destinatário e versão sem expor identificadores', () => {
  const args = { organizationId: 'org1', eventId: 'event1', submissionId: 'sub1', versionNumber: 1, recipient: 'ana@example.test' };
  const key = scientificNoticeKey(args);
  assert.match(key, /^[0-9a-f]{64}$/u);
  assert.equal(key, scientificNoticeKey(args));
  assert.notEqual(key, scientificNoticeKey({ ...args, recipient: 'b@example.test' }));
  assert.notEqual(key, scientificNoticeKey({ ...args, versionNumber: 2 }));
  assert.doesNotMatch(key, /ana|example|org1/u);
});

test('mensagem científica por destinatário escapa HTML e identifica quem submeteu', () => {
  const message = scientificNoticeMessage({
    eventName: 'Congresso <Ciência>', title: 'Pesquisa & resultados <2026>',
    submitterName: 'Ana "Autora"', kind: 'SUBMITTED', versionNumber: 1,
    recipient: 'COAUTOR@example.test', sender: 'secretaria@example.test',
    publicBaseUrl: 'https://eventos.example.test', slug: 'congresso-2026',
  });
  assert.deepEqual(message.message.to, ['coautor@example.test']);
  assert.match(message.message.text, /submetido por Ana "Autora"/u);
  assert.match(message.message.html, /Pesquisa &amp; resultados &lt;2026&gt;/u);
  assert.doesNotMatch(message.message.html, /<Ciência>|<2026>/u);
  assert.deepEqual(message.metadata, { purpose: 'scientific_author_notice', version: 1, kind: 'SUBMITTED' });
});

test('não gera aviso com URL insegura, slug adulterado ou versão inválida', () => {
  const args = {
    eventName: 'Congresso', title: 'Trabalho', submitterName: 'Ana',
    kind: 'CORRECTED', versionNumber: 2, recipient: 'ana@example.test',
    sender: 'secretaria@example.test', publicBaseUrl: 'https://eventos.example.test',
    slug: 'congresso',
  };
  assert.match(scientificNoticeMessage(args).message.text, /corrigido por Ana/u);
  assert.throws(() => scientificNoticeMessage({ ...args, slug: '../admin' }), /Evento inválido/u);
  assert.throws(() => scientificNoticeMessage({ ...args, versionNumber: 0 }), /Versão/u);
  assert.throws(() => scientificNoticeMessage({ ...args, publicBaseUrl: 'http://inseguro.example.test' }), /HTTPS/u);
  assert.throws(() => scientificNoticeMessage({ ...args, recipient: 'endereço errado' }), /e-mail/u);
});
