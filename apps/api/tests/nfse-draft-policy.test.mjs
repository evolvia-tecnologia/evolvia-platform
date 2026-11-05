import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FiscalInvoicePolicyError, prepareFiscalInvoiceDraft, prepareFiscalInvoiceDraftBatch,
  requireMunicipalFiscalAuthorization,
} from '../dist/nfse-draft-policy.js';

const fixture = {
  organizationId: 'organization_0001',
  eventId: 'event_0001',
  reservationId: 'reservation_0001',
  receiptId: 'receipt_0001',
  paymentStatus: 'CONFIRMED',
  amountCents: 12050,
  currency: 'BRL',
  municipalityIbgeCode: '3550308',
  issuerId: 'issuer_0001',
  recipientId: 'recipient_0001',
  serviceCode: '12.01',
};

test('prepara rascunho fiscal idempotente, sem alegar emissão', () => {
  const first = prepareFiscalInvoiceDraft(fixture);
  const replay = prepareFiscalInvoiceDraft({ ...fixture });
  assert.deepEqual(first, replay);
  assert.match(first.idempotencyKey, /^[0-9a-f]{64}$/u);
  assert.equal(first.status, 'AWAITING_MUNICIPAL_ADAPTER');
  assert.equal(first.issueAuthorized, false);
  assert.equal(first.amountCents, 12050);
  assert.equal(first.currency, 'BRL');
  assert.doesNotMatch(JSON.stringify(first), /access_token|authorization|cpf|password/iu);
});

test('chave é distinta por organização, evento, recibo, tomador e município', () => {
  const original = prepareFiscalInvoiceDraft(fixture).idempotencyKey;
  for (const change of [
    { organizationId: 'organization_0002' }, { eventId: 'event_0002' },
    { receiptId: 'receipt_0002' }, { recipientId: 'recipient_0002' },
    { municipalityIbgeCode: '3509502' }, { amountCents: 12051 },
  ]) {
    assert.notEqual(prepareFiscalInvoiceDraft({ ...fixture, ...change }).idempotencyKey, original);
  }
});

test('nenhuma NFS-e pode ser emitida com pagamento pendente, cancelado ou estornado', () => {
  for (const paymentStatus of ['PENDING', 'REFUNDED', 'CANCELLED']) {
    assert.throws(
      () => prepareFiscalInvoiceDraft({ ...fixture, paymentStatus }),
      FiscalInvoicePolicyError,
    );
  }
});

test('impede município, valor, serviço e referências inválidos', () => {
  const variants = [
    { municipalityIbgeCode: '355030' },
    { municipalityIbgeCode: 'A550308' },
    { municipalityIbgeCode: '0000000' },
    { municipalityIbgeCode: '9950308' },
    { municipalityIbgeCode: '3450308' },
    { municipalityIbgeCode: '3500000' },
    { municipalityIbgeCode: '5300000' },
    { amountCents: 0 }, { amountCents: -1 },
    { amountCents: 1.5 }, { amountCents: Number.POSITIVE_INFINITY },
    { currency: 'USD' }, { serviceCode: '12.01;DROP TABLE' },
    { serviceCode: undefined }, { serviceCode: null }, { serviceCode: 123 },
    { serviceCode: false }, { serviceCode: {} },
    { municipalityIbgeCode: undefined }, { municipalityIbgeCode: null },
    { municipalityIbgeCode: 3550308 }, { municipalityIbgeCode: {} },
    { issuerId: '' }, { recipientId: '' },
  ];
  for (const change of variants) {
    assert.throws(() => prepareFiscalInvoiceDraft({ ...fixture, ...change }), FiscalInvoicePolicyError);
  }
});

test('rejeita payload ausente ou não objeto com erro fiscal controlado', () => {
  for (const payload of [undefined, null, false, '', 0, [], ['invalid']]) {
    assert.throws(() => prepareFiscalInvoiceDraft(payload), FiscalInvoicePolicyError);
  }
});

test('aceita identificadores legados curtos sem enfraquecer isolamento e idempotência', () => {
  const short = { ...fixture, organizationId: 'o', eventId: 'e', reservationId: 'r',
    receiptId: 'p', issuerId: 'i', recipientId: 't' };
  const draft = prepareFiscalInvoiceDraft(short);
  assert.equal(draft.organizationId, 'o');
  assert.equal(draft.issueAuthorized, false);
  assert.notEqual(draft.idempotencyKey, prepareFiscalInvoiceDraft(fixture).idempotencyKey);
  for (const change of [{ organizationId: 'o!' }, { eventId: ' ' },
    { reservationId: 'x'.repeat(129) }]) {
    assert.throws(() => prepareFiscalInvoiceDraft({ ...short, ...change }), FiscalInvoicePolicyError);
  }
});

test('sem adaptador municipal autorizado a emissão é proibida', () => {
  const draft = prepareFiscalInvoiceDraft(fixture);
  assert.throws(() => requireMunicipalFiscalAuthorization(draft), /não emitida/u);
});

test('lote fiscal deduplica retry do mesmo recibo sem emissão', () => {
  const drafts = prepareFiscalInvoiceDraftBatch([fixture, { ...fixture }]);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].issueAuthorized, false);
});

test('lote fiscal recusa conflito no mesmo recibo e isola organizações', () => {
  assert.throws(
    () => prepareFiscalInvoiceDraftBatch([fixture, { ...fixture, amountCents: 12051 }]),
    /conflitantes/u,
  );
  const drafts = prepareFiscalInvoiceDraftBatch([
    fixture, { ...fixture, organizationId: 'organization_0002' },
  ]);
  assert.equal(drafts.length, 2);
  for (const batch of [[], Array.from({ length: 101 }, () => fixture)]) {
    assert.throws(() => prepareFiscalInvoiceDraftBatch(batch), FiscalInvoicePolicyError);
  }
});
