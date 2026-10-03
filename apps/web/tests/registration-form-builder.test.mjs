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
  assert.match(dashboard, /sem abrir inscrições ao público/u);
});

test('o organizador anexa o PDF que abre no aceite dos termos', () => {
  assert.match(builder, /Anexar PDF/u);
  assert.match(builder, /Abrir PDF anexado/u);
  assert.match(builder, /terms_acceptance/u);
  assert.match(builder, /type="checkbox"/u);
  assert.match(service, /termsDocument/u);
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
