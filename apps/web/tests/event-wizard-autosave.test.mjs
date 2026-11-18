import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { queueWizardSave, saveCurrentDraftBeforeExit, wizardBlockedExitMessage, wizardDatesConfirmed, wizardSaveLabel, wizardScheduleRejection } from '../lib/event-wizard-save.ts';
import ts from 'typescript';

const apiSource = await readFile(new URL('../lib/api.ts', import.meta.url), 'utf8');
const apiModule = ts.transpileModule(apiSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { ApiError } = await import('data:text/javascript;base64,' + Buffer.from(apiModule).toString('base64'));

function harness(draft, response, extra = {}) {
  const state = {
    draftRef: { current: draft }, revisionRef: { current: 3 },
    catalogRef: { current: [] }, savedStepRef: { current: 'identity' },
    saveQueueRef: { current: Promise.resolve() }, dirty: true,
    requests: [], recovered: 0, saveState: 'idle', resumes: 0,
  };
  const save = (targetStep, snapshot = state.draftRef.current, options) => queueWizardSave(targetStep, snapshot, {
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
    datesConfirmed: extra.datesConfirmed,
    rejectionOf: extra.rejectionOf,
    resume: () => {
      state.resumes += 1;
      extra.resume?.();
    },
  }, options);
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
  assert.equal(state.saveState, 'saving');
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

test('resposta tardia pede outro salvamento e não anuncia Tudo salvo', async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  let resumed = 0;
  const { state, save } = harness({ endDate: '2026-10-16T03:00:00.000Z' }, () => pending, { resume: () => { resumed += 1; } });
  const operation = save('identity');
  await Promise.resolve();
  state.draftRef.current = { endDate: '2026-10-17T03:00:00.000Z' };
  resolve({ session: { revision: 4 }, answers: { endDate: '2026-10-16T03:00:00.000Z' } });
  await operation;
  assert.equal(state.draftRef.current.endDate, '2026-10-17T03:00:00.000Z');
  assert.equal(state.saveState, 'saving');
  assert.equal(resumed, 1);
});

test('servidor que devolve a data anterior não marca o rascunho como salvo', async () => {
  const typed = { startDate: '2026-10-16T03:00:00.000Z', endDate: '2026-10-17T03:00:00.000Z', timeZone: 'America/Sao_Paulo' };
  const { state, save } = harness(typed, async () => ({
    session: { revision: 4 },
    answers: { ...typed, endDate: '2026-10-16T03:00:00.000Z' },
  }), { datesConfirmed: (snapshot, payload) => wizardDatesConfirmed(snapshot, payload.answers) });
  await assert.rejects(save('identity'), /manteve a data anterior/);
  assert.equal(state.draftRef.current.endDate, '2026-10-17T03:00:00.000Z');
  assert.equal(state.dirty, true);
  assert.equal(state.saveState, 'error');
  assert.equal(state.revisionRef.current, 4);
});

test('o mesmo instante confirmado pelo servidor pode anunciar Tudo salvo', async () => {
  const typed = { startDate: '2026-10-16T03:00:00.000Z', endDate: '2026-10-17T03:00:00.000Z', timeZone: 'America/Sao_Paulo' };
  const { state, save } = harness(typed, async () => ({
    session: { revision: 4 },
    answers: { ...typed, endDate: '2026-10-17T03:00:00Z' },
  }), { datesConfirmed: (snapshot, payload) => wizardDatesConfirmed(snapshot, payload.answers) });
  await save('identity');
  assert.equal(state.dirty, false);
  assert.equal(state.saveState, 'saved');
});

async function flush() {
  for (let step = 0; step < 8; step += 1) await Promise.resolve();
}

test('salvar e sair durante o PATCH permanece até a edição nova ser confirmada', async () => {
  let releaseFirst;
  let releaseSecond;
  const firstGate = new Promise((done) => { releaseFirst = done; });
  const secondGate = new Promise((done) => { releaseSecond = done; });
  const original = { startDate: '2026-10-16T03:00:00.000Z', endDate: '2026-10-16T03:00:00.000Z', timeZone: 'America/Sao_Paulo' };
  const edited = { ...original, endDate: '2026-10-17T03:00:00.000Z' };
  const { state, save } = harness(original, async (number) => {
    if (number === 1) {
      await firstGate;
      return { session: { revision: 4 }, answers: original };
    }
    await secondGate;
    return { session: { revision: 5 }, answers: edited };
  }, { datesConfirmed: (snapshot, payload) => wizardDatesConfirmed(snapshot, payload.answers) });

  let left = false;
  const exiting = saveCurrentDraftBeforeExit({
    currentDraft: () => state.draftRef.current,
    save: (snapshot) => save('identity', snapshot, { resumeOnStale: false }),
  }).then(() => { left = true; });

  await flush();
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].answers.endDate, original.endDate);
  state.draftRef.current = edited;
  releaseFirst();
  await flush();
  assert.equal(left, false);
  assert.equal(state.requests.length, 2);
  assert.equal(state.requests[1].answers.endDate, edited.endDate);
  assert.equal(state.draftRef.current.endDate, edited.endDate);
  releaseSecond();
  await exiting;
  assert.equal(left, true);
  assert.equal(state.dirty, false);
  assert.equal(state.saveState, 'saved');
  assert.equal(state.resumes, 0);
});

