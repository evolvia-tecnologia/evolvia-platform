import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const builder = readFileSync(new URL('../components/registration-form-builder.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../components/event-admin-dashboard.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../components/registration-form-builder.module.css', import.meta.url), 'utf8');
const service = readFileSync(new URL('../../api/src/registration-forms.service.ts', import.meta.url), 'utf8');

test('construtor é encontrável no painel sem prometer inscrição pública', () => {
  assert.match(dashboard, /Ficha de inscrição/u);
  assert.match(dashboard, /Configurar ficha de inscrição/u);
  assert.match(dashboard, /não abre inscrições ao público/u);
});

test('UX oferece catálogo, ordem, obrigatoriedade, campo próprio, prévia e versão', () => {
  for (const text of ['Adicionar campos do catálogo', 'Mover', 'Obrigatório', 'Criar pergunta do evento', 'PRÉVIA', 'Preservar versão para testes']) assert.match(builder, new RegExp(text, 'u'));
});

test('modelo universal protege os campos essenciais definidos', () => {
  for (const code of ['full_name', 'preferred_name', 'identity_document', 'email', 'phone', 'registration_type', 'terms_acceptance']) assert.match(service, new RegExp(`code: '${code}'.*required: true.*enabled: true.*locked: true`, 'u'));
});

test('organizador pode habilitar, desabilitar e criar campos sem perder configuração', () => {
  assert.match(builder, /Habilitado na ficha/u);
  assert.match(builder, /field\.enabled !== false/u);
  assert.match(builder, /Criar pergunta do evento/u);
  assert.match(service, /enabled: field\.enabled !== false/u);
});

test('campos operacionais são gerados pelo sistema e não viram perguntas', () => {
  assert.match(builder, /Campos gerados automaticamente/u);
  for (const label of ['QR Code', 'Status do pagamento', 'Data\/hora de entrada', 'Versão do termo aceito']) assert.match(service, new RegExp(label, 'u'));
});

