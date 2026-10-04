import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('o aceite público permite abrir o PDF anexado', async () => {
  const web = await readFile(new URL('../components/public-registration-form.tsx', import.meta.url), 'utf8');
  assert.match(web, /type="checkbox"/u);
  assert.match(web, /Abrir \{options\.terms\.fileName\}/u);
});
