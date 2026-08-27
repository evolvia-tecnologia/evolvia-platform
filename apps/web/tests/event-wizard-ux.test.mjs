import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function wizardSource() {
  return readFile(new URL('../components/event-wizard.tsx', import.meta.url), 'utf8');
}

test('Wizard organiza tipos de evento por universos reconhecíveis', async () => {
  const source = await wizardSource();

  for (const label of [
    'Científicos e acadêmicos',
    'Corporativos e capacitação',
    'Feiras e exposições',
    'Entretenimento',
    'Outros perfis',
  ]) {
    assert.match(source, new RegExp(label, 'u'), label);
  }

  for (const eventType of [
    'Simpósio científico',
    'Jornada científica',
    'Convenção empresarial',
    'Treinamento',
    'Workshop',
    'Exposição',
    'Festival',
  ]) {
    assert.match(source, new RegExp(eventType, 'u'), eventType);
  }
});

test('opções de perfil expõem agrupamento e estado selecionado para tecnologia assistiva', async () => {
  const source = await wizardSource();

  assert.match(source, /role="group" aria-labelledby=\{`profile-group-\$\{group\.id\}`\}/u);
  assert.match(source, /aria-pressed=\{draft\.eventType === profile\.value\}/u);
});

test('Wizard pergunta público estimado sem tratá-lo como capacidade', async () => {
  const source = await wizardSource();

  assert.match(source, /<label htmlFor="estimatedAudience">Público estimado<\/label>/u);
  assert.match(source, /id="estimatedAudience" type="number"[^>]*min=\{1\}[^>]*max=\{1000000\}[^>]*step=\{1\}/u);
  assert.match(source, /Não define capacidade, estoque ou limite de inscrições\./u);
  assert.match(source, /Definir o público estimado depois/u);
  assert.match(source, /Estimativa operacional, não capacidade/u);
});

test('EVA explica a diferença entre estimativa operacional e capacidade real', async () => {
  const source = await wizardSource();

  assert.match(source, /Público estimado orienta planejamento; capacidade real será configurada nas áreas próprias\./u);
});
