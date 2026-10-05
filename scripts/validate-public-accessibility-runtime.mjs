import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_TIMEOUT_MS = 240_000;
const PAGE_TIMEOUT_MS = 15_000;
const MANIFEST_LIMIT_BYTES = 256 * 1024;
const MAX_REDIRECTS = 5;
const MAX_TABS = 16;
const PROFILE_REMOVE_MAX_RETRIES = 5;
const PROFILE_REMOVE_RETRY_DELAY_MS = 100;
const RETRYABLE_PROFILE_REMOVE_CODES = new Set(['ENOTEMPTY', 'EBUSY', 'EPERM']);

export const TIMEOUT_MESSAGE = 'A prova de acessibilidade excedeu o tempo máximo de execução.';

export async function runWithWatchdog(work, options) {
  const timeoutMs = options.timeoutMs;
  const cleanup = options.cleanup;
  const message = options.timeoutMessage ?? TIMEOUT_MESSAGE;
  const controller = new AbortController();
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(message));
    }, timeoutMs);
  });
  const workPromise = Promise.resolve().then(() => work(controller.signal));
  workPromise.catch(() => {
    // evita rejeição não observada quando o timeout vence a corrida
  });
  try {
    return await Promise.race([workPromise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
    await cleanup();
  }
}

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 720 },
];

const STATIC_PATHS = [
  '/',
  '/login',
  '/cadastro',
  '/eventos',
  '/eventos?period=PAST',
  '/eventos?period=ALL',
  '/termos-de-uso',
  '/privacidade',
];

export const CHECK_IDS = [
  'http_200',
  'overflow_horizontal',
  'main_unico',
  'skip_destino',
  'nav_nome',
  'headings',
  'cabecalho_nomes',
  'cabecalho_alvos_44',
  'foco_visivel',
  'sem_erro_js',
];

function isMainModule() {
  const invoked = process.argv[1];
  return Boolean(invoked) && fileURLToPath(import.meta.url) === resolve(invoked);
}

function fail(message) {
  throw new Error(message);
}

function check(ok, detalhe) {
  return { ok: Boolean(ok), detalhe };
}

function formatSize(width, height) {
  return `${Math.round(width)}×${Math.round(height)} px`;
}

function wcagTargetException(control) {
  if (control.inlineInText) {
    return 'WCAG 2.2 SC 2.5.8 — alvo em linha no bloco de texto';
  }
  return null;
}

const HORIZONTAL_OFFENDER_LIMIT = 8;

function clipMetric(value, max) {
  return String(value ?? '').slice(0, max);
}

export function sanitizeHorizontalOffenders(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, HORIZONTAL_OFFENDER_LIMIT).map((item) => ({
    tag: clipMetric(item?.tag, 32),
    id: clipMetric(item?.id, 64),
    className: clipMetric(item?.className, 120),
    left: Number(item?.left) || 0,
    right: Number(item?.right) || 0,
    top: Number(item?.top) || 0,
    width: Number(item?.width) || 0,
    height: Number(item?.height) || 0,
    display: clipMetric(item?.display, 32),
    fontSize: clipMetric(item?.fontSize, 32),
    fontWeight: clipMetric(item?.fontWeight, 16),
    minWidth: clipMetric(item?.minWidth, 32),
    maxWidth: clipMetric(item?.maxWidth, 48),
    overflowWrap: clipMetric(item?.overflowWrap, 32),
  }));
}

