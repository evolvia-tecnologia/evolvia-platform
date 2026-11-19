import assert from 'node:assert/strict';
import test from 'node:test';
import { previewFiscalReceipt } from '../dist/nfse-receipt-draft.js';

const scope = { userId:'u', organizationId:'o', eventId:'e', receiptId:'receipt' };
const setup = { issuerId:'i', recipientId:'r', serviceCode:'12.01', municipalityIbgeCode:'3550308' };
const receipt = { id:'receipt', organizationId:'o', eventId:'e', reservationId:'reservation',
  amountCents:750, checkout:{ amountCents:750, reservationId:'reservation' } };
const reader = row => ({eventRegistrationPaymentReceipt:{findFirst:async () => row}});

test('a prévia usa o valor persistido, é idempotente e permanece bloqueada para emissão', async () => {
  const preview = await previewFiscalReceipt(reader(receipt),scope,{...setup,amountCents:10});
  assert.equal(preview.amountCents,750);
  assert.equal(preview.issueAuthorized,false);
  assert.deepEqual(preview,await previewFiscalReceipt(reader(receipt),scope,setup));
});

test('escopo incompleto é recusado antes da consulta, e divergência impede preparação', async () => {
  for (const key of Object.keys(scope)) {
    await assert.rejects(previewFiscalReceipt({}, {...scope,[key]:undefined}, setup), /Recibo indisponível/);
  }
  for (const value of [null,{...receipt,amountCents:751},{...receipt,reservationId:'outra'}]) {
    await assert.rejects(previewFiscalReceipt(reader(value),scope,setup), /Recibo indisponível/);
  }
});

test('configuração fiscal inválida falha antes da leitura do recibo', async () => {
  let queries = 0;
  const db = { eventRegistrationPaymentReceipt: { findFirst: async () => { queries++; return receipt; } } };
  for (const invalid of [null, undefined, [], { ...setup, issuerId: '' }, { ...setup, recipientId: 123 },
    { ...setup, municipalityIbgeCode: '0000000' }, { ...setup, serviceCode: {} }]) {
    await assert.rejects(previewFiscalReceipt(db, scope, invalid), { name: 'FiscalInvoicePolicyError' });
  }
  assert.equal(queries, 0);
});
