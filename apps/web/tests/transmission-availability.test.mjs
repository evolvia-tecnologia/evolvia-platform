import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transmissionFieldFromApiMessage, transmissionUnavailable } from '../lib/transmission-availability.ts';

const UNAVAILABLE = 'Transmissão disponível somente para eventos online ou híbridos';

test('a frase da API identifica presencial e o campo recusado', () => {
  const format = `${UNAVAILABLE}. Altere o formato na Fundação do evento.`;
  assert.equal(transmissionUnavailable(format), true);
  assert.equal(transmissionFieldFromApiMessage(format), null);
  // Frase de formato + texto de campo: o curto-circuito de indisponível prevalece.
  assert.equal(transmissionFieldFromApiMessage(`${UNAVAILABLE}. Informe um link https.`), null);
  assert.equal(transmissionUnavailable('Falha de carga'), false);
  assert.equal(transmissionFieldFromApiMessage('Informe um link https.'), 'url');
  assert.equal(transmissionFieldFromApiMessage('O link da transmissão precisa ser https, sem usuário e senha.'), 'url');
  assert.equal(transmissionFieldFromApiMessage('Informe o endereço público da transmissão.'), 'url');
  assert.equal(transmissionFieldFromApiMessage('O título da transmissão não pode conter marcação.'), 'title');
  assert.equal(transmissionFieldFromApiMessage('Não foi possível confirmar se o link foi salvo.'), null);
  assert.equal(transmissionUnavailable(null), false);
  assert.equal(transmissionUnavailable(undefined), false);
  assert.equal(transmissionFieldFromApiMessage(null), null);
  assert.equal(transmissionFieldFromApiMessage(undefined), null);
});

test('a frase UNAVAILABLE permanece acoplada à API', async () => {
  const [lib, service] = await Promise.all([
    readFile(new URL('../lib/transmission-availability.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../api/src/transmission.service.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(lib, new RegExp(UNAVAILABLE.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')));
  assert.ok(
    service.includes(UNAVAILABLE),
    'A frase da API mudou: atualize lib/transmission-availability.ts no mesmo PR.',
  );
});
