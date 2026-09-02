import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  resolveAllowedUrl,
  resolveBaseUrl,
} from './validate-public-accessibility-runtime.mjs';

const SCRIPT_TIMEOUT_MS = 120_000;
const PAGE_TIMEOUT_MS = 15_000;
const SETTLE_MS = 400;
const MANIFEST_LIMIT_BYTES = 64 * 1024;
const MAX_REDIRECTS = 5;
const MAX_NAME_LENGTH = 80;

const STATIC_PATHS = [
  '/',
  '/login',
  '/cadastro',
  '/eventos',
  '/termos-de-uso',
  '/privacidade',
];

const ROUTES_WITH_CURRENT = new Set([
  '/eventos',
  '/termos-de-uso',
  '/privacidade',
]);

export const CHECK_IDS = [
  'documento',
  'main_unico',
  'nav_principal',
  'marca',
  'headings',
  'controles_nomeados',
  'estado_atual',
  'status_semantico',
  'foco_ignorado',
  'sem_cabecalho_paralelo',
];

const INTERACTIVE_ROLES = new Set([
  'link',
  'button',
  'textbox',
  'textfield',
  'searchbox',
  'search',
  'combobox',
  'listbox',
  'checkbox',
  'radio',
  'switch',
  'menuitem',
  'tab',
  'slider',
  'spinbutton',
]);

const STATUS_ROLES = new Set(['status', 'alert', 'alertdialog']);

function isMainModule() {
  const invoked = process.argv[1];
  return Boolean(invoked) && fileURLToPath(import.meta.url) === resolve(invoked);
}

function shouldRunCli() {
  if (!isMainModule()) return false;
  if (process.env.NODE_TEST_CONTEXT) return false;
  if (process.argv.includes('--test')) return false;
  return !process.execArgv.some((arg) => arg === '--test' || arg.startsWith('--test='));
}

function fail(message) {
  throw new Error(message);
}

function check(ok, detalhe) {
  return { ok: Boolean(ok), detalhe };
}

export function safeName(value) {
  let text = String(value ?? '').replace(/\s+/gu, ' ').trim();
  text = text.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/gu, '[redigido]');
  text = text.replace(/\+?\d[\d\s().-]{8,}\d/gu, '[redigido]');
  if (text.length > MAX_NAME_LENGTH) {
    text = `${text.slice(0, MAX_NAME_LENGTH - 3)}...`;
  }
  return text;
}

function normalizeRole(role) {
  return String(role ?? '').trim().toLowerCase();
}

function axRole(node) {
  return normalizeRole(node?.role?.value ?? node?.role);
}

function axName(node) {
  return safeName(node?.name?.value ?? node?.name ?? '');
}

function axProp(node, name) {
  return (node?.properties ?? []).find((item) => item.name === name)?.value;
}

function axBool(node, name) {
  const value = axProp(node, name);
  return value?.value === true || value === true;
}

function axToken(node, name) {
  const value = axProp(node, name);
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return String(value.value ?? '').trim();
}

function axInt(node, name) {
  const value = axProp(node, name);
  const number = Number(value?.value ?? value);
  return Number.isFinite(number) ? number : null;
}

function hasDescribedBy(node) {
  const value = axProp(node, 'describedby');
  return Boolean(value?.relatedNodes?.length || value?.value);
}

