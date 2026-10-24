import assert from 'node:assert/strict';
import test from 'node:test';
import {
  confirmationMessage,
  credentialUrl,
  readDeliveryConfig,
  readRegistrationEmail,
} from '../src/registration-confirmation-mail.policy.ts';

const protocol = 'EVO-0123456789ABCDEF';

test('o e-mail de confirmação só sai com destinatário e endereço HTTPS válidos', () => {
  assert.equal(readRegistrationEmail({ email: ' Pessoa@Example.com ' }), 'pessoa@example.com');
  assert.equal(readRegistrationEmail({ email: 'sem-arroba' }), null);
  assert.equal(readRegistrationEmail({ email: 'a@b.com\n' }), null);
  assert.equal(readRegistrationEmail(null), null);
  assert.equal(credentialUrl('https://eventos.example', 'ensaio-lotes', protocol),
    `https://eventos.example/evento/ensaio-lotes/inscricao?protocolo=${protocol}`);
  assert.equal(credentialUrl('http://eventos.example', 'ensaio-lotes', protocol), null);
  assert.equal(credentialUrl('https://eventos.example', 'ensaio-lotes', 'EVO-1'), null);
  const env = {
    EVOLVIA_EMAIL_DELIVERY_ENDPOINT: 'https://mail.example/send',
    EVOLVIA_EMAIL_DELIVERY_TOKEN: 'token',
    EVOLVIA_EMAIL_FROM: 'avisos@eventos.example',
    EVOLVIA_PUBLIC_BASE_URL: 'https://eventos.example',
  };
  assert.equal(readDeliveryConfig(env)?.endpoint, 'https://mail.example/send');
  assert.equal(readDeliveryConfig({ ...env, EVOLVIA_PUBLIC_BASE_URL: 'http://eventos.example' }), null);
  assert.equal(readDeliveryConfig({ ...env, EVOLVIA_EMAIL_DELIVERY_ENDPOINT: 'http://mail.example/send' }), null);
  const message = confirmationMessage({
    eventName: 'Congresso <Norte>',
    protocol,
    credentialUrl: `https://eventos.example/evento/ensaio-lotes/inscricao?protocolo=${protocol}`,
    sender: 'avisos@eventos.example',
    recipient: 'pessoa@example.com',
  });
  assert.equal(message.message.subject, 'Sua inscrição foi confirmada');
  assert.match(message.message.text, new RegExp(protocol, 'u'));
  assert.match(message.message.html, /Congresso &lt;Norte&gt;/u);
  assert.equal(message.metadata.purpose, 'registration-confirmation');
  assert.equal(JSON.stringify(message.metadata).includes('pessoa@example.com'), false);
});
