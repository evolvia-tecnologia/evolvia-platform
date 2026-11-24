import assert from 'node:assert/strict';
import test from 'node:test';
import { SPORTS_ATHLETE_FIELDS, readPublishedAthletePrompts, readPublishedShirtSizes, sportsKitAvailability, validateSportsKitVariants } from '../lib/sports-athlete-and-kits.ts';

test('campos de atleta incluem os necessários sem exigir dados sensíveis por padrão', () => {
  assert.ok(SPORTS_ATHLETE_FIELDS.some((row) => row.field === 'shirtSize'));
  assert.ok(SPORTS_ATHLETE_FIELDS.some((row) => row.field === 'team'));
  assert.ok(SPORTS_ATHLETE_FIELDS.some((row) => row.field === 'emergencyContact' && !row.mandatoryDefault));
  assert.ok(SPORTS_ATHLETE_FIELDS.every((row) => !row.sensitive || !row.mandatoryDefault));
});

test('a página só anuncia campos de atleta que a ficha publicou', () => {
  const prompts = readPublishedAthletePrompts({ fields: [
    { code: 'full_name', label: ' Nome completo ', enabled: true, required: true },
    { code: 'birth_date', label: 'Data de nascimento', enabled: false, required: true },
    { code: 'team', label: 'Equipe', enabled: true },
    { code: 'estimated_pace', label: 'Ritmo estimado', enabled: true, required: false },
    { code: 'emergency_contact', label: 'Contato de emergência', enabled: true },
    { code: 'guardian', label: 'Responsável legal', enabled: true },
    { code: 'shirt_size', label: 'Tamanho da camisa', enabled: true, required: false },
    { code: 'email', label: '<b>E-mail</b>', enabled: true },
    { code: 'unknown_custom', label: 'Campo estranho', enabled: true },
  ] });
  assert.deepEqual(prompts, [
    { code: 'full_name', label: 'Nome completo', required: true },
    { code: 'team', label: 'Equipe', required: false },
    { code: 'estimated_pace', label: 'Ritmo estimado', required: false },
    { code: 'emergency_contact', label: 'Contato de emergência', required: false },
    { code: 'guardian', label: 'Responsável legal', required: false },
    { code: 'shirt_size', label: 'Tamanho da camisa', required: false },
  ]);
  assert.deepEqual(readPublishedAthletePrompts(null), []);
  const allCodes = [
    'full_name', 'preferred_name', 'birth_date', 'identity_document', 'email', 'phone',
    'country', 'city', 'state', 'team', 'estimated_pace', 'emergency_contact', 'guardian', 'shirt_size',
  ];
  const allPrompts = readPublishedAthletePrompts({
    fields: allCodes.map((code) => ({ code, label: code.replaceAll('_', ' '), enabled: true })),
  });
  assert.equal(allPrompts.length, allCodes.length, 'todos os códigos de atleta publicados devem aparecer');
});

test('tamanhos publicados vêm da ficha e não do saldo', () => {
  const payload = { fields: [
    { code: 'shirt_size', type: 'SELECT', enabled: true, options: [
      { id: 'size-m', label: ' M ' },
      { id: 'size-m', label: 'Repetido' },
      { id: 'x', label: 'P' },
      { id: 'size-g', label: '<script>' },
      { id: 'size-p', label: 'P', stockQuantity: 0 },
    ] },
    { code: 'shirt_size', type: 'SELECT', enabled: false, options: [{ id: 'size-hidden', label: 'Oculto' }] },
  ] };
  assert.deepEqual(readPublishedShirtSizes(payload), [
    { id: 'size-m', label: 'M' },
    { id: 'size-p', label: 'P' },
  ]);
  assert.deepEqual(readPublishedShirtSizes({ fields: [] }), []);
  assert.deepEqual(readPublishedShirtSizes(null), []);
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
