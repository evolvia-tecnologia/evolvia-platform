import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('a transmissão mostra o link da atividade e a agenda só o entrega a quem está nela', async () => {
  const [page, panel, css, agenda] = await Promise.all([
    read('../app/eventos/[id]/painel/transmissao/page.tsx'),
    read('../components/activity-transmission.tsx'),
    read('../components/activity-transmission.module.css'),
    read('../components/participant-agenda.tsx'),
  ]);
  assert.match(page, /EventTransmission/u);
  assert.match(page, /ActivityTransmission/u);
  assert.match(panel, /Um link para cada atividade/u);
  assert.match(panel, /Assim o inscrito verá/u);
  assert.match(panel, /Entrar na transmissão/u);
  assert.match(panel, /activity-transmissions/u);
  assert.doesNotMatch(panel, /registrationData|emailHash/u);
  assert.match(css, /min-height:\s*var\(--space-44\)/u);
  assert.match(css, /border-inline-start:\s*6px solid var\(--color-brand-blue-600\)/u);
  assert.match(agenda, /Entrar na transmissão/u);
  assert.match(agenda, /item\.transmission/u);
});
