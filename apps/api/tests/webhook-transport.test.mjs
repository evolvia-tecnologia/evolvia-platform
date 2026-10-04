import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicWebhookAddress, webhookLookup } from '../dist/webhook-transport.js';

test('webhook rejeita redes locais, reservadas e IPv4 encapsulado', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '100.64.0.1', '169.254.169.254',
    '172.16.0.1', '192.168.1.1', '0.0.0.0', '224.0.0.1', '198.18.0.1',
    '::1', '::ffff:127.0.0.1', '::ffff:8.8.8.8', 'fc00::1', 'fe80::1',
    '64:ff9b::a00:1', '2002:a00:1::', '2001:db8::1', 'invalid']) {
    assert.equal(isPublicWebhookAddress(address), false, address);
  }
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
    assert.equal(isPublicWebhookAddress(address), true, address);
  }
});

function resolveWith(addresses, options = {}) {
  let calls = 0;
  const lookup = webhookLookup((_host, _options, callback) => {
    calls += 1;
    callback(null, addresses);
  });
  return new Promise((resolve) => lookup('hooks.example.com', options, (error, address, family) => {
    resolve({ error, address, family, calls });
  }));
}

test('DNS privado ou misto é recusado antes de abrir conexão', async () => {
  for (const addresses of [[], [{ address: '127.0.0.1', family: 4 }],
    [{ address: '1.1.1.1', family: 4 }, { address: '10.1.1.1', family: 4 }]]) {
    const result = await resolveWith(addresses);
    assert.ok(result.error);
  }
});

test('o socket recebe o resultado validado sem nova consulta DNS', async () => {
  const addresses = [{ address: '1.1.1.1', family: 4 }];
  const result = await resolveWith(addresses);
  assert.equal(result.error, null);
  assert.equal(result.address, '1.1.1.1');
  assert.equal(result.calls, 1);
  assert.deepEqual((await resolveWith(addresses, { all: true })).address, addresses);
});
