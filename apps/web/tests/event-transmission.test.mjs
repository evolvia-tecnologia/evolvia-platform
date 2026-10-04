import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const panel = await readFile(new URL('../components/event-transmission.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/eventos/[id]/painel/transmissao/page.tsx', import.meta.url), 'utf8');
const area = await readFile(new URL('../components/participant-area.tsx', import.meta.url), 'utf8');
const help = await readFile(new URL('../lib/public-help.ts', import.meta.url), 'utf8');
const kiosk = await readFile(new URL('../components/self-service-kiosk.tsx', import.meta.url), 'utf8');

test('a transmissão fica na área do inscrito confirmado e o totem aceita o número da inscrição', () => {
  assert.match(page, /section="transmission"/u);
  assert.match(panel, /A página pública não mostra esse endereço/u);
  assert.match(panel, /Videoconferência/u);
  assert.match(panel, /Vídeo ao vivo/u);
  assert.match(panel, /Vídeo gravado/u);
  assert.match(panel, /Não há envio de arquivo nem comentário/u);
  assert.match(area, /area\.transmission &&/u);
  assert.match(area, /Abrir videoconferência/u);
  assert.match(help, /A página pública não mostra esse link/u);
  assert.match(kiosk, /Número de inscrição/u);
  assert.doesNotMatch(panel, /SCIENTIFIC_EVENT|CORPORATE_TRAINING|FAIR_EXHIBITION|ENTERTAINMENT|SOCIAL_COMMUNITY/u);
});
