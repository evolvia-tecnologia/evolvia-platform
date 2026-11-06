import assert from 'node:assert/strict';
import test from 'node:test';
import { SPORTS_ATHLETE_FIELDS, sportsKitAvailability, validateSportsKitVariants } from '../lib/sports-athlete-and-kits.ts';

test('campos de atleta incluem os necessários sem exigir dados sensíveis por padrão', () => {
  assert.ok(SPORTS_ATHLETE_FIELDS.some((row) => row.field === 'shirtSize'));
  assert.ok(SPORTS_ATHLETE_FIELDS.some((row) => row.field === 'team'));
  assert.ok(SPORTS_ATHLETE_FIELDS.some((row) => row.field === 'emergencyContact' && !row.mandatoryDefault));
  assert.ok(SPORTS_ATHLETE_FIELDS.every((row) => !row.sensitive || !row.mandatoryDefault));
});

test('disponibilidade de kit não altera o estoque', () => {
  const kit = { id: 'shirt-m', label: 'Camiseta M', stock: 12, reserved: 3, delivered: 5 };
  assert.equal(sportsKitAvailability(kit), 4);
  assert.equal(kit.stock, 12);
  assert.deepEqual(validateSportsKitVariants([kit]), []);
});

test('estoque inválido e variante duplicada são rejeitados', () => {
  const kit = { id: 'shirt-m', label: 'Camiseta M', stock: 1, reserved: 1, delivered: 1 };
  assert.throws(() => sportsKitAvailability(kit));
  assert.ok(validateSportsKitVariants([kit]).length > 0);
  assert.ok(validateSportsKitVariants([{ id: 'shirt-m', label: 'M', stock: 3, reserved: 0, delivered: 0 }, { id: 'shirt-m', label: 'M', stock: 3, reserved: 0, delivered: 0 }]).length > 0);
  assert.throws(() => sportsKitAvailability({ id: 'n', label: 'N', stock: -1, reserved: 0, delivered: 0 }));
  assert.ok(validateSportsKitVariants(null).length > 0);
});
