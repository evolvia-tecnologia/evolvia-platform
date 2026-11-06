import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const dataUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const apiBridge = dataUrl('export const api = (...args) => globalThis.__evolviaConnectionsApi(...args);');
const styles = dataUrl('export default new Proxy({}, {get: (_, key) => key});');
const compiled = ts.transpileModule(readFileSync(new URL('../components/integrations-hub.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replace(/from ['"]([^'"]+)['"]/g, (_, name) => 'from ' + JSON.stringify(
  name === '../lib/api' ? apiBridge : name.endsWith('.css') ? styles : pathToFileURL(require.resolve(name)).href,
));
const { default: Hub } = await import(dataUrl(compiled));
const items = ['api', 'webhook', 'presence'].map(kind => ({
  code: kind, foundation: kind, name: kind, summary: kind, category: 'PLATFORM', categoryLabel: 'Plataforma',
  availability: 'READY', availabilityLabel: 'Disponível', availabilityHint: 'Configuração do evento',
  objectives: [], recipes: [], useCases: [], requirements: [], dataShared: [],
}));
const catalog = id => ({ event: { id }, guidance: { summary: 'Guia' }, categories: [], objectives: [], items });
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) :
  Array.isArray(node) ? node.map(text).join('') : node ? text(node.children) : '';
const view = renderer => text(renderer.toJSON());
const button = (renderer, label) => renderer.root.findAllByType('button').find(node => text(node.toJSON?.() ?? {children: node.children}) === label);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function mount(id, api) {
  globalThis.__evolviaConnectionsApi = api;
  let renderer;
  await act(async () => { renderer = create(React.createElement(Hub, { eventId: id })); });
  return renderer;
}
async function close(renderer) { await act(async () => renderer.unmount()); delete globalThis.__evolviaConnectionsApi; }

test('respostas nulas ou malformadas viram erro por recurso e permitem nova consulta', async () => {
  let valid = false;
  const renderer = await mount('A', async url => {
    if (url.endsWith('/integrations')) return catalog('A');
    if (!valid) return url.endsWith('/api-keys') ? null : url.endsWith('/webhooks') ? {items: [null]} : {};
    return url.endsWith('/presence') ? {snippet: null} : {items: []};
  });
  try {
    assert.match(view(renderer), /Não foi possível consultar as preparações/);
    assert.equal(renderer.root.findAll(node => node.props.role === 'alert').length, 4);
    assert.doesNotMatch(view(renderer), /0 chave\(s\)|0 endpoint\(s\)|Consultando as configurações/);
    valid = true;
    await act(async () => button(renderer, 'Atualizar conexões').props.onClick());
    assert.equal(renderer.root.findAll(node => node.props.role === 'alert').length, 0);
    assert.match(view(renderer), /0 chave\(s\)/);
  } finally { await close(renderer); }
});

test('conexões contam somente chaves válidas e preservam falhas parciais', async () => {
  const calls = [];
  const renderer = await mount('A', async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/integrations')) return catalog('A');
    if (url.endsWith('/api-keys')) return { items: [
      { expiresAt: '2999-01-01', revokedAt: null },
      { expiresAt: '2000-01-01', revokedAt: null },
      { expiresAt: '2999-01-01', revokedAt: '2026-01-01' },
    ] };
    if (url.endsWith('/webhooks')) throw new Error('indisponível');
    if (url.endsWith('/preparations')) return { items: [] };
    return { snippet: null };
  });
  try {
    assert.match(view(renderer), /1 chave\(s\) de leitura ativa\(s\)/);
    assert.match(view(renderer), /Não foi possível consultar os endpoints/);
    assert.match(view(renderer), /Endereço público ainda não configurado/);
    assert.equal(renderer.root.findAll(node => node.props.role === 'alert').length, 1);
    assert.ok(calls.every(call => call.options === undefined));
  } finally { await close(renderer); }
});

test('troca de evento descarta consultas tardias do evento anterior', async () => {
  const oldKeys = deferred();
  const renderer = await mount('A', async url => {
    if (url.endsWith('/integrations')) return catalog(url.includes('/A/') ? 'A' : 'B');
    if (url.includes('/A/') && url.endsWith('/api-keys')) return oldKeys.promise;
    if (url.endsWith('/api-keys')) return { items: [] };
    if (url.endsWith('/webhooks') || url.endsWith('/preparations')) return { items: [] };
    return { snippet: null };
  });
  try {
    await act(async () => renderer.update(React.createElement(Hub, { eventId: 'B' })));
    assert.match(view(renderer), /0 chave\(s\) de leitura ativa\(s\)/);
    await act(async () => oldKeys.resolve({ items: [{ expiresAt: '2999-01-01', revokedAt: null }] }));
    assert.match(view(renderer), /0 chave\(s\) de leitura ativa\(s\)/);
    assert.doesNotMatch(view(renderer), /1 chave\(s\)/);
  } finally { await close(renderer); }
});

