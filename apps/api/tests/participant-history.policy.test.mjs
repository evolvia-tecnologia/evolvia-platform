import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import test from 'node:test';

async function loadPolicy() {
  try {
    await access(new URL('../dist/participant-history.policy.js', import.meta.url));
    return import('../dist/participant-history.policy.js');
  } catch {
    return null;
  }
}

test('cpf e passaporte não compartilham o mesmo histórico', async () => {
  const policy = await loadPolicy();
  assert.ok(policy, 'dist/participant-history.policy.js precisa existir após o build da API');
  const cpf = policy.participantDocumentIdentity({ documentKind: 'CPF', identityDocument: '390.533.447-05' });
  const passport = policy.participantDocumentIdentity({ documentKind: 'PASSPORT', identityDocument: 'AB123456', issuerCountry: 'pt' });
  const otherCountry = policy.participantDocumentIdentity({ documentKind: 'PASSPORT', identityDocument: 'AB123456', issuerCountry: 'BR' });
  assert.notEqual(cpf.identityHash, passport.identityHash);
  assert.notEqual(passport.identityHash, otherCountry.identityHash);
  assert.equal(cpf.masked.endsWith('05'), true);
  assert.equal(cpf.masked.includes('390533447'), false);
  assert.throws(() => policy.participantDocumentIdentity({ documentKind: 'CPF', identityDocument: '111.111.111-11' }), /CPF inválido/u);
  assert.throws(() => policy.participantDocumentIdentity({ documentKind: 'PASSPORT', identityDocument: 'AB 12', issuerCountry: 'BR' }), /passaporte/u);
});

test('documento de outra pessoa e pagamento pendente não entram no histórico', async () => {
  const policy = await loadPolicy();
  assert.ok(policy, 'dist/participant-history.policy.js precisa existir após o build da API');
  assert.equal(policy.includeReservation({ sameAccount: false, verifiedDocument: false, confirmed: true }), false);
  assert.equal(policy.includeReservation({ sameAccount: true, verifiedDocument: false, confirmed: false }), true);
  assert.equal(policy.includeReservation({ sameAccount: false, verifiedDocument: true, confirmed: true }), true);
  assert.equal(policy.includeReservation({ sameAccount: false, verifiedDocument: true, confirmed: false }), false);
  assert.deepEqual(policy.historyFacts({ confirmed: true, presenceRecorded: true, presenceReversed: true }), { confirmed: true, presence: false });
  assert.equal(policy.HISTORY_RECOVERY_MESSAGE.includes('e-mail'), true);
});

test('a resposta do histórico não devolve e-mail nem documento', async () => {
  const [service, page] = await Promise.all([
    readFile(new URL('../src/participant-dashboard.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../web/app/participante/page.tsx', import.meta.url), 'utf8'),
  ]);
  const history = service.slice(service.indexOf('async history'), service.indexOf('async requestHistoryRecovery'));
  assert.match(history, /confirmed: facts\.confirmed/u);
  assert.match(history, /presence: facts\.presence/u);
  assert.match(history, /pendingConfirmations/u);
  assert.doesNotMatch(history, /email:/u);
  assert.doesNotMatch(history, /requester/u);
  assert.match(page, /Histórico do documento/u);
  assert.match(page, /Pedir confirmação do histórico/u);
  assert.match(page, /Nenhum histórico verificado nesta conta/u);
  assert.match(page, /Confirmar histórico deste documento/u);
  assert.match(page, /recoveryId/u);
  const list = page.slice(page.indexOf('historyItems.map'), page.indexOf('Presença registrada'));
  assert.doesNotMatch(list, /email/u);
});

test('confirmação do dono autenticado não exige token e-mail e inscrição confirmada verifica o vínculo', async () => {
  const service = await readFile(new URL('../src/participant-dashboard.service.ts', import.meta.url), 'utf8');
  assert.match(service, /recoveryId/u);
  assert.match(service, /historyGrantSource: HISTORY_GRANT_RECOVERY_CONSENT/u);
  assert.match(service, /findRecoverySteward/u);
  assert.match(service, /HttpStatus.BAD_REQUEST/u);
  assert.doesNotMatch(service, /ownConfirmed/u);
  assert.doesNotMatch(service.slice(service.indexOf('async link'), service.indexOf('async get')), /verifiedAt/u);
  assert.doesNotMatch(service.slice(service.indexOf('async requestHistoryRecovery'), service.indexOf('async confirmHistoryRecovery')), /email:/u);
});
