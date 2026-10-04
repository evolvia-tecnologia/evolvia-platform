import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { HttpException } from '@nestjs/common';
import {
  assertAccessRate,
  clientAddress,
  jwtSecret,
  resetAccessShieldForTests,
} from '../dist/access-shield.js';

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.name.endsWith('.ts')) files.push(path);
  }
  return files;
}

test('consultas usam parâmetros e não aceitam SQL montado pelo cliente', async () => {
  const files = await sourceFiles(new URL('../src', import.meta.url).pathname);
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /queryRawUnsafe|executeRawUnsafe/u, file);
  }
});

test('o endereço real só vale quando o par imediato é um proxy interno', () => {
  assert.equal(clientAddress({
    socket: { remoteAddress: '203.0.113.8' },
    headers: { 'x-real-ip': '198.51.100.9' },
  }), '203.0.113.8');
  assert.equal(clientAddress({
    socket: { remoteAddress: '172.18.0.3' },
    headers: { 'x-real-ip': '198.51.100.9' },
  }), '198.51.100.9');
  assert.equal(clientAddress({
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'x-real-ip': '198.51.100.9, 10.0.0.1' },
  }), '127.0.0.1');
  assert.equal(clientAddress({
    socket: { remoteAddress: 'fe80::1' },
    headers: { 'x-real-ip': '198.51.100.9' },
  }), '198.51.100.9');
  assert.equal(clientAddress({
    socket: { remoteAddress: 'fd7a:115c:a1e0::1' },
    headers: { 'x-real-ip': '198.51.100.10' },
  }), '198.51.100.10');
  assert.equal(clientAddress({
    socket: { remoteAddress: 'fc00::1' },
    headers: { 'x-real-ip': '198.51.100.12' },
  }), '198.51.100.12');
  assert.equal(clientAddress({
    socket: { remoteAddress: '2001:db8::5' },
    headers: { 'x-real-ip': '198.51.100.11' },
  }), '2001:db8::5');
});

test('o limite de tentativas corta a repetição sem guardar o e-mail em claro', async () => {
  const login = await readFile(new URL('../src/auth.controller.ts', import.meta.url), 'utf8');
  assert.match(login, /shieldDigest\(dto\.email\.trim\(\)\.toLowerCase\(\)\)/u);
  assert.doesNotMatch(login, /assertAccessRate\(request, `login:\$\{dto\.email/u);
  resetAccessShieldForTests();
  const request = { socket: { remoteAddress: '203.0.113.20' } };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    assertAccessRate(request, 'login:digest', 8);
  }
  assert.throws(() => assertAccessRate(request, 'login:digest', 8), (error) => {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), 429);
    return true;
  });
  assertAccessRate({ socket: { remoteAddress: '203.0.113.21' } }, 'login:digest', 8);
});

test('o mapa cheio recusa endereço novo e a limpeza não roda em toda requisição', async () => {
  const source = await readFile(new URL('../src/access-shield.ts', import.meta.url), 'utf8');
  assert.match(source, /CLEANUP_INTERVAL_MS = 60_000/u);
  assert.match(source, /now - lastCleanup < CLEANUP_INTERVAL_MS/u);
  const webhook = await readFile(new URL('../src/asaas-checkout.controller.ts', import.meta.url), 'utf8');
  assert.match(webhook, /assertAccessRate\(request, 'asaas-webhook', 1000\)/u);
  const guard = await readFile(new URL('../src/auth.guard.ts', import.meta.url), 'utf8');
  assert.match(guard, /if \(!payload \|\| typeof payload\.sub !== 'string'/u);
  resetAccessShieldForTests();
  const request = { socket: { remoteAddress: '203.0.113.40' } };
  for (let index = 0; index < 5000; index += 1) assertAccessRate(request, `full-${index}`, 3);
  assert.throws(() => assertAccessRate({ socket: { remoteAddress: '203.0.113.41' } }, 'full-new', 3), (error) => {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), 429);
    return true;
  });
  assertAccessRate(request, 'full-0', 3);
});

test('a sessão exige um segredo longo', () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'curto';
  assert.throws(() => jwtSecret(), /32 caracteres/u);
  process.env.JWT_SECRET = 'segredo com espaço e tamanho suficiente para falhar';
  assert.throws(() => jwtSecret(), /espaço/u);
  process.env.JWT_SECRET = previous;
});
