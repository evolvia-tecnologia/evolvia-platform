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
const datesHref = '/eventos/evento-qa/configuracao?review=foundation&step=identity';
const locationHref = '/eventos/evento-qa/configuracao?review=foundation&step=location';
const profiles = [
  ['CORPORATE_TRAINING', 'Convenção', /inscrições, o local nem o credenciamento/],
  ['SCIENTIFIC_EVENT', 'Congresso', /janelas de submissão, avaliação nem a programação/],
  ['FAIR_EXHIBITION', 'Feira', /prazos de expositores, CAEX nem credenciais/],
  ['ENTERTAINMENT', 'Show ou entretenimento', /períodos de ingressos, categorias nem lotes/],
  ['SOCIAL_COMMUNITY', 'Corrida', /modalidades, inscrições, kits nem camisetas/],
];

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
      if (['./accessibility-panel', './event-subject-areas', './publication-editor', './integrations-hub'].includes(name)) return () => null;
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

test('Geral oferece Alterar datas / Prorrogar evento nos cinco perfis, sem atalho digitado', async () => {
  for (const [profile, eventType] of profiles) {
    await withTree(async () => { throw new Error('Não deve buscar com payload autorizado'); }, false,
      ({ Workspace }) => React.createElement(Workspace, { eventId: 'evento-qa', section: 'overview', payload: eventPayload(profile, eventType) }, 'Conteúdo'),
      async (tree) => {
        const nav = tree.root.findByProps({ 'aria-label': 'Navegação do evento' });
        const links = nav.findAllByType('a');
        const dates = links.find((link) => link.props.href === datesHref);
        const location = links.find((link) => link.props.href === locationHref);
        assert.ok(dates, profile);
        assert.ok(location, profile);
        assert.equal(text(dates), '✎Alterar datas / Prorrogar eventoInício, término e fuso');
        assert.equal(text(location), '⌂Local e endereçoPresencial, online ou híbrido');
        assert.equal(text(nav.findAllByType('span')[0]), 'Geral');
        assert.equal(links[1], dates);
        assert.equal(links[2], location);
        assert.equal(dates.props.tabIndex, undefined);
        assert.equal(location.props.tabIndex, undefined);
        assert.equal(dates.props['aria-current'], undefined);
        assert.equal(links.filter((link) => link.props['aria-current'] === 'page').length, 1);
      });
  }
});

test('menu móvel fecha após escolher a prorrogação e links ocultos saem da ordem de tabulação', async () => {
  await withTree(async () => ({}), true,
    ({ Workspace }) => React.createElement(Workspace, { eventId: 'evento-qa', section: 'overview', payload: eventPayload() }, 'Conteúdo'),
    async (tree) => {
      const toggle = () => tree.root.findByProps({ 'aria-controls': 'event-admin-navigation' });
      const dates = () => tree.root.findByProps({ 'aria-label': 'Navegação do evento' }).findAllByType('a').find((link) => link.props.href === datesHref);
      assert.equal(toggle().props['aria-expanded'], false);
      assert.equal(dates().props.tabIndex, -1);
      await act(async () => { toggle().props.onClick(); });
      assert.equal(toggle().props['aria-expanded'], true);
      assert.equal(dates().props.tabIndex, undefined);
      await act(async () => { dates().props.onClick(); });
      assert.equal(toggle().props['aria-expanded'], false);
      assert.equal(dates().props.tabIndex, -1);
    });
});

test('visão geral carregada mostra prorrogação, local, imagens e lotes sem gravar nem publicar', async () => {
  for (const [profile, eventType, impact] of profiles) {
    const calls = [];
    await withTree(async (path, options) => { calls.push({ path, method: options?.method }); return eventPayload(profile, eventType); }, false,
      ({ Dashboard }) => React.createElement(Dashboard, { eventId: 'evento-qa', section: 'overview' }),
      async (tree) => {
        const section = tree.root.findByProps({ 'aria-labelledby': 'event-dates-title' });
        assert.equal(text(section.findByType('h2')), 'Alterar datas / Prorrogar evento');
        assert.match(text(section), /Data de início não definida/);
        assert.match(text(section), /Fuso não confirmado/);
        assert.match(text(section), /Local não definido/);
        assert.match(text(section), impact);
        assert.deepEqual(section.findAllByType('a').map((link) => [text(link), link.props.href]), [
          ['Alterar datas / Prorrogar evento', datesHref],
          ['Local e endereço', locationHref],
          ['Página e imagens', '/eventos/evento-qa/painel/divulgacao'],
          ['Categorias e lotes', '/eventos/evento-qa/painel/inscricoes/categorias-lotes'],
        ]);
        assert.equal(tree.root.findAllByType('h3').some((heading) => text(heading) === 'Informações do evento'), false);
        const headings = tree.root.findAllByType('h2').map((heading) => text(heading));
        assert.equal(headings.includes('Responsável financeiro'), false, profile);
        assert.equal(headings.includes('Certificados'), false, profile);
        const hrefs = tree.root.findAllByType('a').map((link) => link.props.href);
        assert.equal(hrefs.some((href) => String(href).endsWith('/painel/financeiro')), false, profile);
        assert.equal(hrefs.some((href) => String(href).endsWith('/painel/show')), profile === 'ENTERTAINMENT', profile);
        assert.deepEqual(calls, [{ path: '/event-wizard/evento-qa', method: undefined }]);
      });
  }
});

test('visão geral mostra a data já salva e a pendência sem nova gravação', async () => {
  const saved = eventPayload('SOCIAL_COMMUNITY', 'Corrida');
  saved.answers = {
    ...saved.answers,
    startDate: '2026-11-09T15:00:00.000Z',
    endDate: '2026-11-10T15:00:00.000Z',
    timeZone: 'America/Sao_Paulo',
    datesPending: false,
    venue: 'Centro de Convenções',
    venuePending: false,
  };
  const pending = eventPayload('FAIR_EXHIBITION', 'Feira');
  pending.answers = { ...pending.answers, datesPending: true, venuePending: true, timeZone: 'America/Sao_Paulo' };
  for (const [payload, expected] of [[saved, /novembro de 2026/iu], [pending, /A definir/]]) {
    const calls = [];
    await withTree(async (path, options) => { calls.push({ path, method: options?.method }); return payload; }, false,
      ({ Dashboard }) => React.createElement(Dashboard, { eventId: 'evento-qa', section: 'overview' }),
      async (tree) => {
        const section = tree.root.findByProps({ 'aria-labelledby': 'event-dates-title' });
        assert.match(text(section), expected);
        if (payload === saved) {
          assert.match(text(section), /Centro de Convenções/);
          assert.match(text(section), /Brasília/);
          assert.match(text(section), /kits nem camisetas/);
        } else {
          assert.match(text(section), /CAEX/);
        }
        assert.deepEqual(calls, [{ path: '/event-wizard/evento-qa', method: undefined }]);
      });
  }
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