const schedule = { startDate: '2026-10-16T03:00:00.000Z', endDate: '2026-10-17T03:00:00.000Z', timeZone: 'America/Sao_Paulo' };
const confirmSchedule = (snapshot, payload) => wizardScheduleRejection(snapshot, payload.answers);

test('resposta 200 com o local anterior não anuncia Local salvo', async () => {
  const typed = { ...schedule, venue: 'Centro novo', venuePending: false };
  const { state, save } = harness(typed, async () => ({
    session: { revision: 4 },
    answers: { ...typed, venue: 'Auditório' },
  }), { rejectionOf: confirmSchedule });
  state.savedStepRef.current = 'location';
  await assert.rejects(save('location'), /manteve o local anterior/);
  assert.equal(state.draftRef.current.venue, 'Centro novo');
  assert.equal(state.dirty, true);
  assert.equal(state.saveState, 'error');
});

test('local equivalente depois da limpeza pode anunciar sucesso', async () => {
  const typed = { ...schedule, venue: 'Centro novo ', venuePending: false };
  const { state, save } = harness(typed, async () => ({
    session: { revision: 4 },
    answers: { ...schedule, venue: 'Centro novo', venuePending: false },
  }), { rejectionOf: confirmSchedule });
  state.savedStepRef.current = 'location';
  await save('location');
  assert.equal(state.dirty, false);
  assert.equal(state.saveState, 'saved');
  assert.equal(state.draftRef.current.venue, 'Centro novo ');
});

test('edição do local durante o PATCH só avisa depois da confirmação nova', async () => {
  let releaseFirst;
  let releaseSecond;
  const firstGate = new Promise((done) => { releaseFirst = done; });
  const secondGate = new Promise((done) => { releaseSecond = done; });
  const typed = { ...schedule, venue: 'Centro novo', venuePending: false };
  const edited = { ...schedule, venue: 'Centro definitivo', venuePending: false };
  const { state, save } = harness(typed, async (number) => {
    if (number === 1) {
      await firstGate;
      return { session: { revision: 4 }, answers: typed };
    }
    await secondGate;
    return { session: { revision: 5 }, answers: edited };
  }, { rejectionOf: confirmSchedule });
  state.savedStepRef.current = 'location';
  let notice = '';
  const saving = saveCurrentDraftBeforeExit({
    currentDraft: () => state.draftRef.current,
    save: (snapshot) => save('location', snapshot, { resumeOnStale: false }),
  }).then(() => { notice = 'Local salvo'; });
  await flush();
  state.draftRef.current = edited;
  releaseFirst();
  await flush();
  assert.equal(notice, '');
  assert.equal(state.dirty, true);
  assert.notEqual(state.saveState, 'saved');
  assert.equal(state.requests[1].answers.venue, 'Centro definitivo');
  releaseSecond();
  await saving;
  assert.equal(notice, 'Local salvo');
  assert.equal(state.dirty, false);
  assert.equal(state.saveState, 'saved');
  assert.equal(state.draftRef.current.venue, 'Centro definitivo');
  assert.equal(state.resumes, 0);
});

test('Salvar datas só avisa depois que a edição feita durante o PATCH é confirmada', async () => {
  let releaseFirst;
  let releaseSecond;
  const firstGate = new Promise((done) => { releaseFirst = done; });
  const secondGate = new Promise((done) => { releaseSecond = done; });
  const original = { startDate: '2026-10-16T03:00:00.000Z', endDate: '2026-10-16T03:00:00.000Z', timeZone: 'America/Sao_Paulo' };
  const edited = { ...original, endDate: '2026-10-17T03:00:00.000Z' };
  const { state, save } = harness(original, async (number) => {
    if (number === 1) {
      await firstGate;
      return { session: { revision: 4 }, answers: original };
    }
    await secondGate;
    return { session: { revision: 5 }, answers: edited };
  }, { datesConfirmed: (snapshot, payload) => wizardDatesConfirmed(snapshot, payload.answers) });
  let notice = '';
  const saving = saveCurrentDraftBeforeExit({
    currentDraft: () => state.draftRef.current,
    save: (snapshot) => save('identity', snapshot, { resumeOnStale: false }),
  }).then(() => { notice = 'Datas salvas'; });
  await flush();
  state.draftRef.current = edited;
  releaseFirst();
  await flush();
  assert.equal(notice, '');
  assert.equal(state.requests[1].answers.endDate, edited.endDate);
  releaseSecond();
  await saving;
  assert.equal(notice, 'Datas salvas');
  assert.equal(state.saveState, 'saved');
  assert.equal(state.resumes, 0);
});