function isCoherentDocumentName(name) {
  const text = String(name ?? '').trim();
  if (text.length < 3) return false;
  if (/^about:blank$/iu.test(text)) return false;
  if (/^https?:\/\//iu.test(text)) return false;
  return true;
}

function isDecorativeSpokenName(name, role) {
  const text = String(name ?? '').trim();
  const normalized = normalizeRole(role);
  if (/barra|decorativ|≡/iu.test(text)) return true;
  if (['image', 'img', 'graphic', 'images'].includes(normalized) && !/evolvia/iu.test(text)) {
    return true;
  }
  return false;
}

function principalNavName(name) {
  return /navega[cç][aã]o principal/iu.test(String(name ?? ''));
}

function brandName(name) {
  return /evolvia/iu.test(String(name ?? ''));
}

export function summarizeAxNodes(nodes, rota = '/') {
  const list = Array.isArray(nodes) ? nodes : [];
  const byId = new Map(list.map((node) => [String(node.nodeId), node]));

  const childrenOf = (node) => (node?.childIds ?? [])
    .map((id) => byId.get(String(id)))
    .filter(Boolean);

  const documents = [];
  const mains = [];
  const navigations = [];
  const banners = [];
  const headings = [];
  const controls = [];
  const statusMessages = [];
  const ignoredFocusable = [];
  let marca = null;

  for (const node of list) {
    const role = axRole(node);
    const name = axName(node);
    const ignored = node.ignored === true;
    const focusable = axBool(node, 'focusable');
    const current = axToken(node, 'current');

    if (ignored && focusable) {
      ignoredFocusable.push({ role, nome: name || 'sem nome' });
    }

    if (role === 'rootwebarea') {
      documents.push({ nome: name });
    }

    if (ignored) continue;

    if (role === 'main') mains.push({ nome: name });
    if (role === 'navigation' || role === 'nav') navigations.push({ nome: name });
    if (role === 'banner') banners.push({ nome: name });

    if (role === 'heading') {
      headings.push({
        nivel: axInt(node, 'level') ?? 0,
        nome: name,
      });
    }

    if (INTERACTIVE_ROLES.has(role)) {
      controls.push({
        papel: role,
        nome: name,
        atual: current === 'page' || current === 'true' || axBool(node, 'selected'),
      });
    }

    if (STATUS_ROLES.has(role)) {
      statusMessages.push({
        papel: role,
        nomeado: Boolean(name) || hasDescribedBy(node),
      });
    }

    if (!marca && INTERACTIVE_ROLES.has(role) && brandName(name)) {
      const falasDecorativas = [];
      const stack = [...childrenOf(node)];
      while (stack.length > 0) {
        const child = stack.pop();
        if (!child || child.ignored === true) continue;
        const childRole = axRole(child);
        const childName = axName(child);
        if (isDecorativeSpokenName(childName, childRole)) {
          falasDecorativas.push({
            papel: childRole || 'sem papel',
            nome: childName || 'sem nome',
          });
        }
        stack.push(...childrenOf(child));
      }
      marca = { nome: name, falasDecorativas };
    }
  }

  return {
    rota,
    documento: documents[0] ?? { nome: '' },
    mains,
    navigations,
    banners,
    headings,
    controls,
    statusMessages,
    ignoredFocusable,
    marca,
  };
}

export function evaluateAxSnapshot(snapshot) {
  const rota = snapshot.rota ?? 'rota';
  const checks = {};
  const nodeHint = (label, extra = '') => extra
    ? `${rota} / ${label} / ${extra}`
    : `${rota} / ${label}`;

  const documentName = safeName(snapshot.documento?.nome ?? '');
  checks.documento = check(
    isCoherentDocumentName(documentName),
    isCoherentDocumentName(documentName)
      ? `RootWebArea «${documentName}»`
      : `contrato RootWebArea com nome coerente violado em ${nodeHint('RootWebArea')}`,
  );

  const mains = Array.isArray(snapshot.mains) ? snapshot.mains : [];
  checks.main_unico = check(
    mains.length === 1,
    mains.length === 1
      ? 'Exatamente um main'
      : `contrato main único violado em ${nodeHint('main', `${mains.length} landmarks main`)}`,
  );

  const navigations = Array.isArray(snapshot.navigations) ? snapshot.navigations : [];
  const principal = navigations.filter((item) => principalNavName(item.nome));
  checks.nav_principal = check(
    principal.length === 1 && Boolean(safeName(principal[0]?.nome)),
    principal.length === 1
      ? `Navegação principal: ${safeName(principal[0].nome)}`
      : `contrato navegação principal nomeada violado em ${nodeHint('navigation', principal.length === 0 ? 'nome ausente' : `${principal.length} ocorrências`)}`,
  );

  const marca = snapshot.marca;
  const decorative = Array.isArray(marca?.falasDecorativas) ? marca.falasDecorativas : [];
  const brandOk = Boolean(marca && brandName(marca.nome) && decorative.length === 0);
  checks.marca = check(
    brandOk,
    !marca || !brandName(marca.nome)
      ? `contrato marca Evolvia violado em ${nodeHint('link', 'nome acessível da marca ausente')}`
      : decorative.length > 0
        ? `contrato marca sem barras decorativas violado em ${nodeHint(decorative[0].papel, decorative[0].nome)}`
        : `Marca «${safeName(marca.nome)}»`,
  );

  const headings = Array.isArray(snapshot.headings) ? snapshot.headings : [];
  const unnamedHeading = headings.find((item) => !safeName(item.nome));
  let headingOk = headings.length > 0 && headings[0]?.nivel === 1 && !unnamedHeading;
  let headingDetalhe = headings.length === 0
    ? `contrato headings relevantes violado em ${nodeHint('heading', 'nenhum heading')}`
    : unnamedHeading
      ? `contrato heading nomeado violado em ${nodeHint(`h${unnamedHeading.nivel || '?'}`, 'nome vazio')}`
      : `Ordem ${headings.map((item) => `h${item.nivel}`).join(' → ')}`;
  if (headingOk) {
    for (let index = 1; index < headings.length; index += 1) {
      const previous = headings[index - 1].nivel;
      const current = headings[index].nivel;
      if (current > previous + 1) {
        headingOk = false;
        headingDetalhe = `contrato headings ordenados violado em ${nodeHint(`h${current}`, `salto h${previous} → h${current}`)}`;
        break;
      }
    }
  } else if (headings.length > 0 && headings[0]?.nivel !== 1 && !unnamedHeading) {
    headingDetalhe = `contrato headings ordenados violado em ${nodeHint(`h${headings[0].nivel}`, 'primeiro heading deveria ser h1')}`;
  }
  checks.headings = check(headingOk, headingDetalhe);

  const controls = Array.isArray(snapshot.controls) ? snapshot.controls : [];
  const unnamedControls = controls.filter((item) => !safeName(item.nome));
  checks.controles_nomeados = check(
    unnamedControls.length === 0,
    unnamedControls.length === 0
      ? `${controls.length} controles com nome acessível`
      : `contrato nome acessível violado em ${nodeHint(unnamedControls[0].papel, 'controle sem nome')}`,
  );

  const needsCurrent = ROUTES_WITH_CURRENT.has(rota);
  const hasCurrent = controls.some((item) => item.atual);
  checks.estado_atual = check(
    !needsCurrent || hasCurrent,
    !needsCurrent
      ? 'Estado atual não se aplica'
      : hasCurrent
        ? 'Estado atual da navegação exposto'
        : `contrato estado atual da navegação violado em ${nodeHint('navigation', rota)}`,
  );

  const statusMessages = Array.isArray(snapshot.statusMessages) ? snapshot.statusMessages : [];
  const unnamedStatus = statusMessages.filter((item) => !item.nomeado);
  checks.status_semantico = check(
    unnamedStatus.length === 0,
    unnamedStatus.length === 0
      ? statusMessages.length === 0
        ? 'Nenhuma mensagem de status renderizada'
        : `${statusMessages.length} mensagem(ns) com papel semântico`
      : `contrato status/erro com papel ou relação semântica violado em ${nodeHint(unnamedStatus[0].papel)}`,
  );

  const ignoredFocusable = Array.isArray(snapshot.ignoredFocusable) ? snapshot.ignoredFocusable : [];
  checks.foco_ignorado = check(
    ignoredFocusable.length === 0,
    ignoredFocusable.length === 0
      ? 'Nenhum controle focável ignorado ou invisível'
      : `contrato controle focável visível violado em ${nodeHint(ignoredFocusable[0].role || ignoredFocusable[0].papel || 'controle', ignoredFocusable[0].nome)}`,
  );

  const extraBanners = bannersOf(snapshot).length > 1;
  const extraPrincipal = principal.length > 1;
  checks.sem_cabecalho_paralelo = check(
    !extraBanners && !extraPrincipal,
    extraBanners
      ? `contrato banner único violado em ${nodeHint('banner', `${bannersOf(snapshot).length} banners`)}`
      : extraPrincipal
        ? `contrato navegação principal única violado em ${nodeHint('navigation', `${principal.length} ocorrências`)}`
        : 'Sem cabeçalho ou navegação paralelos',
  );

  const falhas = CHECK_IDS
    .filter((id) => !checks[id]?.ok)
    .map((id) => `A rota ${rota} falhou em ${id}: ${checks[id].detalhe}.`);

  return { checks, falhas };
}

function bannersOf(snapshot) {
  return Array.isArray(snapshot.banners) ? snapshot.banners : [];
}

export function buildRouteEvidence(snapshot, evaluation) {
  const principal = (snapshot.navigations ?? []).find((item) => principalNavName(item.nome));
  const papeis = {
    RootWebArea: snapshot.documento?.nome ? 1 : 0,
    main: (snapshot.mains ?? []).length,
    navigation: (snapshot.navigations ?? []).length,
    banner: (snapshot.banners ?? []).length,
    heading: (snapshot.headings ?? []).length,
    link: (snapshot.controls ?? []).filter((item) => item.papel === 'link').length,
    button: (snapshot.controls ?? []).filter((item) => item.papel === 'button').length,
    textbox: (snapshot.controls ?? []).filter((item) => item.papel === 'textbox' || item.papel === 'textfield').length,
    searchbox: (snapshot.controls ?? []).filter((item) => item.papel === 'searchbox' || item.papel === 'search').length,
    combobox: (snapshot.controls ?? []).filter((item) => item.papel === 'combobox').length,
    status: (snapshot.statusMessages ?? []).filter((item) => item.papel === 'status').length,
    alert: (snapshot.statusMessages ?? []).filter((item) => item.papel === 'alert' || item.papel === 'alertdialog').length,
  };

  return {
    rota: snapshot.rota,
    papeis,
    nomes: {
      documento: safeName(snapshot.documento?.nome ?? ''),
      marca: safeName(snapshot.marca?.nome ?? ''),
      navegacaoPrincipal: safeName(principal?.nome ?? ''),
      headings: (snapshot.headings ?? []).map((item) => safeName(item.nome)).filter(Boolean),
    },
    contagens: {
      controlesNomeados: (snapshot.controls ?? []).filter((item) => safeName(item.nome)).length,
      controlesSemNome: (snapshot.controls ?? []).filter((item) => !safeName(item.nome)).length,
      headings: (snapshot.headings ?? []).length,
      banners: (snapshot.banners ?? []).length,
      mains: (snapshot.mains ?? []).length,
      mensagensStatus: (snapshot.statusMessages ?? []).length,
    },
    verificacoes: evaluation.checks,
  };
}

function pathKey(url) {
  return `${url.pathname}${url.search}`;
}

export async function discoverPublicEventPath(base) {
  const catalogUrl = resolveAllowedUrl(base, '/eventos');
  const response = await fetch(catalogUrl, {
    headers: { accept: 'text/html' },
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
  });
  if (response.status !== 200) {
    fail(`O catálogo /eventos precisa responder 200 para descobrir /evento/[slug] (recebido ${response.status}).`);
  }
  const html = (await response.text()).slice(0, 512_000);
  const match = html.match(/href="(\/evento\/[^"#?]+)"/u);
  if (!match?.[1]) {
    fail('A jornada de CI precisa publicar ao menos um evento antes da prova da árvore acessível.');
  }
  return resolveAllowedUrl(base, match[1]).pathname;
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

async function fetchFinalStatus(url) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      headers: { accept: 'text/html' },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) fail(`Redirecionamento sem Location em ${pathKey(current)}.`);
      current = resolveAllowedUrl(url, location);
      continue;
    }
    return response.status;
  }
  fail(`A rota ${pathKey(url)} excedeu o limite de redirecionamentos.`);
}

