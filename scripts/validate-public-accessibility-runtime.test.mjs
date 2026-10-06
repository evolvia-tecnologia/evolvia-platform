import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  TIMEOUT_MESSAGE,
  allowedPathKey,
  browserHarness,
  discoverPublicEventPath,
  evaluateAccessibilitySnapshot,
  fetchFinalHttpStatus,
  removeChromiumProfile,
  resolveAllowedUrl,
  resolveBaseUrl,
  runWithWatchdog,
  sanitizeHorizontalOffenders,
  stopChrome,
  summarizeRuntimeException,
  waitForPageLoad,
} from './validate-public-accessibility-runtime.mjs';

function passingSnapshot(overrides = {}) {
  return {
    rota: '/',
    viewport: '1366x768',
    httpStatus: 200,
    clientWidth: 1366,
    scrollWidth: 1366,
    bodyClientWidth: 1366,
    bodyScrollWidth: 1366,
    mainCount: 1,
    mainId: 'main-content',
    skipHref: '#main-content',
    skipName: 'Pular para o conteúdo principal',
    skipTargetExists: true,
    skipTargetIsMain: true,
    navAccessibleName: 'Navegação principal',
    headings: [{ level: 1 }, { level: 2 }],
    headerControls: [
      { name: 'Evolvia — início', width: 180, height: 44, visible: true },
      { name: 'Eventos', width: 88, height: 44, visible: true },
    ],
    focusedCritical: [
      { name: 'Pular para o conteúdo principal', hasVisibleFocus: true },
      { name: 'Evolvia — início', hasVisibleFocus: true },
      { name: 'Eventos', hasVisibleFocus: true },
    ],
    unhandledErrors: [],
    ...overrides,
  };
}

test('diagnóstico runtime preserva código React e omite mensagens e origem privada', () => {
  const result = summarizeRuntimeException({ exceptionDetails: {
    text: 'secret@example.com',
    exception: { className: 'Error', description: 'Minified React error #418; args secret@example.com token=secret' },
    stackTrace: { callFrames: [
      { url: 'https://internal.example/_next/static/chunks/app-abc.js?token=secret', lineNumber: 2, columnNumber: 3, functionName: 'secret' },
      { url: 'https://internal.example/private?token=secret', lineNumber: 4, columnNumber: 5 },
    ] },
  } });
  assert.equal(result.reactCode, '418');
  assert.equal(result.className, 'Error');
  assert.deepEqual(result.frames[0], { asset: '/_next/static/chunks/app-abc.js', line: 2, column: 3 });
  assert.equal(result.frames[1].asset, null);
  assert.doesNotMatch(JSON.stringify(result), /secret|internal|token|https|functionName/u);
  assert.deepEqual(summarizeRuntimeException({ exceptionDetails: { exception: { className: 'secret@example.com' } } }),
    { className: 'UnknownError', reactCode: null, frames: [] });
  const evaluation = evaluateAccessibilitySnapshot(passingSnapshot({ unhandledErrors: [result] }));
  assert.equal(evaluation.checks.sem_erro_js.ok, false);
});

test('snapshot válido aprova todas as verificações mecânicas', () => {
  const result = evaluateAccessibilitySnapshot(passingSnapshot());
  assert.equal(result.falhas.length, 0);
  assert.equal(result.checks.http_200.ok, true);
  assert.equal(result.checks.overflow_horizontal.ok, true);
  assert.equal(result.checks.cabecalho_alvos_44.ok, true);
});

test('overflow horizontal falha com mensagem em português', () => {
  const result = evaluateAccessibilitySnapshot(passingSnapshot({
    clientWidth: 320,
    scrollWidth: 480,
    bodyClientWidth: 320,
    bodyScrollWidth: 480,
  }));
  assert.equal(result.checks.overflow_horizontal.ok, false);
  assert.match(result.falhas.join('\n'), /overflow horizontal/u);
  assert.match(result.falhas.join('\n'), /A rota \/ em 1366x768 falhou em overflow_horizontal/u);
});

