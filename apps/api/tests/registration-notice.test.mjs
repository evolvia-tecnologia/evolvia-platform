import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RegistrationNoticePolicyError,
  normalizeIdempotencyKey,
  normalizeNotice,
  noticeMessage,
  readDeliveryConfig,
  readRegistrationEmail,
} from '../src/registration-notice.policy.ts';

const notice = {
  subject: 'Mudança de horário',
  body: 'A abertura passou para as 9h.\nTraga o protocolo.',
  categoryId: null,
  continuationCursor: null,
  presence: null,
  scientificResult: null,
};

test('o aviso aceita texto simples e recusa HTML, chave curta e canal sem HTTPS', () => {
  assert.deepEqual(normalizeNotice(notice), notice);
  assert.equal(normalizeIdempotencyKey('aviso-operacional-01'), 'aviso-operacional-01');
  assert.equal(readRegistrationEmail({ email: ' Pessoa@Example.com ' }), 'pessoa@example.com');
  assert.equal(readDeliveryConfig({
    EVOLVIA_EMAIL_DELIVERY_ENDPOINT: 'https://mail.example/send',
    EVOLVIA_EMAIL_DELIVERY_TOKEN: 'token',
    EVOLVIA_EMAIL_FROM: 'avisos@eventos.example',
  })?.endpoint, 'https://mail.example/send');
  assert.equal(readDeliveryConfig({
    EVOLVIA_EMAIL_DELIVERY_ENDPOINT: 'http://mail.example/send',
    EVOLVIA_EMAIL_DELIVERY_TOKEN: 'token',
    EVOLVIA_EMAIL_FROM: 'avisos@eventos.example',
  }), null);
  const message = noticeMessage({
    ...notice,
    sender: 'avisos@eventos.example',
    recipient: 'pessoa@example.com',
    eventName: 'Congresso <Norte>',
  });
  assert.equal(message.message.subject, notice.subject);
  assert.match(message.message.html, /Congresso &lt;Norte&gt;/u);
  assert.equal(JSON.stringify(message.metadata).includes('pessoa@example.com'), false);
  for (const input of [
    { ...notice, subject: 'Oi' },
    { ...notice, body: '<b>oi</b> extra' },
    { ...notice, categoryId: 'CATEGORIA' },
    { ...notice, extra: true },
    null,
  ]) {
    assert.throws(() => normalizeNotice(input), RegistrationNoticePolicyError);
  }
  assert.throws(() => normalizeIdempotencyKey('curta'), RegistrationNoticePolicyError);
  assert.deepEqual(normalizeNotice({
    ...notice,
    presence: 'ABSENT',
    scientificResult: 'ACCEPTED_WITH_CHANGES',
  }).scientificResult, 'ACCEPTED_WITH_CHANGES');
  for (const presence of ['present', 'DRAFT', '']) {
    assert.throws(() => normalizeNotice({ ...notice, presence }), RegistrationNoticePolicyError);
  }
  for (const scientificResult of ['SUBMITTED', 'UNDER_REVIEW', 'INCOMPLETE', 'DRAFT']) {
    assert.throws(() => normalizeNotice({ ...notice, scientificResult }), RegistrationNoticePolicyError);
  }
  const { presence, scientificResult, ...withoutFilters } = notice;
  assert.throws(() => normalizeNotice(withoutFilters), RegistrationNoticePolicyError);
  assert.equal(presence, null);
  assert.equal(scientificResult, null);
});