async function waitForLoad(cdp) {
  await new Promise((resolveLoad, reject) => {
    const timer = setTimeout(() => reject(new Error('A página não disparou load no prazo.')), PAGE_TIMEOUT_MS);
    const off = cdp.on('Page.loadEventFired', () => {
      clearTimeout(timer);
      off();
      resolveLoad();
    });
  });
}

async function inspectRoute(cdp, url) {
  const load = waitForLoad(cdp);
  await cdp.send('Page.navigate', { url: url.toString() }, PAGE_TIMEOUT_MS);
  await load;
  await sleep(SETTLE_MS);
  const tree = await cdp.send('Accessibility.getFullAXTree');
  return summarizeAxNodes(tree.nodes ?? [], pathKey(url));
}

function sanitizeManifest(manifest) {
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  if (Buffer.byteLength(json, 'utf8') > MANIFEST_LIMIT_BYTES) {
    fail(`O manifesto da árvore acessível excedeu ${MANIFEST_LIMIT_BYTES} bytes.`);
  }
  return json;
}

async function stopChrome(session) {
  if (session?.cdp) session.cdp.close();
  if (session?.chrome && session.chrome.exitCode == null) {
    session.chrome.kill('SIGTERM');
    await sleep(300);
    if (session.chrome.exitCode == null) session.chrome.kill('SIGKILL');
  }
  if (session?.userDataDir) {
    await rm(session.userDataDir, { recursive: true, force: true });
  }
}

