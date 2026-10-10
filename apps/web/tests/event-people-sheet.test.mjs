import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const panel = await readFile(new URL('../components/event-people-sheet.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/eventos/[id]/painel/pessoas/page.tsx', import.meta.url), 'utf8');
const home = await readFile(new URL('../app/eventos/[id]/painel/page.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../components/event-people-sheet.module.css', import.meta.url), 'utf8');

test('a organização exporta a ficha do próprio evento sem documento na lista', () => {
  assert.match(page, /section="overview"/u);
  assert.match(page, /EventPeopleSheet/u);
  assert.match(home, /painel\/pessoas/u);
  assert.match(panel, /Exportar planilha/u);
  assert.match(panel, /people\/sheet/u);
  assert.match(panel, /Outro evento e o histórico do documento não entram/u);
  assert.match(panel, /Foto não entra/u);
  assert.match(panel, /role="alert"/u);
  assert.equal(panel.match(/<table>/gu).length, 1);
  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.match(css, /@media \(max-width: 360px\)/u);
  assert.match(panel, /!\('registrationData' in value\)/u);
  assert.doesNotMatch(panel, /identityHash|emailHash|full_name|preferred_name/u);
});
