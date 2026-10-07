import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PaidEventCommissionError,
  asaasCheckoutPayload,
  asaasOrganizerSplit,
  negotiatedCommissionPercent,
  normalizeOrganizerWalletId,
  quotePlatformCommission,
} from '../src/paid-event-commission.policy.ts';

const wallet = '7bafd95a-e783-4a62-9be1-23999af742c6';

test('comissão negociada fica entre 10% e 15% e o padrão é 10%', () => {
  const previous = process.env.EVOLVIA_ASAAS_COMMISSION_PERCENT;
  delete process.env.EVOLVIA_ASAAS_COMMISSION_PERCENT;
  assert.equal(negotiatedCommissionPercent(), 10);
  assert.equal(negotiatedCommissionPercent('15'), 15);
  for (const value of ['9', '16', '10.5', '10%', '0']) {
    assert.throws(() => negotiatedCommissionPercent(value), PaidEventCommissionError);
  }
  if (previous === undefined) delete process.env.EVOLVIA_ASAAS_COMMISSION_PERCENT;
  else process.env.EVOLVIA_ASAAS_COMMISSION_PERCENT = previous;
});

test('só inscrição paga gera comissão e o split soma o valor cobrado', () => {
  const absorbed = quotePlatformCommission({
    surface: 'registration', ticketCents: 10_000, percent: 10, bearer: 'ORGANIZER', country: 'Brasil',
  });
  assert.equal(absorbed.chargeable, true);
  assert.equal(absorbed.platformCents, 1_000);
  assert.equal(absorbed.organizerCents, 9_000);
  assert.equal(absorbed.buyerCents, 10_000);
  assert.equal(absorbed.platformCents + absorbed.organizerCents, absorbed.buyerCents);
  assert.deepEqual(absorbed.billingTypes, ['PIX', 'CREDIT_CARD']);
  assert.deepEqual(absorbed.chargeTypes, ['DETACHED', 'INSTALLMENT']);
  assert.equal(absorbed.maxInstallmentCount, 6);

  const passed = quotePlatformCommission({
    surface: 'registration', ticketCents: 10_000, percent: 15, bearer: 'PARTICIPANT', country: 'Argentina',
  });
  assert.equal(passed.buyerCents, 11_500);
  assert.equal(passed.organizerCents, 10_000);
  assert.equal(passed.platformCents + passed.organizerCents, passed.buyerCents);
  assert.deepEqual(passed.billingTypes, ['CREDIT_CARD']);
  assert.equal(passed.maxInstallmentCount, null);

  const free = quotePlatformCommission({ surface: 'registration', ticketCents: 0, percent: 10, bearer: 'ORGANIZER' });
  assert.equal(free.chargeable, false);
  assert.equal(free.platformCents, 0);
  for (const surface of ['certificate', 'scientific_submission']) {
    const quote = quotePlatformCommission({ surface, ticketCents: 10_000, percent: 15, bearer: 'PARTICIPANT', country: 'US' });
    assert.equal(quote.chargeable, false);
    assert.equal(quote.percent, 0);
    assert.equal(quote.buyerCents, 0);
    assert.equal(quote.platformCents, 0);
  }
});

test('repasse usa a carteira do organizador e rejeita chave de API', () => {
  const quote = quotePlatformCommission({
    surface: 'registration', ticketCents: 10_000, percent: 10, bearer: 'ORGANIZER', country: '',
  });
  assert.equal(quote.market, 'BR');
  assert.throws(() => asaasOrganizerSplit(quote, null), PaidEventCommissionError);
  assert.throws(() => normalizeOrganizerWalletId('$aact_hmlg_000000000000000000000000'), PaidEventCommissionError);
  const split = asaasOrganizerSplit(quote, wallet.toUpperCase());
  assert.deepEqual(split, { walletId: wallet, fixedValue: 90 });
});

test('checkout do Asaas recebe Pix e cartão no Brasil e só cartão fora, com split fixo', () => {
  const callback = {
    successUrl: 'https://evolvia.example/ok',
    cancelUrl: 'https://evolvia.example/cancel',
    expiredUrl: 'https://evolvia.example/expired',
  };
  const brazil = asaasCheckoutPayload({
    reservationId: 'reservation-1',
    protocol: 'EVO-0123456789ABCDEF',
    eventName: 'Congresso',
    slug: 'congresso',
    amountCents: 10_000,
    minutesToExpire: 20,
    billingTypes: ['PIX', 'CREDIT_CARD'],
    chargeTypes: ['DETACHED', 'INSTALLMENT'],
    maxInstallmentCount: 6,
    split: { walletId: wallet, fixedValue: 90 },
  }, callback);
  assert.deepEqual(brazil.billingTypes, ['PIX', 'CREDIT_CARD']);
  assert.deepEqual(brazil.chargeTypes, ['DETACHED', 'INSTALLMENT']);
  assert.equal(brazil.installment.maxInstallmentCount, 6);
  assert.equal(brazil.items[0].value, 100);
  assert.deepEqual(brazil.splits, [{ walletId: wallet, fixedValue: 90 }]);

  const abroad = asaasCheckoutPayload({
    reservationId: 'reservation-1',
    protocol: 'EVO-0123456789ABCDEF',
    eventName: 'Congresso',
    slug: 'congresso',
    amountCents: 11_500,
    minutesToExpire: 20,
    billingTypes: ['CREDIT_CARD'],
    chargeTypes: ['DETACHED'],
    maxInstallmentCount: null,
    split: { walletId: wallet, fixedValue: 100 },
  }, callback);
  assert.equal(abroad.installment, undefined);
  assert.deepEqual(abroad.billingTypes, ['CREDIT_CARD']);
  assert.throws(() => asaasCheckoutPayload({
    ...abroad,
    reservationId: 'reservation-1',
    protocol: 'EVO-0123456789ABCDEF',
    eventName: 'Congresso',
    slug: 'congresso',
    amountCents: 11_500,
    minutesToExpire: 20,
    billingTypes: ['BOLETO'],
    chargeTypes: ['DETACHED'],
    maxInstallmentCount: null,
    split: { walletId: wallet, fixedValue: 100 },
  }, callback), PaidEventCommissionError);
});

test('cobrança persiste o recorte da comissão sem carteira, certificado ou taxa de trabalho', async () => {
  const [service, gateway, policy, migration] = await Promise.all([
    readFile(new URL('../src/asaas-checkout.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/asaas-checkout.gateway.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/paid-event-commission.policy.ts', import.meta.url), 'utf8'),
    readFile(new URL('../prisma/migrations/20261006223000_paid_event_commission/migration.sql', import.meta.url), 'utf8'),
  ]);
  assert.match(service, /surface: 'registration'/u);
  assert.match(service, /commissionSnapshot/u);
  assert.match(service, /quote\.buyerCents/u);
  assert.doesNotMatch(service, /sellerSnapshot:[\s\S]{0,240}asaasWalletId/u);
  assert.match(policy, /splits: \[/u);
  assert.match(gateway, /asaasCheckoutPayload/u);
  assert.doesNotMatch(gateway, /BOLETO/u);
  assert.match(migration, /ADD COLUMN "asaasWalletId"/u);
  assert.match(migration, /ADD COLUMN "feeBearer"/u);
  assert.match(migration, /ADD COLUMN "commissionSnapshot"/u);
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN|TYPE)|DELETE\s+FROM/iu);
  assert.doesNotMatch(`${service}\n${gateway}`, /19[,.]90|3[,.]99|2[,.]50/u);
});