function passingSnapshot(overrides = {}) {
  return {
    rota: '/',
    documento: { nome: 'Evolvia' },
    mains: [{ nome: 'conteúdo principal' }],
    navigations: [{ nome: 'Navegação principal' }],
    banners: [],
    headings: [
      { nivel: 1, nome: 'Eventos publicados na Evolvia' },
      { nivel: 2, nome: 'Resultados' },
    ],
    controls: [
      { papel: 'link', nome: 'Evolvia — início', atual: false },
      { papel: 'link', nome: 'Eventos', atual: false },
      { papel: 'button', nome: 'Buscar eventos', atual: false },
      { papel: 'searchbox', nome: 'Nome ou local', atual: false },
      { papel: 'combobox', nome: 'Formato', atual: false },
    ],
    statusMessages: [],
    ignoredFocusable: [],
    marca: { nome: 'Evolvia — início', falasDecorativas: [] },
    ...overrides,
  };
}

test('snapshot AX válido aprova o contrato das sete rotas', () => {
  const result = evaluateAxSnapshot(passingSnapshot());
  assert.equal(result.falhas.length, 0);
  for (const id of CHECK_IDS) {
    assert.equal(result.checks[id].ok, true, id);
  }
});

test('controle sem nome acessível falha em português com rota e nó', () => {
  const result = evaluateAxSnapshot(passingSnapshot({
    rota: '/login',
    controls: [
      { papel: 'link', nome: 'Evolvia — início', atual: false },
      { papel: 'textbox', nome: '', atual: false },
    ],
  }));
  assert.equal(result.checks.controles_nomeados.ok, false);
  assert.match(result.falhas.join('\n'), /A rota \/login falhou em controles_nomeados/u);
  assert.match(result.falhas.join('\n'), /\/login \/ textbox \/ controle sem nome/u);
});

