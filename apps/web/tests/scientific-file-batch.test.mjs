import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('a página de submissões oferece o pacote sem dado de autor', async () => {
  const [page, panel, css] = await Promise.all([
    read('../app/eventos/[id]/cientifico/submissoes/page.tsx'),
    read('../components/scientific-file-batch.tsx'),
    read('../components/scientific-file-batch.module.css'),
  ]);
  assert.match(page, /ScientificSubmissions/u);
  assert.match(page, /ScientificFileBatch/u);
  assert.match(panel, /Baixar arquivos/u);
  assert.match(panel, /Baixar os próximos/u);
  assert.match(panel, /X-Evolvia-Next/u);
  assert.match(panel, /submission-files\/batch/u);
  assert.match(panel, /role="alert"/u);
  assert.match(panel, /Não há envio de e-mail/u);
  assert.doesNotMatch(panel, /fileKey|registrationData/u);
  assert.match(css, /min-height:\s*var\(--space-44\)/u);
  assert.match(css, /max-width:\s*360px/u);
});
