import assert from 'node:assert/strict';
import test from 'node:test';
import { createPasswordRecoveryOriginKey } from '../dist/auth/password-recovery-origin.js';

const PEPPER = 'pepper-de-origem-com-mais-de-32-caracteres';

test('ignora cabeçalho encaminhado quando o socket não é proxy confiável', () => {
  const direct = createPasswordRecoveryOriginKey({
    socketAddress: '203.0.113.10',
    forwardedFor: '198.51.100.20',
    trustedProxyAddresses: ['127.0.0.1'],
    identifierPepper: PEPPER,
  });
  const withoutHeader = createPasswordRecoveryOriginKey({
    socketAddress: '203.0.113.10',
    trustedProxyAddresses: ['127.0.0.1'],
    identifierPepper: PEPPER,
  });

  assert.equal(direct, withoutHeader);
  assert.match(direct, /^[a-f0-9]{64}$/u);
});

test('resolve a primeira origem não confiável por proxies permitidos', () => {
  const throughProxy = createPasswordRecoveryOriginKey({
    socketAddress: '127.0.0.1',
    forwardedFor: '198.51.100.20, 10.0.0.2',
    trustedProxyAddresses: ['127.0.0.1', '10.0.0.2'],
    identifierPepper: PEPPER,
  });
  const directClient = createPasswordRecoveryOriginKey({
    socketAddress: '198.51.100.20',
    trustedProxyAddresses: [],
    identifierPepper: PEPPER,
  });

  assert.equal(throughProxy, directClient);
});

test('normaliza IPv4 mapeado e nunca retorna endereço bruto', () => {
  const mapped = createPasswordRecoveryOriginKey({
    socketAddress: '::ffff:192.0.2.15',
    trustedProxyAddresses: [],
    identifierPepper: PEPPER,
  });
  const ipv4 = createPasswordRecoveryOriginKey({
    socketAddress: '192.0.2.15',
    trustedProxyAddresses: [],
    identifierPepper: PEPPER,
  });

  assert.equal(mapped, ipv4);
  assert.equal(mapped.includes('192.0.2.15'), false);
});

test('recusa endereço inválido e pepper fraco', () => {
  assert.throws(
    () => createPasswordRecoveryOriginKey({
      socketAddress: 'origem-invalida',
      trustedProxyAddresses: [],
      identifierPepper: PEPPER,
    }),
    /Endereço de origem inválido/u,
  );
  assert.throws(
    () => createPasswordRecoveryOriginKey({
      socketAddress: '192.0.2.15',
      trustedProxyAddresses: [],
      identifierPepper: 'curto',
    }),
    /ao menos 32 caracteres/u,
  );
});