test('catálogo e prévia contemplam CNPJ numérico e alfanumérico', () => {
  assert.match(builder, /CNPJ numérico ou alfanumérico/u);
  assert.match(builder, /field\.type === 'CNPJ' \? 'text'/u);
  assert.match(builder, /autoCapitalize=\{field\.type === 'CNPJ' \? 'characters'/u);
});

test('construtor usa somente tokens visuais canônicos', () => {
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
});

test('opções de campos já incluídos podem ser adicionadas, renomeadas, reordenadas e removidas', () => {
  for (const text of ['Adicionar opção', 'Rótulo da opção', 'Remover opção', 'Mover opção', 'Não é possível remover a última opção.']) {
    assert.match(builder, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
  assert.match(builder, /function renameOption\(/u);
  assert.match(builder, /function moveOption\(/u);
  assert.match(builder, /function removeOption\(/u);
  assert.match(builder, /option\.id === optionId \? \{ \.\.\.option, label \}/u);
  assert.match(builder, /options\.filter\(\(option\) => option\.id !== optionId\)/u);
  assert.match(builder, /options\.length <= optionConstraints\.minCount/u);
});

test('novas opções recebem ID opaco e estável, sem depender da posição', () => {
  assert.match(builder, /function createOpaqueOptionId\(/u);
  assert.match(builder, /crypto\.getRandomValues\(bytes\)/u);
  assert.match(builder, /opt_\$\{Array\.from/u);
  assert.doesNotMatch(builder, /option-\$\{index/u);
  assert.doesNotMatch(builder, /option-\$\{[^}]*\+ 1\}/u);
});

test('limites e tipos de escolha vêm do payload canônico, sem contrato local duplicado', () => {
  assert.match(builder, /payload\?\.choiceFieldTypes/u);
  assert.match(builder, /payload\?\.optionConstraints/u);
  assert.match(builder, /optionConstraints\.maxCount/u);
  assert.match(builder, /optionConstraints\.minCount/u);
  assert.match(builder, /isChoiceField\(field\.type, choiceFieldTypes\)/u);
  assert.doesNotMatch(builder, /slice\(0, 50\)/u);
  assert.match(service, /choiceFieldTypes: CHOICE_FIELD_TYPES/u);
  assert.match(service, /optionConstraints: REGISTRATION_OPTION_CONSTRAINTS/u);
});

test('prévia distingue semanticamente lista, escolha única e múltipla escolha', () => {
  assert.match(builder, /field\.type === 'SELECT' \|\| field\.type === 'REGISTRATION_TYPE'/u);
  assert.match(builder, /field\.type === 'RADIO'/u);
  assert.match(builder, /type="radio"/u);
  assert.match(builder, /role="radiogroup"/u);
  assert.match(builder, /field\.type === 'CHECKBOX'/u);
  assert.match(builder, /type="checkbox"/u);
  assert.match(builder, /role="group"/u);
  assert.doesNotMatch(builder, /field\.type === 'SELECT' \|\| field\.type === 'RADIO' \|\| field\.type === 'CHECKBOX'/u);
});

test('editor de opções oferece teclado, foco, alvos de toque e reflow mobile', () => {
  assert.match(css, /\.optionOrder button,\.optionRemove\{[^}]*min-height:44px/u);
  assert.match(css, /\.optionRow input\{[^}]*min-height:44px/u);
  assert.match(css, /\.previewChoiceItem\{[^}]*min-height:44px/u);
  assert.match(css, /\.page button:focus-visible/u);
  assert.match(css, /@media\(max-width:700px\)\{[\s\S]*\.optionRow\{grid-template-columns:44px minmax\(0,1fr\)\}/u);
  assert.match(builder, /type="button"/u);
  assert.match(builder, /autoFocus=\{focusOptionId === option\.id\}/u);
});

test('condição opcional usa fonte anterior, operadores do payload e ID estável da opção', () => {
  assert.match(builder, /<legend>Exibir somente quando<\/legend>/u);
  assert.match(builder, /!field\.locked && \(index > 0 \|\| field\.condition\)/u);
  assert.match(builder, /payload\?\.conditionSourceTypes/u);
  assert.match(builder, /payload\?\.conditionOperators/u);
  assert.match(builder, /conditionOperators\.map\(\(operator\) =>/u);
  assert.match(builder, /source\?\.options\?\.\[0\]\?\.id/u);
  assert.match(builder, /value: event\.target\.value/u);
  assert.match(builder, /option\.id === field\.condition\?\.value/u);
  assert.doesNotMatch(builder, /value: option\.label/u);
  assert.match(service, /conditionSourceTypes: CONDITION_SOURCE_TYPES/u);
  assert.match(service, /conditionOperators: CONDITION_OPERATORS/u);
});

test('prévia descreve a condição com rótulos atuais sem executar a regra pública', () => {
  assert.match(builder, /Será exibido quando \$\{source\.label\} \$\{operator\.label\} “\$\{option\.label\}”\./u);
  assert.match(builder, /Atenção: a condição de exibição ficou inválida/u);
  assert.match(builder, /fields\.filter\(\(field\) => field\.enabled !== false\)/u);
  assert.doesNotMatch(builder, /field\.condition && field\.enabled === false/u);
  assert.doesNotMatch(builder, /if \(field\.condition\) return null/u);
});

test('condição oferece teclado, semântica, alvos de toque e reflow mobile', () => {
  assert.match(builder, /<fieldset className=\{styles\.conditionEditor\}/u);
  assert.match(builder, /<legend>Exibir somente quando<\/legend>/u);
  assert.match(builder, /<label>Campo fonte<select/u);
  assert.match(builder, /<label>Comparação<select/u);
  assert.match(builder, /<label>Opção<select/u);
  assert.match(builder, /role="status"/u);
  assert.match(css, /\.conditionFields select\{[^}]*min-height:44px/u);
  assert.match(css, /\.conditionEditor \.check\{[^}]*min-height:44px/u);
  assert.match(css, /\.page select:focus-visible/u);
  assert.match(css, /@media\(max-width:700px\)\{[\s\S]*\.conditionFields\{grid-template-columns:1fr\}/u);
  assert.match(css, /\.conditionIssue\{[^}]*border:1px solid var\(--color-border-strong\)/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
});