test('diagnóstico Asaas mostra configuração sem afirmar pagamento e some ao trocar evento', async () => {
  const pending = deferred();
  const renderer = await mount('A', async url => {
    if (url === '/events/A/integrations') return { ...catalog('A'), asaas: {
      state: 'SIMULATED', environment: 'local', message: 'Simulação local. Não há cobrança pelo Asaas.',
    } };
    if (url === '/events/B/integrations') return pending.promise;
    return url.endsWith('/presence') ? { snippet: null } : { items: [] };
  });
  try {
    assert.match(view(renderer), /Pagamento Asaas/);
    assert.match(view(renderer), /simulação local/);
    assert.match(view(renderer), /não comprova criação de cobrança, pagamento ou recebimento de webhook/);
    await act(async () => renderer.update(React.createElement(Hub, { eventId: 'B' })));
    assert.doesNotMatch(view(renderer), /Simulação local|Pagamento Asaas/);
    await act(async () => pending.resolve({ ...catalog('B'), asaas: {
      state: 'BLOCKED', environment: 'production', message: 'A cobrança de produção não está autorizada neste ambiente.',
    } }));
    assert.match(view(renderer), /produção não está autorizada/);
    assert.doesNotMatch(view(renderer), /Simulação local/);
    assert.equal(renderer.root.findAll(node => node.props.role === 'alert').length, 1);
  } finally { await close(renderer); }
});

test('atualização recupera erro sem transformar falha em configuração ativa', async () => {
  let fail = true;
  const renderer = await mount('A', async url => {
    if (url.endsWith('/integrations')) return catalog('A');
    if (url.endsWith('/api-keys')) { if (fail) throw new Error('falha'); return { items: [] }; }
    if (url.endsWith('/webhooks')) return { items: [{ enabled: true }, { enabled: false }] };
    if (url.endsWith('/preparations')) return { items: [] };
    return { snippet: '<div></div>' };
  });
  try {
    assert.match(view(renderer), /Não foi possível consultar as chaves/);
    assert.match(view(renderer), /1 endpoint\(s\) ativo\(s\)/);
    fail = false;
    await act(async () => button(renderer, 'Atualizar conexões').props.onClick());
    assert.match(view(renderer), /0 chave\(s\) de leitura ativa\(s\)/);
    assert.doesNotMatch(view(renderer), /Não foi possível consultar as chaves/);
    assert.match(view(renderer), /Trecho do evento disponível/);
  } finally { await close(renderer); }
});

test('configurar limpa a busca e abre o recurso existente sem criar credenciais', async () => {
  const calls = [];
  const renderer = await mount('A', async (url, options) => {
    calls.push({ url, options });
    return url.endsWith('/integrations') ? catalog('A') : url.endsWith('/presence') ? { snippet: null } : { items: [] };
  });
  try {
    await act(async () => renderer.root.findByProps({ id: 'integrations-search' }).props.onChange({ target: { value: 'sem resultados' } }));
    await act(async () => button(renderer, 'Configurar API do evento').props.onClick());
    assert.equal(renderer.root.findByProps({ id: 'integrations-search' }).props.value, '');
    assert.match(view(renderer), /Emitir chave/);
    assert.ok(calls.every(call => call.options === undefined));
  } finally { await close(renderer); }
});

const diagnostic = (id, message, state = 'NOT_CONFIGURED') => ({
  ...catalog(id), asaas: { state, environment: 'sandbox', message },
});

