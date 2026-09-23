import assert from 'node:assert/strict';
import test from 'node:test';
import { issueCheckInCode, verifyCheckInCode } from '../src/check-in-policy.ts';

const secret = 'ci-only-secret-with-more-than-32-characters';
const id = 'cm12345678901234567890123';

test('credencial opaca valida somente no evento e segredo corretos', () => {
  const code = issueCheckInCode('event-a', id, secret);
  assert.match(code, /^EVQ1\./u);
  assert.equal(verifyCheckInCode('event-a', code, secret), id);
  assert.equal(verifyCheckInCode('event-b', code, secret), null);
  assert.equal(verifyCheckInCode('event-a', code, 'another-ci-only-secret-over-32-characters'), null);
  assert.equal(verifyCheckInCode('event-a', code.slice(0, -1) + (code.endsWith('a') ? 'b' : 'a'), secret), null);
  assert.equal(verifyCheckInCode('event-a', code + 'x', secret), null);
  assert.equal(verifyCheckInCode('event-a', null, secret), null);
});

test('segredo curto e identificador inválido falham fechado', () => {
  assert.throws(() => issueCheckInCode('event-a', id, 'short'));
  assert.throws(() => issueCheckInCode('event-a', '1', secret));
});
