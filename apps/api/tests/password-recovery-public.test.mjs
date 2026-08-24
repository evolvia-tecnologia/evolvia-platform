import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PasswordRecoveryOriginService,
  passwordRecoveryTrustedProxyAddresses,
  requirePasswordRecoveryPepper,
} from '../dist/auth/password-recovery-public.js';

const ORIGIN_PEPPER = 'origem-segura-de-teste-com-mais-de-32-caracteres';

test('configuração pública exige peppers separados com no mínimo 32 caracteres', () => {
  assert.equal(
    requirePasswordRecoveryPepper(ORIGIN_PEPPER, 'PEPPER'),
    ORIGIN_PEPPER,
  );
  assert.throws(
    () => requirePasswordRecoveryPepper('curto', 'PEPPER'),
    /PEPPER deve ter ao menos 32 caracteres/u,
  );
});

test('lista de proxies ignora espaços e entradas vazias', () => {
  assert.deepEqual(
    passwordRecoveryTrustedProxyAddresses(' 10.0.0.1, ,::1 '),
    ['10.0.0.1', '::1'],
  );
  assert.deepEqual(passwordRecoveryTrustedProxyAddresses(undefined), []);
});

test('serviço de origem aceita forwarded-for somente de proxy confiável', () => {
  const service = new PasswordRecoveryOriginService({
    PASSWORD_RECOVERY_ORIGIN_PEPPER: ORIGIN_PEPPER,
    EVOLVIA_TRUSTED_PROXY_ADDRESSES: '10.0.0.1',
  });

  const trusted = service.createKey({
    socket: { remoteAddress: '10.0.0.1' },
    headers: { 'x-forwarded-for': '203.0.113.10' },
  });
  const directClient = service.createKey({
    socket: { remoteAddress: '203.0.113.10' },
    headers: { 'x-forwarded-for': '198.51.100.7' },
  });

  assert.equal(trusted, directClient);
  assert.match(trusted, /^[a-f0-9]{64}$/u);
  assert.equal(trusted.includes('203.0.113.10'), false);
});
