import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, '..');
const appDir = resolve(webRoot, 'app');

const errorSrc = readFileSync(resolve(appDir, 'error.tsx'), 'utf8');
const cssSrc = readFileSync(resolve(appDir, 'system-feedback.module.css'), 'utf8');

describe('loading.tsx — não instala Suspense na raiz', () => {
  it('não existe app/loading.tsx (Suspense raiz congela HTTP 200 antes do notFound)', () => {
    assert.equal(existsSync(resolve(appDir, 'loading.tsx')), false);
  });
});

describe('error.tsx — segurança e acessibilidade', () => {
  it('é um Client Component', () => {
    assert.match(errorSrc, /['"]use client['"]/);
  });

  it('possui role="alert"', () => {
    assert.match(errorSrc, /role=["']alert["']/);
  });

  it('possui botão "Tentar novamente" que chama reset()', () => {
    assert.match(errorSrc, /Tentar novamente/);
    assert.match(errorSrc, /onClick=\{reset\}/);
  });

  it('possui link para página inicial', () => {
    assert.match(errorSrc, /href=["']\/["']/);
    assert.match(errorSrc, /Página inicial/);
  });

  it('não renderiza error.message, stack ou digest no markup', () => {
    assert.doesNotMatch(errorSrc, /\{error\.message\}/);
    assert.doesNotMatch(errorSrc, /\{error\.stack\}/);
    assert.doesNotMatch(errorSrc, /\{error\.digest\}/);
  });

  it('repassa not-found do App Router em vez de tratar como erro genérico', () => {
    assert.match(errorSrc, /NEXT_HTTP_ERROR_FALLBACK;404/);
    assert.match(errorSrc, /NEXT_NOT_FOUND/);
    assert.match(errorSrc, /throw error/);
  });

  it('não serializa stack, digest ou mensagem original', () => {
    const combined = errorSrc.toLowerCase();
    assert.ok(!combined.includes('json.stringify'));
    assert.ok(!combined.includes('innerhtml'));
    assert.ok(!combined.includes('dangerouslysetinnerhtml'));
  });

  it('não expõe URL, token ou dado pessoal', () => {
    assert.doesNotMatch(errorSrc, /window\.location/);
    assert.doesNotMatch(errorSrc, /document\.cookie/);
    assert.doesNotMatch(errorSrc, /localStorage/);
    assert.doesNotMatch(errorSrc, /sessionStorage/);
  });
});

describe('system-feedback.module.css — acessibilidade visual', () => {
  it('alvos de toque com mínimo 44px', () => {
    assert.match(cssSrc, /min-height:\s*44px/);
    assert.match(cssSrc, /min-width:\s*44px/);
  });

  it('respeita prefers-reduced-motion', () => {
    assert.match(cssSrc, /prefers-reduced-motion/);
  });

  it('suporta forced-colors', () => {
    assert.match(cssSrc, /forced-colors:\s*active/);
  });

  it('suporta viewport de 320px', () => {
    assert.match(cssSrc, /max-width:\s*320px/);
  });
});

describe('regressão HTTP — evento inexistente permanece 404', () => {
  it('GET /evento/{slug}-inexistente responde 404, não 200', async () => {
    const apiPort = await freePort();
    const webPort = await freePort();
    const api = startMockPublicApi(apiPort);
    let web;

    try {
      await ensureWebBuild();
      web = await startNext(webPort, apiPort);
      const response = await fetch(
        `http://127.0.0.1:${webPort}/evento/congresso-automatizado-evolvia-inexistente`,
        { headers: { accept: 'text/html' } },
      );
      const html = await response.text();

      assert.equal(
        response.status,
        404,
        `esperado 404, recebido ${response.status}`,
      );
      assert.notEqual(response.status, 200);
      assert.doesNotMatch(html, /Algo deu errado/);
      assert.doesNotMatch(html, /\{error\.message\}|\{error\.stack\}/);
    } finally {
      await api.close();
      if (web) await web.close();
    }
  });
});

function startMockPublicApi(port) {
  const server = createServer((req, res) => {
    if (req.url?.startsWith('/public/events/')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"error":"not_found"}');
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{"error":"not_found"}');
  });
  server.listen(port, '127.0.0.1');
  return {
    close() {
      return new Promise((resolveClose) => {
        server.closeAllConnections?.();
        server.close(() => resolveClose());
      });
    },
  };
}

async function ensureWebBuild() {
  if (existsSync(resolve(webRoot, '.next', 'BUILD_ID'))) return;
  await runCommand('npx', ['next', 'build'], webRoot, {});
}

async function startNext(webPort, apiPort) {
  const nextBin = resolve(webRoot, 'node_modules/next/dist/bin/next');
  const child = spawn(
    process.execPath,
    [nextBin, 'start', '-H', '127.0.0.1', '-p', String(webPort)],
    {
      cwd: webRoot,
      env: {
        ...process.env,
        EVOLVIA_API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    },
  );

  const ready = waitForOutput(child, /Ready/i, 20_000);
  try {
    await ready;
  } catch (error) {
    killProcessGroup(child);
    throw error;
  }

  return {
    close() {
      return new Promise((resolveClose) => {
        const finish = () => resolveClose();
        child.once('exit', finish);
        killProcessGroup(child);
        setTimeout(() => {
          killProcessGroup(child, 'SIGKILL');
          finish();
        }, 1_500).unref();
      });
    },
  };
}

function killProcessGroup(child, signal = 'SIGTERM') {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // processo já encerrado
    }
  }
}

function waitForOutput(child, pattern, timeoutMs) {
  return new Promise((resolveReady, reject) => {
    let output = '';
    const onData = (chunk) => {
      output += chunk.toString();
      if (pattern.test(output)) {
        cleanup();
        resolveReady();
      }
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`next start saiu com código ${code}: ${output}`));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout à espera do Next.js: ${output}`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout?.off('data', onData);
      child.stderr?.off('data', onData);
      child.off('exit', onExit);
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('exit', onExit);
  });
}

function runCommand(command, args, cwd, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      output += chunk;
    });
    child.on('exit', (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} ${args.join(' ')} falhou (${code}): ${output}`));
    });
  });
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(port);
      });
    });
    server.on('error', reject);
  });
}
