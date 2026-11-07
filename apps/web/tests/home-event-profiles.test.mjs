import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function homeSource() {
  return readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
}

async function pickerSource() {
  return readFile(new URL('../components/public-profile-picker.tsx', import.meta.url), 'utf8');
}

async function profileCatalogSource() {
  return readFile(new URL('../lib/event-profile-catalog.ts', import.meta.url), 'utf8');
}

test('Home e Wizard compartilham um único catálogo de perfis', async () => {
  const [home, picker, catalog] = await Promise.all([homeSource(), pickerSource(), profileCatalogSource()]);

  assert.match(home, /import \{ findEventProfileGroup \} from '\.\.\/lib\/event-profile-catalog'/u);
  assert.match(picker, /EVENT_PROFILE_GROUPS, findEventProfileGroup/u);
  assert.match(picker, /EVENT_PROFILE_GROUPS\.map/u);
  assert.match(picker, /family\.options\.map/u);
  assert.doesNotMatch(picker, /EVENT_PROFILE_GROUPS\s*=/u);
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

test('Home mostra uma família por vez e esconde a versão interna', async () => {
  const [home, picker] = await Promise.all([homeSource(), pickerSource()]);

  assert.match(home, /<h1>Seu evento começa com uma conversa\.<\/h1>/u);
  assert.doesNotMatch(home, /EVOLVIA CORE v0\.2/u);
  assert.doesNotMatch(home, /<h2>/u);
  assert.match(picker, /Voltar às famílias/u);
  assert.match(picker, /criação do evento/u);
  assert.doesNotMatch(picker, /Wizard/u);
  assert.doesNotMatch(home, /max-height/u);
});

test('Home restaura e persiste somente tipos válidos do catálogo', async () => {
  const source = await homeSource();

  assert.match(source, /findEventProfileGroup\(parsed\.eventType\)/u);
  assert.match(source, /setSelectedEventType\(readPersistedEventType\(\)\)/u);
  assert.match(source, /JSON\.stringify\(\{ \.\.\.previous, eventType \}\)/u);
  assert.match(source, /evolvia_wizard_prestart_v2/u);
});

test('seletores públicos mantêm nome, estado e anúncio para tecnologia assistiva', async () => {
  const [home, picker, css] = await Promise.all([
    homeSource(),
    pickerSource(),
    readFile(new URL('../components/public-profile-picker.module.css', import.meta.url), 'utf8'),
  ]);

  assert.match(home, /id="event-type-question"/u);
  assert.match(picker, /role="group"/u);
  assert.match(picker, /aria-labelledby=\{`home-profile-\$\{family\.id\}`\}/u);
  assert.match(picker, /aria-pressed=\{selected\}/u);
  assert.match(picker, /aria-live="polite"/u);
  assert.match(css, /\.families:focus-visible \{\s*outline: 3px solid var\(--color-focus-on-light\);/u);
  assert.match(css, /@media \(max-width: 390px\)/u);
  assert.match(css, /min-height: 44px/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
  assert.doesNotMatch(css, /max-height/u);
});