test('main ausente ou duplicado falha o contrato de landmark', () => {
  const absent = evaluateAxSnapshot(passingSnapshot({ rota: '/cadastro', mains: [] }));
  assert.equal(absent.checks.main_unico.ok, false);
  assert.match(absent.falhas.join('\n'), /\/cadastro \/ main \/ 0 landmarks main/u);

  const duplicated = evaluateAxSnapshot(passingSnapshot({
    rota: '/',
    mains: [{ nome: 'um' }, { nome: 'dois' }],
  }));
  assert.equal(duplicated.checks.main_unico.ok, false);
  assert.match(duplicated.falhas.join('\n'), /\/ \/ main \/ 2 landmarks main/u);
});

test('elemento decorativo da marca pronunciável falha o contrato da marca', () => {
  const result = evaluateAxSnapshot(passingSnapshot({
    rota: '/',
    marca: {
      nome: 'Evolvia — início',
      falasDecorativas: [{ papel: 'image', nome: 'barra decorativa' }],
    },
  }));
  assert.equal(result.checks.marca.ok, false);
  assert.match(result.falhas.join('\n'), /A rota \/ falhou em marca/u);
  assert.match(result.falhas.join('\n'), /\/ \/ image \/ barra decorativa/u);
});

test('navegação principal sem nome falha em português', () => {
  const result = evaluateAxSnapshot(passingSnapshot({
    rota: '/eventos',
    navigations: [{ nome: '' }],
    controls: [
      { papel: 'link', nome: 'Evolvia — início', atual: false },
      { papel: 'link', nome: 'Eventos', atual: true },
    ],
  }));
  assert.equal(result.checks.nav_principal.ok, false);
  assert.match(result.falhas.join('\n'), /A rota \/eventos falhou em nav_principal/u);
  assert.match(result.falhas.join('\n'), /navegação principal nomeada/u);
});