test('salvar e sair interrompe após três tentativas se o rascunho não estabilizar', async () => {
  let tick = 0;
  const { state, save } = harness(
    { name: 'v0' },
    async () => ({ session: { revision: 4 }, answers: { name: 'v0' } }),
  );
  await assert.rejects(
    saveCurrentDraftBeforeExit({
      currentDraft: () => state.draftRef.current,
      save: async (snapshot) => {
        await save('identity', snapshot, { resumeOnStale: false });
        tick += 1;
        state.draftRef.current = { name: `v${tick}` };
      },
    }),
    /mudou durante o salvamento/,
  );
  assert.equal(tick, 3);
  assert.equal(state.requests.length, 3);
  assert.equal(state.resumes, 0);
});

test('data limpa no cliente equivale a null no servidor', () => {
  assert.equal(
    wizardDatesConfirmed(
      { startDate: '', endDate: '', timeZone: 'America/Sao_Paulo' },
      { startDate: null, endDate: null, timeZone: 'America/Sao_Paulo' },
    ),
    true,
  );
  assert.equal(
    wizardScheduleRejection(
      { startDate: '   ', endDate: null, timeZone: 'America/Sao_Paulo', venue: 'Centro', venuePending: false },
      { startDate: null, endDate: null, timeZone: 'America/Sao_Paulo', venue: 'Centro', venuePending: false },
    ),
    null,
  );
});

test('Salvar e sair com data recusada permanece na tela e mostra o motivo', async () => {
  assert.equal(
    wizardBlockedExitMessage(new Error('O servidor manteve a data anterior. A alteração desta tela não foi gravada.')),
    'O servidor manteve a data anterior. A alteração desta tela não foi gravada.',
  );
  assert.equal(wizardBlockedExitMessage('falha'), 'Não foi possível salvar. Os valores desta tela foram mantidos.');
  const source = await readFile(new URL('../components/event-wizard.tsx', import.meta.url), 'utf8');
  const exit = source.slice(source.indexOf('async function saveAndExit'), source.indexOf('function toggleCapability'));
  assert.match(exit, /saveCurrentDraftBeforeExit\(/);
  assert.match(exit, /setError\(wizardBlockedExitMessage\(reason\)\)/);
  assert.match(exit, /resumeOnStale:\s*false/);
  const dates = source.slice(source.indexOf('async function saveDates'), source.indexOf('async function saveVenue'));
  assert.ok(dates.indexOf('saveCurrentDraftBeforeExit') < dates.indexOf("setDateNotice('Datas salvas"));
  assert.match(dates, /resumeOnStale:\s*false/);
  const venue = source.slice(source.indexOf('async function saveVenue'), source.indexOf('async function saveAndExit'));
  assert.ok(venue.indexOf('saveCurrentDraftBeforeExit') < venue.indexOf("setVenueNotice('Local salvo"));
  assert.match(venue, /resumeOnStale:\s*false/);
  const goTo = source.slice(source.indexOf('async function goTo'), source.indexOf('async function finish'));
  assert.ok(goTo.indexOf('saveCurrentDraftBeforeExit') < goTo.indexOf('setStepIndex(index)'));
  assert.match(goTo, /resumeOnStale:\s*false/);
  assert.match(exit, /return;/);
  assert.ok(exit.indexOf('setError(wizardBlockedExitMessage(reason))') < exit.indexOf("router.push('/painel')"));
});

test('Tudo salvo não aparece com edição pendente ou sem confirmação', () => {
  assert.equal(wizardSaveLabel({ hasEvent: true, saveState: 'saved', dirty: true }), 'Não salvo');
  assert.equal(wizardSaveLabel({ hasEvent: true, saveState: 'idle', dirty: false }), 'Tudo salvo');
  assert.equal(wizardSaveLabel({ hasEvent: true, saveState: 'error', dirty: false }), 'Não salvo');
  assert.equal(wizardSaveLabel({ hasEvent: true, saveState: 'saving', dirty: true }), 'Salvando…');
  assert.equal(wizardSaveLabel({ hasEvent: false, saveState: 'saved', dirty: false }), 'Rascunho local');
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
