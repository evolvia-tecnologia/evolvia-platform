import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const editor = await readFile(new URL('../components/publication-media-editor.tsx', import.meta.url), 'utf8');

test('envio de mídia usa a revisão devolvida e recarrega após conflito', () => {
  assert.match(editor, /const \[revision, setRevision\] = useState\(publicationRevision\)/u);
  assert.match(editor, /setRevision\(publicationRevision\)/u);
  assert.match(editor, /publicationRevision: revision/u);
  assert.match(editor, /result\.publicationRevision/u);
  assert.match(editor, /reason\.status === 409/u);
  assert.match(editor, /await onChanged\(\)\.catch/u);
});
