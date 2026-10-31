import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolveEmailDeliveryConfiguration } from '../dist/email-verification-delivery-config.js';

const VALID = Object.freeze({
  EVOLVIA_EMAIL_DELIVERY_ENDPOINT: 'https://mail-gateway.example.test/v1/send',
  EVOLVIA_EMAIL_DELIVERY_TOKEN: 'test-token-not-a-secret',
  EVOLVIA_EMAIL_FROM: 'no-reply@example.test',
  EVOLVIA_PUBLIC_BASE_URL: 'https://homologacao.evolviatecnologia.com',
});

test('configuração válida preserva HTTPS, remetente e destino sem enviar e-mail', () => {
  const config = resolveEmailDeliveryConfiguration(VALID);
  assert.equal(config.deliveryUrl.href, 'https://mail-gateway.example.test/v1/send');
  assert.equal(config.actionUrl.href, 'https://homologacao.evolviatecnologia.com/verificar-email');
  assert.equal(config.sender, VALID.EVOLVIA_EMAIL_FROM);
  assert.equal(config.bearerToken, VALID.EVOLVIA_EMAIL_DELIVERY_TOKEN);
});

test('configuração ausente ou inválida falha sem revelar credenciais', () => {
  for (const change of [
    { EVOLVIA_EMAIL_DELIVERY_ENDPOINT: undefined },
    { EVOLVIA_EMAIL_DELIVERY_TOKEN: undefined },
    { EVOLVIA_EMAIL_FROM: 'invalid-address' },
    { EVOLVIA_EMAIL_FROM: 'a@example.test\r\nBcc: other@example.test' },
    { EVOLVIA_PUBLIC_BASE_URL: undefined },
    { EVOLVIA_EMAIL_DELIVERY_ENDPOINT: 'http://mail-gateway.example.test/send' },
    { EVOLVIA_EMAIL_DELIVERY_ENDPOINT: 'https://user:pass@mail-gateway.example.test/send' },
    { EVOLVIA_PUBLIC_BASE_URL: 'http://homologacao.evolviatecnologia.com' },
    { EVOLVIA_PUBLIC_BASE_URL: 'https://user:pass@homologacao.evolviatecnologia.com' },
    { EVOLVIA_PUBLIC_BASE_URL: 'not-a-url' },
  ]) {
    assert.throws(
      () => resolveEmailDeliveryConfiguration({ ...VALID, ...change }),
      (error) => error instanceof Error
        && !error.message.includes(VALID.EVOLVIA_EMAIL_DELIVERY_TOKEN)
        && !error.message.includes('other@example.test'),
    );
  }
});

test('preflight ocorre depois da verificação do usuário e antes da mutação de tokens', async () => {
  const source = await readFile(new URL('../src/email-verification.service.ts', import.meta.url), 'utf8');
  const issue = source.slice(source.indexOf('async issue('), source.indexOf('async confirm('));
  const userGuard = issue.indexOf('if (!user || user.emailVerifiedAt) return null;');
  const preflight = issue.indexOf('resolveEmailDeliveryConfiguration(process.env)');
  const revoke = issue.indexOf('emailVerificationToken.updateMany({');
  const create = issue.indexOf('emailVerificationToken.create({');
  assert.ok(userGuard >= 0 && userGuard < preflight && preflight < revoke && revoke < create);
  assert.match(issue, /process\.env\.EVOLVIA_CI_MODE === '1' \? null/u);
  assert.match(issue, /throw new ServiceUnavailableException\('O envio do e-mail de confirmação ainda não está configurado\.'\)/u);
});
