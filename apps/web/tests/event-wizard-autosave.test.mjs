import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../components/event-wizard.tsx', import.meta.url), 'utf8');
// Localiza o callback pela AST: independente da ordem dos hooks, espaços e tipos.
const parsed = ts.createSourceFile('event-wizard.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let saveCallback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'queueSave') {
    const initializer = node.initializer;
    assert.ok(initializer && ts.isCallExpression(initializer));
    saveCallback = initializer.arguments[0];
  }
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.ok(saveCallback && ts.isArrowFunction(saveCallback), 'callback de salvamento encontrado pela AST');
const compiled = ts.transpileModule('globalThis.save = ' + saveCallback.getText(parsed) + ';', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);

class ApiError extends Error {
  constructor(status) { super('falha'); this.status = status; }
}

function harness(draft, response) {
  const state = {
    draftRef: { current: draft }, revisionRef: { current: 3 },
    catalogRef: { current: [] }, savedStepRef: { current: 'identity' },
    saveQueueRef: { current: Promise.resolve() }, dirty: true,
    requests: [], recovered: 0, saveState: 'idle',
  };
  const context = {
    ...state, currentEventId: 'event-test', serialize: JSON.stringify,
    useCallback: (fn) => fn, withRequiredCapabilities: (value) => value,
    ApiError, setDirty: (value) => { state.dirty = value; },
    setSaveState: (value) => { state.saveState = value; },
    api: async (path, options) => {
      state.requests.push({ path, ...JSON.parse(options.body) });
      return response(state.requests.length);
    },
    applyPayload: (payload, overwrite = true) => {
      state.revisionRef.current = payload.session.revision;
      if (overwrite) state.draftRef.current = payload.answers;
    },
    recoverLatest: async () => { state.recovered += 1; },
  };
  vm.createContext(context);
  vm.runInContext(compiled.outputText, context);
  return { state, save: context.save };
}

for (const field of ['name', 'venue']) {
  test(`autosave preserva espaço final em ${field} e permite continuar a próxima palavra`, async () => {
    const local = { [field]: 'Congresso ' };
    const { state, save } = harness(local, async () => ({
      session: { revision: 4 }, answers: { [field]: 'Congresso' },
    }));
    await save('identity');
    assert.equal(state.draftRef.current[field], 'Congresso ');
    assert.equal(state.dirty, false);
    assert.equal(state.revisionRef.current, 4);
    state.draftRef.current = { [field]: `${state.draftRef.current[field]}Berg` };
    assert.equal(state.draftRef.current[field], 'Congresso Berg');
  });
}

test('resposta tardia não apaga edição mais recente e mantém autosave pendente', async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const { state, save } = harness({ name: 'Congresso ' }, () => pending);
  const operation = save('identity');
  await Promise.resolve();
  state.draftRef.current = { name: 'Congresso científico', venue: 'São Paulo' };
  resolve({ session: { revision: 4 }, answers: { name: 'Congresso' } });
  await operation;
  assert.equal(state.draftRef.current.name, 'Congresso científico');
  assert.equal(state.draftRef.current.venue, 'São Paulo');
  assert.equal(state.dirty, true);
  assert.equal(state.revisionRef.current, 4);
});

test('fila usa revisão confirmada no próximo PATCH sem retirar espaços internos', async () => {
  const { state, save } = harness({ name: 'Congresso  Berg' }, async (number) => ({
    session: { revision: 3 + number }, answers: { name: 'Congresso Berg' },
  }));
  await Promise.all([save('identity'), save('location')]);
  assert.deepEqual(state.requests.map((request) => request.revision), [3, 4]);
  assert.equal(state.draftRef.current.name, 'Congresso  Berg');
  assert.equal(state.savedStepRef.current, 'location');
});

test('erro de rede preserva texto e permite nova tentativa na mesma revisão', async () => {
  const { state, save } = harness({ venue: 'Centro ' }, async (number) => {
    if (number === 1) throw new Error('rede');
    return { session: { revision: 4 }, answers: { venue: 'Centro' } };
  });
  await assert.rejects(save('location'), /rede/);
  assert.equal(state.draftRef.current.venue, 'Centro ');
  assert.equal(state.dirty, true);
  assert.equal(state.saveState, 'error');
  await save('location');
  assert.deepEqual(state.requests.map((request) => request.revision), [3, 3]);
  assert.equal(state.draftRef.current.venue, 'Centro ');
});

test('conflito 409 continua recuperando versão canônica e interrompe avanço', async () => {
  const { state, save } = harness({ name: 'Congresso ' }, async () => { throw new ApiError(409); });
  await assert.rejects(save('location'), /outra sessão/);
  assert.equal(state.recovered, 1);
  assert.equal(state.savedStepRef.current, 'identity');
});
