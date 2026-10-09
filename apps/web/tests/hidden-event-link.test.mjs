import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('a divulgação pode tirar o evento da vitrine sem apagar o link direto', async () => {
  const [editor, page, policy] = await Promise.all([
    read('../components/publication-editor.tsx'),
    read('../app/evento/[slug]/page.tsx'),
    read('../../api/src/event-publication/public-discovery.policy.ts'),
  ]);
  assert.match(editor, /Mostrar na vitrine pública/u);
  assert.match(editor, /catalogListed: form\.catalogListed/u);
  assert.match(editor, /continua abrindo a página/u);
  assert.match(page, /catalogListed !== false/u);
  assert.match(policy, /catalogListed: true/u);
  assert.match(policy, /eventPublication: \{ is: null \}/u);
  assert.doesNotMatch(editor, /ipAddress|userAgent/u);
});
