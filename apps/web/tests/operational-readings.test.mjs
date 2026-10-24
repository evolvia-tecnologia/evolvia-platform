import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('a tela mostra as quinze contas e não decide o trabalho', async () => {
  const [page, readings, css, workspace, dashboard] = await Promise.all([
    read('../app/eventos/[id]/painel/leituras/page.tsx'),
    read('../components/operational-readings.tsx'),
    read('../components/operational-readings.module.css'),
    read('../components/event-workspace.tsx'),
    read('../components/event-admin-dashboard.tsx'),
  ]);
  for (const label of [
    'Presença do dia', 'Dias com presença', 'Presença do dia estornada', 'Presença em atividade',
    'Atividades com presença', 'Material estornado', 'Credenciamento estornado', 'Fila aguardando',
    'Fila com oferta', 'Inscrições em atividade', 'Atividades publicadas', 'Pareceres enviados',
    'Pareceres em aberto', 'Trabalhos sem parecer', 'Certificados emitidos',
  ]) assert.match(readings, new RegExp(label, 'u'));
  assert.match(page, /OperationalReadings/u);
  assert.match(page, /continua decidindo o trabalho/u);
  assert.match(readings, /Não estorna, não emite e não decide o trabalho/u);
  assert.match(readings, /if \(!eventId\) return/u);
  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.match(css, /\.tableWrap table[\s\S]*font-family: inherit/u);
  assert.match(css, /\.tableWrap table[\s\S]*font-size: var\(--font-size-sm\)/u);
  assert.match(css, /\.page[\s\S]*font-family: var\(--font-family-sans\)/u);
  assert.doesNotMatch(css, /tabular-nums/u);
  assert.doesNotMatch(readings, /organizationId|registrationData|emailHash|protocol:/u);
  assert.match(workspace, /painel\/leituras/u);
  assert.match(workspace, /Quinze somas, sem pessoas/u);
  assert.match(dashboard, /Abrir contas/u);
});
