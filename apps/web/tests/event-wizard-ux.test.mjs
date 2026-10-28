import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function wizardSource() {
  return readFile(new URL('../components/event-wizard.tsx', import.meta.url), 'utf8');
}

async function profileCatalogSource() {
  return readFile(new URL('../lib/event-profile-catalog.ts', import.meta.url), 'utf8');
}

test('Wizard organiza tipos de evento por universos reconhecíveis', async () => {
  const source = await wizardSource();
  const catalog = await profileCatalogSource();

  assert.match(source, /EVENT_PROFILE_GROUPS\.map/u);

  for (const label of [
    'Científicos e acadêmicos',
    'Corporativos e capacitação',
    'Feiras e exposições',
    'Entretenimento',
    'Comunidades, causas e esportes',
    'Outros perfis',
  ]) {
    assert.match(catalog, new RegExp(label, 'u'), label);
  }

  for (const eventType of [
    'Simpósio científico',
    'Jornada científica',
    'Convenção empresarial',
    'Treinamento',
    'Workshop',
    'Exposição',
    'Festival',
    'Seminário acadêmico',
    'Curso ou palestra',
    'Networking ou meetup',
    'Evento religioso ou beneficente',
    'Evento esportivo ou torneio',
    'Corrida',
  ]) {
    assert.match(catalog, new RegExp(eventType, 'u'), eventType);
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

test('conclusão oferece categorias e lotes antes da ficha sem publicar', async () => {
  const source = await wizardSource();
  assert.match(source, /painel\/inscricoes\/categorias-lotes`\}>\s*Configurar categorias e lotes/u);
  assert.match(source, /painel`\}>\s*Abrir painel do evento/u);
  assert.match(source, /Nada será publicado agora/u);
});

test('escolhas e etapa atual informam o estado à tecnologia assistiva', async () => {
  const source = await wizardSource();
  assert.ok(source.includes("aria-current={index === stepIndex ? 'step' : undefined}"));
  assert.ok(source.includes('aria-pressed={draft.format === value}'));
  assert.ok(source.includes('aria-pressed={draft.registrationMode === value}'));
});

test('rascunho local corrompido não impede nova criação nem reutiliza organização inacessível', async () => {
  const source = await wizardSource();
  assert.match(source, /try \{\s*const parsed: unknown = JSON.parse\(saved\)/u);
  assert.match(source, /findEventProfileOption\(previous.eventType\)/u);
  assert.match(source, /editors.some\(\(item\) => item.organization.id === restored.organizationId\)/u);
});
