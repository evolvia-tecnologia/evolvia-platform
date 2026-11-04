import assert from 'node:assert/strict';
import test from 'node:test';
import { acquireBenefitSaveLock, releaseBenefitSaveLock } from '../lib/benefit-save-lock.ts';

test('duas tentativas síncronas só iniciam uma gravação', () => {
  const lock = { current: false };
  assert.equal(acquireBenefitSaveLock(lock, true), true);
  assert.equal(acquireBenefitSaveLock(lock, true), false);
  assert.equal(lock.current, true);
  releaseBenefitSaveLock(lock);
  assert.equal(acquireBenefitSaveLock(lock, true), true);
});

test('alterações inexistentes não iniciam requisição e falhas liberam nova tentativa', () => {
  const lock = { current: false };
  assert.equal(acquireBenefitSaveLock(lock, false), false);
  assert.equal(lock.current, false);
  assert.equal(acquireBenefitSaveLock(lock, true), true);
  // The enclosing save() finally invokes release after success or failure.
  releaseBenefitSaveLock(lock);
  assert.equal(lock.current, false);
  assert.equal(acquireBenefitSaveLock(lock, true), true);
});
