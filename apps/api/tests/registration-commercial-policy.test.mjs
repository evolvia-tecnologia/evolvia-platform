import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RegistrationCommercialPolicyError,
  normalizeRegistrationCatalog,
} from '../src/registration-commercial-policy.ts';

const category = (overrides = {}) => ({
  code: 'geral',
  name: 'Categoria geral',
  capacity: 200,
  proofRequirement: 'NONE',
  lots: [
    {
      code: 'primeiro_lote',
      name: 'Primeiro lote',
      startsAt: '2026-10-01T09:00:00-03:00',
      endsAt: '2026-10-15T23:59:59-03:00',
      quantity: 100,
      priceCents: 15000,
    },
  ],
  ...overrides,
});

test('normaliza categorias e lotes sem usar ponto flutuante para dinheiro', () => {
  const [result] = normalizeRegistrationCatalog([category()], 'PAID');
  assert.equal(result.lots[0].priceCents, 15000);
  assert.equal(result.lots[0].startsAt, '2026-10-01T12:00:00.000Z');
  assert.equal(result.active, true);
});

test('rejeita códigos duplicados de categoria e lote', () => {
  assert.throws(
    () => normalizeRegistrationCatalog([category(), category({ name: 'Outra' })], 'PAID'),
    /código único/u,
  );
  assert.throws(
    () => normalizeRegistrationCatalog([category({ lots: [category().lots[0], category().lots[0]] })], 'PAID'),
    /código único/u,
  );
});

test('rejeita períodos sobrepostos na mesma categoria', () => {
  const second = {
    ...category().lots[0],
    code: 'segundo_lote',
    name: 'Segundo lote',
    startsAt: '2026-10-10T09:00:00-03:00',
    endsAt: '2026-10-20T09:00:00-03:00',
  };
  assert.throws(
    () => normalizeRegistrationCatalog([category({ lots: [category().lots[0], second] })], 'PAID'),
    /não podem se sobrepor/u,
  );
});

test('aceita lotes contíguos e preserva a ordem configurada', () => {
  const second = {
    ...category().lots[0],
    code: 'segundo_lote',
    name: 'Segundo lote',
    startsAt: '2026-10-16T02:59:59.000Z',
    endsAt: '2026-10-31T23:59:59-03:00',
    sortOrder: 5,
  };
  const [result] = normalizeRegistrationCatalog([category({ lots: [second, category().lots[0]] })], 'PAID');
  assert.equal(result.lots[0].code, 'segundo_lote');
  assert.equal(result.lots[0].sortOrder, 5);
});

test('impede quantidade maior que a capacidade da categoria', () => {
  assert.throws(
    () => normalizeRegistrationCatalog([category({ capacity: 50 })], 'PAID'),
    /não pode superar/u,
  );
});

test('evento gratuito aceita apenas preço zero', () => {
  assert.throws(
    () => normalizeRegistrationCatalog([category()], 'FREE'),
    /preço zero/u,
  );
  const free = category({ lots: [{ ...category().lots[0], priceCents: 0 }] });
  assert.equal(normalizeRegistrationCatalog([free], 'FREE')[0].lots[0].priceCents, 0);
});

test('comprovante antes do pagamento só é válido em inscrição paga', () => {
  assert.throws(
    () => normalizeRegistrationCatalog([category({ proofRequirement: 'REQUIRED_BEFORE_PAYMENT' })], 'INVITATION'),
    RegistrationCommercialPolicyError,
  );
  const optional = normalizeRegistrationCatalog([category({ proofRequirement: 'OPTIONAL', lots: [{ ...category().lots[0], priceCents: 0 }] })], 'FREE');
  assert.equal(optional[0].proofRequirement, 'OPTIONAL');
});

test('descrição opcional composta apenas por espaços é normalizada para nulo', () => {
  const [result] = normalizeRegistrationCatalog([category({ description: '   ' })], 'PAID');
  assert.equal(result.description, null);
});

test('lote respeita o instante final do evento inclusive com fusos diferentes', () => {
  const eventEnd = new Date('2026-10-15T23:59:59-03:00');
  assert.equal(normalizeRegistrationCatalog([category()], 'PAID', eventEnd)[0].lots.length, 1);
  const late = category({ lots: [{
    ...category().lots[0], endsAt: '2026-10-16T00:00:00-03:00',
  }] });
  assert.throws(() => normalizeRegistrationCatalog([late], 'PAID', eventEnd),
    /não pode encerrar depois da data final/u);
});
