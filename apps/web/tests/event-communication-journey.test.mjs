import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../components/event-communication.tsx', import.meta.url), 'utf8');

test('comunicação expõe Escrever, Rascunhos, Prévia e Histórico sem falso enviado', () => {
  assert.match(source, /aria-pressed=\{tab === 'write'\}/u);
  assert.match(source, /Rascunhos \(\{drafts\.length\}\)/u);
  assert.match(source, /Prévia do público/u);
  assert.match(source, /Histórico/u);
  assert.match(source, /showAudience && <EventCommunicationAudience/u);
  assert.match(source, /tab === 'write' \|\| tab === 'preview'/u);
  assert.match(source, /Nenhum e-mail foi enviado/u);
  assert.match(source, /A API ainda não publica histórico de disparos/u);
  assert.doesNotMatch(source, /E-mail enviado com sucesso|Mensagem enviada|Nenhum envio registrado neste evento/u);
  assert.match(source, /sendingAvailable === true/u);
});
