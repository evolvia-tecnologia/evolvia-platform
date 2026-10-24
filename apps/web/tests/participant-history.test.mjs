import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('../app/participante/page.tsx', import.meta.url), 'utf8');

test('histórico do documento pede confirmação sem revelar e-mail ou nome', () => {
  assert.match(page, /Histórico do documento/u);
  assert.match(page, /Pedir confirmação do histórico/u);
  assert.match(page, /Confirmar histórico deste documento/u);
  assert.match(page, /\/participant\/history\/recovery/u);
  assert.match(page, /recoveryId/u);
  assert.match(page, /documentKind: historyKind/u);
  const history = page.slice(page.indexOf('Histórico do documento'), page.indexOf('Usou outro e-mail') > 0 ? page.indexOf('Usou outro e-mail') : page.length);
  assert.doesNotMatch(history, /requesterEmail|targetEmail|user\.email/u);
  assert.match(history, /Quem pediu não é identificado/u);
});

test('histórico mostra estados e mantém a lista sem e-mail', () => {
  assert.match(page, /Histórico do documento/u);
  assert.match(page, /Pedir confirmação do histórico/u);
  assert.match(page, /Nenhum histórico verificado nesta conta/u);
  assert.match(page, /Confirmar histórico deste documento/u);
  assert.match(page, /recoveryId/u);
  const list = page.slice(page.indexOf('historyItems.map'), page.indexOf('Presença registrada'));
  assert.doesNotMatch(list, /email/u);
});
