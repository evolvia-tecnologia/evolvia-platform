import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function homeSource() {
  return readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
}

async function profileCatalogSource() {
  return readFile(new URL('../lib/event-profile-catalog.ts', import.meta.url), 'utf8');
}

test('Home e Wizard compartilham um único catálogo de perfis', async () => {
  const [home, catalog] = await Promise.all([homeSource(), profileCatalogSource()]);

  assert.match(home, /EVENT_PROFILE_GROUPS, findEventProfileGroup/u);
  assert.match(home, /EVENT_PROFILE_GROUPS\.map/u);
  assert.match(home, /activeGroup\.options\.map/u);

  for (const group of [
    'Científicos e acadêmicos',
    'Corporativos e capacitação',
    'Feiras e exposições',
    'Entretenimento',
    'Comunidades, causas e esportes',
    'Outros perfis',
  ]) {
    assert.match(catalog, new RegExp(group, 'u'), group);
  }
});

test('Home revela tipos progressivamente e permite retornar aos perfis', async () => {
  const source = await homeSource();

  assert.match(source, /activeGroup \? <>/u);
  assert.match(source, /Escolha primeiro um perfil para ver somente os tipos relacionados\./u);
  assert.match(source, /← Escolher outro perfil/u);
  assert.match(source, /function returnToGroups\(\)/u);
  assert.match(source, /clearPersistedEventType\(\)/u);
});

test('Home restaura e persiste somente tipos válidos do catálogo', async () => {
  const source = await homeSource();

  assert.match(source, /findEventProfileGroup\(parsed\.eventType\)/u);
  assert.match(source, /setActiveGroupId\(findEventProfileGroup\(persistedEventType\)\?\.id \?\? ''\)/u);
  assert.match(source, /JSON\.stringify\(\{ \.\.\.previous, eventType \}\)/u);
});

test('seletores públicos mantêm nome, estado e anúncio para tecnologia assistiva', async () => {
  const source = await homeSource();

  assert.match(source, /role="group"/u);
  assert.match(source, /aria-labelledby="event-type-question"/u);
  assert.match(source, /aria-describedby="event-group-description"/u);
  assert.match(source, /aria-pressed=\{selected\}/u);
  assert.match(source, /aria-live="polite"/u);
});
