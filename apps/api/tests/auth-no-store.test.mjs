import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import 'reflect-metadata';
import {
  AUTH_CACHE_CONTROL,
  AUTH_EXPIRES,
  AUTH_PRAGMA,
  NoStore,
} from '../dist/auth/no-store.decorator.js';

const HEADERS_METADATA = '__headers__';
const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

class InertSensitiveHandler {
  reply() {
    return { ok: true };
  }
}

function applyNoStore(target) {
  const descriptor = Object.getOwnPropertyDescriptor(target.prototype, 'reply');
  NoStore()(target.prototype, 'reply', descriptor);
  return descriptor;
}

function headerMap(method) {
  const headers = Reflect.getMetadata(HEADERS_METADATA, method) ?? [];
  return Object.fromEntries(
    headers.map(({ name, value }) => [String(name).toLowerCase(), value]),
  );
}

function walkFiles(directory) {
  const entries = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      entries.push(...walkFiles(path));
      continue;
    }
    entries.push(path);
  }
  return entries;
}

test('NoStore aplica metadados inertes de Cache-Control, Pragma e Expires', () => {
  let invoked = 0;
  class Probe {
    reply() {
      invoked += 1;
      return { ok: true };
    }
  }

  applyNoStore(Probe);

  assert.equal(invoked, 0);
  assert.deepEqual(new Probe().reply(), { ok: true });
  assert.equal(invoked, 1);

  const headers = headerMap(Probe.prototype.reply);

  assert.equal(headers['cache-control'], AUTH_CACHE_CONTROL);
  assert.equal(headers['cache-control'], 'no-store, max-age=0');
  assert.equal(headers.pragma, AUTH_PRAGMA);
  assert.equal(headers.pragma, 'no-cache');
  assert.equal(headers.expires, AUTH_EXPIRES);
  assert.equal(headers.expires, '0');
});

test('NoStore não depende de request, response, env ou gateway', () => {
  const source = readFileSync(join(apiRoot, 'src/auth/no-store.decorator.ts'), 'utf8');

  assert.equal(source.includes('process.env'), false);
  assert.match(source, /Header\('Cache-Control', AUTH_CACHE_CONTROL\)/u);
  assert.equal(source.includes('request'), false);
  assert.equal(source.includes('response'), false);
  assert.equal(source.includes('gateway'), false);

  applyNoStore(InertSensitiveHandler);
  assert.deepEqual(new InertSensitiveHandler().reply(), { ok: true });
});

test('nenhum controller do projeto aplica NoStore neste lote', () => {
  const controllers = walkFiles(join(apiRoot, 'src')).filter((path) =>
    path.endsWith('.controller.ts'),
  );

  assert.ok(controllers.length > 0);

  for (const path of controllers) {
    const source = readFileSync(path, 'utf8');
    assert.equal(source.includes('NoStore'), false, path);
    assert.equal(source.includes('no-store.decorator'), false, path);
  }
});
