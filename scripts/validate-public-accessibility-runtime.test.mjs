import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  TIMEOUT_MESSAGE,
  evaluateAccessibilitySnapshot,
  resolveAllowedUrl,
  resolveBaseUrl,
  runWithWatchdog,
  stopChrome,
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

test('URLs só podem derivar de EVOLVIA_WEB_URL', () => {
  const base = resolveBaseUrl('http://127.0.0.1:3000');
  assert.equal(resolveAllowedUrl(base, '/eventos?period=PAST').href, 'http://127.0.0.1:3000/eventos?period=PAST');
  assert.throws(
    () => resolveAllowedUrl(base, 'https://example.com/'),
    /origem permitida/u,
  );
  assert.throws(
    () => resolveBaseUrl('http://user:secret@127.0.0.1:3000'),
    /credenciais/u,
  );
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
