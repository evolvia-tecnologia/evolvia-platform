import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PASSWORD_RECOVERY_ORIGIN_MAX_FORWARDED_HOPS,
  PASSWORD_RECOVERY_ORIGIN_MAX_FORWARDED_LENGTH,
  createPasswordRecoveryOriginKey,
} from '../dist/auth/password-recovery-origin.js';

const PEPPER = 'pepper-de-origem-com-mais-de-32-caracteres';
const OTHER_PEPPER = 'outro-pepper-de-origem-com-mais-de-32-chars';
const HEX_64 = /^[a-f0-9]{64}$/u;

function originKey(input) {
  return createPasswordRecoveryOriginKey({
    trustedProxyAddresses: [],
    originPepper: PEPPER,
    ...input,
  });
}

function expectedHmac(address, pepper = PEPPER) {
  return createHmac('sha256', pepper).update(address, 'utf8').digest('hex');
}

function assertSafeKey(key, ...rawValues) {
  assert.match(key, HEX_64);
  for (const value of rawValues) {
    assert.equal(key.includes(value), false);
  }
}

test('conexão direta deriva HMAC do socket e ignora ausência de cabeçalho', () => {
  const key = originKey({ socketAddress: '203.0.113.10' });

  assert.equal(key, expectedHmac('203.0.113.10'));
  assertSafeKey(key, '203.0.113.10');
});

test('ignora cabeçalho falsificado quando o socket não é proxy confiável', () => {
  const forged = originKey({
    socketAddress: '203.0.113.10',
    forwardedFor: '198.51.100.20',
    trustedProxyAddresses: ['127.0.0.1'],
  });
  const direct = originKey({
    socketAddress: '203.0.113.10',
    trustedProxyAddresses: ['127.0.0.1'],
  });

  assert.equal(forged, direct);
  assert.equal(forged, expectedHmac('203.0.113.10'));
  assertSafeKey(forged, '203.0.113.10', '198.51.100.20');
});

test('não rejeita cabeçalho inválido vindo de socket não confiável', () => {
  const key = originKey({
    socketAddress: '203.0.113.10',
    forwardedFor: 'origem-invalida, '.repeat(40),
    trustedProxyAddresses: [],
  });

  assert.equal(key, expectedHmac('203.0.113.10'));
  assertSafeKey(key, '203.0.113.10');
});

test('um proxy confiável revela a origem imediata à esquerda', () => {
  const throughProxy = originKey({
    socketAddress: '10.0.0.1',
    forwardedFor: '198.51.100.20',
    trustedProxyAddresses: ['10.0.0.1'],
  });
  const directClient = originKey({ socketAddress: '198.51.100.20' });

  assert.equal(throughProxy, directClient);
  assert.equal(throughProxy, expectedHmac('198.51.100.20'));
  assertSafeKey(throughProxy, '10.0.0.1', '198.51.100.20');
});

test('múltiplos proxies confiáveis percorrem a cadeia da direita para a esquerda', () => {
  const throughProxies = originKey({
    socketAddress: '127.0.0.1',
    forwardedFor: '198.51.100.20, 10.0.0.2',
    trustedProxyAddresses: ['127.0.0.1', '10.0.0.2'],
  });
  const directClient = originKey({ socketAddress: '198.51.100.20' });

  assert.equal(throughProxies, directClient);
  assertSafeKey(throughProxies, '127.0.0.1', '10.0.0.2', '198.51.100.20');
});

test('para na primeira origem não confiável e nunca assume o primeiro endereço', () => {
  const spoofedLeftmost = originKey({
    socketAddress: '127.0.0.1',
    forwardedFor: '203.0.113.1, 198.51.100.20, 10.0.0.2',
    trustedProxyAddresses: ['127.0.0.1', '10.0.0.2'],
  });
  const untrustedHop = originKey({ socketAddress: '198.51.100.20' });
  const spoofedClient = originKey({ socketAddress: '203.0.113.1' });

  assert.equal(spoofedLeftmost, untrustedHop);
  assert.notEqual(spoofedLeftmost, spoofedClient);
  assertSafeKey(spoofedLeftmost, '203.0.113.1', '198.51.100.20', '10.0.0.2');
});