// Preserve only technical identifiers; exception messages may contain user data.
export function summarizeRuntimeException(params) {
  const details = params?.exceptionDetails ?? {};
  const exception = details.exception ?? {};
  const allowedClasses = new Set(['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'URIError', 'EvalError']);
  const description = String(exception.description ?? '');
  const reactCode = description.match(/Minified React error #(\d{1,4})\b/u)?.[1] ?? null;
  const frames = (details.stackTrace?.callFrames ?? []).slice(0, 4).map((frame) => {
    const asset = String(frame.url ?? '').match(/\/_next\/static\/(?:chunks|media)\/[A-Za-z0-9_.\/-]+\.js(?=[?#]|$)/u)?.[0] ?? null;
    return {
      asset,
      line: Number.isInteger(frame.lineNumber) ? frame.lineNumber : null,
      column: Number.isInteger(frame.columnNumber) ? frame.columnNumber : null,
    };
  });
  return { className: allowedClasses.has(exception.className) ? exception.className : 'UnknownError', reactCode, frames };
}

export function evaluateAccessibilitySnapshot(snapshot) {
  const rota = snapshot.rota ?? 'rota';
  const viewport = snapshot.viewport ?? 'viewport';
  const contexto = `${rota} em ${viewport}`;
  const checks = {};

  checks.http_200 = check(
    snapshot.httpStatus === 200,
    snapshot.httpStatus === 200
      ? 'Resposta final HTTP 200'
      : `Resposta final HTTP ${snapshot.httpStatus ?? 'ausente'}`,
  );

  const overflow = Number(snapshot.scrollWidth) <= Number(snapshot.clientWidth)
    && Number(snapshot.bodyScrollWidth) <= Number(snapshot.bodyClientWidth);
  checks.overflow_horizontal = check(
    overflow,
    overflow
      ? `scrollWidth ${snapshot.scrollWidth} <= clientWidth ${snapshot.clientWidth}`
      : `overflow horizontal (scrollWidth ${snapshot.scrollWidth} > clientWidth ${snapshot.clientWidth})`,
  );

  checks.main_unico = check(
    snapshot.mainCount === 1,
    snapshot.mainCount === 1
      ? 'Exatamente um main'
      : `${snapshot.mainCount ?? 0} elementos main; é exigido exatamente um`,
  );

  const skipOk = Boolean(
    snapshot.skipHref
    && snapshot.skipTargetExists
    && snapshot.skipTargetIsMain
    && (snapshot.skipHref === '#main-content' || snapshot.mainId),
  );
  checks.skip_destino = check(
    skipOk,
    skipOk
      ? `Skip link ${snapshot.skipHref} alcança o main#${snapshot.mainId || 'main-content'}`
      : 'Destino válido do skip link #main-content ausente',
  );

  const navName = String(snapshot.navAccessibleName ?? '').trim();
  checks.nav_nome = check(
    navName.length > 0,
    navName.length > 0
      ? `Navegação principal: ${navName}`
      : 'Navegação principal sem nome acessível',
  );

  const headings = Array.isArray(snapshot.headings) ? snapshot.headings : [];
  let headingOk = headings.length > 0 && headings[0]?.level === 1;
  let headingDetalhe = headings.length === 0
    ? 'Nenhum heading encontrado'
    : `Ordem ${headings.map((item) => `h${item.level}`).join(' → ')}`;
  if (headingOk) {
    for (let index = 1; index < headings.length; index += 1) {
      const previous = headings[index - 1].level;
      const current = headings[index].level;
      if (current > previous + 1) {
        headingOk = false;
        headingDetalhe = `Salto inválido h${previous} → h${current}`;
        break;
      }
    }
  } else if (headings.length > 0) {
    headingDetalhe = `Primeiro heading é h${headings[0].level}; esperado h1`;
  }
  checks.headings = check(headingOk, headingDetalhe);

  const controls = Array.isArray(snapshot.headerControls)
    ? snapshot.headerControls.filter((item) => item.visible)
    : [];
  const unnamed = controls.filter((item) => !String(item.name ?? '').trim());
  checks.cabecalho_nomes = check(
    controls.length > 0 && unnamed.length === 0,
    unnamed.length === 0 && controls.length > 0
      ? `${controls.length} controles visíveis do cabeçalho com nome acessível`
      : unnamed.length > 0
        ? `${unnamed.length} controle(s) do cabeçalho sem nome acessível`
        : 'Nenhum controle visível no cabeçalho',
  );

  const undersized = controls.filter((item) => {
    if (wcagTargetException(item)) return false;
    return Number(item.width) < 44 || Number(item.height) < 44;
  });
  checks.cabecalho_alvos_44 = check(
    controls.length > 0 && undersized.length === 0,
    undersized.length === 0 && controls.length > 0
      ? 'Alvos do cabeçalho com pelo menos 44×44 px'
      : undersized.length > 0
        ? undersized
          .map((item) => `«${item.name || 'sem nome'}» mede ${formatSize(item.width, item.height)}`)
          .join('; ')
        : 'Nenhum alvo interativo visível no cabeçalho',
  );

  const focused = Array.isArray(snapshot.focusedCritical) ? snapshot.focusedCritical : [];
  const missingFocus = focused.filter((item) => !item.hasVisibleFocus);
  const expectedFocus = new Set([
    ...controls.map((item) => String(item.name ?? '').trim()).filter(Boolean),
    ...(snapshot.skipHref ? [String(snapshot.skipName ?? 'Pular para o conteúdo principal').trim()] : []),
  ]);
  const focusedNames = new Set(focused.map((item) => String(item.name ?? '').trim()).filter(Boolean));
  const unseen = [...expectedFocus].filter((name) => !focusedNames.has(name));
  const focusOk = focused.length > 0 && missingFocus.length === 0 && unseen.length === 0;
  checks.foco_visivel = check(
    focusOk,
    focusOk
      ? 'Foco de teclado visível nos controles críticos'
      : missingFocus.length > 0
        ? `Foco invisível em ${missingFocus.map((item) => `«${item.name || 'sem nome'}»`).join(', ')}`
        : unseen.length > 0
          ? `Tab não alcançou ${unseen.map((name) => `«${name}»`).join(', ')}`
          : 'Nenhum controle crítico recebeu foco de teclado',
  );

  const errors = Array.isArray(snapshot.unhandledErrors) ? snapshot.unhandledErrors : [];
  checks.sem_erro_js = check(
    errors.length === 0,
    errors.length === 0
      ? 'Nenhum erro JavaScript não tratado'
      : `${errors.length} erro(s) JavaScript não tratado(s) no carregamento`,
  );

  const falhas = CHECK_IDS
    .filter((id) => !checks[id]?.ok)
    .map((id) => `A rota ${contexto} falhou em ${id}: ${checks[id].detalhe}.`);

  return { checks, falhas };
}

export function resolveBaseUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) fail('EVOLVIA_WEB_URL não foi definida.');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('EVOLVIA_WEB_URL é inválida.');
  }
  if (parsed.username || parsed.password) {
    fail('EVOLVIA_WEB_URL não pode conter credenciais.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    fail('EVOLVIA_WEB_URL precisa usar http ou https.');
  }
  parsed.hash = '';
  parsed.search = '';
  if (parsed.pathname.endsWith('/') && parsed.pathname !== '/') {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  return parsed;
}

export function resolveAllowedUrl(base, pathOrUrl) {
  const candidate = new URL(pathOrUrl, base);
  if (candidate.origin !== base.origin) {
    fail(`Destino fora da origem permitida: ${candidate.origin}`);
  }
  candidate.username = '';
  candidate.password = '';
  return candidate;
}

export function allowedPathKey(url) {
  return `${url.pathname}${url.search}`;
}

function findBrowserBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const resolved = execFileSync('sh', ['-c', 'command -v "$1"', 'sh', candidate], {
        encoding: 'utf8',
      }).trim();
      if (resolved) return resolved;
    } catch {
      // próximo candidato
    }
  }
  fail('Chrome ou Chromium não foi encontrado no runner.');
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.socket.addEventListener('message', (event) => {
      const payload = typeof event.data === 'string' ? event.data : event.data.toString();
      const message = JSON.parse(payload);
      if (message.id != null && this.pending.has(message.id)) {
        const { resolve: resolveSend, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(message.error.message || `Falha CDP ${message.error.code ?? ''}`.trim()));
          return;
        }
        resolveSend(message.result);
        return;
      }
      if (message.method) {
        for (const listener of this.listeners.get(message.method) ?? []) {
          listener(message.params ?? {});
        }
      }
    });
  }

  on(method, listener) {
    const list = this.listeners.get(method) ?? [];
    list.push(listener);
    this.listeners.set(method, list);
    return () => {
      this.listeners.set(method, (this.listeners.get(method) ?? []).filter((item) => item !== listener));
    };
  }

  send(method, params = {}, timeoutMs = 20_000) {
    const id = ++this.nextId;
    return new Promise((resolveSend, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`A chamada CDP ${method} excedeu o tempo limite.`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolveSend(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.socket.close();
    } catch {
      // encerramento idempotente
    }
  }
}

async function waitForDevtoolsPort(userDataDir, timeoutMs = 15_000) {
  const portFile = resolve(userDataDir, 'DevToolsActivePort');
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const [port] = (await readFile(portFile, 'utf8')).split('\n');
      const parsed = Number.parseInt(port, 10);
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    } catch {
      // o Chrome ainda está abrindo a porta
    }
    await sleep(50);
  }
  fail('O Chromium não publicou a porta DevTools no prazo.');
}

