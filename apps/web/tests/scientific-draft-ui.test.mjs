import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const panel = await readFile(new URL('../components/scientific-author-panel.tsx', import.meta.url), 'utf8');

test('o autor guarda rascunho, continua o mesmo trabalho e vê as versões enviadas', () => {
  assert.match(panel, /DRAFT: 'Rascunho'/u);
  assert.match(panel, /Salvar rascunho/u);
  assert.match(panel, /Continuar rascunho/u);
  assert.match(panel, /Rascunho ainda sem versão enviada/u);
  assert.match(panel, /Rascunho guardado nesta inscrição/u);
  assert.match(panel, /Informe um título para guardar o rascunho/u);
  assert.match(panel, /Versões enviadas/u);
  assert.match(panel, /\/drafts/u);
  assert.match(panel, /draftId: draftId \?\? undefined/u);
  assert.match(panel, /revisionId \|\| draftId \|\| area\.submissions\.length < area\.config\.maxSubmissionsPerAuthor/u);
  assert.match(panel, /type="button" disabled=\{busy\} onClick=\{\(\) => void saveDraft\(\)\}/u);
});
