import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseRaffleId,
  CredentialRafflePolicyError,
  normalizeRaffle,
  rafflePool,
} from '../src/credential-raffle-policy.ts';

test('o sorteio fica no evento e não repete vencedor quando a equipe pede', () => {
  assert.deepEqual(normalizeRaffle({ scope: 'ALL', allowRepeat: false }), {
    scope: 'ALL', categoryId: null, activityId: null, allowRepeat: false,
  });
  assert.equal(normalizeRaffle({
    scope: 'CATEGORY', categoryId: 'cat1234567890', allowRepeat: true,
  }).categoryId, 'cat1234567890');
  assert.deepEqual(rafflePool(['a', 'b', 'c'], new Set(['b']), false), ['a', 'c']);
  assert.deepEqual(rafflePool(['a', 'b'], new Set(['a']), true), ['a', 'b']);
  assert.equal(chooseRaffleId(['a', 'b', 'c'], () => 1), 'b');
  assert.throws(() => chooseRaffleId([], () => 0), CredentialRafflePolicyError);
  assert.throws(() => normalizeRaffle({ scope: 'ACTIVITY', allowRepeat: false }), CredentialRafflePolicyError);
  assert.throws(() => normalizeRaffle({ scope: 'ALL', allowRepeat: false, note: 'x' }), CredentialRafflePolicyError);
});
