import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('o limite de atividades usa a fonte do painel e não lista pessoas', async () => {
  const [page, limit, css, agenda, preferences] = await Promise.all([
    read('../app/eventos/[id]/painel/limite-atividades/page.tsx'),
    read('../components/activity-enrollment-limit.tsx'),
    read('../components/activity-enrollment-limit.module.css'),
    read('../components/participant-agenda.tsx'),
    read('../components/activity-preferences.tsx'),
  ]);
  assert.match(page, /ActivityEnrollmentLimit/u);
  assert.match(page, /não confirma presença/u);
  assert.match(page, /ActivityPreferences/u);
  assert.match(page, /ActivityCourtesy/u);
  assert.match(limit, /Sem limite adicional/u);
  assert.match(limit, /Limitar a quantidade/u);
  assert.match(limit, /A organização confirma o horário/u);
  assert.match(limit, /Quantidade máxima/u);
  assert.match(limit, /type="number"/u);
  assert.match(limit, /if \(!eventId\) return/u);
  assert.match(preferences, /if \(!eventId\) return/u);
  assert.match(preferences, /Confirmar na vaga/u);
  assert.match(preferences, /Confirmar como cortesia/u);
  assert.match(preferences, /Recusar/u);
  assert.match(preferences, /não mostra e-mail nem documento/u);
  assert.match(agenda, /Indicar preferência/u);
  assert.match(agenda, /limitou a quantidade/u);
  assert.match(css, /font-family: var\(--font-family-sans\)/u);
  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.doesNotMatch(limit, /organizationId|email|protocol/u);
  assert.doesNotMatch(preferences, /organizationId|registrationData|full_name/u);
});
