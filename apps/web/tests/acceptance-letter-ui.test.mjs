import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [panel, area] = await Promise.all([
  readFile(new URL('../components/scientific-author-panel.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/participant-area.tsx', import.meta.url), 'utf8'),
]);

test('a carta fica na área do autor aceito e a EVA não promete e-mail', () => {
  assert.match(panel, /acceptance-letter/u);
  assert.match(panel, /item\.status === 'ACCEPTED' \|\| item\.status === 'ACCEPTED_WITH_CHANGES'/u);
  assert.match(panel, /Ver carta de aceite/u);
  assert.match(area, /Não mostro parecer, nota ou o trabalho de outra pessoa/u);
  assert.match(area, /A EVA não envia e-mail nem parecer/u);
  assert.doesNotMatch(panel, /reviewer|nota do avaliador/iu);
});
