import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('o limite de atividades usa a fonte do painel e não lista pessoas', async () => {
  const [page, limit, css, agenda] = await Promise.all([
    read('../app/eventos/[id]/painel/limite-atividades/page.tsx'),
    read('../components/activity-enrollment-limit.tsx'),
    read('../components/activity-enrollment-limit.module.css'),
    read('../components/participant-agenda.tsx'),
  ]);
  assert.match(page, /ActivityEnrollmentLimit/u);
  assert.match(page, /não confirma presença/u);
  assert.match(limit, /Sem limite adicional/u);
  assert.match(limit, /Limitar a quantidade/u);
  assert.match(limit, /Quantidade máxima/u);
  assert.match(agenda, /limitou a quantidade/u);
  assert.match(css, /font-family: var\(--font-family-sans\)/u);
  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.doesNotMatch(limit, /organizationId|email|protocol/u);
});