test('normaliza IPv4, IPv6, colchetes, espaços e IPv4 mapeado em IPv6', () => {
  const ipv4 = originKey({ socketAddress: '192.0.2.15' });
  const mapped = originKey({ socketAddress: '::ffff:192.0.2.15' });
  const mappedBrackets = originKey({ socketAddress: '[::FFFF:192.0.2.15]' });
  const ipv6 = originKey({ socketAddress: '2001:db8::10' });
  const ipv6Brackets = originKey({ socketAddress: '[2001:DB8::10]' });
  const ipv6Spaces = originKey({ socketAddress: '  2001:db8::10  ' });
  const throughMappedProxy = originKey({
    socketAddress: '[::ffff:10.0.0.1]',
    forwardedFor: '  [192.0.2.15]  ',
    trustedProxyAddresses: ['10.0.0.1'],
  });

  assert.equal(mapped, ipv4);
  assert.equal(mappedBrackets, ipv4);
  assert.equal(throughMappedProxy, ipv4);
  assert.equal(ipv6Brackets, ipv6);
  assert.equal(ipv6Spaces, ipv6);
  assert.notEqual(ipv6, ipv4);
  assertSafeKey(ipv4, '192.0.2.15', '::ffff:192.0.2.15');
  assertSafeKey(ipv6, '2001:db8::10', '2001:DB8::10');
});

test('IPv6 comprimido e expandido geram a mesma chave canônica', () => {
  const compressed = originKey({ socketAddress: '2001:db8::10' });
  const expanded = originKey({
    socketAddress: '2001:0db8:0000:0000:0000:0000:0000:0010',
  });
  const mixedZeros = originKey({
    socketAddress: '2001:db8:0:0:0:0:0:10',
  });
  const leftmostTie = originKey({ socketAddress: '2001:db8:0:0:1:0:0:1' });
  const rightCompressed = originKey({ socketAddress: '2001:db8:0:0:1::1' });
  const leftCompressed = originKey({ socketAddress: '2001:db8::1:0:0:1' });

  assert.equal(expanded, compressed);
  assert.equal(mixedZeros, compressed);
  assert.equal(compressed, expectedHmac('2001:db8::10'));
  assert.equal(leftmostTie, leftCompressed);
  assert.equal(rightCompressed, leftCompressed);
  assert.notEqual(leftCompressed, compressed);
  assertSafeKey(compressed, '2001:db8::10', '2001:0db8:0000:0000:0000:0000:0000:0010');
});

test('allowlist expandida reconhece socket IPv6 comprimido e vice-versa', () => {
  const client = originKey({ socketAddress: '198.51.100.20' });
  const expandedAllowlist = originKey({
    socketAddress: '2001:db8::1',
    forwardedFor: '198.51.100.20',
    trustedProxyAddresses: ['2001:0db8:0000:0000:0000:0000:0000:0001'],
  });
  const compressedAllowlist = originKey({
    socketAddress: '2001:0db8:0000:0000:0000:0000:0000:0001',
    forwardedFor: '198.51.100.20',
    trustedProxyAddresses: ['2001:db8::1'],
  });
  const ignoredBecauseUnmatched = originKey({
    socketAddress: '2001:db8::1',
    forwardedFor: '198.51.100.20',
    trustedProxyAddresses: ['2001:db8::2'],
  });

  assert.equal(expandedAllowlist, client);
  assert.equal(compressedAllowlist, client);
  assert.notEqual(ignoredBecauseUnmatched, client);
  assert.equal(ignoredBecauseUnmatched, expectedHmac('2001:db8::1'));
});

