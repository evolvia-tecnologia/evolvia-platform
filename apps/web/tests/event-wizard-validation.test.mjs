import assert from 'node:assert/strict';
import test from 'node:test';
import { firstIncompleteWizardStep, wizardStepIssues } from '../lib/event-wizard-validation.ts';
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

