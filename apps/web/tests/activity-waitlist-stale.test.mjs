import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function text(node) {
  if (Array.isArray(node)) return node.map(text).join('');
  if (node && typeof node === 'object') return text(node.props?.children);
  return String(node ?? '');
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = find(item, predicate);
      if (found) return found;
    }
    return null;
  }
  return predicate(node) ? node : find(node.props?.children, predicate);
}

function button(tree, label) {
  return find(tree, (node) => node.type === 'button' && text(node) === label);
}

async function participantHarness() {
  const slots = [];
  const effects = [];
  const pending = [];
  let cursor = 0;
  let cleanup = () => {};
  let lastDeps = null;
  const state = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  };
  const key = `waitlistStale${Math.random().toString(36).slice(2)}`;
  globalThis[key] = {
    useState: state,
    useRef: (initial) => state({ current: initial })[0],
    useEffect: (fn, deps) => { effects.push({ fn, deps }); },
    fetch: (path, options = {}) => new Promise((resolve) => {
      pending.push({ path, method: options.method ?? 'GET', resolve });
    }),
  };
  const react = url(`export const {useState,useRef,useEffect}=globalThis[${JSON.stringify(key)}];`);
  const jsx = url('export const Fragment="fragment"; export const jsx=(type,props,key)=>({type,props,key}); export const jsxs=jsx;');
  const css = url('export default new Proxy({}, {get:(_,name)=>name});');
  const link = url('export default function Link(props){return {type:"a",props};}');
  const modules = { react, 'react/jsx-runtime': jsx, 'next/link': link, './activity-waitlist.module.css': css };
  const source = `const {fetch}=globalThis[${JSON.stringify(key)}];\n` + compile('../components/participant-activity-waitlist.tsx')
    .replace(/from ['"]([^'"]+)['"]/g, (_match, name) => `from ${JSON.stringify(modules[name] ?? name)}`);
  const component = await import(url(source));
  const Panel = component.default;
  const flush = () => {
    const next = effects.at(-1);
    effects.length = 0;
    if (!next) return;
    const same = lastDeps && next.deps && lastDeps.length === next.deps.length && next.deps.every((item, index) => item === lastDeps[index]);
    if (same) return;
    cleanup();
    cleanup = next.fn() ?? (() => {});
    lastDeps = next.deps;
  };
  const render = () => {
    cursor = 0;
    const outer = Panel({ slug: 'congresso' });
    const tree = typeof outer.type === 'function' ? outer.type(outer.props) : outer;
    flush();
    return tree;
  };
  return {
    render, pending, cleanup: () => { cleanup(); delete globalThis[key]; },
    input(tree, label) {
      const field = find(tree, (node) => node.type === 'label' && text(node).startsWith(label));
      return find(field, (node) => node.type === 'input');
    },
  };
}

const waiting = {
  timeZone: 'America/Sao_Paulo',
  waiting: [{
    activityId: 'atividade1', title: 'Oficina', startAt: '2026-11-01T15:00:00.000Z', endAt: '2026-11-01T16:00:00.000Z',
    spaceName: 'Sala', queuedAt: '2026-11-01T14:00:00.000Z', position: 2,
  }],
  full: [],
};

async function enterParticipant(h) {
  const form = find(h.render(), (node) => node.type === 'form');
  const submitted = form.props.onSubmit({ preventDefault() {} });
  h.pending.find((item) => item.path.endsWith('/participant/sessions'))
    .resolve({ ok: true, json: async () => ({ accessToken: 'sessao-opaca' }) });
  await submitted;
  h.render();
  return h.pending.find((item) => item.method === 'GET');
}

const malformedViews = [
  () => new Response('<html>Falha de proxy</html>'),
  () => new Response(''),
  () => Response.json(null),
  () => Response.json([]),
  () => Response.json({}),
  () => Response.json({ ...waiting, waiting: null }),
  () => Response.json({ ...waiting, waiting: [null] }),
  () => Response.json({ ...waiting, full: [{}] }),
];