test('normaliza integralmente IPv4 mapeado em IPv6 e representações equivalentes', () => {
  const ipv4 = originKey({ socketAddress: '192.0.2.15' });
  const mappedForms = [
    '::ffff:192.0.2.15',
    '::FFFF:192.0.2.15',
    '::ffff:c000:20f',
    '::ffff:c000:020f',
    '0:0:0:0:0:ffff:192.0.2.15',
    '0:0:0:0:0:ffff:c000:20f',
    '0000:0000:0000:0000:0000:ffff:c000:020f',
    '[::ffff:192.0.2.15]',
    '[0:0:0:0:0:FFFF:C000:020F]',
  ];

  for (const socketAddress of mappedForms) {
    assert.equal(originKey({ socketAddress }), ipv4, socketAddress);
  }

  const translatedPrefix = originKey({ socketAddress: '::ffff:0:192.0.2.15' });
  assert.notEqual(translatedPrefix, ipv4);

  const mappedProxy = originKey({
    socketAddress: '::ffff:a00:1',
    forwardedFor: '::ffff:c000:20f',
    trustedProxyAddresses: ['10.0.0.1'],
  });
  const ipv4Allowlist = originKey({
    socketAddress: '10.0.0.1',
    forwardedFor: '192.0.2.15',
    trustedProxyAddresses: ['::ffff:10.0.0.1'],
  });

  assert.equal(mappedProxy, ipv4);
  assert.equal(ipv4Allowlist, ipv4);
  assert.equal(ipv4, expectedHmac('192.0.2.15'));
});

test('rejeita identificadores de zona IPv6 sem removê-los silenciosamente', () => {
  const zonedSockets = [
    '2001:db8::1%',
    '2001:db8::1%a%b',
    'fe80::1%eth0',
    '[fe80::1%eth0]',
  ];

  for (const socketAddress of zonedSockets) {
    assert.throws(
      () => originKey({ socketAddress }),
      /Endereço de origem inválido/u,
      socketAddress,
    );
  }

  const bareLinkLocal = originKey({ socketAddress: 'fe80::1' });
  const bareDocumentation = originKey({ socketAddress: '2001:db8::1' });
  assert.match(bareLinkLocal, HEX_64);
  assert.match(bareDocumentation, HEX_64);

  assert.throws(
    () => originKey({
      socketAddress: '127.0.0.1',
      forwardedFor: 'fe80::1%eth0',
      trustedProxyAddresses: ['127.0.0.1'],
    }),
    /Cadeia de origem encaminhada inválida/u,
  );
  assert.throws(
    () => originKey({
      socketAddress: '127.0.0.1',
      forwardedFor: '2001:db8::1, fe80::1%eth0',
      trustedProxyAddresses: ['127.0.0.1'],
    }),
    /Cadeia de origem encaminhada inválida/u,
  );

  assert.throws(
    () => originKey({
      socketAddress: '2001:db8::1',
      forwardedFor: '198.51.100.20',
      trustedProxyAddresses: ['fe80::1%eth0'],
    }),
    /Endereço de origem inválido/u,
  );
  assert.throws(
    () => originKey({
      socketAddress: '2001:db8::1',
      forwardedFor: '198.51.100.20',
      trustedProxyAddresses: ['2001:db8::1', '2001:db8::1%'],
    }),
    /Endereço de origem inválido/u,
  );
});

test('aceita colchetes somente com par completo e rejeita colchete isolado', () => {
  const ipv6 = originKey({ socketAddress: '2001:db8::10' });
  const ipv4 = originKey({ socketAddress: '192.0.2.15' });

  assert.equal(originKey({ socketAddress: '[2001:db8::10]' }), ipv6);
  assert.equal(originKey({ socketAddress: '  [192.0.2.15]  ' }), ipv4);

  assert.throws(
    () => originKey({ socketAddress: '[2001:db8::10' }),
    /Endereço de origem inválido/u,
  );
  assert.throws(
    () => originKey({ socketAddress: '2001:db8::10]' }),
    /Endereço de origem inválido/u,
  );
  assert.throws(
    () => originKey({ socketAddress: '[192.0.2.15' }),
    /Endereço de origem inválido/u,
  );
  assert.throws(
    () => originKey({ socketAddress: '192.0.2.15]' }),
    /Endereço de origem inválido/u,
  );

  const trusted = {
    socketAddress: '127.0.0.1',
    trustedProxyAddresses: ['127.0.0.1'],
  };

  assert.equal(
    originKey({ ...trusted, forwardedFor: '[2001:db8::10]' }),
    ipv6,
  );
  assert.throws(
    () => originKey({ ...trusted, forwardedFor: '[2001:db8::10' }),
    /Cadeia de origem encaminhada inválida/u,
  );
  assert.throws(
    () => originKey({ ...trusted, forwardedFor: '2001:db8::10]' }),
    /Cadeia de origem encaminhada inválida/u,
  );
  assert.throws(
    () => originKey({ ...trusted, forwardedFor: '[192.0.2.15' }),
    /Cadeia de origem encaminhada inválida/u,
  );
  assert.throws(
    () => originKey({ ...trusted, forwardedFor: '192.0.2.15]' }),
    /Cadeia de origem encaminhada inválida/u,
  );
});

