import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const builder = readFileSync(new URL('../components/registration-form-builder.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../components/event-admin-dashboard.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../components/registration-form-builder.module.css', import.meta.url), 'utf8');

test('construtor é encontrável no painel sem prometer inscrição pública', () => {
  assert.match(dashboard, /Ficha de inscrição/u);
  assert.match(dashboard, /Configurar ficha de inscrição/u);
  assert.match(dashboard, /não abre inscrições ao público/u);
});

test('UX oferece catálogo, ordem, obrigatoriedade, campo próprio, prévia e versão', () => {
  for (const text of ['Adicionar campos do catálogo', 'Mover', 'Obrigatório', 'Criar pergunta do evento', 'PRÉVIA', 'Preservar versão para testes']) assert.match(builder, new RegExp(text, 'u'));
});

test('catálogo e prévia contemplam CNPJ numérico e alfanumérico', () => {
  assert.match(builder, /CNPJ numérico ou alfanumérico/u);
  assert.match(builder, /field\.type === 'CNPJ' \? 'text'/u);
  assert.match(builder, /autoCapitalize=\{field\.type === 'CNPJ' \? 'characters'/u);
});

test('construtor usa somente tokens visuais canônicos', () => {
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
});