test('ofensores horizontais no manifesto omitem conteúdo e respeitam o limite', () => {
  const sanitized = sanitizeHorizontalOffenders([
    {
      tag: 'H1',
      id: '',
      className: 'hero',
      left: 33,
      right: 363,
      top: 80,
      width: 330,
      height: 42,
      display: 'block',
      fontSize: '42px',
      fontWeight: '700',
      minWidth: 'auto',
      maxWidth: '16ch',
      overflowWrap: 'normal',
      text: 'owner-1@evolvia-ci.local',
      innerText: 'nome-do-evento',
    },
    ...Array.from({ length: 12 }, () => ({ tag: 'DIV', right: 400 })),
  ]);
  assert.equal(sanitized.length, 8);
  assert.deepEqual(Object.keys(sanitized[0]), [
    'tag', 'id', 'className', 'left', 'right', 'top', 'width', 'height',
    'display', 'fontSize', 'fontWeight', 'minWidth', 'maxWidth', 'overflowWrap',
  ]);
  assert.equal(sanitized[0].tag, 'H1');
  assert.equal(sanitized[0].right, 363);
  assert.equal('text' in sanitized[0], false);
  assert.equal('innerText' in sanitized[0], false);
  assert.doesNotMatch(JSON.stringify(sanitized), /@|owner-|nome-do-evento/u);
});

test('título público do evento usa token menor no móvel e quebra palavra longa', async () => {
  const css = await readFile(new URL('../apps/web/app/evento/[slug]/page.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.hero h1 \{[\s\S]*overflow-wrap: anywhere/u);
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*\.hero h1 \{[\s\S]*font-size: var\(--font-size-display-sm\)/u);
  assert.match(css, /\.contact a,[\s\S]*\.contact span \{[\s\S]*overflow-wrap: anywhere/u);
});

test('ausência de nome acessível no cabeçalho falha com mensagem em português', () => {
  const result = evaluateAccessibilitySnapshot(passingSnapshot({
    headerControls: [
      { name: '', width: 88, height: 44, visible: true },
      { name: 'Eventos', width: 88, height: 44, visible: true },
    ],
    focusedCritical: [
      { name: 'Pular para o conteúdo principal', hasVisibleFocus: true },
      { name: 'Eventos', hasVisibleFocus: true },
    ],
  }));
  assert.equal(result.checks.cabecalho_nomes.ok, false);
  assert.match(result.falhas.join('\n'), /sem nome acessível/u);
});

test('alvo do cabeçalho abaixo de 44 px falha com mensagem em português', () => {
  const result = evaluateAccessibilitySnapshot(passingSnapshot({
    headerControls: [
      { name: 'Evolvia — início', width: 180, height: 44, visible: true },
      { name: 'Entrar', width: 40, height: 32, visible: true },
    ],
    focusedCritical: [
      { name: 'Pular para o conteúdo principal', hasVisibleFocus: true },
      { name: 'Evolvia — início', hasVisibleFocus: true },
      { name: 'Entrar', hasVisibleFocus: true },
    ],
  }));
  assert.equal(result.checks.cabecalho_alvos_44.ok, false);
  assert.match(result.falhas.join('\n'), /40×32 px/u);
  assert.match(result.falhas.join('\n'), /cabecalho_alvos_44/u);
});

test('exceção WCAG 2.5.8 em linha não falha alvo abaixo de 44 px', () => {
  const result = evaluateAccessibilitySnapshot(passingSnapshot({
    headerControls: [
      { name: 'Evolvia — início', width: 180, height: 44, visible: true },
      { name: 'nota de rodapé', width: 20, height: 16, visible: true, inlineInText: true },
    ],
    focusedCritical: [
      { name: 'Pular para o conteúdo principal', hasVisibleFocus: true },
      { name: 'Evolvia — início', hasVisibleFocus: true },
      { name: 'nota de rodapé', hasVisibleFocus: true },
    ],
  }));
  assert.equal(result.checks.cabecalho_alvos_44.ok, true);
  assert.equal(result.falhas.length, 0);
});

function listen(handler) {
  return new Promise((resolveListen) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolveListen({
        server,
        base: resolveBaseUrl(`http://127.0.0.1:${port}`),
        close: () => new Promise((resolveClose, reject) => {
          server.close((error) => (error ? reject(error) : resolveClose()));
        }),
      });
    });
  });
}

