import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createStreamingProxy, loopbackOrigin } from '../../../scripts/validate-public-streaming-hydration.mjs';

test('asset interrompido encerra o downstream sem esperar o timeout do cliente', { timeout: 10_000 }, async () => {
  let started = false;
  const source = createServer((req, res) => {
    started = true;
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.write('partial asset');
    setTimeout(() => res.destroy(), 20);
  });
  await new Promise((resolve) => source.listen(0, '127.0.0.1', resolve));
  const proxy = await createStreamingProxy(`http://127.0.0.1:${source.address().port}`);
  try {
    await assert.rejects(async () => {
      const response = await fetch(`${proxy.origin}/asset.js`, { signal: AbortSignal.timeout(5000) });
      await response.text();
    }, (error) => error instanceof TypeError && error.name !== 'TimeoutError');
    assert.equal(started, true);
  } finally {
    await proxy.close();
    source.closeAllConnections();
    await new Promise((resolve) => source.close(resolve));
  }
});

test('ensaio de streaming recusa origens remotas, credenciais e caminhos', () => {
  for (const value of ['https://127.0.0.1', 'http://localhost', 'http://example.org', 'http://127.0.0.1.evil.test', 'http://x:y@127.0.0.1', 'http://127.0.0.1/path', 'http://127.0.0.1?token=x']) {
    assert.throws(() => loopbackOrigin(value));
  }
  assert.equal(loopbackOrigin('http://127.0.0.1:3000').origin, 'http://127.0.0.1:3000');
});

test('proxy preserva HTML UTF8, assets/status e recusa comandos sem encaminhar', async () => {
  const seen = [];
  const html = '<main><h1>Ciência — ação</h1></main>'.repeat(30);
  const source = createServer((req, res) => {
    seen.push({ method: req.method, path: req.url, encoding: req.headers['accept-encoding'] });
    res.writeHead(req.url === '/missing' ? 404 : 200, { 'content-type': req.url === '/asset.js' ? 'text/javascript' : 'text/html; charset=utf-8' });
    res.end(req.url === '/asset.js' ? 'window.localFixture=true' : html);
  });
  await new Promise((resolve) => source.listen(0, '127.0.0.1', resolve));
  const proxy = await createStreamingProxy(`http://127.0.0.1:${source.address().port}`);
  try {
    const response = await fetch(`${proxy.origin}/eventos?period=PAST`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), html);
    assert.equal(await (await fetch(`${proxy.origin}/asset.js`)).text(), 'window.localFixture=true');
    assert.equal((await fetch(`${proxy.origin}/missing`)).status, 404);
    assert.equal((await fetch(`${proxy.origin}/command`, { method: 'POST', body: 'no real action' })).status, 405);
    assert.equal(seen.length, 3);
    assert.deepEqual(seen[0], { method: 'GET', path: '/eventos?period=PAST', encoding: 'identity' });
  } finally {
    await proxy.close();
    source.closeAllConnections();
    await new Promise((resolve) => source.close(resolve));
  }
});
