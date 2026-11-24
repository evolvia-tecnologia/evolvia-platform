import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { queueWizardSave } from '../lib/event-wizard-save.ts';
import { stripTypeScriptTypes } from 'node:module';

const apiSource = await readFile(new URL('../lib/api.ts', import.meta.url), 'utf8');
const helperSource = await readFile(new URL('../lib/api-failure-message.ts', import.meta.url), 'utf8');
const helperUrl = 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(helperSource)).toString('base64');
const apiModule = stripTypeScriptTypes(apiSource.replace("'./api-failure-message'", JSON.stringify(helperUrl)), { mode: 'transform' });
const { ApiError } = await import('data:text/javascript;base64,' + Buffer.from(apiModule).toString('base64'));

function harness(draft, response) {
  const state = {
    draftRef: { current: draft }, revisionRef: { current: 3 },
    catalogRef: { current: [] }, savedStepRef: { current: 'identity' },
    saveQueueRef: { current: Promise.resolve() }, dirty: true,
    requests: [], recovered: 0, saveState: 'idle',
  };
  const save = (targetStep, snapshot = state.draftRef.current) => queueWizardSave(targetStep, snapshot, {
    queue: state.saveQueueRef,
    savedStep: state.savedStepRef,
    getDirty: () => state.dirty,
    currentDraft: () => state.draftRef.current,
    request: async (currentStep, answers) => {
      state.requests.push({ currentStep, answers, revision: state.revisionRef.current });
      return response(state.requests.length);
    },
    applyPayload: (payload, overwrite) => {
      state.revisionRef.current = payload.session.revision;
      if (overwrite) state.draftRef.current = payload.answers;
    },
    setDirty: value => { state.dirty = value; },
    setSaveState: value => { state.saveState = value; },
    isConflict: reason => reason instanceof ApiError && reason.status === 409,
    recoverLatest: async () => { state.recovered += 1; },
  });
  return { state, save };
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

test('fila usa revisão confirmada e normaliza ao navegar para outra etapa', async () => {
  const { state, save } = harness({ name: 'Congresso  Berg' }, async (number) => ({
    session: { revision: 3 + number }, answers: { name: 'Congresso Berg' },
  }));
  await Promise.all([save('identity'), save('location')]);
  assert.deepEqual(state.requests.map((request) => request.revision), [3, 4]);
  assert.equal(state.draftRef.current.name, 'Congresso Berg');
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
  assert.equal(state.draftRef.current.venue, 'Centro');
});

test('conflito 409 continua recuperando versão canônica e interrompe avanço', async () => {
  const { state, save } = harness({ name: 'Congresso ' }, async () => { throw new ApiError('Conflito de versão', 409); });
  await assert.rejects(save('location'), /outra sessão/);
  assert.equal(state.recovered, 1);
  assert.equal(state.savedStepRef.current, 'identity');
});

test('navegação com digitação durante PATCH preserva edição nova para próximo save', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const { state, save } = harness({ name: 'Congresso ' }, () => pending);
  const operation = save('location');
  await Promise.resolve();
  state.draftRef.current = { name: 'Congresso Berg ' };
  resolve({ session: { revision: 4 }, answers: { name: 'Congresso' } });
  await operation;
  assert.equal(state.draftRef.current.name, 'Congresso Berg ');
  assert.equal(state.dirty, true);
  assert.equal(state.revisionRef.current, 4);
});

test('save sem nova edição na mesma etapa não repete PATCH', async () => {
  const { state, save } = harness({ name: 'Congresso Berg' }, async () => ({
    session: { revision: 4 }, answers: { name: 'Congresso Berg' },
  }));
  await save('identity');
  assert.equal(state.dirty, false);
  await save('identity');
  assert.equal(state.requests.length, 1);
  assert.equal(state.revisionRef.current, 4);
});


test('duas operações pendentes na mesma etapa consultam dirty após confirmação anterior', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const { state, save } = harness({ name: 'Congresso Berg ' }, () => pending);
  const first = save('identity');
  const second = save('identity');
  await Promise.resolve();
  assert.equal(state.requests.length, 1);
  resolve({ session: { revision: 4 }, answers: { name: 'Congresso Berg' } });
  await Promise.all([first, second]);
  assert.equal(state.requests.length, 1);
  assert.equal(state.dirty, false);
  assert.equal(state.draftRef.current.name, 'Congresso Berg ');
});