test('reflow mede viewport redimensionado sem autosize móvel', async () => {
  const source = await readFile(new URL('./validate-public-accessibility-runtime.mjs', import.meta.url), 'utf8');
  assert.match(source, /mobile: false/u);
  assert.match(source, /sem autosize móvel do Chrome/u);
  assert.doesNotMatch(source, /mobile:\s*viewport\.width\s*<=\s*390/u);
});

test('URLs só podem derivar de EVOLVIA_WEB_URL', () => {
  const base = resolveBaseUrl('http://127.0.0.1:3000');
  assert.equal(resolveAllowedUrl(base, '/eventos?period=PAST').href, 'http://127.0.0.1:3000/eventos?period=PAST');
  assert.equal(allowedPathKey(resolveAllowedUrl(base, '/eventos?period=PAST')), '/eventos?period=PAST');
  assert.throws(
    () => resolveAllowedUrl(base, 'https://example.com/'),
    /origem permitida/u,
  );
  assert.throws(
    () => resolveBaseUrl('http://user:secret@127.0.0.1:3000'),
    /credenciais/u,
  );
});

test('harness estável não exporta estado mutável e cobre descoberta, status e load', async () => {
  assert.equal(Object.isFrozen(browserHarness), true);
  assert.deepEqual(Object.keys(browserHarness), [
    'resolveBaseUrl',
    'resolveAllowedUrl',
    'allowedPathKey',
    'discoverPublicEventPath',
    'fetchFinalHttpStatus',
    'openChromiumCdp',
    'waitForPageLoad',
    'stopChrome',
  ]);
  assert.throws(() => {
    browserHarness.stopChrome = null;
  });

  const fixture = await listen((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/sair') {
      response.writeHead(302, { location: 'https://example.com/' });
      response.end();
      return;
    }
    if (url.pathname === '/eventos') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<h3><a href="/demo-publico-codigo">evento</a></h3>');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<main>ok</main>');
  });

  try {
    assert.equal(await discoverPublicEventPath(fixture.base), '/demo-publico-codigo');
    assert.equal(await fetchFinalHttpStatus(resolveAllowedUrl(fixture.base, '/')), 200);
    await assert.rejects(
      () => fetchFinalHttpStatus(resolveAllowedUrl(fixture.base, '/sair')),
      /origem permitida/u,
    );
  } finally {
    await fixture.close();
  }

  const emptyCatalog = await listen((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<p>sem evento</p>');
  });
  try {
    await assert.rejects(
      () => discoverPublicEventPath(emptyCatalog.base),
      /publicar ao menos um evento/u,
    );
  } finally {
    await emptyCatalog.close();
  }

  const downCatalog = await listen((_request, response) => {
    response.writeHead(503, { 'content-type': 'text/plain' });
    response.end('indisponível');
  });
  try {
    await assert.rejects(
      () => discoverPublicEventPath(downCatalog.base),
      /catálogo \/eventos precisa responder 200/u,
    );
  } finally {
    await downCatalog.close();
  }

  const listeners = new Map();
  const fakeCdp = {
    on(method, listener) {
      listeners.set(method, listener);
      return () => listeners.delete(method);
    },
  };
  const loaded = waitForPageLoad(fakeCdp, 200);
  listeners.get('Page.loadEventFired')({});
  await loaded;
  await assert.rejects(() => waitForPageLoad({ on() { return () => {}; } }, 20), /load no prazo/u);
});