async function openCdp(browserPath, userDataDir) {
  const chrome = spawn(browserPath, [
    `--user-data-dir=${userDataDir}`,
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    'about:blank',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  chrome.stdout?.resume();
  chrome.stderr?.resume();

  try {
    const port = await waitForDevtoolsPort(userDataDir);
    const listResponse = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!listResponse.ok) fail('Não foi possível listar os alvos DevTools.');
    const targets = await listResponse.json();
    const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
    if (!page) fail('Nenhum alvo de página DevTools está disponível.');
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolveOpen, reject) => {
      socket.addEventListener('open', () => resolveOpen(), { once: true });
      socket.addEventListener('error', () => reject(new Error('Falha ao abrir o WebSocket do DevTools.')), { once: true });
    });
    return { chrome, cdp: new CdpClient(socket) };
  } catch (error) {
    chrome.kill('SIGKILL');
    throw error;
  }
}

export async function fetchFinalHttpStatus(url) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      headers: { accept: 'text/html' },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) fail(`Redirecionamento sem Location em ${allowedPathKey(current)}.`);
      current = resolveAllowedUrl(url, location);
      continue;
    }
    return response.status;
  }
  fail(`A rota ${allowedPathKey(url)} excedeu o limite de redirecionamentos.`);
}

export async function discoverPublicEventPath(base) {
  const catalogUrl = resolveAllowedUrl(base, '/eventos');
  const response = await fetch(catalogUrl, {
    headers: { accept: 'text/html' },
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
  });
  if (response.status !== 200) {
    fail(`O catálogo /eventos precisa responder 200 para descobrir /[slug] (recebido ${response.status}).`);
  }
  const html = (await response.text()).slice(0, 512_000);
  const match = html.match(/<h3\b[^>]*>\s*<a\b[^>]*\bhref="(\/[^/"#?]+)"/u);
  if (!match?.[1]) {
    fail('A jornada de CI precisa publicar ao menos um evento antes da prova de acessibilidade.');
  }
  return resolveAllowedUrl(base, match[1]).pathname;
}

const COLLECT_SNAPSHOT_JS = `(() => {
  const scrollRoot = document.documentElement;
  const body = document.body;
  const mains = [...document.querySelectorAll('main')];
  const skip = document.querySelector('a.skip-link, a[href="#main-content"]');
  const skipHref = skip?.getAttribute('href') || '';
  const skipTarget = skipHref ? document.querySelector(skipHref) : null;
  const header = document.querySelector('header');
  const nav = header?.querySelector('nav') || document.querySelector('nav[aria-label], nav[aria-labelledby]');
  const accessibleName = (el) => {
    if (!el) return '';
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      return labelledby.split(/\\s+/u).map((id) => document.getElementById(id)?.innerText || '').join(' ').replace(/\\s+/gu, ' ').trim();
    }
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();
    if (el.getAttribute('alt')) return el.getAttribute('alt').trim();
    return (el.innerText || el.textContent || '').replace(/\\s+/gu, ' ').trim();
  };
  const isVisible = (el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) !== 0
      && rect.width > 0
      && rect.height > 0;
  };
  const headerControls = [...(header?.querySelectorAll('a, button, summary, [role="button"]') ?? [])]
    .filter((el) => el.getAttribute('aria-hidden') !== 'true')
    .map((el) => {
      const rect = el.getBoundingClientRect();
      const parent = el.parentElement;
      const inlineInText = getComputedStyle(el).display === 'inline'
        && Boolean(parent && ['P', 'SPAN', 'LI', 'DD', 'TD'].includes(parent.tagName));
      return {
        name: accessibleName(el),
        width: rect.width,
        height: rect.height,
        visible: isVisible(el),
        inlineInText,
      };
    });
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((heading) => ({
    level: Number(heading.tagName.slice(1)),
  }));
  const viewportWidth = scrollRoot.clientWidth;
  const ofensoresHorizontais = [...document.querySelectorAll('body *')]
    .filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.right > viewportWidth || rect.left < 0;
    })
    .slice(0, 8)
    .map((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const className = typeof el.className === 'string' ? el.className : '';
      return {
        tag: el.tagName,
        id: el.id || '',
        className: className.slice(0, 120),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        display: style.display,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        minWidth: style.minWidth,
        maxWidth: style.maxWidth,
        overflowWrap: style.overflowWrap,
      };
    });
  return {
    clientWidth: scrollRoot.clientWidth,
    scrollWidth: scrollRoot.scrollWidth,
    bodyClientWidth: body?.clientWidth ?? 0,
    bodyScrollWidth: body?.scrollWidth ?? 0,
    mainCount: mains.length,
    mainId: mains[0]?.id || '',
    skipHref,
    skipName: accessibleName(skip),
    skipTargetExists: Boolean(skipTarget),
    skipTargetIsMain: Boolean(skipTarget && mains.length === 1 && mains[0] === skipTarget),
    navAccessibleName: accessibleName(nav),
    headings,
    headerControls,
    ofensoresHorizontais,
  };
})()`;

const FOCUS_INFO_JS = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) {
    return { name: '', hasVisibleFocus: false };
  }
  const style = getComputedStyle(el);
  const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
  const outlineVisible = style.outlineStyle !== 'none' && outlineWidth >= 2;
  const shadowVisible = Boolean(style.boxShadow && style.boxShadow !== 'none');
  const labelledby = el.getAttribute('aria-labelledby');
  const name = labelledby
    ? labelledby.split(/\\s+/u).map((id) => document.getElementById(id)?.innerText || '').join(' ').replace(/\\s+/gu, ' ').trim()
    : (el.getAttribute('aria-label') || el.innerText || el.textContent || '').replace(/\\s+/gu, ' ').trim();
  return { name, hasVisibleFocus: outlineVisible || shadowVisible };
})()`;

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    fail('A inspeção da página no Chromium lançou uma exceção.');
  }
  return result.result?.value;
}

async function pressTab(cdp) {
  const event = {
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...event });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
}

async function collectFocus(cdp, expectedNames) {
  await evaluate(cdp, 'document.activeElement && document.activeElement.blur && document.activeElement.blur()');
  const focused = [];
  const seen = new Set();
  for (let index = 0; index < MAX_TABS; index += 1) {
    await pressTab(cdp);
    const info = await evaluate(cdp, FOCUS_INFO_JS);
    if (!info?.name) continue;
    const key = `${info.name}:${info.hasVisibleFocus}`;
    if (!seen.has(key)) {
      seen.add(key);
      focused.push(info);
    }
    const names = new Set(focused.map((item) => item.name));
    if (expectedNames.every((name) => names.has(name))) break;
  }
  return focused;
}

export async function waitForPageLoad(cdp, timeoutMs = PAGE_TIMEOUT_MS) {
  await new Promise((resolveLoad, reject) => {
    const timer = setTimeout(() => reject(new Error('A página não disparou load no prazo.')), timeoutMs);
    const off = cdp.on('Page.loadEventFired', () => {
      clearTimeout(timer);
      off();
      resolveLoad();
    });
  });
}

export async function openChromiumCdp() {
  const browserPath = findBrowserBinary();
  const userDataDir = await mkdtemp(resolve(tmpdir(), 'evolvia-a11y-'));
  try {
    const opened = await openCdp(browserPath, userDataDir);
    return { userDataDir, chrome: opened.chrome, cdp: opened.cdp };
  } catch (error) {
    await removeChromiumProfile(userDataDir);
    throw error;
  }
}

async function inspectRoute(cdp, url, viewport, httpStatus, runtimeErrors) {
  runtimeErrors.length = 0;

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    // Reflow WCAG 1.4.10 mede o viewport redimensionado, sem autosize móvel do Chrome.
    mobile: false,
  });

  const load = waitForPageLoad(cdp);
  await cdp.send('Page.navigate', { url: url.toString() }, PAGE_TIMEOUT_MS);
  await load;
  await sleep(800);

  const collected = await evaluate(cdp, COLLECT_SNAPSHOT_JS);
  const expectedNames = [
    ...(collected.skipName ? [collected.skipName] : []),
    ...collected.headerControls.filter((item) => item.visible && item.name).map((item) => item.name),
  ];
  const focusedCritical = await collectFocus(cdp, expectedNames);

  return {
    rota: allowedPathKey(url),
    viewport: `${viewport.width}x${viewport.height}`,
    httpStatus,
    ...collected,
    focusedCritical,
    unhandledErrors: [...runtimeErrors],
  };
}

function sanitizeManifest(manifest) {
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  if (Buffer.byteLength(json, 'utf8') > MANIFEST_LIMIT_BYTES) {
    fail(`O manifesto de acessibilidade excedeu ${MANIFEST_LIMIT_BYTES} bytes.`);
  }
  return json;
}

function waitForProcessExit(child) {
  if (child.exitCode != null || child.signalCode != null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
  });
}

export async function removeChromiumProfile(userDataDir, options = {}) {
  if (!userDataDir) return;

  const remove = options.remove ?? rm;
  const wait = options.sleep ?? sleep;
  const maxRetries = options.maxRetries ?? PROFILE_REMOVE_MAX_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? PROFILE_REMOVE_RETRY_DELAY_MS;

  for (let attempt = 0; ; attempt += 1) {
    try {
      await remove(userDataDir, { recursive: true, force: true });
      return;
    } catch (error) {
      const retryable = RETRYABLE_PROFILE_REMOVE_CODES.has(error?.code);
      if (!retryable || attempt >= maxRetries) throw error;
      await wait(retryDelayMs * (attempt + 1));
    }
  }
}

export async function stopChrome(session) {
  if (session?.cdp) session.cdp.close();
  if (session?.chrome && session.chrome.exitCode == null && session.chrome.signalCode == null) {
    const exited = waitForProcessExit(session.chrome);
    session.chrome.kill('SIGTERM');
    const outcome = await Promise.race([
      exited.then(() => 'exited'),
      sleep(300).then(() => 'timeout'),
    ]);
    if (outcome === 'timeout' && session.chrome.exitCode == null && session.chrome.signalCode == null) {
      session.chrome.kill('SIGKILL');
      await exited;
    }
  }
  if (session?.userDataDir) {
    await removeChromiumProfile(session.userDataDir);
  }
}

export const browserHarness = Object.freeze({
  resolveBaseUrl,
  resolveAllowedUrl,
  allowedPathKey,
  discoverPublicEventPath,
  fetchFinalHttpStatus,
  openChromiumCdp,
  waitForPageLoad,
  stopChrome,
});

export async function runCli(options = {}) {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? SCRIPT_TIMEOUT_MS;
  const base = resolveBaseUrl(process.env.EVOLVIA_WEB_URL);
  const output = resolve(process.env.EVOLVIA_A11Y_OUTPUT ?? 'visual-evidence/public-accessibility-runtime.json');
  const sourceSha = process.env.GITHUB_SHA ?? null;
  const falhas = [];
  const resultados = [];
  let session;
  const runtimeErrors = [];

  await runWithWatchdog(async (signal) => {
    try {
      const eventPath = await discoverPublicEventPath(base);
      const routes = [
        ...STATIC_PATHS.map((path) => resolveAllowedUrl(base, path)),
        resolveAllowedUrl(base, eventPath),
      ];
      session = await openChromiumCdp();

      await session.cdp.send('Runtime.enable');
      await session.cdp.send('Page.enable');
      session.cdp.on('Runtime.exceptionThrown', (params) => {
        runtimeErrors.push(summarizeRuntimeException(params));
      });

      for (const url of routes) {
        if (signal.aborted) fail(TIMEOUT_MESSAGE);
        const httpStatus = await fetchFinalHttpStatus(url);
        for (const viewport of VIEWPORTS) {
          if (signal.aborted || Date.now() - started > timeoutMs - 10_000) {
            fail(TIMEOUT_MESSAGE);
          }
          const snapshot = await inspectRoute(session.cdp, url, viewport, httpStatus, runtimeErrors);
          const evaluation = evaluateAccessibilitySnapshot(snapshot);
          const rota = {
            rota: snapshot.rota,
            viewport: snapshot.viewport,
            httpStatus,
            verificacoes: evaluation.checks,
          };
          if (!evaluation.checks.overflow_horizontal.ok) {
            rota.ofensoresHorizontais = sanitizeHorizontalOffenders(snapshot.ofensoresHorizontais);
          }
          if (!evaluation.checks.sem_erro_js.ok) {
            rota.errosRuntime = snapshot.unhandledErrors.slice(0, 8);
          }
          resultados.push(rota);
          falhas.push(...evaluation.falhas);
        }
      }

      const persist = async (ok) => {
        const manifest = {
          sourceSha,
          origemPermitida: base.origin,
          navegador: 'chromium-cdp',
          rotas: resultados,
          ok,
        };
        const json = sanitizeManifest(manifest);
        await mkdir(dirname(output), { recursive: true });
        await writeFile(output, json, 'utf8');
      };

      await persist(falhas.length === 0);

      if (falhas.length > 0) {
        console.error(falhas.join('\n'));
        process.exitCode = 1;
        return;
      }

      console.log(JSON.stringify({
        sourceSha,
        arquivo: output,
        rotas: resultados.length,
        ok: true,
      }));
    } catch (error) {
      if (resultados.length > 0) {
        try {
          const json = sanitizeManifest({
            sourceSha,
            origemPermitida: base.origin,
            navegador: 'chromium-cdp',
            rotas: resultados,
            ok: false,
          });
          await mkdir(dirname(output), { recursive: true });
          await writeFile(output, json, 'utf8');
        } catch {
          // o manifesto parcial não pode mascarar a falha original
        }
      }
      throw error;
    }
  }, {
    timeoutMs,
    timeoutMessage: TIMEOUT_MESSAGE,
    cleanup: async () => stopChrome(session),
  });
}

if (isMainModule()) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Falha na prova de acessibilidade runtime.');
    process.exitCode = 1;
  });
}
