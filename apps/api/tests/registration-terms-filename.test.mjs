import assert from 'node:assert/strict';
import test from 'node:test';
import { registrationTermsFileName } from '../dist/registration-terms-document.policy.js';

test('long PDF names are normalized to a bounded, valid display name', () => {
  const result = registrationTermsFileName('Termos de Inscrição ' + 'A'.repeat(160) + '.pdf');
  assert.ok(result.length <= 75);
  assert.ok(result.endsWith('.pdf'));
  assert.ok(result.startsWith('Termos de Inscrição'));
});

test('normalization keeps path segments out of persisted filename', () => {
  assert.equal(registrationTermsFileName('C:\\temp\\Termos.pdf'), 'Termos.pdf');
  assert.equal(registrationTermsFileName('/tmp/Termos.pdf'), 'Termos.pdf');
});

test('invalid extension and invalid initial character remain rejected', () => {
  for (const name of ['Termos.exe', '.pdf', '!!!.pdf', 'Termos.pdf.exe']) {
    assert.throws(() => registrationTermsFileName(name));
  }
});
