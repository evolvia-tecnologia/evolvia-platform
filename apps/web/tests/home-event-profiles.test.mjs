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
  assert.match(home, /group\.options\.map/u);
  assert.match(catalog, /value: 'Corrida', icon: '◎', title: 'Corrida'/u);

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

test('Home mostra todos os tipos do catálogo na mesma caixa', async () => {
  const source = await homeSource();

  assert.match(source, /group\.options\.map\(\(profile\) =>/u);
  assert.match(source, /\{profile\.title\}/u);
  assert.match(source, /Todos os tipos estão nesta lista/u);
  assert.doesNotMatch(source, /Escolha primeiro um perfil para ver somente os tipos relacionados/u);
  assert.doesNotMatch(source, /Escolher outro perfil/u);
});

test('Home restaura e persiste somente tipos válidos do catálogo', async () => {
  const source = await homeSource();

  assert.match(source, /findEventProfileGroup\(parsed\.eventType\)/u);
  assert.match(source, /setSelectedEventType\(readPersistedEventType\(\)\)/u);
  assert.match(source, /JSON\.stringify\(\{ \.\.\.previous, eventType \}\)/u);
});

test('seletores públicos mantêm nome, estado e anúncio para tecnologia assistiva', async () => {
  const source = await homeSource();

  assert.match(source, /role="group"/u);
  assert.match(source, /aria-labelledby=\{`home-profile-\$\{group\.id\}`\}/u);
  assert.match(source, /aria-pressed=\{selected\}/u);
  assert.match(source, /aria-live="polite"/u);
});

test('catálogo rolável é região nomeada focalizável e família é anunciada uma vez', async () => {
  const [source, css] = await Promise.all([
    homeSource(),
    readFile(new URL('../app/home-viewport.module.css', import.meta.url), 'utf8'),
  ]);

  assert.match(source, /className=\{styles\.profileCatalog\} tabIndex=\{0\} role="region" aria-label="Catálogo de perfis de evento"/u);
  assert.equal(source.match(/aria-labelledby=\{`home-profile-\$\{group\.id\}`\}/gu)?.length, 1);
  assert.doesNotMatch(source, /<section className=\{styles\.profileFamily\}/u);
  assert.match(css, /\.profileCatalog:focus-visible \{\s*outline: 3px solid var\(--color-focus-on-light\);/u);
});
