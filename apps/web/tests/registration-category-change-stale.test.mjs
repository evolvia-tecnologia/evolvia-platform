import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../components/registration-operations.tsx', import.meta.url), 'utf8');
const start = source.indexOf('  async function openChange(');
const end = source.indexOf('  async function submitChange(', start);
const script = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function harness() {
  const state = { protocol: 'OLD', options: { old: true }, choice: 'old:lot', error: '', notice: 'old' };
  const requests = [];
  const changeRequest = { current: 0 };
  const api = (url) => new Promise((resolve, reject) => requests.push({ url, resolve, reject }));
  const open = new Function('api', 'eventId', 'changeRequest', 'setError', 'setNotice', 'setChangeProtocol', 'setCategoryOptions', 'setChoice', `${script}; return openChange;`)(
    api, 'event/one', changeRequest,
    (v) => { state.error = v; }, (v) => { state.notice = v; }, (v) => { state.protocol = v; },
    (v) => { state.options = v; }, (v) => { state.choice = v; },
  );
  return { state, requests, changeRequest, open };
}
const result = (name) => ({ current: { categoryId: name, lotId: 'lot' }, choices: [{ categoryId: name, lotId: 'lot', category: name, lot: 'Lote', priceCents: 8000 }] });

test('falha na segunda inscrição limpa formulário e permite nova consulta', async () => {
  const h = harness();
  const first = h.open('FIRST'); h.requests[0].resolve(result('A')); await first;
  assert.equal(h.state.protocol, 'FIRST');
  const second = h.open('SECOND');
  assert.equal(h.state.options, null); assert.equal(h.state.protocol, ''); assert.equal(h.state.choice, '');
  h.requests[1].reject(new Error('indisponível')); await second;
  assert.equal(h.state.error, 'indisponível'); assert.equal(h.state.options, null); assert.equal(h.state.protocol, '');
  const retry = h.open('SECOND'); h.requests[2].resolve(result('B')); await retry;
  assert.equal(h.state.protocol, 'SECOND'); assert.equal(h.state.choice, 'B:lot'); assert.equal(h.state.error, '');
  assert.ok(h.requests.every((r) => r.url.includes('event%2Fone')));
});

test('resposta e erro antigos não substituem a consulta mais recente', async () => {
  for (const failOld of [false, true]) {
    const h = harness();
    const old = h.open('OLD'); const latest = h.open('LATEST');
    h.requests[1].resolve(result('LATEST')); await latest;
    if (failOld) h.requests[0].reject(new Error('erro antigo')); else h.requests[0].resolve(result('OLD'));
    await old;
    assert.equal(h.state.protocol, 'LATEST'); assert.equal(h.state.choice, 'LATEST:lot'); assert.equal(h.state.error, '');
  }
});

test('troca de evento ou desmontagem invalida consulta pendente e resposta inválida mantém formulário fechado', async () => {
  const h = harness(); const old = h.open('OLD'); h.changeRequest.current += 1;
  h.requests[0].resolve(result('OLD')); await old;
  assert.equal(h.state.options, null); assert.equal(h.state.protocol, '');
  const invalid = h.open('INVALID'); h.requests[1].resolve({}); await invalid;
  assert.equal(h.state.options, null); assert.equal(h.state.protocol, ''); assert.ok(h.state.error);
});
