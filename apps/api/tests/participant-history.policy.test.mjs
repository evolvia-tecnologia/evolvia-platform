import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  HISTORY_RECOVERY_MESSAGE,
  historyFacts,
  includeReservation,
  participantDocumentIdentity,
} from '../dist/participant-history.policy.js';

test('cpf e passaporte não compartilham o mesmo histórico', () => {
  const cpf = participantDocumentIdentity({ documentKind: 'CPF', identityDocument: '390.533.447-05' });
  const passport = participantDocumentIdentity({ documentKind: 'PASSPORT', identityDocument: 'AB123456', issuerCountry: 'pt' });
  const otherCountry = participantDocumentIdentity({ documentKind: 'PASSPORT', identityDocument: 'AB123456', issuerCountry: 'BR' });
  assert.notEqual(cpf.identityHash, passport.identityHash);
  assert.notEqual(passport.identityHash, otherCountry.identityHash);
  assert.equal(cpf.masked.endsWith('05'), true);
  assert.equal(cpf.masked.includes('390533447'), false);
  assert.throws(() => participantDocumentIdentity({ documentKind: 'CPF', identityDocument: '111.111.111-11' }), /CPF inválido/u);
  assert.throws(() => participantDocumentIdentity({ documentKind: 'PASSPORT', identityDocument: 'AB 12', issuerCountry: 'BR' }), /passaporte/u);
});

test('documento de outra pessoa e pagamento pendente não entram no histórico', () => {
  assert.equal(includeReservation({ sameAccount: false, verifiedDocument: false, confirmed: true }), false);
  assert.equal(includeReservation({ sameAccount: true, verifiedDocument: false, confirmed: false }), true);
  assert.equal(includeReservation({ sameAccount: false, verifiedDocument: true, confirmed: true }), true);
  assert.equal(includeReservation({ sameAccount: false, verifiedDocument: true, confirmed: false }), false);
  assert.deepEqual(historyFacts({ confirmed: true, presenceRecorded: true, presenceReversed: true }), { confirmed: true, presence: false });
  assert.equal(HISTORY_RECOVERY_MESSAGE.includes('e-mail'), true);
});

test('a resposta do histórico não devolve e-mail nem documento', async () => {
  const [service, page] = await Promise.all([
    readFile(new URL('../src/participant-dashboard.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../web/app/participante/page.tsx', import.meta.url), 'utf8'),
  ]);
  const history = service.slice(service.indexOf('async history'), service.indexOf('async requestHistoryRecovery'));
  assert.match(history, /confirmed: facts\.confirmed/u);
  assert.match(history, /presence: facts\.presence/u);
  assert.doesNotMatch(history, /email:/u);
  assert.match(page, /Histórico do documento/u);
  assert.match(page, /Pedir confirmação do histórico/u);
  assert.match(page, /Nenhum histórico verificado nesta conta/u);
  const list = page.slice(page.indexOf('historyItems.map'), page.indexOf('Presença registrada'));
  assert.doesNotMatch(list, /email/u);
});