test('atualizar diagnóstico preserva rascunho e filtros sem recarregar conexões', async () => {
  const pending = deferred();
  const calls = [];
  let catalogCalls = 0;
  const renderer = await mount('A', async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/integrations')) return ++catalogCalls === 1
      ? diagnostic('A', 'Configuração incompleta.') : pending.promise;
    return url.endsWith('/presence') ? { snippet: null } : { items: [] };
  });
  try {
    await act(async () => button(renderer, 'Configurar API do evento').props.onClick());
    await act(async () => renderer.root.findByProps({ id: 'api-key-label' }).props.onChange({ target: { value: 'rascunho' } }));
    await act(async () => renderer.root.findByProps({ id: 'integrations-search' }).props.onChange({ target: { value: 'api' } }));
    const resourceCalls = calls.filter(call => !call.url.endsWith('/integrations')).length;
    let refresh;
    await act(async () => { refresh = button(renderer, 'Atualizar diagnóstico').props.onClick(); });
    assert.equal(button(renderer, 'Atualizar diagnóstico').props.disabled, true);
    assert.match(view(renderer), /Consultando diagnóstico/);
    await act(async () => { pending.resolve(diagnostic('A', 'Configuração localizada.', 'CONFIGURED')); await refresh; });
    assert.match(view(renderer), /Configuração localizada/);
    assert.equal(renderer.root.findByProps({ id: 'api-key-label' }).props.value, 'rascunho');
    assert.equal(renderer.root.findByProps({ id: 'integrations-search' }).props.value, 'api');
    assert.equal(calls.filter(call => !call.url.endsWith('/integrations')).length, resourceCalls);
    assert.equal(button(renderer, 'Atualizar diagnóstico').props.disabled, false);
    assert.ok(calls.every(call => call.options === undefined));
  } finally { await close(renderer); }
});

test('falha ou resposta inválida mantém diagnóstico anterior com aviso e permite recuperação', async () => {
  let response = () => diagnostic('A', 'Resultado anterior.');
  const renderer = await mount('A', async url => url.endsWith('/integrations')
    ? response() : url.endsWith('/presence') ? { snippet: null } : { items: [] });
  try {
    for (const invalid of [
      () => { throw new Error('token secreto remoto'); },
      () => null,
      () => diagnostic('B', 'Outro evento.'),
      () => diagnostic('A', 'Estado inválido.', 'READY'),
      () => ({ ...diagnostic('A', 'Ambiente inválido.'), asaas: { state: 'CONFIGURED', environment: 'unknown', message: 'Não exibir.' } }),
      () => diagnostic('A', ' '),
    ]) {
      response = invalid;
      await act(async () => button(renderer, 'Atualizar diagnóstico').props.onClick());
      assert.match(view(renderer), /Resultado anterior/);
      assert.match(view(renderer), /pode estar desatualizado/);
      assert.doesNotMatch(view(renderer), /token secreto remoto|Outro evento|Estado inválido|Não exibir/);
      assert.equal(button(renderer, 'Atualizar diagnóstico').props.disabled, false);
    }
    response = () => diagnostic('A', 'Consulta recuperada.', 'CONFIGURED');
    await act(async () => button(renderer, 'Atualizar diagnóstico').props.onClick());
    assert.match(view(renderer), /Consulta recuperada/);
    assert.doesNotMatch(view(renderer), /pode estar desatualizado|Resultado anterior/);
  } finally { await close(renderer); }
});

test('resposta tardia da atualização não substitui diagnóstico nem estado de consulta do novo evento', async () => {
  const old = deferred();
  const current = deferred();
  const counts = { A: 0, B: 0 };
  const renderer = await mount('A', async url => {
    const id = url.includes('/A/') ? 'A' : 'B';
    if (url.endsWith('/integrations')) return ++counts[id] === 1
      ? diagnostic(id, `Inicial ${id}.`) : id === 'A' ? old.promise : current.promise;
    return url.endsWith('/presence') ? { snippet: null } : { items: [] };
  });
  try {
    let oldRefresh;
    await act(async () => { oldRefresh = button(renderer, 'Atualizar diagnóstico').props.onClick(); });
    await act(async () => renderer.update(React.createElement(Hub, { eventId: 'B' })));
    assert.match(view(renderer), /Inicial B/);
    assert.equal(button(renderer, 'Atualizar diagnóstico').props.disabled, false);
    let currentRefresh;
    await act(async () => { currentRefresh = button(renderer, 'Atualizar diagnóstico').props.onClick(); });
    await act(async () => { old.resolve(diagnostic('A', 'Tardio A.')); await oldRefresh; });
    assert.match(view(renderer), /Inicial B/);
    assert.doesNotMatch(view(renderer), /Tardio A/);
    assert.equal(button(renderer, 'Atualizar diagnóstico').props.disabled, true);
    await act(async () => { current.resolve(diagnostic('B', 'Atual B.')); await currentRefresh; });
    assert.match(view(renderer), /Atual B/);
    assert.equal(button(renderer, 'Atualizar diagnóstico').props.disabled, false);
  } finally { await close(renderer); }
});


