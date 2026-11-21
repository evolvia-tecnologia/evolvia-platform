import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../components/event-communication.tsx', import.meta.url), 'utf8');

test('comunicação expõe Escrever, Rascunhos, Prévia e Histórico sem falso enviado', () => {
  assert.match(source, /aria-pressed=\{tab === 'write'\}/u);
  assert.match(source, /Rascunhos \(\{drafts\.length\}\)/u);
  assert.match(source, /Prévia do público/u);
  assert.match(source, /Histórico/u);
  assert.match(source, /EventCommunicationAudience/u);
  assert.match(source, /Nenhum e-mail foi enviado/u);
  assert.match(source, /não contam como mensagem entregue/u);
  assert.doesNotMatch(source, /E-mail enviado com sucesso|Mensagem enviada/u);
  assert.match(source, /sendingAvailable === true/u);
  assert.match(source, /tab === 'preview'/u);
  assert.match(source, /tab === 'history'/u);
});
