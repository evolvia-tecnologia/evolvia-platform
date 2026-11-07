import assert from 'node:assert/strict';
import test from 'node:test';
import { transmissionFieldFromApiMessage, transmissionUnavailable } from '../lib/transmission-availability.ts';

test('a frase da API identifica presencial e o campo recusado', () => {
  const format = 'Transmissão disponível somente para eventos online ou híbridos. Altere o formato na Fundação do evento.';
  assert.equal(transmissionUnavailable(format), true);
  assert.equal(transmissionFieldFromApiMessage(format), null);
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