test('rejeita cadeia vazia, elemento inválido e cadeia excessivamente longa', () => {
  const trusted = {
    socketAddress: '127.0.0.1',
    trustedProxyAddresses: ['127.0.0.1'],
  };

  assert.throws(
    () => originKey({ ...trusted, forwardedFor: '' }),
    /Cadeia de origem encaminhada inválida/u,
  );
  assert.throws(
    () => originKey({ ...trusted, forwardedFor: '   ' }),
    /Cadeia de origem encaminhada inválida/u,
  );
  assert.throws(
    () => originKey({ ...trusted, forwardedFor: '198.51.100.20,,10.0.0.2' }),
    /Cadeia de origem encaminhada inválida/u,
  );
  assert.throws(
    () => originKey({ ...trusted, forwardedFor: 'origem-invalida' }),
    /Cadeia de origem encaminhada inválida/u,
  );
  assert.throws(
    () => originKey({
      ...trusted,
      forwardedFor: Array.from(
        { length: PASSWORD_RECOVERY_ORIGIN_MAX_FORWARDED_HOPS + 1 },
        (_, index) => `198.51.100.${index + 1}`,
      ).join(', '),
    }),
    /Cadeia de origem encaminhada inválida/u,
  );
  assert.throws(
    () => originKey({
      ...trusted,
      forwardedFor: `${'1'.repeat(PASSWORD_RECOVERY_ORIGIN_MAX_FORWARDED_LENGTH + 1)}`,
    }),
    /Cadeia de origem encaminhada inválida/u,
  );
});

test('rejeita endereço de socket inválido e pepper curto', () => {
  assert.throws(
    () => originKey({ socketAddress: 'origem-invalida' }),
    /Endereço de origem inválido/u,
  );
  assert.throws(
    () => originKey({ socketAddress: '192.0.2.15', originPepper: 'curto' }),
    /ao menos 32 caracteres/u,
  );
});

test('não lê variável de ambiente e não persiste IP ou pepper em claro', () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../src/auth/password-recovery-origin.ts'),
    'utf8',
  );

  assert.equal(source.includes('process.env'), false);
  assert.equal(source.includes('console.'), false);
  assert.equal(source.includes('writeFile'), false);
  assert.equal(source.includes('withoutZone'), false);
  assert.equal(source.includes('zoneSeparator'), false);
  assert.match(source, /includes\('%'\)/u);

  const key = originKey({ socketAddress: '192.0.2.15' });
  assertSafeKey(key, '192.0.2.15', PEPPER, 'PASSWORD_RECOVERY');
});

test('HMAC é determinístico, muda com o pepper e nunca devolve IP bruto', () => {
  const first = originKey({ socketAddress: '192.0.2.15' });
  const second = originKey({ socketAddress: '192.0.2.15' });
  const otherPepper = originKey({
    socketAddress: '192.0.2.15',
    originPepper: OTHER_PEPPER,
  });

  assert.equal(first, second);
  assert.equal(first, expectedHmac('192.0.2.15'));
  assert.equal(otherPepper, expectedHmac('192.0.2.15', OTHER_PEPPER));
  assert.notEqual(first, otherPepper);
  assertSafeKey(first, '192.0.2.15', PEPPER);
  assertSafeKey(otherPepper, '192.0.2.15', OTHER_PEPPER);
});
