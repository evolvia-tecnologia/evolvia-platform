import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [agenda, area] = await Promise.all([
  '../components/participant-agenda.tsx',
  '../components/participant-area.tsx',
].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));

test('a agenda do participante usa a sessão em memória e a EVA local', () => {
  assert.match(area, /status === 'CONFIRMED' && <ParticipantAgenda/u);
  assert.match(agenda, /ScientificEvaHelp/u);
  assert.match(agenda, /participant\/agenda/u);
  assert.match(agenda, /A entrada no dia continua no credenciamento/u);
  assert.doesNotMatch(agenda, /localStorage|sessionStorage|emailHash|identityHash|https?:\/\//u);
  assert.doesNotMatch(agenda, /fetch\([^)]*openai|fetch\([^)]*https?:/u);
});