test('resposta 200 inválida na consulta mostra erro sem derrubar a fila', async () => {
  for (const response of malformedViews) {
    const h = await participantHarness();
    try {
      const listed = await enterParticipant(h);
      listed.resolve(response());
      await new Promise((resolve) => setImmediate(resolve));
      const tree = h.render();
      assert.match(text(find(tree, (node) => node.props?.role === 'alert')), /Resposta inválida do servidor/u);
      assert.doesNotMatch(text(tree), /Carregando a fila|Você não está em nenhuma fila/u);
      assert.ok(button(tree, 'Sair com segurança'));
    } finally { h.cleanup(); }
  }
});

test('resposta inválida ao sair preserva a última consulta e permite recuperar sem repetir a escrita automaticamente', async () => {
  for (const response of malformedViews) {
    const h = await participantHarness();
    try {
      const listed = await enterParticipant(h);
      listed.resolve(Response.json(waiting));
      await new Promise((resolve) => setImmediate(resolve));
      button(h.render(), 'Sair da fila').props.onClick();
      h.pending.find((item) => item.method === 'DELETE').resolve(response());
      await new Promise((resolve) => setImmediate(resolve));
      let tree = h.render();
      assert.match(text(tree), /Posição 2/u);
      assert.match(text(find(tree, (node) => node.props?.role === 'alert')), /Resposta inválida do servidor/u);
      assert.doesNotMatch(text(tree), /Você saiu da fila/u);
      assert.equal(button(tree, 'Sair da fila').props.disabled, false);
      assert.equal(h.pending.filter((item) => item.method === 'DELETE').length, 1);
      button(tree, 'Sair com segurança').props.onClick();
      tree = h.render();
      assert.match(text(tree), /Entrar na fila de uma atividade/u);
      assert.doesNotMatch(text(tree), /Posição 2|Oficina/u);
    } finally { h.cleanup(); }
  }
});

test('erro HTTP mantém a mensagem útil e usa fallback se o corpo não for JSON', async () => {
  for (const [response, expected] of [
    [Response.json({ error: { message: ['Inscrição', 'cancelada.'] } }, { status: 409 }), /Inscrição cancelada\./u],
    [new Response('<html>Indisponível</html>', { status: 502 }), /Não foi possível carregar a fila\./u],
    [Response.json({ message: { invalid: true } }, { status: 500 }), /Não foi possível carregar a fila\./u],
  ]) {
    const h = await participantHarness();
    try {
      const listed = await enterParticipant(h);
      listed.resolve(response);
      await new Promise((resolve) => setImmediate(resolve));
      assert.match(text(find(h.render(), (node) => node.props?.role === 'alert')), expected);
    } finally { h.cleanup(); }
  }
});

async function organizerHarness() {
  const slots = [];
  const effects = [];
  const pending = [];
  let cursor = 0;
  let cleanup = () => {};
  let lastDeps = null;
  const state = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  };
  const key = `waitlistAdmin${Math.random().toString(36).slice(2)}`;
  globalThis[key] = {
    useState: state,
    useRef: (initial) => state({ current: initial })[0],
    useEffect: (fn, deps) => { effects.push({ fn, deps }); },
    api: (path, options = {}) => new Promise((resolve) => pending.push({ path, method: options.method ?? 'GET', resolve })),
    getToken: () => 'organizador',
  };
  const react = url(`export const {useState,useRef,useEffect}=globalThis[${JSON.stringify(key)}];`);
  const jsx = url('export const Fragment="fragment"; export const jsx=(type,props,key)=>({type,props,key}); export const jsxs=jsx;');
  const css = url('export default new Proxy({}, {get:(_,name)=>name});');
  const client = url(`export const api = globalThis[${JSON.stringify(key)}].api; export const getToken = globalThis[${JSON.stringify(key)}].getToken;`);
  const modules = { react, 'react/jsx-runtime': jsx, '../lib/api': client, './activity-waitlist.module.css': css };
  const source = compile('../components/activity-waitlist-admin.tsx')
    .replace(/from ['"]([^'"]+)['"]/g, (_match, name) => `from ${JSON.stringify(modules[name] ?? name)}`);
  const component = await import(url(source));
  const Panel = component.default;
  const flush = () => {
    const next = effects.at(-1);
    effects.length = 0;
    if (!next) return;
    const same = lastDeps && next.deps && lastDeps.length === next.deps.length && next.deps.every((item, index) => item === lastDeps[index]);
    if (same) return;
    cleanup();
    cleanup = next.fn() ?? (() => {});
    lastDeps = next.deps;
  };
  return {
    pending,
    slots,
    cleanup: () => { cleanup(); delete globalThis[key]; },
    render() {
      cursor = 0;
      const outer = Panel({ eventId: 'evento1' });
      const tree = typeof outer.type === 'function' ? outer.type(outer.props) : outer;
      flush();
      return tree;
    },
  };
}

