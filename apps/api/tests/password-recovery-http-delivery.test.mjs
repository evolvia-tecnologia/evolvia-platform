import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PasswordRecoveryDeliveryConfigurationError,
  PasswordRecoveryDeliveryUnavailableError,
  deliverPasswordRecoveryEmail,
  passwordRecoveryDeliveryConfigFromEnvironment,
} from '../dist/auth/password-recovery-http.delivery.js';

const CONFIG = {
  endpoint: 'https://email-gateway.evolviatecnologia.com/v1/messages',
  bearerToken: 'segredo-do-gateway-que-nao-pode-vazar',
  sender: 'seguranca@evolviatecnologia.com',
  publicBaseUrl: 'https://homologacao.evolviatecnologia.com',
  timeoutMs: 1_000,
};

const INPUT = {
  recipient: 'pessoa@exemplo.com',
  token: 'A'.repeat(43),
  expiresAt: new Date('2026-08-19T15:30:00.000Z'),
};

test('configuração é opt-in e falha sem revelar valores quando incompleta', () => {
  assert.equal(passwordRecoveryDeliveryConfigFromEnvironment({}), null);

  assert.throws(
    () => passwordRecoveryDeliveryConfigFromEnvironment({
      EVOLVIA_EMAIL_DELIVERY_ENDPOINT: CONFIG.endpoint,
      EVOLVIA_EMAIL_DELIVERY_TOKEN: CONFIG.bearerToken,
    }),
    (reason) => {
      assert.ok(reason instanceof PasswordRecoveryDeliveryConfigurationError);
      const serialized = String(reason);
      assert.equal(serialized.includes(CONFIG.endpoint), false);
      assert.equal(serialized.includes(CONFIG.bearerToken), false);
      return true;
    },
  );
});

test('recusa URL sem HTTPS, credenciais embutidas e remetente inseguro', () => {
  const base = {
    EVOLVIA_EMAIL_DELIVERY_TOKEN: CONFIG.bearerToken,
    EVOLVIA_EMAIL_FROM: CONFIG.sender,
    EVOLVIA_PUBLIC_BASE_URL: CONFIG.publicBaseUrl,
  };

  for (const endpoint of [
    'http://email-gateway.evolviatecnologia.com/v1/messages',
    'https://usuario:senha@email-gateway.evolviatecnologia.com/v1/messages',
  ]) {
    assert.throws(
      () => passwordRecoveryDeliveryConfigFromEnvironment({
        ...base,
        EVOLVIA_EMAIL_DELIVERY_ENDPOINT: endpoint,
      }),
      PasswordRecoveryDeliveryConfigurationError,
    );
  }

  assert.throws(
    () => passwordRecoveryDeliveryConfigFromEnvironment({
      ...base,
      EVOLVIA_EMAIL_DELIVERY_ENDPOINT: CONFIG.endpoint,
      EVOLVIA_EMAIL_FROM: 'seguranca@evolvia.com\r\nBcc: atacante@exemplo.com',
    }),
    PasswordRecoveryDeliveryConfigurationError,
  );
});

test('envia contrato versionado com link HTTPS e token somente no corpo necessário', async () => {
  const calls = [];

  await deliverPasswordRecoveryEmail(CONFIG, INPUT, async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 202 };
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, CONFIG.endpoint);
  assert.equal(calls[0].init.method, 'POST');
  const headers = calls[0].init.headers;
  assert.equal(headers.Authorization, `Bearer ${CONFIG.bearerToken}`);
  assert.match(headers['Idempotency-Key'], /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(headers).includes(INPUT.token), false);

  const payload = JSON.parse(calls[0].init.body);
  assert.equal(payload.schema, 'evolvia.transactional-email.v1');
  assert.deepEqual(payload.message.to, [INPUT.recipient]);
  assert.equal(payload.message.from, CONFIG.sender);
  assert.equal(payload.metadata.purpose, 'password-recovery');
  assert.equal(payload.metadata.expiresAt, INPUT.expiresAt.toISOString());
  assert.match(
    payload.message.text,
    /https:\/\/homologacao\.evolviatecnologia\.com\/redefinir-senha#token=/u,
  );
  assert.equal(payload.message.text.includes(INPUT.token), true);
  assert.equal(payload.message.html.includes(INPUT.token), true);
  assert.equal(payload.message.text.includes('?token='), false);
});

test('ausência, erro de rede e resposta não 2xx produzem falha pública sanitizada', async () => {
  const attempts = [
    () => deliverPasswordRecoveryEmail(null, INPUT),
    () => deliverPasswordRecoveryEmail(CONFIG, INPUT, async () => {
      throw new Error(`falha com ${INPUT.token}`);
    }),
    () => deliverPasswordRecoveryEmail(CONFIG, INPUT, async () => ({
      ok: false,
      status: 503,
    })),
  ];

  for (const attempt of attempts) {
    await assert.rejects(attempt, (reason) => {
      assert.ok(reason instanceof PasswordRecoveryDeliveryUnavailableError);
      const serialized = String(reason);
      assert.equal(serialized.includes(INPUT.token), false);
      assert.equal(serialized.includes(INPUT.recipient), false);
      assert.equal(serialized.includes(CONFIG.bearerToken), false);
      return true;
    });
  }
});
