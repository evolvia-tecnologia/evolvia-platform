import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { Logger } from '@nestjs/common';
import { LocalRegistrationTermsDocumentStorage } from '../dist/registration-terms-document.storage.js';

const key = 'org1/event1/12345678-1234-1234-1234-123456789abc.pdf';
const bytes = Buffer.from('%PDF-1.4\n%%EOF');

async function fixture(t, run) {
  const root = await mkdtemp(join(tmpdir(), 'evolvia-terms-'));
  const previousRoot = process.env.EVOLVIA_TERMS_ROOT;
  process.env.EVOLVIA_TERMS_ROOT = root;
  try { await run(root); }
  finally {
    if (previousRoot === undefined) delete process.env.EVOLVIA_TERMS_ROOT;
    else process.env.EVOLVIA_TERMS_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  }
}

test('grava e lê PDF no volume configurado sem deixar temporário', async (t) => fixture(t, async (root) => {
  const storage = new LocalRegistrationTermsDocumentStorage();
  await storage.write(key, bytes);
  assert.deepEqual(await storage.read(key), bytes);
  assert.deepEqual(await readdir(join(root, 'org1/event1')), [key.split('/').at(-1)]);
  await storage.rollbackNewWrite(key);
  await assert.rejects(storage.read(key), (error) => error.getStatus() === 404);
}));

test('configuração ausente ou vazia usa o diretório padrão local', async (t) => fixture(t, async (root) => {
  const previousCwd = process.cwd();
  delete process.env.EVOLVIA_TERMS_ROOT;
  process.chdir(root);
  try {
    for (const configured of [undefined, '', '   ']) {
      if (configured === undefined) delete process.env.EVOLVIA_TERMS_ROOT;
      else process.env.EVOLVIA_TERMS_ROOT = configured;
      await new LocalRegistrationTermsDocumentStorage().write(key, bytes);
      assert.deepEqual(await readFile(join(root, 'data/registration-terms', key)), bytes);
    }
  } finally { process.chdir(previousCwd); }
}));

test('falha de configuração retorna 503 sem divulgar caminho e preserva origem', async (t) => fixture(t, async (root) => {
  const blockedRoot = join(root, 'volume');
  await writeFile(blockedRoot, 'preservar');
  process.env.EVOLVIA_TERMS_ROOT = blockedRoot;
  const messages = [];
  t.mock.method(Logger.prototype, 'error', (...args) => messages.push(args));
  const storage = new LocalRegistrationTermsDocumentStorage();
  await assert.rejects(storage.write(key, bytes), (error) => {
    assert.equal(error.getStatus(), 503);
    assert.match(error.message, /configuração e a permissão/u);
    assert.ok(!error.message.includes(root));
    return true;
  });
  assert.equal(await readFile(blockedRoot, 'utf8'), 'preservar');
  assert.equal(messages.length, 1);
  assert.match(messages[0][0], /código=ENOTDIR/u);
  assert.ok(!JSON.stringify(messages).includes(root));
}));

test('falha no rename remove somente o temporário próprio', async (t) => fixture(t, async (root) => {
  const target = join(root, key);
  await mkdir(target, { recursive: true });
  await writeFile(join(target, 'origem'), 'preservar');
  const storage = new LocalRegistrationTermsDocumentStorage();
  await assert.rejects(storage.write(key, bytes), (error) => error.getStatus() === 503);
  assert.deepEqual(await readdir(dirname(target)), [key.split('/').at(-1)]);
  assert.equal(await readFile(join(target, 'origem'), 'utf8'), 'preservar');
}));

test('chave que tenta sair do escopo é recusada antes da gravação', async (t) => fixture(t, async (root) => {
  const storage = new LocalRegistrationTermsDocumentStorage();
  for (const invalid of ['../fora.pdf', '/tmp/fora.pdf', 'org1/event1/segredo.html']) {
    await assert.rejects(storage.write(invalid, bytes), (error) => error.getStatus() === 404);
  }
  assert.deepEqual(await readdir(root), []);
}));