test('summarizeAxNodes detecta barras decorativas e redige e-mail no nome', () => {
  const snapshot = summarizeAxNodes([
    {
      nodeId: '1',
      role: { value: 'RootWebArea' },
      name: { value: 'Evolvia' },
      childIds: ['2'],
    },
    {
      nodeId: '2',
      role: { value: 'link' },
      name: { value: 'Evolvia — início' },
      childIds: ['3'],
    },
    {
      nodeId: '3',
      role: { value: 'image' },
      name: { value: 'contato@evolvia.com' },
      ignored: false,
    },
  ], '/');
  assert.equal(snapshot.marca.nome, 'Evolvia — início');
  assert.equal(snapshot.marca.falasDecorativas.length, 1);
  assert.equal(snapshot.marca.falasDecorativas[0].nome, '[redigido]');
  assert.equal(safeName('Organizador contato@evolvia.com'), 'Organizador [redigido]');
});

export async function runCli() {
  const started = Date.now();
  const base = resolveBaseUrl(process.env.EVOLVIA_WEB_URL);
  const output = resolve(process.env.EVOLVIA_AX_OUTPUT ?? 'visual-evidence/public-accessibility-tree.json');
  const sourceSha = process.env.GITHUB_SHA ?? null;
  const falhas = [];
  const resultados = [];
  let session;

  const watchdog = setTimeout(() => {
    fail('A prova da árvore acessível excedeu o tempo máximo de execução.');
  }, SCRIPT_TIMEOUT_MS);
  watchdog.unref?.();

  try {
    const eventPath = await discoverPublicEventPath(base);
    const routes = [
      ...STATIC_PATHS.map((path) => resolveAllowedUrl(base, path)),
      resolveAllowedUrl(base, eventPath),
    ];
    const browserPath = findBrowserBinary();
    const userDataDir = await mkdtemp(resolve(tmpdir(), 'evolvia-ax-'));
    session = { userDataDir, ...(await openCdp(browserPath, userDataDir)) };

    await session.cdp.send('Page.enable');
    await session.cdp.send('Accessibility.enable');

    for (const url of routes) {
      if (Date.now() - started > SCRIPT_TIMEOUT_MS - 8_000) {
        fail('A prova da árvore acessível foi interrompida para respeitar o limite de tempo.');
      }
      const httpStatus = await fetchFinalStatus(url);
      if (httpStatus !== 200) {
        fail(`A rota ${pathKey(url)} respondeu HTTP ${httpStatus}; a árvore acessível exige 200.`);
      }
      const snapshot = await inspectRoute(session.cdp, url);
      const evaluation = evaluateAxSnapshot(snapshot);
      resultados.push(buildRouteEvidence(snapshot, evaluation));
      falhas.push(...evaluation.falhas);
    }

    const persist = async (ok) => {
      const manifest = {
        sourceSha,
        origemPermitida: base.origin,
        navegador: 'chromium-cdp-ax',
        metodo: 'Accessibility.getFullAXTree',
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
          navegador: 'chromium-cdp-ax',
          metodo: 'Accessibility.getFullAXTree',
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
  } finally {
    clearTimeout(watchdog);
    await stopChrome(session);
  }
}

if (shouldRunCli()) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Falha na prova da árvore acessível.');
    process.exitCode = 1;
  });
}
