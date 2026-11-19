import { createServer, request } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserHarness, runCli } from './validate-public-accessibility-runtime.mjs';

export function loopbackOrigin(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('O ensaio de streaming exige uma origem HTTP de loopback sem credenciais.');
  }
  return url;
}

// Proxy apenas para o ensaio local/CI: não faz parte do servidor da aplicação.
export async function createStreamingProxy(raw, { chunkBytes = 128, delayMs = 1 } = {}) {
  const upstream = loopbackOrigin(raw);
  if (!Number.isInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > 4096
    || !Number.isInteger(delayMs) || delayMs < 1 || delayMs > 100) throw new Error('Limites de streaming inválidos.');
  const server = createServer((incoming, outgoing) => {
    if (!['GET', 'HEAD'].includes(incoming.method) || !incoming.url?.startsWith('/') || incoming.url.startsWith('//')) {
      outgoing.writeHead(405); outgoing.end(); return;
    }
    const target = new URL(incoming.url, upstream);
    if (target.origin !== upstream.origin) { outgoing.writeHead(400); outgoing.end(); return; }
    const headers = { ...incoming.headers, host: upstream.host, 'accept-encoding': 'identity' };
    delete headers.connection;
    const remote = request(target, { method: incoming.method, headers, timeout: 15_000 }, (response) => {
      const responseHeaders = { ...response.headers };
      delete responseHeaders['transfer-encoding'];
      delete responseHeaders['content-length'];
      delete responseHeaders.connection;
      response.on('error', () => outgoing.destroy());
      if (!String(responseHeaders['content-type']).includes('text/html') || incoming.method === 'HEAD') {
        outgoing.writeHead(response.statusCode, responseHeaders); response.pipe(outgoing); return;
      }
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 4 * 1024 * 1024) remote.destroy(new Error('HTML excedeu o limite do ensaio.'));
        else chunks.push(chunk);
      });
      response.on('end', () => {
        if (outgoing.destroyed) return;
        outgoing.writeHead(response.statusCode, responseHeaders);
        const html = Buffer.concat(chunks);
        let offset = 0;
        let timer;
        const send = () => {
          if (outgoing.destroyed) return;
          if (offset >= html.length) { outgoing.end(); return; }
          outgoing.write(html.subarray(offset, offset += chunkBytes));
          timer = setTimeout(send, delayMs);
        };
        outgoing.once('close', () => clearTimeout(timer));
        send();
      });
    });
    remote.once('timeout', () => remote.destroy(new Error('Tempo de upstream excedido.')));
    remote.once('error', () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    outgoing.once('close', () => remote.destroy());
    remote.end();
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    async close() { server.closeAllConnections(); await new Promise((done) => server.close(done)); },
  };
}

export async function runStreamingHydration() {
  const source = process.env.EVOLVIA_WEB_URL;
  const output = process.env.EVOLVIA_A11Y_OUTPUT;
  // O ensaio lento é só para ambiente descartável, nunca para homologação remota.
  loopbackOrigin(source);
  const eventPath = await browserHarness.discoverPublicEventPath(new URL(source));
  const paths = ['/eventos', '/eventos?period=CURRENT', '/eventos?period=ALL', '/eventos?period=PAST', eventPath];
  const proxy = await createStreamingProxy(source);
  try {
    process.env.EVOLVIA_WEB_URL = proxy.origin;
    process.env.EVOLVIA_A11Y_OUTPUT = resolve(dirname(output ?? 'visual-evidence/public-catalog-hydration-runtime.json'), 'public-streaming-hydration-runtime.json');
    await runCli({ staticPaths: Array.from({ length: 6 }, () => paths).flat(),
      viewports: [{ width: 1366, height: 768 }], includeDiscoveredEvent: false, timeoutMs: 180_000 });
  } finally {
    process.env.EVOLVIA_WEB_URL = source;
    if (output === undefined) delete process.env.EVOLVIA_A11Y_OUTPUT;
    else process.env.EVOLVIA_A11Y_OUTPUT = output;
    await proxy.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runStreamingHydration().catch(() => { console.error('Falha no ensaio local de hidratação com HTML fragmentado.'); process.exitCode = 1; });
}
