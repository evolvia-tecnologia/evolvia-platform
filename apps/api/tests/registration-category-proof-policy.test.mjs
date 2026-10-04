import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { categoryProofPaymentBlock } from '../src/registration-category-proof.policy.ts';

test('pagamento espera aprovação só quando a categoria pede comprovante', () => {
  assert.equal(categoryProofPaymentBlock('NONE', null), null);
  assert.equal(categoryProofPaymentBlock('OPTIONAL', null), null);
  assert.equal(categoryProofPaymentBlock('OPTIONAL', 'PENDING_REVIEW'), null);
  assert.equal(categoryProofPaymentBlock('REQUIRED_BEFORE_PAYMENT', 'APPROVED'), null);
  assert.match(categoryProofPaymentBlock('REQUIRED_BEFORE_PAYMENT', null) ?? '', /Envie o PDF/u);
  assert.match(categoryProofPaymentBlock('REQUIRED_BEFORE_PAYMENT', 'PENDING_REVIEW') ?? '', /análise/u);
  assert.match(categoryProofPaymentBlock('REQUIRED_BEFORE_PAYMENT', 'REJECTED') ?? '', /recusado/u);
});

test('comprovante usa a mesma leitura passiva do PDF e não é executado', async () => {
  const [service, storage, checkout] = await Promise.all([
    readFile(new URL('../src/registration-category-proof.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/registration-category-proof.storage.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/asaas-checkout.service.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(service, /validateRegistrationTermsPdf/u);
  assert.match(service, /sandbox/u);
  assert.match(checkout, /categoryProofPaymentBlock/u);
  assert.doesNotMatch(`${service}\n${storage}`, /child_process|execFile|spawn\(/u);
});