test('timeout rejeita na cadeia observada e executa o cleanup', async () => {
  const ordem = [];
  await assert.rejects(
    () => runWithWatchdog(
      () => new Promise(() => {
        ordem.push('work');
      }),
      {
        timeoutMs: 30,
        timeoutMessage: TIMEOUT_MESSAGE,
        cleanup: async () => {
          ordem.push('cleanup');
        },
      },
    ),
    (error) => {
      assert.equal(error instanceof Error, true);
      assert.equal(error.message, TIMEOUT_MESSAGE);
      return true;
    },
  );
  assert.deepEqual(ordem, ['work', 'cleanup']);
});

test('falha da execução ainda passa pelo cleanup', async () => {
  const ordem = [];
  await assert.rejects(
    () => runWithWatchdog(
      async () => {
        ordem.push('work');
        throw new Error('falha interna da prova');
      },
      {
        timeoutMs: 1_000,
        timeoutMessage: TIMEOUT_MESSAGE,
        cleanup: async () => {
          ordem.push('cleanup');
        },
      },
    ),
    /falha interna da prova/u,
  );
  assert.deepEqual(ordem, ['work', 'cleanup']);
});

test('remoção do perfil repete apenas erros transitórios com backoff limitado', async () => {
  const attempts = [];
  const delays = [];

  await removeChromiumProfile('/tmp/evolvia-a11y-profile-test', {
    remove: async (path, options) => {
      attempts.push({ path, options });
      if (attempts.length < 3) {
        const error = new Error('perfil ainda ocupado');
        error.code = attempts.length === 1 ? 'ENOTEMPTY' : 'EBUSY';
        throw error;
      }
    },
    sleep: async (delay) => {
      delays.push(delay);
    },
    maxRetries: 5,
    retryDelayMs: 100,
  });

  assert.equal(attempts.length, 3);
  assert.deepEqual(delays, [100, 200]);
  assert.deepEqual(attempts[0], {
    path: '/tmp/evolvia-a11y-profile-test',
    options: { recursive: true, force: true },
  });
});

test('remoção do perfil não mascara erro permanente', async () => {
  let attempts = 0;
  const delays = [];
  await assert.rejects(
    () => removeChromiumProfile('/tmp/evolvia-a11y-profile-test', {
      remove: async () => {
        attempts += 1;
        const error = new Error('sem permissão');
        error.code = 'EACCES';
        throw error;
      },
      sleep: async (delay) => {
        delays.push(delay);
      },
    }),
    (error) => error?.code === 'EACCES',
  );
  assert.equal(attempts, 1);
  assert.deepEqual(delays, []);
});

test('remoção do perfil propaga erro transitório após esgotar tentativas', async () => {
  let attempts = 0;
  const delays = [];
  await assert.rejects(
    () => removeChromiumProfile('/tmp/evolvia-a11y-profile-test', {
      remove: async () => {
        attempts += 1;
        const error = new Error('perfil permanece ocupado');
        error.code = 'EPERM';
        throw error;
      },
      sleep: async (delay) => {
        delays.push(delay);
      },
      maxRetries: 2,
      retryDelayMs: 25,
    }),
    (error) => error?.code === 'EPERM',
  );
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [25, 50]);
});

test('stopChrome encerra o processo e remove o perfil temporário', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'evolvia-a11y-test-'));
  await writeFile(join(userDataDir, 'DevToolsActivePort'), '9\n');
  let cdpClosed = false;
  const chrome = spawn('sleep', ['30'], { stdio: 'ignore' });
  assert.equal(chrome.killed, false);
  assert.equal(chrome.exitCode, null);

  await stopChrome({
    cdp: {
      close() {
        cdpClosed = true;
      },
    },
    chrome,
    userDataDir,
  });

  assert.equal(cdpClosed, true);
  assert.notEqual(chrome.exitCode ?? chrome.signalCode, null);
  await assert.rejects(() => access(userDataDir), /ENOENT/u);
});
