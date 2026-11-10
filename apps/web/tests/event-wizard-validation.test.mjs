import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { queueWizardSave, saveCurrentDraftBeforeExit, wizardDatesConfirmed } from '../lib/event-wizard-save.ts';
import { firstIncompleteWizardStep, nextWizardCompletion, openedWizardStep, showWizardCompletion, wizardStepIssues } from '../lib/event-wizard-validation.ts';
const valid = { organizationId: 'org', eventType: 'Congresso científico', subjectAreas: ['saude'], format: 'IN_PERSON', name: 'Congresso teste', startDate: '2026-11-01T12:00:00Z', endDate: '2026-11-02T12:00:00Z', timeZone: 'America/Sao_Paulo', venue: 'Centro de eventos', registrationMode: 'FREE', capabilities: ['registration'] };
test('cada etapa bloqueia sua informação obrigatória antes de continuar', () => {
  for (const [index, patch] of [[0,{organizationId:''}], [0,{eventType:''}], [0,{subjectAreas:[]}], [1,{format:''}], [2,{name:''}], [2,{startDate:null}], [2,{timeZone:''}], [3,{venue:'   '}], [4,{registrationMode:''}], [5,{capabilities:[]}]]) {
    assert.ok(wizardStepIssues(index, {...valid,...patch}).length, String(index));
  }
});
test('datas inválidas e término anterior não passam', () => {
  for (const patch of [{startDate:'invalid'}, {endDate:'invalid'}, {endDate:'2026-10-01T12:00:00Z'}, {timeZone:'invalid'}]) assert.ok(wizardStepIssues(2, {...valid,...patch}).length);
});
test('pendência deve ser explicitamente marcada e não dispensa nome ou fuso', () => {
  assert.deepEqual(wizardStepIssues(2, {...valid,startDate:null,endDate:null,datesPending:true}), []);
  assert.deepEqual(wizardStepIssues(3, {...valid,venue:null,venuePending:true}), []);
  assert.ok(wizardStepIssues(2, {...valid,name:'',datesPending:true}).length);
});
test('revisão e avanço encontram a primeira etapa pendente sem busca manual', () => {
  assert.equal(firstIncompleteWizardStep({...valid,subjectAreas:[],name:''}).index, 0);
  assert.equal(firstIncompleteWizardStep({...valid,name:''}).index, 2);
  assert.equal(firstIncompleteWizardStep(valid), null);
  assert.equal(firstIncompleteWizardStep({...valid,venue:''}, 2), null);
});
test('recursos estruturais respeitam perfil de entretenimento', () => {
  assert.ok(wizardStepIssues(5,valid,['registration','access_control']).length);
  assert.deepEqual(wizardStepIssues(5,{...valid,capabilities:['registration','access_control']},['registration','access_control']),[]);
});

test('salva as áreas iniciais antes de navegar para a configuração', () => {
  const source = readFileSync(new URL('../components/event-wizard.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('async function startWizard()');
  const end = source.indexOf('async function goTo(', start);
  const block = source.slice(start, end);
  const patch = block.indexOf('const saved = await api<WizardPayload>');
  const navigation = block.indexOf('router.replace(');

  assert.ok(patch >= 0);
  assert.ok(navigation > patch);
  assert.equal(block.match(/router\.replace\(/gu)?.length, 1);
});

const wizardSteps = ['profile', 'format', 'identity', 'location', 'registration', 'capabilities', 'review'];

test('o painel abre a etapa de datas já alcançada e recusa pular etapa pendente', () => {
  assert.equal(openedWizardStep('review', 'identity', wizardSteps), 'identity');
  assert.equal(openedWizardStep('profile', 'identity', wizardSteps), 'profile');
  assert.equal(openedWizardStep('identity', 'unknown', wizardSteps), 'identity');
  assert.equal(openedWizardStep('review', null, wizardSteps), 'review');
});

async function salvarNoFormulario(step, draft, response) {
  const state = {
    draft,
    savedStep: { current: 'profile' },
    dirty: true,
    queue: { current: Promise.resolve() },
    visibleStep: step,
    navigated: false,
    requests: [],
    notice: '',
    error: '',
  };
  try {
    await saveCurrentDraftBeforeExit({
      currentDraft: () => state.draft,
      save: (snapshot) => queueWizardSave(step, snapshot, {
        queue: state.queue,
        savedStep: state.savedStep,
        getDirty: () => state.dirty,
        currentDraft: () => state.draft,
        request: async (targetStep) => { state.requests.push(targetStep); return response(snapshot); },
        applyPayload: () => {},
        setDirty: (value) => { state.dirty = value; },
        setSaveState: () => {},
        isConflict: () => false,
        recoverLatest: async () => {},
        datesConfirmed: (snapshot, payload) => wizardDatesConfirmed(snapshot, payload.answers),
      }),
    });
    state.notice = step === 'identity' ? 'Datas salvas' : 'Local salvo';
  } catch (reason) {
    state.error = reason instanceof Error ? reason.message : 'falha';
  }
  return state;
}

test('revisão pedida pelo painel permanece no formulário depois do salvamento', async () => {
  assert.equal(showWizardCompletion('COMPLETED', '?review=foundation&step=identity', false), false);
  assert.equal(showWizardCompletion('COMPLETED', '', false), true);
  assert.equal(showWizardCompletion('COMPLETED', null, true), false);
  assert.equal(showWizardCompletion('DRAFT', '?review=foundation', false), false);

  const dates = { startDate: '2026-11-01T12:00:00.000Z', endDate: '2026-11-02T12:00:00.000Z', timeZone: 'America/Sao_Paulo' };
  const saved = await salvarNoFormulario('identity', dates, (snapshot) => ({ session: { revision: 4 }, answers: snapshot }));
  assert.deepEqual(saved.requests, ['identity']);
  assert.equal(saved.visibleStep, 'identity');
  assert.equal(saved.navigated, false);
  assert.equal(saved.notice, 'Datas salvas');
  assert.equal(saved.savedStep.current, 'identity');
  assert.equal(showWizardCompletion('COMPLETED', '?review=foundation&step=identity', false), false);

  const rejected = await salvarNoFormulario('identity', dates, () => ({
    session: { revision: 4 },
    answers: { ...dates, endDate: '2026-11-01T12:00:00.000Z' },
  }));
  assert.deepEqual(rejected.requests, ['identity']);
  assert.equal(rejected.visibleStep, 'identity');
  assert.equal(rejected.navigated, false);
  assert.equal(rejected.notice, '');
  assert.match(rejected.error, /manteve a data anterior/);

  const local = await salvarNoFormulario('location', { ...dates, venue: 'Centro de eventos' }, (snapshot) => ({ session: { revision: 4 }, answers: snapshot }));
  assert.deepEqual(local.requests, ['location']);
  assert.equal(local.visibleStep, 'location');
  assert.equal(local.navigated, false);
  assert.equal(local.notice, 'Local salvo');
});

test('revisar respostas não volta para a conclusão no salvamento seguinte', () => {
  assert.equal(nextWizardCompletion(false, false, 'COMPLETED', null, false), false);
  assert.equal(nextWizardCompletion(false, true, 'COMPLETED', '', false), true);
  assert.equal(nextWizardCompletion(false, true, 'COMPLETED', '?review=foundation&step=identity', false), false);
  assert.equal(nextWizardCompletion(true, false, 'COMPLETED', null, true), false);
});
