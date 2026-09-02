import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../prisma/migrations/20260830230000_registration_form_builder/migration.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../src/registration-forms.service.ts', import.meta.url), 'utf8');

test('ficha preserva rascunho revisado e versões publicadas imutáveis', () => {
  assert.match(schema, /model EventRegistrationForm\s*\{/u);
  assert.match(schema, /model EventRegistrationFormVersion\s*\{/u);
  assert.match(service, /expectedRevision/u);
  assert.match(service, /registration\.form_version_published/u);
});

test('campos essenciais não podem ser removidos e identidade é estável', () => {
  for (const code of ['full_name', 'preferred_name', 'email']) assert.match(service, new RegExp(`code: '${code}'`, 'u'));
  assert.match(service, /identificador e código únicos/u);
  assert.match(service, /não pode ser removido/u);
});

test('migration é aditiva, escopada e sem destruição', () => {
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN)/iu);
  assert.match(migration, /FOREIGN KEY \("eventId", "organizationId"\)/u);
  assert.match(migration, /UNIQUE INDEX "EventRegistrationForm_eventId_organizationId_key"/u);
});

test('opções de escolha passam pela autoridade do servidor e limites canônicos', () => {
  assert.match(service, /validateChoiceOptions\(field\.options\)/u);
  assert.match(service, /choiceFieldTypes: CHOICE_FIELD_TYPES/u);
  assert.match(service, /optionConstraints: REGISTRATION_OPTION_CONSTRAINTS/u);
  assert.match(service, /isChoiceFieldType\(field\.type\) \? validateChoiceOptions/u);
});

test('rascunho usa revisão otimista e auditoria sanitizada', () => {
  assert.match(service, /expectedRevision/u);
  assert.match(service, /A ficha foi alterada em outra sessão/u);
  assert.match(service, /registration\.form_draft_saved/u);
  assert.match(service, /\{ revision: form\.revision, fieldCount: fields\.length \}/u);
  assert.match(service, /\{ version, revision: form\.revision \}/u);
});

test('consultas e mutações permanecem no escopo organização\+evento', () => {
  assert.match(service, /eventId_organizationId: scope/u);
  assert.match(service, /requireRole\(userId, event\.organizationId, EVENT_EDITOR_ROLES\)/u);
  assert.match(service, /organizationId: event\.organizationId!/u);
});

test('condições passam pela autoridade do servidor e metadados canônicos', () => {
  assert.match(service, /validateFieldCondition\(condition, \{ dependentIndex: index, dependentLocked: Boolean\(field\.locked\), fields \}\)/u);
  assert.match(service, /conditionSourceTypes: CONDITION_SOURCE_TYPES/u);
  assert.match(service, /conditionOperators: CONDITION_OPERATORS/u);
  assert.match(service, /registration\.form_draft_saved/u);
  assert.doesNotMatch(service, /this\.text\(value\.value, 1, 100, 'valor da condição'\)/u);
});
