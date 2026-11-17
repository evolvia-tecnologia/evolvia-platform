import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const proxyaddr = require('proxy-addr');
const request = (remoteAddress, forwarded) => ({ socket: { remoteAddress }, headers: forwarded ? { 'x-forwarded-for': forwarded } : {} });

test('subnet IPv4 mapeada com prefixo curto não confia em endereço externo', () => {
  const trust = proxyaddr.compile('::ffff:10.0.0.0/8');
  assert.equal(trust('203.0.113.4', 0), false);
  assert.equal(proxyaddr(request('203.0.113.4', '198.51.100.7'), trust), '203.0.113.4');
});
test('prefixo IPv6 amplo não confia em IPv4 arbitrário', () => {
  const trust = proxyaddr.compile('::/1');
  assert.equal(trust('203.0.113.4', 0), false);
  assert.equal(proxyaddr(request('203.0.113.4', '198.51.100.7'), trust), '203.0.113.4');
});
test('subnet IPv4 válida e mapeamento IPv6 /104 preservam proxy autorizado', () => {
  for (const subnet of ['10.0.0.0/8', '::ffff:10.0.0.0/104']) {
    const trust = proxyaddr.compile(subnet);
    assert.equal(trust('10.1.2.3', 0), true);
    assert.equal(trust('203.0.113.4', 0), false);
    assert.equal(proxyaddr(request('10.1.2.3', '198.51.100.7'), trust), '198.51.100.7');
  }
});
test('requisição sem X-Forwarded-For mantém endereço de conexão', () => {
  assert.equal(proxyaddr(request('203.0.113.4'), proxyaddr.compile('10.0.0.0/8')), '203.0.113.4');
});
