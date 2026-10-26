import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const panel = await readFile(new URL('../components/event-role-certificates.tsx', import.meta.url), 'utf8');
const types = panel.slice(panel.indexOf('const ROLES'), panel.indexOf('const CODE'));
const handlers = panel.slice(panel.indexOf('  function applySnapshot'), panel.indexOf('  return <section'));
const helpers = panel.slice(panel.indexOf('function toDraft'));
const bind = new Function(stripTypeScriptTypes(`${types}\n${helpers}\nfunction bind(api, state) {
  const eventId = 'event-a';
  const inFlight = state.inFlight ??= { current: false };
  const commands = state.commands ??= { current: new Map() };
  const communicationDraftId = () => '11111111-1111-4111-8111-111111111111';
  const setPackagesRevision = update => { state.packagesRevision = update(state.packagesRevision ?? 0); };
  const selected = 'activity';
  const focus = 'body';
  let busy = state.busy ?? false;
  let refreshRequired = state.refreshRequired ?? false;
  const draft = state.draft;
  const setBusy = value => { busy = value; state.busy = value; };
  const setRefreshRequired = value => { refreshRequired = value; state.refreshRequired = value; };
  const setError = value => { state.error = value; };
  const setNotice = value => { state.notice = value; };
  const setRoles = value => { state.roles = value; };
  const setRecent = value => { state.recent = value; };
  const setDrafts = value => { state.drafts = typeof value === 'function' ? value(state.drafts ?? {}) : value; };
  ${handlers}
  return { save, issue, recover };
}`, { mode: 'transform' }) + '; return bind;')();

const snapshot = { feeCents: 0, roles: [], recent: [] };
const issued = { role: 'activity', batchId: '11111111-1111-4111-8111-111111111111', created: 2, alreadyIssued: 1, pending: 0, skipped: 0, truncated: false, feeCents: 0 };
const saved = { saved: true, role: 'activity', revision: 2, refreshRequired: true, feeCents: 0 };
const draft = { enabled: true, releaseMode: 'manual', releaseDays: '0', hours: '', title: 'Certificado', body: 'Presença', revision: 1 };

test('emissão confirmada preserva contagem quando GET falha e recuperação usa somente GET', async () => {
  const calls = [];
  const state = { draft };
  let reads = 0;
  const api = async (url, options) => {
    calls.push({ url, method: options?.method ?? 'GET' });
    if (options?.method === 'POST') return issued;
    if (++reads === 1) throw new Error('leitura indisponível');
    return snapshot;
  };
  await bind(api, state).issue();
  assert.match(state.notice, /Emitidos agora: 2\. Já existiam: 1/u);
  assert.match(state.error, /emissão foi confirmada/u);
  assert.equal(state.refreshRequired, true);
  assert.equal(state.busy, false);
  await bind(api, state).issue();
  await bind(api, state).save({ preventDefault() {} });
  assert.equal(calls.length, 2, 'escritas bloqueadas enquanto a lista está desatualizada');
  await bind(api, state).recover();
  assert.deepEqual(calls.map(call => call.method), ['POST', 'GET', 'GET']);
  assert.equal(state.refreshRequired, false);
  assert.equal(state.error, '');
  assert.match(state.notice, /Emitidos agora: 2/u);
});

test('GET inválido após emissão mantém confirmação e exige recuperação', async () => {
  const state = { draft };
  await bind(async (_url, options) => options?.method === 'POST' ? issued : null, state).issue();
  assert.equal(state.refreshRequired, true);
  assert.match(state.notice, /Emitidos agora: 2/u);
  assert.match(state.error, /Atualizar lista/u);
});

test('POST recusado não consulta lista nem anuncia emissão', async () => {
  const calls = [];
  const state = { draft };
  await bind(async (_url, options) => { calls.push(options?.method); throw new Error('Papel desligado'); }, state).issue();
  assert.deepEqual(calls, ['POST']);
  assert.equal(state.notice, '');
  assert.equal(state.error, 'Papel desligado');
  assert.equal(state.busy, false);
});

test('configuração confirmada sem snapshot bloqueia PUT até recuperar a revisão', async () => {
  const calls = [];
  const state = { draft };
  const api = async (_url, options) => { calls.push(options?.method ?? 'GET'); return options?.method === 'PUT' ? saved : snapshot; };
  await bind(api, state).save({ preventDefault() {} });
  assert.match(state.notice, /Papel salvo/u);
  assert.equal(state.refreshRequired, true);
  await bind(api, state).save({ preventDefault() {} });
  assert.deepEqual(calls, ['PUT']);
  await bind(api, state).recover();
  assert.deepEqual(calls, ['PUT', 'GET']);
  assert.equal(state.refreshRequired, false);
});

test('recuperação repetida nunca emite nem salva e mantém confirmação na falha', async () => {
  const calls = [];
  const state = { draft, refreshRequired: true, notice: 'Papel salvo.' };
  const api = async (_url, options) => { calls.push(options?.method ?? 'GET'); throw new Error('offline'); };
  await bind(api, state).recover();
  await bind(api, state).recover();
  assert.deepEqual(calls, ['GET', 'GET']);
  assert.equal(state.notice, 'Papel salvo.');
  assert.equal(state.refreshRequired, true);
  assert.equal(state.busy, false);
});

test('PUT recusado mantém erro real e formato antigo de sucesso continua aceito', async () => {
  const state = { draft };
  await bind(async () => { throw new Error('Revisão alterada'); }, state).save({ preventDefault() {} });
  assert.equal(state.error, 'Revisão alterada');
  assert.equal(state.notice, '');
  await bind(async () => snapshot, state).save({ preventDefault() {} });
  assert.match(state.notice, /Papel salvo/u);
  assert.equal(state.refreshRequired, false);
});

