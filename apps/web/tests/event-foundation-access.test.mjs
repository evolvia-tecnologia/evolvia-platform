import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
const eventPayload = (profileCode = 'CORPORATE_TRAINING', eventType = 'Congresso') => ({
  event: { id: 'evento-qa', name: 'Evento QA', status: 'PUBLISHED', profileCode, format: 'IN_PERSON', organization: { name: 'Organização QA' } },
  session: { completionPercent: 100, status: 'COMPLETED' },
  answers: { eventType, capabilities: [] },
});
const text = (node) => node.children.map((child) => typeof child === 'string' ? child : text(child)).join('');
const foundationHref = '/eventos/evento-qa/configuracao?review=foundation';

function loadComponents(api) {
  const cache = new Map();
  const router = { replace() {} };
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} }; cache.set(path, module);
    const result = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
    new Function('require', 'module', 'exports', result.outputText)((name) => {
      if (name.endsWith('.css')) return { __esModule: true, default: {} };
      if (name === 'next/link') return ({ children, ...props }) => React.createElement('a', props, children);
      if (name === 'next/navigation') return { useRouter: () => router, usePathname: () => '/eventos/evento-qa/painel' };
      if (name === '../lib/api') return { api, ApiError, getToken: () => 'qa-session' };
      if (['./accessibility-panel', './event-subject-areas', './publication-editor', './integrations-hub', './eva-screen-support'].includes(name)) return () => null;
      if (name.startsWith('.')) {
        const base = resolve(dirname(path), name);
        return load(base + (name === './event-workspace' ? '.tsx' : '.ts'));
      }
      return require(name);
    }, module, module.exports);
    return module.exports;
  }
  const directory = fileURLToPath(new URL('../components/', import.meta.url));
  return {
    Workspace: load(resolve(directory, 'event-workspace.tsx')).default,
    Dashboard: load(resolve(directory, 'event-admin-dashboard.tsx')).default,
  };
}

async function withTree(api, mobile, render, run) {
  const previousWindow = globalThis.window;
  globalThis.window = {
    matchMedia: () => ({ matches: mobile, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {}, removeEventListener() {},
  };
  let tree;
  try {
    const components = loadComponents(api);
    await act(async () => { tree = create(render(components)); });
    await run(tree, components);
  } finally {
    if (tree) await act(async () => tree.unmount());
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

test('Geral oferece Informações do evento nos perfis, com destino canônico e sem outro item ativo', async () => {
  for (const [profile, eventType] of [
    ['CORPORATE_TRAINING', 'Convenção'], ['SCIENTIFIC_EVENT', 'Congresso'],
    ['FAIR_EXHIBITION', 'Feira'], ['ENTERTAINMENT', 'Show ou entretenimento'],
    ['SOCIAL_COMMUNITY', 'Corrida'],
  ]) {
    await withTree(async () => { throw new Error('Não deve buscar com payload autorizado'); }, false,
      ({ Workspace }) => React.createElement(Workspace, { eventId: 'evento-qa', section: 'overview', payload: eventPayload(profile, eventType) }, 'Conteúdo'),
      async (tree) => {
        const nav = tree.root.findByProps({ 'aria-label': 'Navegação do evento' });
        const links = nav.findAllByType('a');
        const foundation = links.find((link) => link.props.href === foundationHref);
        assert.ok(foundation, profile);
        assert.equal(text(foundation), '✎Informações do eventoNome, datas, local e formato');
        assert.equal(text(nav.findAllByType('span')[0]), 'Geral');
        assert.equal(links[1], foundation);
        assert.equal(foundation.props.tabIndex, undefined);
        assert.equal(foundation.props['aria-current'], undefined);
        assert.equal(links.filter((link) => link.props['aria-current'] === 'page').length, 1);
      });
  }
});

test('menu móvel fecha após escolher Informações e links ocultos saem da ordem de tabulação', async () => {
  await withTree(async () => ({}), true,
    ({ Workspace }) => React.createElement(Workspace, { eventId: 'evento-qa', section: 'overview', payload: eventPayload() }, 'Conteúdo'),
    async (tree) => {
      const toggle = () => tree.root.findByProps({ 'aria-controls': 'event-admin-navigation' });
      const foundation = () => tree.root.findByProps({ 'aria-label': 'Navegação do evento' }).findAllByType('a').find((link) => link.props.href === foundationHref);
      assert.equal(toggle().props['aria-expanded'], false);
      assert.equal(foundation().props.tabIndex, -1);
      await act(async () => { toggle().props.onClick(); });
      assert.equal(toggle().props['aria-expanded'], true);
      assert.equal(foundation().props.tabIndex, undefined);
      await act(async () => { foundation().props.onClick(); });
      assert.equal(toggle().props['aria-expanded'], false);
      assert.equal(foundation().props.tabIndex, -1);
    });
});

test('visão geral carregada oferece edição de informações sem gravar dados nem publicar', async () => {
  const calls = [];
  await withTree(async (path, options) => { calls.push({ path, method: options?.method }); return eventPayload(); }, false,
    ({ Dashboard }) => React.createElement(Dashboard, { eventId: 'evento-qa', section: 'overview' }),
    async (tree) => {
      const card = tree.root.findAllByType('article').find((article) => article.findAllByType('h3').some((h3) => text(h3) === 'Informações do evento'));
      assert.ok(card);
      const link = card.findByType('a');
      assert.equal(link.props.href, foundationHref);
      assert.equal(text(link), 'Editar informações do evento');
      assert.match(text(card), /nome, as datas, o local e o formato/);
      assert.deepEqual(calls, [{ path: '/event-wizard/evento-qa', method: undefined }]);
    });
});

test('erro de autorização não oferece Informações no fallback do operador ou no painel negado', async () => {
  const forbidden = async () => { throw new ApiError('Acesso negado', 403); };
  await withTree(forbidden, false,
    ({ Workspace }) => React.createElement(Workspace, { eventId: 'evento-qa', section: 'check-in' }, 'Posto operacional'),
    async (tree) => {
      assert.equal(tree.root.findByProps({ 'data-shell': 'operation' }).props['data-shell'], 'operation');
      assert.match(JSON.stringify(tree.toJSON()), /Posto operacional/);
      assert.equal(tree.root.findAllByType('a').some((link) => link.props.href.includes('/configuracao')), false);
    });
  await withTree(forbidden, false,
    ({ Dashboard }) => React.createElement(Dashboard, { eventId: 'evento-qa', section: 'overview' }),
    async (tree) => {
      assert.match(JSON.stringify(tree.toJSON()), /Acesso negado/);
      assert.equal(tree.root.findAllByType('a').some((link) => link.props.href.includes('/configuracao')), false);
    });
});