const queue = {
  timeZone: 'America/Sao_Paulo',
  truncated: false,
  activities: [{
    activityId: 'atividade1', title: 'Oficina', startAt: '2026-11-01T15:00:00.000Z', endAt: '2026-11-01T16:00:00.000Z',
    spaceName: 'Sala', published: true, remaining: 1, hiddenCount: 0,
    people: [{ id: 'fila1', participantName: 'Ana Costa', queuedAt: '2026-11-01T14:00:00.000Z', position: 1 }],
  }],
};

test('consulta antiga não restaura a pessoa depois da vaga confirmada', async () => {
  const h = await organizerHarness();
  try {
    h.render();
    const listed = h.pending.find((item) => item.method === 'GET');
    h.slots[0] = queue;
    let tree = h.render();
    const promoting = button(tree, 'Dar a vaga').props.onClick();
    listed.resolve(queue);
    await new Promise((resolve) => setImmediate(resolve));
    const promotion = h.pending.find((item) => item.method === 'POST');
    promotion.resolve({ ...queue, activities: [] });
    await promoting;
    tree = h.render();
    assert.match(text(tree), /Vaga confirmada na agenda/u);
    assert.doesNotMatch(text(tree), /Ana Costa/u);
  } finally {
    h.cleanup();
  }
});

test('consulta antiga não devolve a pessoa à fila depois que ela sai', async () => {
  const h = await participantHarness();
  try {
    let tree = h.render();
    h.input(tree, 'Código da inscrição').props.onChange({ target: { value: 'evo-1' } });
    h.input(h.render(), 'CPF ou documento estrangeiro').props.onChange({ target: { value: '123' } });
    const form = find(h.render(), (node) => node.type === 'form');
    const submitted = form.props.onSubmit({ preventDefault() {} });
    const session = h.pending.find((item) => item.path.endsWith('/participant/sessions'));
    session.resolve({ ok: true, json: async () => ({ accessToken: 'sessao-opaca' }) });
    await submitted;
    tree = h.render();
    const listed = h.pending.find((item) => item.method === 'GET');
    listed.resolve({ ok: true, json: async () => waiting });
    await new Promise((resolve) => setImmediate(resolve));
    tree = h.render();
    assert.match(text(tree), /Posição 2/u);
    const leaving = button(tree, 'Sair da fila').props.onClick();
    button(h.render(), 'Sair com segurança').props.onClick();
    tree = h.render();
    assert.doesNotMatch(text(tree), /Posição 2/u);
    const removal = h.pending.find((item) => item.method === 'DELETE');
    removal.resolve({ ok: true, json: async () => waiting });
    await leaving;
    tree = h.render();
    assert.match(text(tree), /Entrar na fila de uma atividade/u);
    assert.doesNotMatch(text(tree), /Posição 2/u);
    assert.doesNotMatch(text(tree), /Oficina/u);
  } finally {
    h.cleanup();
  }
});
